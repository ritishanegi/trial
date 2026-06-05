import logging
import time

from app.services.ingestion.embeddings import EmbeddingService
from app.services.retrieval.search import SearchService
from app.services.retrieval.vectordb import VectorDBService
from app.services.privacy import PrivacyService
from app.services.retrieval.llm import LLMService

logger = logging.getLogger(__name__)


class RAGService:
    """
    12-step hybrid RAG pipeline:
    1. Embed question
    2. Keyword search (Elasticsearch BM25)
    3. Vector search (pgvector — vessel, fleet, master scopes)
    4. Reciprocal Rank Fusion
    5. Priority boost (vessel×1.15, fleet×1.05, master×1.00)
    6. Score threshold filter
    7. Top 10 chunks
    8. Strip PII from master chunks
    9. Build context with scope labels
    10. Stream to Claude
    11. Return answer + sources
    12. Log query
    """

    # RRF scores cap at ~1/(RRF_K+1) per search source (~0.016 with RRF_K=60).
    # A chunk hitting both searches at top rank yields ~0.033, boosted ~0.038.
    # Threshold must be well below that to allow real matches through.
    SCORE_THRESHOLD = 0.005
    TOP_K = 10
    BOOST_VESSEL = 1.15
    BOOST_FLEET = 1.05
    BOOST_MASTER = 1.00
    RRF_K = 60  # RRF constant

    def __init__(self):
        self.embedder = EmbeddingService()
        self.search = SearchService()
        self.vectordb = VectorDBService()
        self.privacy = PrivacyService()
        self.llm = LLMService()

    def query(
        self,
        question: str,
        tenant_id: str,
        vessel_id: str | None = None,
        document_id: str | None = None,
        chat_history: list[dict] | None = None,
        tenant_name: str = "",
    ) -> dict:
        """
        Non-streaming version of stream_query. Same modes:
        scoped (document_id), vessel-scoped, or tenant-wide.
        """
        start_time = time.time()

        # ─── Scoped mode: one document, all chunks ────────────────────
        if document_id:
            all_chunks = self.vectordb.get_all_chunks_for_document(
                document_id=document_id, tenant_id=tenant_id,
            )
            if not all_chunks:
                return {
                    "answer": "This document has no indexed content yet.",
                    "sources": [],
                    "response_time_ms": int((time.time() - start_time) * 1000),
                }
            context = self._build_context(all_chunks, scoped=True)
            answer = self.llm.get_answer(question, context, chat_history=chat_history)
            return {
                "answer": answer,
                "sources": self._collect_sources(all_chunks),
                "response_time_ms": int((time.time() - start_time) * 1000),
            }

        # ─── Hybrid retrieval ─────────────────────────────────────────
        query_vector = self.embedder.embed_query(question)

        keyword_results = self.search.keyword_search(
            query=question, tenant_id=tenant_id, vessel_id=vessel_id, top_k=20
        )
        vector_results = self.vectordb.vector_search(
            query_embedding=query_vector,
            tenant_id=tenant_id,
            vessel_id=vessel_id,
            top_k=20,
        )

        fused = self._reciprocal_rank_fusion(keyword_results, vector_results)

        for item in fused:
            scope = item.get("scope", "vessel")
            if scope == "vessel":
                item["final_score"] = item["rrf_score"] * self.BOOST_VESSEL
            elif scope == "fleet":
                item["final_score"] = item["rrf_score"] * self.BOOST_FLEET
            else:
                item["final_score"] = item["rrf_score"] * self.BOOST_MASTER

        fused = [r for r in fused if r["final_score"] >= self.SCORE_THRESHOLD]
        fused.sort(key=lambda x: x["final_score"], reverse=True)
        top_chunks = fused[: self.TOP_K]

        if not top_chunks:
            return {
                "answer": "I couldn't find relevant information in the available documentation to answer your question.",
                "sources": [],
                "response_time_ms": int((time.time() - start_time) * 1000),
            }

        for chunk in top_chunks:
            if chunk.get("scope") == "master":
                chunk["text"] = self.privacy.strip_master_metadata(chunk["text"], tenant_name)

        context = self._build_context(top_chunks)
        answer = self.llm.get_answer(question, context, chat_history=chat_history)

        return {
            "answer": answer,
            "sources": self._collect_sources(top_chunks),
            "response_time_ms": int((time.time() - start_time) * 1000),
        }

    def stream_query(
        self,
        question: str,
        tenant_id: str,
        vessel_id: str | None = None,
        document_id: str | None = None,
        chat_history: list[dict] | None = None,
        tenant_name: str = "",
    ):
        """
        Execute RAG pipeline and yield streaming tokens.

        Three modes:
        - document_id provided → scoped mode: fetch ALL chunks from that one
          document, ordered by page. Bypasses RRF / scoring / top-K. Used by
          "Ask about this document" flow.
        - vessel_id provided → vessel-scoped hybrid search.
        - Neither → tenant-wide hybrid search across all docs + master library.
        """
        # ─── Scoped mode: one document, all chunks ────────────────────
        if document_id:
            all_chunks = self.vectordb.get_all_chunks_for_document(
                document_id=document_id,
                tenant_id=tenant_id,
            )
            if not all_chunks:
                yield {"type": "text", "content": "This document has no indexed content yet, or you don't have access to it."}
                yield {"type": "sources", "content": []}
                yield {"type": "done"}
                return

            context = self._build_context(all_chunks, scoped=True)
            sources = self._collect_sources(all_chunks)

            for text_chunk in self.llm.stream_answer(question, context, chat_history=chat_history):
                yield {"type": "text", "content": text_chunk}

            yield {"type": "sources", "content": sources}
            yield {"type": "done"}
            return

        # ─── Hybrid retrieval mode: search across docs ────────────────
        query_vector = self.embedder.embed_query(question)

        keyword_results = self.search.keyword_search(
            query=question, tenant_id=tenant_id, vessel_id=vessel_id, top_k=20
        )
        vector_results = self.vectordb.vector_search(
            query_embedding=query_vector,
            tenant_id=tenant_id,
            vessel_id=vessel_id,
            top_k=20,
        )

        fused = self._reciprocal_rank_fusion(keyword_results, vector_results)

        for item in fused:
            scope = item.get("scope", "vessel")
            if scope == "vessel":
                item["final_score"] = item["rrf_score"] * self.BOOST_VESSEL
            elif scope == "fleet":
                item["final_score"] = item["rrf_score"] * self.BOOST_FLEET
            else:
                item["final_score"] = item["rrf_score"] * self.BOOST_MASTER

        fused = [r for r in fused if r["final_score"] >= self.SCORE_THRESHOLD]
        fused.sort(key=lambda x: x["final_score"], reverse=True)
        top_chunks = fused[: self.TOP_K]

        if not top_chunks:
            yield {"type": "text", "content": "I couldn't find relevant information in the available documentation."}
            yield {"type": "sources", "content": []}
            yield {"type": "done"}
            return

        for chunk in top_chunks:
            if chunk.get("scope") == "master":
                chunk["text"] = self.privacy.strip_master_metadata(chunk["text"], tenant_name)

        context = self._build_context(top_chunks)
        sources = self._collect_sources(top_chunks)

        for text_chunk in self.llm.stream_answer(question, context, chat_history=chat_history):
            yield {"type": "text", "content": text_chunk}

        yield {"type": "sources", "content": sources}
        yield {"type": "done"}

    def _collect_sources(self, chunks: list[dict]) -> list[dict]:
        """Deduplicate chunks by document_id, preserving first-seen page number."""
        sources = []
        seen_docs = set()
        for chunk in chunks:
            doc_id = chunk["document_id"]
            if doc_id not in seen_docs:
                seen_docs.add(doc_id)
                sources.append({
                    "document_id": doc_id,
                    "title": chunk.get("title", ""),
                    "page_number": chunk.get("page_number"),
                    "scope": chunk.get("scope", "vessel"),
                })
        return sources

    def _reciprocal_rank_fusion(
        self, keyword_results: list[dict], vector_results: list[dict]
    ) -> list[dict]:
        """Merge keyword and vector results using RRF scoring."""
        scores: dict[str, dict] = {}

        for rank, result in enumerate(keyword_results):
            key = f"{result['document_id']}:{result.get('page_number', 0)}"
            if key not in scores:
                scores[key] = {**result, "rrf_score": 0.0}
            scores[key]["rrf_score"] += 1.0 / (self.RRF_K + rank + 1)

        for rank, result in enumerate(vector_results):
            key = f"{result['document_id']}:{result.get('page_number', 0)}"
            if key not in scores:
                scores[key] = {**result, "rrf_score": 0.0}
            scores[key]["rrf_score"] += 1.0 / (self.RRF_K + rank + 1)

        return list(scores.values())

    def _build_context(self, chunks: list[dict], scoped: bool = False) -> str:
        """
        Build labeled context block for the LLM.

        scoped=True signals 'single document, all chunks present' — adds a
        framing header so the LLM knows it has the complete document and
        should answer comprehensively (e.g. output ALL table rows).
        """
        sections = []
        for chunk in chunks:
            scope = chunk.get("scope", "vessel").upper()
            title = chunk.get("title", "Unknown Document")
            page = chunk.get("page_number", "?")
            sections.append(
                f"[{scope}] {title} (Page {page}):\n{chunk['text']}"
            )
        body = "\n\n---\n\n".join(sections)

        if scoped and chunks:
            doc_title = chunks[0].get("title", "this document")
            preamble = (
                f"The following is the COMPLETE content of one document: "
                f"'{doc_title}'. All available chunks from this document are "
                f"included below, ordered by page. Answer the user's question "
                f"comprehensively using only this content. Do not refer to "
                f"other documents — there are none in scope.\n\n"
            )
            return preamble + body

        return body
