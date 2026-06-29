"""
Tests for app.services.retrieval.rag — RAGService

All external dependencies (EmbeddingService, SearchService, VectorDBService,
PrivacyService, LLMService) are mocked so tests run offline.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.services.retrieval.rag import RAGService


# ── Fixtures ──────────────────────────────────────────────────────────────────


def _chunk(
    document_id: str = "doc-1",
    page_number: int = 1,
    text: str = "Sample chunk text.",
    scope: str = "vessel",
    title: str = "Test Document",
) -> dict:
    """Factory for a fake retrieval chunk dict."""
    return {
        "document_id": document_id,
        "page_number": page_number,
        "text": text,
        "scope": scope,
        "title": title,
    }


@pytest.fixture()
def rag_service(monkeypatch: pytest.MonkeyPatch) -> RAGService:
    """
    Return a RAGService with all external service dependencies mocked.
    Patches at class-import level so no real clients are instantiated.
    """
    with (
        patch("app.services.retrieval.rag.EmbeddingService") as mock_emb,
        patch("app.services.retrieval.rag.SearchService") as mock_search,
        patch("app.services.retrieval.rag.VectorDBService") as mock_vdb,
        patch("app.services.retrieval.rag.PrivacyService") as mock_priv,
        patch("app.services.retrieval.rag.LLMService") as mock_llm,
    ):
        svc = RAGService()

        # Sensible defaults — override per-test as needed
        svc.embedder.embed_query.return_value = [0.1] * 1024
        svc.search.keyword_search.return_value = []
        svc.vectordb.vector_search.return_value = []
        svc.vectordb.get_all_chunks_for_document.return_value = []
        svc.privacy.strip_master_metadata.side_effect = lambda text, _: text
        svc.llm.get_answer.return_value = "This is the answer."
        svc.llm.stream_answer.return_value = iter(["Token1 ", "Token2"])

        yield svc


# ── Tests — _reciprocal_rank_fusion ──────────────────────────────────────────


class TestReciprocalRankFusion:
    def test_rrf_scores_are_additive_for_shared_results(self) -> None:
        """A chunk appearing in both lists must have a higher RRF score than one in only one."""
        rag = RAGService.__new__(RAGService)
        rag.RRF_K = 60

        keyword = [_chunk(document_id="doc-A", page_number=1)]
        vector = [_chunk(document_id="doc-A", page_number=1)]

        fused = rag._reciprocal_rank_fusion(keyword, vector)

        # doc-A should appear exactly once with doubled score
        assert len(fused) == 1
        expected_score = 1.0 / (60 + 1) + 1.0 / (60 + 1)
        assert abs(fused[0]["rrf_score"] - expected_score) < 1e-9

    def test_rrf_with_disjoint_results_returns_both(self) -> None:
        """Chunks from separate lists that don't overlap should both appear."""
        rag = RAGService.__new__(RAGService)
        rag.RRF_K = 60

        keyword = [_chunk(document_id="doc-A", page_number=1)]
        vector = [_chunk(document_id="doc-B", page_number=2)]

        fused = rag._reciprocal_rank_fusion(keyword, vector)
        doc_ids = {r["document_id"] for r in fused}
        assert doc_ids == {"doc-A", "doc-B"}

    def test_rrf_empty_inputs_returns_empty_list(self) -> None:
        rag = RAGService.__new__(RAGService)
        rag.RRF_K = 60

        assert rag._reciprocal_rank_fusion([], []) == []

    def test_rrf_rank_order_affects_score(self) -> None:
        """A chunk ranked #1 must score higher than one ranked #5."""
        rag = RAGService.__new__(RAGService)
        rag.RRF_K = 60

        # doc-A is rank 0 (top), doc-B is rank 4
        keyword = [
            _chunk(document_id="doc-A", page_number=1),
            _chunk(document_id="doc-B", page_number=1),
            _chunk(document_id="doc-C", page_number=1),
            _chunk(document_id="doc-D", page_number=1),
            _chunk(document_id="doc-E", page_number=1),  # rank 4
        ]

        fused = rag._reciprocal_rank_fusion(keyword, [])
        scores = {r["document_id"]: r["rrf_score"] for r in fused}
        assert scores["doc-A"] > scores["doc-E"]


# ── Tests — _collect_sources ─────────────────────────────────────────────────


class TestCollectSources:
    def test_deduplication_by_document_id(self) -> None:
        """Multiple chunks from the same document should produce one source."""
        rag = RAGService.__new__(RAGService)

        chunks = [
            _chunk(document_id="doc-1", page_number=2),
            _chunk(document_id="doc-1", page_number=5),  # duplicate
            _chunk(document_id="doc-2", page_number=1),
        ]

        sources = rag._collect_sources(chunks)
        assert len(sources) == 2
        source_ids = {s["document_id"] for s in sources}
        assert source_ids == {"doc-1", "doc-2"}

    def test_first_seen_page_number_is_preserved(self) -> None:
        """The page_number in the source should come from the first chunk seen."""
        rag = RAGService.__new__(RAGService)

        chunks = [
            _chunk(document_id="doc-1", page_number=3),
            _chunk(document_id="doc-1", page_number=10),
        ]

        sources = rag._collect_sources(chunks)
        assert sources[0]["page_number"] == 3

    def test_empty_chunks_returns_empty_sources(self) -> None:
        rag = RAGService.__new__(RAGService)
        assert rag._collect_sources([]) == []

    def test_source_contains_expected_fields(self) -> None:
        rag = RAGService.__new__(RAGService)
        chunks = [_chunk(document_id="doc-1", title="My Doc", scope="fleet")]

        source = rag._collect_sources(chunks)[0]
        assert source["document_id"] == "doc-1"
        assert source["title"] == "My Doc"
        assert source["scope"] == "fleet"


# ── Tests — _build_context ────────────────────────────────────────────────────


class TestBuildContext:
    def test_context_contains_chunk_text(self) -> None:
        rag = RAGService.__new__(RAGService)
        chunks = [_chunk(text="Important regulation text.")]

        context = rag._build_context(chunks)
        assert "Important regulation text." in context

    def test_scoped_mode_prepends_preamble(self) -> None:
        rag = RAGService.__new__(RAGService)
        chunks = [_chunk(title="MARPOL Annex VI", text="Some content.")]

        context = rag._build_context(chunks, scoped=True)
        assert "MARPOL Annex VI" in context
        assert "COMPLETE content" in context

    def test_non_scoped_mode_has_no_preamble(self) -> None:
        rag = RAGService.__new__(RAGService)
        chunks = [_chunk(text="Chunk content.")]

        context = rag._build_context(chunks, scoped=False)
        assert "COMPLETE content" not in context

    def test_multiple_chunks_separated_by_divider(self) -> None:
        rag = RAGService.__new__(RAGService)
        chunks = [
            _chunk(text="First chunk.", document_id="d1"),
            _chunk(text="Second chunk.", document_id="d2"),
        ]

        context = rag._build_context(chunks)
        assert "First chunk." in context
        assert "Second chunk." in context
        assert "---" in context

    def test_scope_label_is_uppercased_in_context(self) -> None:
        rag = RAGService.__new__(RAGService)
        chunks = [_chunk(scope="fleet")]

        context = rag._build_context(chunks)
        assert "[FLEET]" in context


# ── Tests — query (integration-style with mocks) ──────────────────────────────


class TestRAGQuery:
    def test_query_returns_fallback_when_no_chunks_retrieved(
        self, rag_service: RAGService
    ) -> None:
        """When RRF produces no results above the threshold, a fallback message is returned."""
        rag_service.search.keyword_search.return_value = []
        rag_service.vectordb.vector_search.return_value = []

        result = rag_service.query(
            question="What is MARPOL?",
            tenant_id="ten-001",
        )

        assert "couldn't find" in result["answer"].lower()
        assert result["sources"] == []
        assert "response_time_ms" in result

    def test_query_returns_answer_and_sources_when_chunks_found(
        self, rag_service: RAGService
    ) -> None:
        """With chunks above threshold, the LLM answer and sources must be returned."""
        # Provide chunks that will survive scoring + threshold
        chunk = _chunk(document_id="doc-99", page_number=1)
        rag_service.search.keyword_search.return_value = [chunk]
        rag_service.vectordb.vector_search.return_value = [chunk]
        rag_service.llm.get_answer.return_value = "MARPOL regulates marine pollution."

        result = rag_service.query(question="What is MARPOL?", tenant_id="ten-001")

        assert result["answer"] == "MARPOL regulates marine pollution."
        assert len(result["sources"]) >= 1
        assert result["sources"][0]["document_id"] == "doc-99"

    def test_query_scoped_mode_uses_all_document_chunks(
        self, rag_service: RAGService
    ) -> None:
        """When document_id is provided, vectordb.get_all_chunks_for_document is called."""
        doc_chunks = [_chunk(document_id="doc-scope")]
        rag_service.vectordb.get_all_chunks_for_document.return_value = doc_chunks
        rag_service.llm.get_answer.return_value = "Scoped answer."

        result = rag_service.query(
            question="Summarise this doc.",
            tenant_id="ten-001",
            document_id="doc-scope",
        )

        rag_service.vectordb.get_all_chunks_for_document.assert_called_once()
        assert result["answer"] == "Scoped answer."

    def test_query_scoped_mode_empty_document_returns_no_content_message(
        self, rag_service: RAGService
    ) -> None:
        rag_service.vectordb.get_all_chunks_for_document.return_value = []

        result = rag_service.query(
            question="Tell me about this doc.",
            tenant_id="ten-001",
            document_id="doc-empty",
        )

        assert "no indexed content" in result["answer"].lower()

    def test_query_strips_pii_from_master_scope_chunks(
        self, rag_service: RAGService
    ) -> None:
        """Master-scope chunks must have privacy.strip_master_metadata applied."""
        master_chunk = _chunk(scope="master", text="Confidential crew data: John Doe")
        rag_service.search.keyword_search.return_value = [master_chunk]
        rag_service.vectordb.vector_search.return_value = [master_chunk]

        rag_service.query(question="Fleet info?", tenant_id="ten-001")

        rag_service.privacy.strip_master_metadata.assert_called()


# ── Tests — stream_query ──────────────────────────────────────────────────────


class TestRAGStreamQuery:
    def test_stream_query_yields_text_sources_done_tokens(
        self, rag_service: RAGService
    ) -> None:
        """The stream must always end with a 'sources' and 'done' token."""
        chunk = _chunk()
        rag_service.search.keyword_search.return_value = [chunk]
        rag_service.vectordb.vector_search.return_value = [chunk]

        tokens = list(
            rag_service.stream_query(question="Test question", tenant_id="ten-001")
        )
        token_types = [t["type"] for t in tokens]

        assert "text" in token_types
        assert "sources" in token_types
        assert token_types[-1] == "done"

    def test_stream_query_empty_results_still_ends_with_done(
        self, rag_service: RAGService
    ) -> None:
        """Even with no chunks, the stream must terminate with a 'done' token."""
        rag_service.search.keyword_search.return_value = []
        rag_service.vectordb.vector_search.return_value = []

        tokens = list(
            rag_service.stream_query(question="?", tenant_id="ten-001")
        )
        assert tokens[-1]["type"] == "done"
