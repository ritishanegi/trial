import psycopg
from pgvector.psycopg import register_vector

from app.services.db import get_connection


class VectorDBService:
    """PostgreSQL pgvector storage for document embeddings."""

    def store_embeddings(
        self,
        document_id: str,
        tenant_id: str,
        chunks: list[dict],
        embeddings: list[list[float]],
    ) -> None:
        """Store chunk embeddings in the embeddings table."""
        with get_connection() as conn:
            register_vector(conn)
            with conn.cursor() as cur:
                for chunk, embedding in zip(chunks, embeddings):
                    cur.execute(
                        """
                        INSERT INTO embeddings (document_id, tenant_id, chunk_text, chunk_index, page_number, embedding)
                        VALUES (%s, %s, %s, %s, %s, %s::vector)
                        """,
                        (
                            document_id,
                            tenant_id,
                            chunk["text"],
                            chunk["chunk_index"],
                            chunk["start_page"],
                            str(embedding),
                        ),
                    )
            conn.commit()

    def vector_search(
        self,
        query_embedding: list[float],
        tenant_id: str,
        vessel_id: str | None = None,
        top_k: int = 10,
    ) -> list[dict]:
        """
        Cosine similarity search across tenant embeddings + master library.
        Returns results with scope labels for RRF priority boosting.
        """
        results = []
        embedding_str = str(query_embedding)

        with get_connection() as conn:
            register_vector(conn)
            with conn.cursor() as cur:
                # --- Tenant-scoped embeddings (vessel + fleet) ---
                if vessel_id:
                    # Vessel-specific search
                    cur.execute(
                        """
                        SELECT e.document_id, e.chunk_text, e.page_number, e.chunk_index,
                               1 - (e.embedding <=> %s::vector) as score,
                               d.scope, d.title
                        FROM embeddings e
                        JOIN documents d ON d.id = e.document_id
                        WHERE e.tenant_id = %s AND d.vessel_id = %s
                        ORDER BY e.embedding <=> %s::vector
                        LIMIT %s
                        """,
                        (embedding_str, tenant_id, vessel_id, embedding_str, top_k),
                    )
                else:
                    # Fleet-wide search
                    cur.execute(
                        """
                        SELECT e.document_id, e.chunk_text, e.page_number, e.chunk_index,
                               1 - (e.embedding <=> %s::vector) as score,
                               d.scope, d.title
                        FROM embeddings e
                        JOIN documents d ON d.id = e.document_id
                        WHERE e.tenant_id = %s
                        ORDER BY e.embedding <=> %s::vector
                        LIMIT %s
                        """,
                        (embedding_str, tenant_id, embedding_str, top_k),
                    )

                for row in cur.fetchall():
                    results.append({
                        "document_id": row[0],
                        "text": row[1],
                        "page_number": row[2],
                        "chunk_index": row[3],
                        "score": float(row[4]),
                        "scope": row[5] or "vessel",
                        "title": row[6] or "",
                    })

                # --- Master library embeddings (shared, PII-stripped) ---
                try:
                    cur.execute(
                        """
                        SELECT me.master_id::text, me.chunk_text, me.page_number, me.chunk_index,
                               1 - (me.embedding <=> %s::vector) as score,
                               ml.title
                        FROM master_embeddings me
                        JOIN master_library ml ON ml.id = me.master_id
                        WHERE me.is_active = true AND ml.is_active = true AND ml.review_status = 'approved'
                        ORDER BY me.embedding <=> %s::vector
                        LIMIT %s
                        """,
                        (embedding_str, embedding_str, top_k),
                    )

                    for row in cur.fetchall():
                        results.append({
                            "document_id": row[0],
                            "text": row[1],
                            "page_number": row[2],
                            "chunk_index": row[3],
                            "score": float(row[4]),
                            "scope": "master",
                            "title": row[5] or "",
                        })
                except Exception:
                    # Master library may be empty — that's fine, skip it
                    pass

        return results

    def delete_chunks_for_document(
        self,
        document_id: str,
        tenant_id: str,
    ) -> int:
        """
        Remove all pgvector chunks for a document. Tenant_id check makes this
        safe to expose — a malicious caller can't delete other tenants' data.

        Called at the start of every ingestion run to make re-ingestion
        idempotent (otherwise retries leave stale duplicate vectors that
        skew vector search results).

        Returns the number of rows deleted.
        """
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM embeddings WHERE document_id = %s AND tenant_id = %s",
                    (document_id, tenant_id),
                )
                deleted = cur.rowcount
            conn.commit()
        return deleted

    def get_all_chunks_for_document(
        self,
        document_id: str,
        tenant_id: str,
    ) -> list[dict]:
        """
        Retrieve ALL chunks for one document, ordered by page + chunk index.
        Used for document-scoped queries where we bypass top-K and feed the
        whole document to the LLM. Tenant_id check prevents cross-tenant leaks.
        """
        results = []
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT e.document_id, e.chunk_text, e.page_number, e.chunk_index,
                           d.scope, d.title
                    FROM embeddings e
                    JOIN documents d ON d.id = e.document_id
                    WHERE e.document_id = %s AND e.tenant_id = %s
                    ORDER BY e.page_number ASC NULLS LAST, e.chunk_index ASC
                    """,
                    (document_id, tenant_id),
                )
                for row in cur.fetchall():
                    results.append({
                        "document_id": row[0],
                        "text": row[1],
                        "page_number": row[2],
                        "chunk_index": row[3],
                        "score": 1.0,  # No score in scoped mode — all chunks are relevant
                        "scope": row[4] or "vessel",
                        "title": row[5] or "",
                    })
        return results
