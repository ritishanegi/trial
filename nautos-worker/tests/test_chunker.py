"""
Tests for app.services.ingestion.chunker — ChunkerService

The ChunkerService is pure Python with no external I/O,
so no mocking is needed.
"""

from __future__ import annotations

import pytest

from app.services.ingestion.chunker import ChunkerService


# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_pages(*texts: str, tables: list[list[list[str]]] | None = None) -> list[dict]:
    """Build a list of page dicts from positional text arguments."""
    pages = []
    for i, text in enumerate(texts, start=1):
        page: dict = {"page_number": i, "text": text, "tables": []}
        pages.append(page)
    # Attach tables to the last page if provided
    if tables and pages:
        pages[-1]["tables"] = tables
    return pages


def _word_count(text: str) -> int:
    return len(text.split())


# ── Tests — chunk_pages ───────────────────────────────────────────────────────


class TestChunkPagesBasic:
    def test_single_page_below_chunk_size_produces_one_chunk(self) -> None:
        """A page with fewer words than chunk_size should produce exactly one chunk."""
        svc = ChunkerService(chunk_size=400, overlap=60)
        pages = _make_pages("word " * 100)  # 100 words

        chunks = svc.chunk_pages(pages)

        assert len(chunks) == 1
        assert "word" in chunks[0]["text"]

    def test_chunk_index_increments_sequentially(self) -> None:
        """chunk_index must start at 0 and increment by 1 for each chunk."""
        svc = ChunkerService(chunk_size=50, overlap=10)
        # 3 full chunks worth of words
        pages = _make_pages("word " * 150)

        chunks = svc.chunk_pages(pages)

        for expected_idx, chunk in enumerate(chunks):
            assert chunk["chunk_index"] == expected_idx

    def test_each_chunk_does_not_exceed_chunk_size(self) -> None:
        """No chunk should have more words than chunk_size."""
        chunk_size = 100
        svc = ChunkerService(chunk_size=chunk_size, overlap=20)
        pages = _make_pages("alpha " * 500)

        for chunk in svc.chunk_pages(pages):
            assert _word_count(chunk["text"]) <= chunk_size

    def test_multi_page_text_is_joined_across_pages(self) -> None:
        """Words from separate pages must be joined into the same buffer."""
        svc = ChunkerService(chunk_size=400, overlap=60)
        # 200 words per page — together they exceed chunk_size
        pages = _make_pages("alpha " * 200, "beta " * 200)

        chunks = svc.chunk_pages(pages)

        all_text = " ".join(c["text"] for c in chunks)
        assert "alpha" in all_text
        assert "beta" in all_text

    def test_empty_pages_returns_empty_chunks(self) -> None:
        """An empty page list should produce no chunks."""
        svc = ChunkerService()
        assert svc.chunk_pages([]) == []

    def test_page_with_no_text_is_skipped_gracefully(self) -> None:
        """A page with an empty text string should not crash."""
        svc = ChunkerService(chunk_size=100, overlap=10)
        pages = [{"page_number": 1, "text": "", "tables": []}]

        chunks = svc.chunk_pages(pages)
        # May produce 0 or 1 chunks; must not raise
        assert isinstance(chunks, list)


class TestChunkPagesOverlap:
    def test_overlap_words_appear_in_consecutive_chunks(self) -> None:
        """The last `overlap` words of a chunk should appear at the start of the next."""
        overlap = 10
        chunk_size = 40
        svc = ChunkerService(chunk_size=chunk_size, overlap=overlap)

        # 80 distinct words: w0 w1 w2 ... w79
        words = [f"w{i}" for i in range(80)]
        pages = [{"page_number": 1, "text": " ".join(words), "tables": []}]

        chunks = svc.chunk_pages(pages)
        assert len(chunks) >= 2

        # The last `overlap` words of chunk 0 should be the first `overlap` words of chunk 1
        chunk0_words = chunks[0]["text"].split()
        chunk1_words = chunks[1]["text"].split()

        tail_of_chunk0 = chunk0_words[-overlap:]
        head_of_chunk1 = chunk1_words[:overlap]
        assert tail_of_chunk0 == head_of_chunk1

    def test_larger_overlap_produces_fewer_new_words_per_chunk(self) -> None:
        """More overlap → more shared words → more chunks for the same input."""
        text = "word " * 200
        pages = [{"page_number": 1, "text": text, "tables": []}]

        svc_small_overlap = ChunkerService(chunk_size=50, overlap=5)
        svc_large_overlap = ChunkerService(chunk_size=50, overlap=40)

        chunks_small = svc_small_overlap.chunk_pages(pages)
        chunks_large = svc_large_overlap.chunk_pages(pages)

        assert len(chunks_large) > len(chunks_small)


class TestChunkPagesPageReferences:
    def test_start_page_and_end_page_are_set(self) -> None:
        """Every chunk must have valid start_page and end_page."""
        svc = ChunkerService(chunk_size=400, overlap=60)
        pages = _make_pages("word " * 100)

        for chunk in svc.chunk_pages(pages):
            assert "start_page" in chunk
            assert "end_page" in chunk
            assert chunk["start_page"] >= 1
            assert chunk["end_page"] >= chunk["start_page"]

    def test_single_page_chunks_have_same_start_and_end_page(self) -> None:
        svc = ChunkerService(chunk_size=400, overlap=60)
        pages = _make_pages("word " * 100)

        chunks = svc.chunk_pages(pages)
        assert all(c["start_page"] == c["end_page"] == 1 for c in chunks)


class TestChunkPagesTables:
    def test_table_produces_separate_chunk(self) -> None:
        """A non-empty table should be appended as its own chunk."""
        svc = ChunkerService()
        table = [["Header A", "Header B"], ["Row1A", "Row1B"]]
        pages = _make_pages("Some text on the page.", tables=[table])

        chunks = svc.chunk_pages(pages)
        table_chunks = [c for c in chunks if "|" in c["text"]]
        assert len(table_chunks) == 1

    def test_table_chunk_has_pipe_separated_content(self) -> None:
        """The table-to-text conversion must produce pipe-separated cells."""
        svc = ChunkerService()
        table = [["Alpha", "Beta"], ["Gamma", "Delta"]]
        pages = [{"page_number": 1, "text": "", "tables": [table]}]

        chunks = svc.chunk_pages(pages)
        table_chunk = next(c for c in chunks if "|" in c["text"])
        assert "Alpha | Beta" in table_chunk["text"]
        assert "Gamma | Delta" in table_chunk["text"]

    def test_empty_table_is_not_appended_as_chunk(self) -> None:
        """A table that produces no text should not create an extra chunk."""
        svc = ChunkerService()
        empty_table: list[list[str]] = []
        pages = [{"page_number": 1, "text": "hello world", "tables": [empty_table]}]

        chunks = svc.chunk_pages(pages)
        # Only the text chunk should be present
        assert all("|" not in c["text"] for c in chunks)

    def test_table_on_same_page_has_correct_page_reference(self) -> None:
        table = [["A", "B"]]
        pages = [{"page_number": 3, "text": "", "tables": [table]}]
        svc = ChunkerService()

        chunks = svc.chunk_pages(pages)
        table_chunk = next(c for c in chunks if "|" in c["text"])
        assert table_chunk["start_page"] == 3
        assert table_chunk["end_page"] == 3


# ── Tests — _table_to_text ────────────────────────────────────────────────────


class TestTableToText:
    def test_single_row_single_cell(self) -> None:
        svc = ChunkerService()
        result = svc._table_to_text([["OnlyCell"]])
        assert result == "OnlyCell"

    def test_multiple_rows_joined_with_newline(self) -> None:
        svc = ChunkerService()
        table = [["A", "B"], ["C", "D"]]
        result = svc._table_to_text(table)
        assert result == "A | B\nC | D"

    def test_cells_joined_with_pipe_separator(self) -> None:
        svc = ChunkerService()
        result = svc._table_to_text([["X", "Y", "Z"]])
        assert result == "X | Y | Z"

    def test_empty_table_returns_empty_string(self) -> None:
        svc = ChunkerService()
        assert svc._table_to_text([]) == ""
