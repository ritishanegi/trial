class ChunkerService:
    """Sliding window text chunker for document ingestion."""

    def __init__(self, chunk_size: int = 400, overlap: int = 60):
        self.chunk_size = chunk_size
        self.overlap = overlap

    def chunk_pages(self, pages: list[dict]) -> list[dict]:
        """
        Chunk pages into overlapping segments of ~400 words with 60-word overlap.
        Each chunk includes page reference.
        """
        chunks = []
        buffer_words: list[str] = []
        buffer_start_page = 1
        current_page = 1

        for page in pages:
            current_page = page["page_number"]
            words = page["text"].split()

            if not buffer_words:
                buffer_start_page = current_page

            buffer_words.extend(words)

            while len(buffer_words) >= self.chunk_size:
                chunk_words = buffer_words[: self.chunk_size]
                chunks.append({
                    "text": " ".join(chunk_words),
                    "start_page": buffer_start_page,
                    "end_page": current_page,
                    "chunk_index": len(chunks),
                })
                buffer_words = buffer_words[self.chunk_size - self.overlap :]
                buffer_start_page = current_page

            # Add tables as separate chunks
            for table in page.get("tables", []):
                table_text = self._table_to_text(table)
                if table_text.strip():
                    chunks.append({
                        "text": table_text,
                        "start_page": current_page,
                        "end_page": current_page,
                        "chunk_index": len(chunks),
                    })

        # Flush remaining buffer
        if buffer_words:
            chunks.append({
                "text": " ".join(buffer_words),
                "start_page": buffer_start_page,
                "end_page": current_page,
                "chunk_index": len(chunks),
            })

        return chunks

    def _table_to_text(self, table: list[list[str]]) -> str:
        """Convert table rows to pipe-separated text."""
        rows = []
        for row in table:
            rows.append(" | ".join(cell for cell in row))
        return "\n".join(rows)
