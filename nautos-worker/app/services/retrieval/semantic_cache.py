"""
app/services/retrieval/semantic_cache.py

Redis-backed Semantic Cache for the nautos RAG pipeline.

╔══════════════════════════════════════════════════════════════════════════════╗
║  CONCEPT                                                                    ║
║                                                                              ║
║  Instead of caching by exact query string (which misses paraphrases),       ║
║  this cache uses VECTOR SIMILARITY to match new queries against past ones.   ║
║                                                                              ║
║  If a new query embedding is ≥ SIMILARITY_THRESHOLD (default 0.92) cosine   ║
║  similar to a cached query, we skip the entire RAG pipeline and return the  ║
║  cached answer immediately — saving ~2–30 seconds of LLM latency and        ║
║  hundreds of token API costs per cache hit.                                  ║
║                                                                              ║
║  Storage layout in Redis:                                                    ║
║                                                                              ║
║    HASH  nautos:sc:{tenant_id}:{sha256_key}                                  ║
║          ├── embedding   (msgpack-encoded float32 list)                      ║
║          ├── answer      (str)                                               ║
║          ├── sources     (JSON array)                                        ║
║          ├── question    (str — for cache inspection / debugging)            ║
║          └── created_at  (ISO timestamp)                                     ║
║                                                                              ║
║    ZSET  nautos:sc:index:{tenant_id}                                         ║
║          score = unix timestamp of last access (LRU eviction ordering)       ║
║          member = sha256_key                                                  ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

Integration with RAGService (rag.py):

    cache = SemanticCache()

    # In query() / stream_query() — BEFORE the embedding + retrieval pipeline:
    hit = cache.get(query_embedding, tenant_id=tenant_id)
    if hit:
        logger.info("Cache hit (similarity=%.4f) for tenant %s", hit.similarity, tenant_id)
        return {"answer": hit.answer, "sources": hit.sources, "cache_hit": True, ...}

    # After the LLM returns its answer:
    cache.set(query_embedding, question=question, answer=answer,
              sources=sources, tenant_id=tenant_id)
"""

from __future__ import annotations

import hashlib
import json
import logging
import struct
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import redis

from app.config import settings

logger = logging.getLogger(__name__)

# ── Redis key prefixes ─────────────────────────────────────────────────────────
_HASH_PREFIX = "nautos:sc"          # HASH key: nautos:sc:{tenant_id}:{sha_key}
_INDEX_PREFIX = "nautos:sc:index"   # ZSET key: nautos:sc:index:{tenant_id}


# ── Result type ────────────────────────────────────────────────────────────────

@dataclass(frozen=True, slots=True)
class CacheHit:
    """
    Returned when a semantically similar cached answer is found.

    Attributes:
        answer:     The cached LLM answer text.
        sources:    List of source dicts (document_id, title, page_number, scope).
        similarity: Cosine similarity score between the new query and the cached query.
        question:   The original question that produced this cached answer.
    """
    answer: str
    sources: list[dict[str, Any]]
    similarity: float
    question: str


# ── Embedding codec ────────────────────────────────────────────────────────────

def _encode_embedding(embedding: list[float]) -> bytes:
    """Pack a float list into compact binary (4 bytes per float, little-endian)."""
    return struct.pack(f"<{len(embedding)}f", *embedding)


def _decode_embedding(data: bytes) -> list[float]:
    """Unpack a binary blob back into a float list."""
    count = len(data) // 4
    return list(struct.unpack(f"<{count}f", data))


# ── Cosine similarity (no numpy dependency) ───────────────────────────────────

def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """
    Compute cosine similarity between two embedding vectors.

    Uses pure Python to avoid a numpy import in the Redis hot-path.
    For 1024-dim voyage-3-large embeddings this takes ~0.1 ms — acceptable.

    Returns a value in [-1.0, 1.0]; higher = more similar.
    """
    if len(a) != len(b):
        raise ValueError(f"Embedding dimension mismatch: {len(a)} vs {len(b)}")

    dot = sum(x * y for x, y in zip(a, b, strict=True))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(x * x for x in b) ** 0.5

    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0

    return dot / (norm_a * norm_b)


# ── Cache key generation ───────────────────────────────────────────────────────

def _make_key(embedding: list[float]) -> str:
    """
    Generate a deterministic short key from an embedding vector.

    We round each dimension to 4 decimal places before hashing so that
    floating-point noise from repeated Voyage AI calls to the same query
    does not produce different keys.
    """
    rounded = [round(x, 4) for x in embedding]
    raw = json.dumps(rounded, separators=(",", ":"))
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


# ── SemanticCache ──────────────────────────────────────────────────────────────

class SemanticCache:
    """
    Redis-backed semantic cache using cosine similarity for cache lookup.

    All Redis operations are synchronous (blocking) since RAGService currently
    runs in a synchronous Celery task context. For async FastAPI routes, wrap
    calls in `asyncio.to_thread(cache.get, ...)`.
    """

    def __init__(
        self,
        redis_client: redis.Redis | None = None,
        similarity_threshold: float | None = None,
        ttl_seconds: int | None = None,
        max_entries_per_tenant: int | None = None,
    ) -> None:
        """
        Initialise the semantic cache.

        Args:
            redis_client:            Pre-built Redis client (for testing). If None,
                                     a new client is created from settings.redis_url.
            similarity_threshold:    Minimum cosine similarity for a cache hit.
                                     Defaults to settings.semantic_cache_similarity_threshold.
            ttl_seconds:             TTL for cached answers. Defaults to settings.semantic_cache_ttl.
            max_entries_per_tenant:  LRU eviction limit per tenant. Defaults to
                                     settings.semantic_cache_max_entries.
        """
        if redis_client is not None:
            self._redis = redis_client
        else:
            self._redis = redis.from_url(
                settings.redis_url,
                decode_responses=False,   # we store binary embeddings
                socket_connect_timeout=2,
                socket_timeout=2,
                retry_on_timeout=True,
            )

        self.similarity_threshold = (
            similarity_threshold
            if similarity_threshold is not None
            else settings.semantic_cache_similarity_threshold
        )
        self.ttl_seconds = ttl_seconds if ttl_seconds is not None else settings.semantic_cache_ttl
        self.max_entries = (
            max_entries_per_tenant
            if max_entries_per_tenant is not None
            else settings.semantic_cache_max_entries
        )

    # ── Public API ─────────────────────────────────────────────────────────

    def get(
        self,
        query_embedding: list[float],
        tenant_id: str,
    ) -> CacheHit | None:
        """
        Look up a semantically similar cached answer.

        Algorithm:
          1. Fetch all cached entry keys for this tenant from the ZSET index.
          2. Pipeline-fetch each entry's embedding + payload from Redis.
          3. For each, compute cosine similarity with the new query embedding.
          4. Return the highest-similarity hit that meets the threshold.
          5. Update the ZSET score (access time) on a hit for LRU ordering.

        Args:
            query_embedding: The embedding of the incoming query (already computed).
            tenant_id:       Tenant scope — caches are isolated per tenant.

        Returns:
            CacheHit if a similar cached answer is found, otherwise None.
        """
        index_key = f"{_INDEX_PREFIX}:{tenant_id}"

        try:
            # Fetch all cached keys (score = last access timestamp)
            cache_keys: list[bytes] = self._redis.zrange(index_key, 0, -1)
        except redis.RedisError as exc:
            logger.warning("Semantic cache GET failed (Redis error): %s", exc)
            return None

        if not cache_keys:
            return None

        # ── Batch-fetch embeddings using a pipeline ───────────────────────
        pipe = self._redis.pipeline(transaction=False)
        for raw_key in cache_keys:
            sha_key = raw_key.decode() if isinstance(raw_key, bytes) else raw_key
            hash_key = f"{_HASH_PREFIX}:{tenant_id}:{sha_key}"
            pipe.hgetall(hash_key)

        try:
            entries: list[dict[bytes, bytes]] = pipe.execute()
        except redis.RedisError as exc:
            logger.warning("Semantic cache pipeline GET failed: %s", exc)
            return None

        # ── Find the best match ───────────────────────────────────────────
        best_hit: CacheHit | None = None
        best_similarity = -1.0
        best_sha_key: str | None = None

        for raw_key, entry in zip(cache_keys, entries, strict=True):
            if not entry or b"embedding" not in entry:
                continue

            sha_key = raw_key.decode() if isinstance(raw_key, bytes) else raw_key

            try:
                cached_embedding = _decode_embedding(entry[b"embedding"])
                similarity = _cosine_similarity(query_embedding, cached_embedding)
            except Exception as exc:  # noqa: BLE001
                logger.debug("Could not decode cached embedding %s: %s", sha_key, exc)
                continue

            if similarity >= self.similarity_threshold and similarity > best_similarity:
                try:
                    answer = entry[b"answer"].decode()
                    sources = json.loads(entry[b"sources"].decode())
                    question = entry.get(b"question", b"").decode()
                except (KeyError, json.JSONDecodeError, UnicodeDecodeError) as exc:
                    logger.debug("Malformed cache entry %s: %s", sha_key, exc)
                    continue

                best_similarity = similarity
                best_hit = CacheHit(
                    answer=answer,
                    sources=sources,
                    similarity=similarity,
                    question=question,
                )
                best_sha_key = sha_key

        # ── Update LRU score on hit ───────────────────────────────────────
        if best_hit is not None and best_sha_key is not None:
            try:
                self._redis.zadd(index_key, {best_sha_key: time.time()})
            except redis.RedisError:
                pass  # Non-fatal — LRU ordering is best-effort

            logger.info(
                "Semantic cache HIT | tenant=%s similarity=%.4f question_preview=%.60s",
                tenant_id,
                best_hit.similarity,
                best_hit.question,
            )

        return best_hit

    def set(
        self,
        query_embedding: list[float],
        question: str,
        answer: str,
        sources: list[dict[str, Any]],
        tenant_id: str,
    ) -> bool:
        """
        Store a query-answer pair in the semantic cache.

        Automatically evicts the oldest entries (LRU) if the per-tenant limit
        is exceeded, and sets a TTL on the hash key so stale entries expire.

        Args:
            query_embedding: The embedding vector for the query.
            question:        The original query text (stored for debugging).
            answer:          The LLM answer to cache.
            sources:         Source documents returned with the answer.
            tenant_id:       Tenant scope.

        Returns:
            True if the entry was successfully stored, False on error.
        """
        sha_key = _make_key(query_embedding)
        hash_key = f"{_HASH_PREFIX}:{tenant_id}:{sha_key}"
        index_key = f"{_INDEX_PREFIX}:{tenant_id}"

        try:
            pipe = self._redis.pipeline(transaction=True)

            # Store the entry
            pipe.hset(
                hash_key,
                mapping={
                    "embedding": _encode_embedding(query_embedding),
                    "answer": answer,
                    "sources": json.dumps(sources, ensure_ascii=False),
                    "question": question[:500],   # cap stored question length
                    "created_at": datetime.now(tz=timezone.utc).isoformat(),
                },
            )
            # Set TTL so entries auto-expire (no manual cleanup needed for old entries)
            pipe.expire(hash_key, self.ttl_seconds)

            # Add to LRU index with current timestamp as score
            pipe.zadd(index_key, {sha_key: time.time()})

            pipe.execute()

            # ── Evict oldest entries if over the per-tenant limit ─────────
            self._evict_if_needed(index_key, tenant_id)

            logger.debug(
                "Semantic cache SET | tenant=%s key=%s question_preview=%.60s",
                tenant_id,
                sha_key,
                question,
            )
            return True

        except redis.RedisError as exc:
            logger.warning("Semantic cache SET failed: %s", exc)
            return False

    def invalidate(self, tenant_id: str) -> int:
        """
        Delete ALL cached entries for a tenant.

        Call this when a new document is ingested for a tenant so that
        answers that might now be outdated are not served from cache.

        Returns:
            The number of entries deleted.
        """
        index_key = f"{_INDEX_PREFIX}:{tenant_id}"
        deleted = 0

        try:
            sha_keys: list[bytes] = self._redis.zrange(index_key, 0, -1)
            if not sha_keys:
                return 0

            pipe = self._redis.pipeline(transaction=True)
            for raw_key in sha_keys:
                sha_key = raw_key.decode() if isinstance(raw_key, bytes) else raw_key
                pipe.delete(f"{_HASH_PREFIX}:{tenant_id}:{sha_key}")
            pipe.delete(index_key)
            results = pipe.execute()

            # Count hash deletes (each returns 1 if deleted, 0 if missing)
            deleted = sum(1 for r in results[:-1] if r)
            logger.info("Semantic cache invalidated %d entries for tenant %s", deleted, tenant_id)

        except redis.RedisError as exc:
            logger.warning("Semantic cache invalidation failed: %s", exc)

        return deleted

    def stats(self, tenant_id: str) -> dict[str, Any]:
        """
        Return cache statistics for a tenant (for observability endpoints).

        Returns:
            Dict with keys: entry_count, oldest_entry_age_seconds, newest_entry_age_seconds.
        """
        index_key = f"{_INDEX_PREFIX}:{tenant_id}"
        try:
            count = self._redis.zcard(index_key)
            if count == 0:
                return {"entry_count": 0}

            # Oldest = lowest score (earliest access time)
            oldest = self._redis.zrange(index_key, 0, 0, withscores=True)
            newest = self._redis.zrange(index_key, -1, -1, withscores=True)
            now = time.time()

            return {
                "entry_count": count,
                "oldest_entry_age_seconds": int(now - oldest[0][1]) if oldest else None,
                "newest_entry_age_seconds": int(now - newest[0][1]) if newest else None,
                "similarity_threshold": self.similarity_threshold,
                "ttl_seconds": self.ttl_seconds,
            }
        except redis.RedisError as exc:
            logger.warning("Semantic cache stats failed: %s", exc)
            return {"entry_count": -1, "error": str(exc)}

    # ── Private helpers ────────────────────────────────────────────────────

    def _evict_if_needed(self, index_key: str, tenant_id: str) -> None:
        """
        Remove the oldest entries (lowest ZSET score) if the entry count
        exceeds max_entries. Uses ZPOPMIN for atomic LRU eviction.
        """
        try:
            count = self._redis.zcard(index_key)
            overflow = count - self.max_entries
            if overflow <= 0:
                return

            # Remove the `overflow` entries with the lowest scores (oldest access time)
            oldest: list[tuple[bytes, float]] = self._redis.zpopmin(index_key, overflow)
            pipe = self._redis.pipeline(transaction=False)
            for raw_key, _ in oldest:
                sha_key = raw_key.decode() if isinstance(raw_key, bytes) else raw_key
                pipe.delete(f"{_HASH_PREFIX}:{tenant_id}:{sha_key}")
            pipe.execute()

            logger.debug(
                "Semantic cache LRU eviction: removed %d entries for tenant %s",
                len(oldest),
                tenant_id,
            )
        except redis.RedisError as exc:
            logger.warning("Semantic cache eviction failed: %s", exc)
