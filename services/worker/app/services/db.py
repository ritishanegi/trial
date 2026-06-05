import logging
from contextlib import contextmanager

import psycopg
from psycopg_pool import ConnectionPool

from app.config import settings

logger = logging.getLogger(__name__)

# Shared connection pool — reused across all worker threads
_pool: ConnectionPool | None = None


def get_pool() -> ConnectionPool:
    """Lazy-init a connection pool (singleton per process)."""
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            conninfo=settings.database_url,
            min_size=2,
            max_size=10,
            open=True,
        )
    return _pool


@contextmanager
def get_connection():
    """Get a connection from the pool (auto-returned on exit)."""
    pool = get_pool()
    with pool.connection() as conn:
        yield conn


def update_job_status(
    document_id: str,
    status: str,
    progress: int = 0,
    total_pages: int | None = None,
    processed_pages: int = 0,
    error: str | None = None,
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            fields = ["status = %s", "progress = %s", "processed_pages = %s"]
            params: list = [status, progress, processed_pages]

            if total_pages is not None:
                fields.append("total_pages = %s")
                params.append(total_pages)

            if status == "processing" and progress == 0:
                fields.append("started_at = NOW()")

            if status in ("complete", "failed"):
                fields.append("completed_at = NOW()")

            if error:
                fields.append("error = %s")
                params.append(error)

            params.append(document_id)
            cur.execute(
                f"UPDATE ingestion_jobs SET {', '.join(fields)} WHERE document_id = %s",
                params,
            )

            if status == "complete":
                cur.execute(
                    "UPDATE documents SET ocr_status = 'complete' WHERE id = %s",
                    (document_id,),
                )
            elif status == "failed":
                cur.execute(
                    "UPDATE documents SET ocr_status = 'failed' WHERE id = %s",
                    (document_id,),
                )
            elif status == "processing":
                cur.execute(
                    "UPDATE documents SET ocr_status = 'processing' WHERE id = %s",
                    (document_id,),
                )

        conn.commit()


def update_page_count(document_id: str, page_count: int):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE documents SET page_count = %s WHERE id = %s",
                (page_count, document_id),
            )
        conn.commit()


def get_document(document_id: str) -> dict | None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, tenant_id, vessel_id, title, doc_type, scope, s3_key FROM documents WHERE id = %s",
                (document_id,),
            )
            row = cur.fetchone()
            if not row:
                return None
            return {
                "id": row[0],
                "tenant_id": row[1],
                "vessel_id": row[2],
                "title": row[3],
                "doc_type": row[4],
                "scope": row[5],
                "s3_key": row[6],
            }
