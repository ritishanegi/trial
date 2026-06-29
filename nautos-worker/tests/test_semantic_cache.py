"""
Tests for app.services.retrieval.semantic_cache — SemanticCache

All Redis interactions are mocked using unittest.mock so these tests
run completely offline without a live Redis instance.
"""

from __future__ import annotations

import json
import struct
import time
from unittest.mock import MagicMock, call, patch

import pytest

from app.services.retrieval.semantic_cache import (
    CacheHit,
    SemanticCache,
    _cosine_similarity,
    _decode_embedding,
    _encode_embedding,
    _make_key,
)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_embedding(dim: int = 8, value: float = 0.5) -> list[float]:
    """Return a normalised embedding vector of the given dimension."""
    raw = [value] * dim
    magnitude = sum(x * x for x in raw) ** 0.5
    return [x / magnitude for x in raw]


def _encoded(embedding: list[float]) -> bytes:
    return struct.pack(f"<{len(embedding)}f", *embedding)


# ── Tests — _cosine_similarity ────────────────────────────────────────────────


class TestCosineSimilarity:
    def test_identical_vectors_return_one(self) -> None:
        v = _make_embedding(16)
        assert abs(_cosine_similarity(v, v) - 1.0) < 1e-6

    def test_opposite_vectors_return_negative_one(self) -> None:
        v = _make_embedding(8, 1.0)
        neg_v = [-x for x in v]
        assert abs(_cosine_similarity(v, neg_v) - (-1.0)) < 1e-6

    def test_orthogonal_vectors_return_zero(self) -> None:
        a = [1.0, 0.0, 0.0, 0.0]
        b = [0.0, 1.0, 0.0, 0.0]
        assert abs(_cosine_similarity(a, b)) < 1e-9

    def test_dimension_mismatch_raises_value_error(self) -> None:
        with pytest.raises(ValueError, match="dimension mismatch"):
            _cosine_similarity([1.0, 2.0], [1.0, 2.0, 3.0])

    def test_zero_vector_returns_zero(self) -> None:
        zero = [0.0, 0.0, 0.0]
        v = [1.0, 0.0, 0.0]
        assert _cosine_similarity(zero, v) == 0.0

    def test_similar_but_not_identical(self) -> None:
        a = [1.0, 0.0, 0.0]
        b = [0.9, 0.1, 0.0]
        sim = _cosine_similarity(a, b)
        assert 0.9 < sim < 1.0


# ── Tests — _encode_embedding / _decode_embedding ─────────────────────────────


class TestEmbeddingCodec:
    def test_encode_then_decode_is_lossless(self) -> None:
        original = [0.1, -0.5, 0.99, 0.0, 1.0]
        decoded = _decode_embedding(_encode_embedding(original))
        for a, b in zip(original, decoded, strict=True):
            assert abs(a - b) < 1e-6

    def test_encoded_size_is_four_bytes_per_float(self) -> None:
        embedding = [0.1] * 10
        assert len(_encode_embedding(embedding)) == 40

    def test_empty_embedding_encodes_to_empty_bytes(self) -> None:
        assert _encode_embedding([]) == b""
        assert _decode_embedding(b"") == []


# ── Tests — _make_key ─────────────────────────────────────────────────────────


class TestMakeKey:
    def test_same_embedding_produces_same_key(self) -> None:
        emb = _make_embedding(8)
        assert _make_key(emb) == _make_key(emb)

    def test_different_embeddings_produce_different_keys(self) -> None:
        a = _make_embedding(8, 0.3)
        b = _make_embedding(8, 0.7)
        assert _make_key(a) != _make_key(b)

    def test_key_is_32_characters(self) -> None:
        assert len(_make_key(_make_embedding(8))) == 32

    def test_minor_floating_point_noise_produces_same_key(self) -> None:
        """Rounding to 4dp should absorb tiny floating-point differences."""
        emb = _make_embedding(8)
        noisy = [x + 1e-7 for x in emb]
        assert _make_key(emb) == _make_key(noisy)


# ── Tests — SemanticCache.get ─────────────────────────────────────────────────


class TestSemanticCacheGet:
    @pytest.fixture()
    def mock_redis(self) -> MagicMock:
        return MagicMock()

    @pytest.fixture()
    def cache(self, mock_redis: MagicMock) -> SemanticCache:
        return SemanticCache(
            redis_client=mock_redis,
            similarity_threshold=0.90,
            ttl_seconds=3600,
            max_entries_per_tenant=100,
        )

    def test_returns_none_when_no_entries_in_index(
        self, cache: SemanticCache, mock_redis: MagicMock
    ) -> None:
        mock_redis.zrange.return_value = []
        assert cache.get(_make_embedding(), "ten-001") is None

    def test_returns_cache_hit_when_similarity_above_threshold(
        self, cache: SemanticCache, mock_redis: MagicMock
    ) -> None:
        embedding = _make_embedding(8)
        sha_key = _make_key(embedding)

        mock_redis.zrange.return_value = [sha_key.encode()]

        # Build a fake pipeline that returns one entry
        pipeline_mock = MagicMock()
        pipeline_mock.__enter__ = MagicMock(return_value=pipeline_mock)
        pipeline_mock.__exit__ = MagicMock(return_value=False)
        pipeline_mock.execute.return_value = [
            {
                b"embedding": _encoded(embedding),
                b"answer": b"MARPOL Annex VI limits sulphur content.",
                b"sources": json.dumps([{"document_id": "d1", "title": "MARPOL"}]).encode(),
                b"question": b"What does MARPOL Annex VI regulate?",
            }
        ]
        mock_redis.pipeline.return_value = pipeline_mock

        hit = cache.get(embedding, "ten-001")

        assert hit is not None
        assert isinstance(hit, CacheHit)
        assert hit.similarity >= 0.90
        assert "MARPOL" in hit.answer
        assert hit.question == "What does MARPOL Annex VI regulate?"

    def test_returns_none_when_similarity_below_threshold(
        self, cache: SemanticCache, mock_redis: MagicMock
    ) -> None:
        query_emb = _make_embedding(8, 0.1)    # points in one direction
        cached_emb = _make_embedding(8, 0.9)   # different direction → low similarity
        sha_key = _make_key(cached_emb)

        mock_redis.zrange.return_value = [sha_key.encode()]

        pipeline_mock = MagicMock()
        pipeline_mock.execute.return_value = [
            {
                b"embedding": _encoded(cached_emb),
                b"answer": b"Some answer.",
                b"sources": b"[]",
                b"question": b"Different question.",
            }
        ]
        mock_redis.pipeline.return_value = pipeline_mock

        result = cache.get(query_emb, "ten-001")
        assert result is None

    def test_returns_none_on_redis_connection_error(
        self, cache: SemanticCache, mock_redis: MagicMock
    ) -> None:
        import redis as _redis

        mock_redis.zrange.side_effect = _redis.RedisError("Connection refused")
        result = cache.get(_make_embedding(), "ten-001")
        assert result is None

    def test_updates_lru_score_on_hit(
        self, cache: SemanticCache, mock_redis: MagicMock
    ) -> None:
        embedding = _make_embedding(8)
        sha_key = _make_key(embedding)
        mock_redis.zrange.return_value = [sha_key.encode()]

        pipeline_mock = MagicMock()
        pipeline_mock.execute.return_value = [
            {
                b"embedding": _encoded(embedding),
                b"answer": b"Answer.",
                b"sources": b"[]",
                b"question": b"Question.",
            }
        ]
        mock_redis.pipeline.return_value = pipeline_mock

        cache.get(embedding, "ten-001")

        # zadd should be called to update the LRU score
        mock_redis.zadd.assert_called_once()
        index_key = mock_redis.zadd.call_args[0][0]
        assert "ten-001" in index_key


# ── Tests — SemanticCache.set ─────────────────────────────────────────────────


class TestSemanticCacheSet:
    @pytest.fixture()
    def mock_redis(self) -> MagicMock:
        r = MagicMock()
        # zcard returns 0 by default (no overflow)
        r.zcard.return_value = 0
        return r

    @pytest.fixture()
    def cache(self, mock_redis: MagicMock) -> SemanticCache:
        return SemanticCache(
            redis_client=mock_redis,
            similarity_threshold=0.90,
            ttl_seconds=3600,
            max_entries_per_tenant=5,
        )

    def test_set_calls_hset_with_required_fields(
        self, cache: SemanticCache, mock_redis: MagicMock
    ) -> None:
        pipeline_mock = MagicMock()
        pipeline_mock.execute.return_value = [True, True, True]
        mock_redis.pipeline.return_value = pipeline_mock

        result = cache.set(
            query_embedding=_make_embedding(8),
            question="What is MARPOL?",
            answer="MARPOL is a marine pollution convention.",
            sources=[{"document_id": "d1", "title": "MARPOL", "page_number": 1, "scope": "vessel"}],
            tenant_id="ten-001",
        )

        assert result is True
        # hset must have been called with all required fields
        hset_call = pipeline_mock.hset.call_args
        mapping = hset_call.kwargs["mapping"]
        assert "embedding" in mapping
        assert "answer" in mapping
        assert "sources" in mapping
        assert "question" in mapping
        assert "created_at" in mapping

    def test_set_returns_false_on_redis_error(
        self, cache: SemanticCache, mock_redis: MagicMock
    ) -> None:
        import redis as _redis

        pipeline_mock = MagicMock()
        pipeline_mock.execute.side_effect = _redis.RedisError("Timeout")
        mock_redis.pipeline.return_value = pipeline_mock

        result = cache.set(
            query_embedding=_make_embedding(8),
            question="Q",
            answer="A",
            sources=[],
            tenant_id="ten-001",
        )
        assert result is False

    def test_eviction_triggered_when_over_limit(
        self, cache: SemanticCache, mock_redis: MagicMock
    ) -> None:
        # 7 entries, limit is 5 → 2 should be evicted
        mock_redis.zcard.return_value = 7

        eviction_pipe = MagicMock()
        eviction_pipe.execute.return_value = [1, 1]
        mock_redis.zpopmin.return_value = [(b"key1", 1.0), (b"key2", 2.0)]

        set_pipe = MagicMock()
        set_pipe.execute.return_value = [True, True, True]

        # First pipeline call is the SET, second is eviction
        mock_redis.pipeline.side_effect = [set_pipe, eviction_pipe]

        cache.set(
            query_embedding=_make_embedding(8),
            question="Q",
            answer="A",
            sources=[],
            tenant_id="ten-001",
        )

        # zpopmin should be called with overflow=2
        mock_redis.zpopmin.assert_called_once_with(
            f"nautos:sc:index:ten-001", 2
        )


# ── Tests — SemanticCache.invalidate ──────────────────────────────────────────


class TestSemanticCacheInvalidate:
    def test_invalidate_deletes_all_tenant_entries(self) -> None:
        mock_redis = MagicMock()
        mock_redis.zrange.return_value = [b"key1", b"key2", b"key3"]

        pipe_mock = MagicMock()
        pipe_mock.execute.return_value = [1, 1, 1, 1]
        mock_redis.pipeline.return_value = pipe_mock

        cache = SemanticCache(redis_client=mock_redis, similarity_threshold=0.9,
                              ttl_seconds=3600, max_entries_per_tenant=100)
        deleted = cache.invalidate("ten-001")

        assert deleted == 3

    def test_invalidate_returns_zero_when_no_entries(self) -> None:
        mock_redis = MagicMock()
        mock_redis.zrange.return_value = []
        cache = SemanticCache(redis_client=mock_redis, similarity_threshold=0.9,
                              ttl_seconds=3600, max_entries_per_tenant=100)
        assert cache.invalidate("ten-empty") == 0


# ── Tests — SemanticCache.stats ───────────────────────────────────────────────


class TestSemanticCacheStats:
    def test_stats_returns_entry_count(self) -> None:
        mock_redis = MagicMock()
        mock_redis.zcard.return_value = 42
        now = time.time()
        mock_redis.zrange.side_effect = [
            [(b"oldest", now - 3600)],
            [(b"newest", now - 60)],
        ]

        cache = SemanticCache(redis_client=mock_redis, similarity_threshold=0.92,
                              ttl_seconds=86400, max_entries_per_tenant=500)
        stats = cache.stats("ten-001")

        assert stats["entry_count"] == 42
        assert "oldest_entry_age_seconds" in stats
        assert "newest_entry_age_seconds" in stats

    def test_stats_zero_when_empty(self) -> None:
        mock_redis = MagicMock()
        mock_redis.zcard.return_value = 0
        cache = SemanticCache(redis_client=mock_redis, similarity_threshold=0.92,
                              ttl_seconds=86400, max_entries_per_tenant=500)
        assert cache.stats("ten-001")["entry_count"] == 0
