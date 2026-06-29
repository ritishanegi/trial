from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://nautos_user:nautos_dev_pass@localhost:5432/nautos"
    redis_url: str = "redis://localhost:6379/0"
    elasticsearch_url: str = "http://localhost:9200"

    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "ap-south-1"
    aws_s3_bucket: str = "nautos-documents"

    anthropic_api_key: str = ""
    gemini_api_key: str = ""
    groq_api_key: str = ""
    llm_provider: str = "groq"  # "groq", "gemini", or "anthropic"
    voyage_api_key: str = ""
    azure_di_endpoint: str = ""
    azure_di_key: str = ""

    # ── Sentry ──────────────────────────────────────────────────────────────
    sentry_dsn: str = ""
    sentry_environment: str = "development"
    sentry_release: str = ""

    # ── Semantic Cache ───────────────────────────────────────────────────────
    # Cosine similarity threshold for cache hits (0.0–1.0). Higher = stricter.
    semantic_cache_similarity_threshold: float = 0.92
    # TTL for cached answers in seconds (default: 24 hours)
    semantic_cache_ttl: int = 86_400
    # Max number of cached entries per tenant (LRU eviction above this limit)
    semantic_cache_max_entries: int = 500

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()

