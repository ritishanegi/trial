-- HNSW indexes for vector similarity search
-- Run after initial data is loaded for best build performance.
-- Cosine distance operator (<=>) — must match the search query operator.
--
-- HNSW params:
--   m = 16      → connections per layer (default; good for 1536-dim)
--   ef_construction = 64  → build-time accuracy/speed tradeoff (default)
--
-- Query-time `ef_search` can be tuned per-session with: SET hnsw.ef_search = 100;

CREATE INDEX IF NOT EXISTS idx_embeddings_vector
    ON embeddings USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_master_embeddings_vector
    ON master_embeddings USING hnsw (embedding vector_cosine_ops);
