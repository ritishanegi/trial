import voyageai

from app.config import settings


class EmbeddingService:
    """Voyage AI voyage-3-large embedding client."""

    def __init__(self):
        self.client = voyageai.Client(api_key=settings.voyage_api_key)
        self.model = "voyage-3-large"
        self.batch_size = 20

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Embed a list of text chunks in batches of 20."""
        all_embeddings: list[list[float]] = []

        for i in range(0, len(texts), self.batch_size):
            batch = texts[i : i + self.batch_size]
            result = self.client.embed(batch, model=self.model, input_type="document")
            all_embeddings.extend(result.embeddings)

        return all_embeddings

    def embed_query(self, query: str) -> list[float]:
        """Embed a single query string."""
        result = self.client.embed([query], model=self.model, input_type="query")
        return result.embeddings[0]
