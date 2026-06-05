import logging

from app.celery_app import celery
from app.services.ingestion.storage import StorageService
from app.services.ingestion.ocr import OCRService
from app.services.ingestion.chunker import ChunkerService
from app.services.ingestion.embeddings import EmbeddingService
from app.services.retrieval.search import SearchService
from app.services.retrieval.vectordb import VectorDBService
from app.services.db import update_job_status, update_page_count, get_document

logger = logging.getLogger(__name__)

# Exponential backoff base (seconds). Retry delays: 60s, 120s, 240s.
_RETRY_BASE_DELAY = 60

# Exception types that indicate a programming/data error — retrying won't fix them.
_PERMANENT_EXC_TYPES = (
    ValueError,    # bad document state, missing fields
    KeyError,      # unexpected data shape
    TypeError,
    AttributeError,
    NotImplementedError,
)

# Substrings in exception messages that suggest a transient condition worth retrying.
_TRANSIENT_KEYWORDS = (
    "timeout",
    "timed out",
    "connection",
    "rate limit",
    "rate_limit",
    "too many requests",
    "temporarily unavailable",
    "service unavailable",
    "internal server error",
    "throttl",
    "429",
    "500",
    "502",
    "503",
    "504",
)


def _is_transient(exc: Exception) -> bool:
    """
    Return True if this exception is likely transient and worth retrying.

    Checks known permanent types first (programming / data errors that a
    retry can never fix), then falls back to keyword matching on the message
    for network / rate-limit signals from third-party SDKs.
    """
    if isinstance(exc, _PERMANENT_EXC_TYPES):
        return False

    # S3 / boto errors: throttling and service errors are transient; auth / not-found are not.
    try:
        import botocore.exceptions
        if isinstance(exc, botocore.exceptions.ClientError):
            code = exc.response.get("Error", {}).get("Code", "")
            return code in (
                "Throttling", "SlowDown", "ServiceUnavailable",
                "RequestTimeout", "InternalError", "RequestExpired",
            )
        if isinstance(exc, (
            botocore.exceptions.EndpointConnectionError,
            botocore.exceptions.ConnectTimeoutError,
            botocore.exceptions.ReadTimeoutError,
        )):
            return True
    except ImportError:
        pass

    # Azure SDK errors
    try:
        from azure.core.exceptions import HttpResponseError, ServiceRequestError
        if isinstance(exc, ServiceRequestError):
            return True
        if isinstance(exc, HttpResponseError):
            return exc.status_code in (429, 500, 502, 503, 504)
    except ImportError:
        pass

    # Elasticsearch client errors
    try:
        from elastic_transport import ConnectionError as ESConnectionError, TransportError
        if isinstance(exc, (ESConnectionError, TransportError)):
            return True
    except ImportError:
        pass

    # Python built-ins
    if isinstance(exc, (ConnectionError, TimeoutError)):
        return True

    # Keyword heuristic — catches Voyage AI, psycopg2, and anything else
    msg = str(exc).lower()
    return any(kw in msg for kw in _TRANSIENT_KEYWORDS)


@celery.task(bind=True, name="ingest_document", max_retries=3)
def ingest_document(self, document_id: str):
    """
    Full ingestion pipeline:
    Download from S3 → OCR → Chunk → Embed → Store vectors → Index ES → Complete

    Retry policy:
    - Transient errors (network, rate limit, 5xx): exponential backoff, up to max_retries.
      Status stays "queued" during the wait so the UI doesn't show a false "failed".
    - Permanent errors (bad document state, data corruption): fail immediately.
    - Exhausted retries: mark permanently failed with attempt count in error message.
    """
    try:
        doc = get_document(document_id)
        if not doc:
            raise ValueError(f"Document {document_id} not found in database")

        update_job_status(document_id, "processing")

        # Step 0: Clear any stale chunks from prior runs (idempotency)
        # Without this, a retry leaves the old chunks PLUS the new ones —
        # we saw 33 vectors vs 6 ES chunks earlier, that's exactly this bug.
        # Tenant_id check on pgvector prevents misuse if document_id was spoofed.
        vectordb = VectorDBService()
        search = SearchService()
        deleted_vectors = vectordb.delete_chunks_for_document(document_id, doc["tenant_id"])
        deleted_es = search.delete_chunks_for_document(document_id)
        if deleted_vectors or deleted_es:
            logger.info(
                f"Cleared stale chunks before re-ingestion: "
                f"{deleted_vectors} vectors, {deleted_es} ES docs"
            )

        # Step 1: Download PDF from S3
        logger.info(f"Downloading {doc['s3_key']} from S3")
        storage = StorageService()
        pdf_bytes = storage.download(doc["s3_key"])

        # Step 2: OCR via Azure Document Intelligence
        logger.info(f"Running OCR on document {document_id}")
        ocr = OCRService()
        ocr_result = ocr.extract(pdf_bytes)
        total_pages = ocr_result["total_pages"]

        if total_pages == 0:
            # A successfully OCR'd document with zero pages is corrupted or not a real PDF.
            # Retrying won't change this — fail immediately.
            raise ValueError(f"OCR returned 0 pages for document {document_id} — file may be corrupted")

        update_page_count(document_id, total_pages)
        update_job_status(document_id, "processing", progress=30, total_pages=total_pages)

        # Step 3: Chunk text (400 words, 60 overlap)
        logger.info(f"Chunking {total_pages} pages into segments")
        chunker = ChunkerService()
        chunks = chunker.chunk_pages(ocr_result["pages"])
        logger.info(f"Generated {len(chunks)} chunks")

        update_job_status(
            document_id, "processing", progress=50, total_pages=total_pages
        )

        # Step 4: Embed chunks via Voyage AI (batches of 20)
        logger.info(f"Embedding {len(chunks)} chunks")
        embedder = EmbeddingService()
        texts = [c["text"] for c in chunks]
        embeddings = embedder.embed_texts(texts)

        update_job_status(
            document_id, "processing", progress=70, total_pages=total_pages
        )

        # Step 5: Store vectors in pgvector (vectordb instance from Step 0)
        logger.info("Storing vectors in pgvector")
        vectordb.store_embeddings(document_id, doc["tenant_id"], chunks, embeddings)

        update_job_status(
            document_id, "processing", progress=85, total_pages=total_pages
        )

        # Step 6: Index chunks in Elasticsearch (search instance from Step 0)
        logger.info("Indexing chunks in Elasticsearch")
        search.index_chunks(
            document_id=document_id,
            tenant_id=doc["tenant_id"],
            vessel_id=doc["vessel_id"],
            scope=doc["scope"],
            title=doc["title"],
            doc_type=doc["doc_type"],
            chunks=chunks,
        )

        # Step 7: Mark complete
        update_job_status(
            document_id,
            "complete",
            progress=100,
            total_pages=total_pages,
            processed_pages=total_pages,
        )
        logger.info(f"Ingestion complete for document {document_id}")

        return {"status": "complete", "document_id": document_id, "chunks": len(chunks)}

    except Exception as exc:
        attempt = self.request.retries + 1  # human-readable (1-based)
        retries_left = self.max_retries - self.request.retries

        if not _is_transient(exc) or self.request.retries >= self.max_retries:
            # Permanent failure or retries exhausted — mark failed and stop.
            if self.request.retries >= self.max_retries:
                error_msg = (
                    f"Failed after {attempt} attempts. Last error: {exc}"
                )
                logger.error(
                    f"Ingestion permanently failed for {document_id} "
                    f"after {attempt} attempts: {exc}"
                )
            else:
                error_msg = str(exc)
                logger.error(
                    f"Permanent ingestion failure for {document_id} "
                    f"(attempt {attempt}, not retrying): {exc}"
                )
            update_job_status(document_id, "failed", error=error_msg)
            raise

        # Transient error — back off and retry. Set status to "queued" so the
        # UI shows the job is waiting, not failed. The error field carries a
        # human-readable hint about what went wrong.
        countdown = _RETRY_BASE_DELAY * (2 ** self.request.retries)
        logger.warning(
            f"Transient error on attempt {attempt} for {document_id}, "
            f"retrying in {countdown}s ({retries_left} attempt(s) left): {exc}"
        )
        update_job_status(
            document_id,
            "queued",
            error=f"Attempt {attempt} failed ({exc}), retrying in {countdown}s…",
        )
        raise self.retry(exc=exc, countdown=countdown)
