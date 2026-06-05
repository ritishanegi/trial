from elasticsearch import Elasticsearch

from app.config import settings


class SearchService:
    """Elasticsearch hybrid search with Reciprocal Rank Fusion."""

    INDEX_NAME = "nautos_chunks"

    def __init__(self):
        self.es = Elasticsearch(settings.elasticsearch_url)
        self._ensure_index()

    def _ensure_index(self):
        try:
            self.es.indices.get(index=self.INDEX_NAME)
        except Exception:
            self.es.indices.create(
                index=self.INDEX_NAME,
                mappings={
                    "properties": {
                        "text": {"type": "text", "analyzer": "standard"},
                        "document_id": {"type": "keyword"},
                        "tenant_id": {"type": "keyword"},
                        "vessel_id": {"type": "keyword"},
                        "scope": {"type": "keyword"},
                        "page_number": {"type": "integer"},
                        "chunk_index": {"type": "integer"},
                        "doc_type": {"type": "keyword"},
                        "title": {"type": "text"},
                    }
                },
            )

    def index_chunks(
        self,
        document_id: str,
        tenant_id: str,
        vessel_id: str | None,
        scope: str,
        title: str,
        doc_type: str,
        chunks: list[dict],
    ) -> None:
        """
        Index document chunks for BM25 keyword search.

        Each chunk gets a deterministic _id = "{document_id}:{chunk_index}" so
        that re-running ingestion UPSERTS existing chunks instead of appending
        duplicates. Combined with delete_chunks_for_document at the top of the
        ingestion task, this makes the whole pipeline safely re-runnable.
        """
        actions = []
        for chunk in chunks:
            doc_chunk_id = f"{document_id}:{chunk['chunk_index']}"
            actions.append({"index": {"_index": self.INDEX_NAME, "_id": doc_chunk_id}})
            actions.append({
                "text": chunk["text"],
                "document_id": document_id,
                "tenant_id": tenant_id,
                "vessel_id": vessel_id or "",
                "scope": scope,
                "page_number": chunk["start_page"],
                "chunk_index": chunk["chunk_index"],
                "doc_type": doc_type,
                "title": title,
            })

        if actions:
            self.es.bulk(operations=actions, refresh=True)

    def delete_chunks_for_document(self, document_id: str) -> int:
        """
        Remove all ES chunks for a document. Called at the start of every
        ingestion run so that retries don't compound stale data.

        Returns the number of chunks deleted.
        """
        try:
            result = self.es.delete_by_query(
                index=self.INDEX_NAME,
                query={"term": {"document_id": document_id}},
                refresh=True,
            )
            return result.get("deleted", 0)
        except Exception:
            # Index might not exist yet on first run — that's fine
            return 0

    def keyword_search(
        self,
        query: str,
        tenant_id: str,
        vessel_id: str | None = None,
        top_k: int = 20,
    ) -> list[dict]:
        """BM25 keyword search scoped to tenant."""
        must = [
            {"multi_match": {"query": query, "fields": ["text^2", "title"], "type": "best_fields"}},
            {"term": {"tenant_id": tenant_id}},
        ]

        if vessel_id:
            must.append({"term": {"vessel_id": vessel_id}})

        result = self.es.search(
            index=self.INDEX_NAME,
            query={"bool": {"must": must}},
            size=top_k,
        )

        hits = []
        for hit in result["hits"]["hits"]:
            src = hit["_source"]
            hits.append({
                "document_id": src["document_id"],
                "text": src["text"],
                "page_number": src["page_number"],
                "scope": src["scope"],
                "title": src["title"],
                "score": hit["_score"],
            })
        return hits
