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

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
