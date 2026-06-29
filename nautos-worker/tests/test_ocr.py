"""
Tests for app.services.ingestion.ocr — OCRService

These tests mock the Azure Document Intelligence client so they run
without any real Azure credentials or network access.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from app.services.ingestion.ocr import OCRService


# ── Fixtures ──────────────────────────────────────────────────────────────────


def _make_paragraph(content: str, page_number: int) -> MagicMock:
    """Helper: create a mock paragraph with a bounding region."""
    region = MagicMock()
    region.page_number = page_number

    para = MagicMock()
    para.content = content
    para.bounding_regions = [region]
    return para


def _make_table_cell(row_index: int, column_index: int, content: str) -> MagicMock:
    cell = MagicMock()
    cell.row_index = row_index
    cell.column_index = column_index
    cell.content = content
    return cell


def _make_table(cells: list[MagicMock], page_number: int) -> MagicMock:
    """Helper: create a mock table on a given page."""
    region = MagicMock()
    region.page_number = page_number

    table = MagicMock()
    table.cells = cells
    table.bounding_regions = [region]
    return table


def _make_page(page_number: int) -> MagicMock:
    page = MagicMock()
    page.page_number = page_number
    return page


def _make_analyze_result(
    paragraphs: list[MagicMock],
    tables: list[MagicMock],
    pages: list[MagicMock],
) -> MagicMock:
    """Helper: build a mock AnalyzeResult returned by the Azure poller."""
    result = MagicMock()
    result.paragraphs = paragraphs
    result.tables = tables
    result.pages = pages
    return result


# ── Tests ─────────────────────────────────────────────────────────────────────


class TestOCRServiceExtract:
    """Tests for OCRService.extract()."""

    @pytest.fixture(autouse=True)
    def mock_azure_client(self) -> Any:
        """Patch DocumentIntelligenceClient for all tests in this class."""
        with patch("app.services.ingestion.ocr.DocumentIntelligenceClient") as mock_cls:
            self._mock_client_instance = mock_cls.return_value
            yield mock_cls

    def _set_analyze_result(self, result: MagicMock) -> None:
        """Configure the mock poller to return the given result."""
        poller = MagicMock()
        poller.result.return_value = result
        self._mock_client_instance.begin_analyze_document.return_value = poller

    def test_extract_returns_expected_top_level_keys(self) -> None:
        """Result dict must have 'pages' and 'total_pages' keys."""
        result = _make_analyze_result(
            paragraphs=[_make_paragraph("Hello world", page_number=1)],
            tables=[],
            pages=[_make_page(1)],
        )
        self._set_analyze_result(result)

        svc = OCRService()
        output = svc.extract(b"%PDF-1.4 fake-bytes")

        assert "pages" in output
        assert "total_pages" in output

    def test_extract_total_pages_matches_last_page(self) -> None:
        """total_pages must equal the page_number of the last page object."""
        result = _make_analyze_result(
            paragraphs=[
                _make_paragraph("Page one text", page_number=1),
                _make_paragraph("Page two text", page_number=2),
            ],
            tables=[],
            pages=[_make_page(1), _make_page(2)],
        )
        self._set_analyze_result(result)

        output = OCRService().extract(b"bytes")
        assert output["total_pages"] == 2
        assert len(output["pages"]) == 2

    def test_extract_paragraph_text_aggregated_per_page(self) -> None:
        """Multiple paragraphs on the same page should be joined with newlines."""
        result = _make_analyze_result(
            paragraphs=[
                _make_paragraph("First sentence.", page_number=1),
                _make_paragraph("Second sentence.", page_number=1),
            ],
            tables=[],
            pages=[_make_page(1)],
        )
        self._set_analyze_result(result)

        output = OCRService().extract(b"bytes")
        page_text = output["pages"][0]["text"]
        assert "First sentence." in page_text
        assert "Second sentence." in page_text

    def test_extract_with_empty_document_returns_zero_pages(self) -> None:
        """An empty document (no pages) should return total_pages=0 gracefully."""
        result = _make_analyze_result(paragraphs=[], tables=[], pages=[])
        self._set_analyze_result(result)

        output = OCRService().extract(b"bytes")
        assert output["total_pages"] == 0
        assert output["pages"] == []

    def test_extract_table_structure_parsed_correctly(self) -> None:
        """Table cells should be reconstructed into a 2D list."""
        cells = [
            _make_table_cell(0, 0, "Header A"),
            _make_table_cell(0, 1, "Header B"),
            _make_table_cell(1, 0, "Row1 Col1"),
            _make_table_cell(1, 1, "Row1 Col2"),
        ]
        table = _make_table(cells, page_number=1)
        result = _make_analyze_result(
            paragraphs=[],
            tables=[table],
            pages=[_make_page(1)],
        )
        self._set_analyze_result(result)

        output = OCRService().extract(b"bytes")
        page = output["pages"][0]
        assert len(page["tables"]) == 1
        table_data = page["tables"][0]
        assert table_data[0] == ["Header A", "Header B"]
        assert table_data[1] == ["Row1 Col1", "Row1 Col2"]

    def test_extract_calls_begin_analyze_with_pdf_content_type(self) -> None:
        """The Azure client must be called with the prebuilt-layout model and PDF MIME type."""
        result = _make_analyze_result(paragraphs=[], tables=[], pages=[])
        self._set_analyze_result(result)

        pdf_bytes = b"%PDF-1.4 test"
        OCRService().extract(pdf_bytes)

        call_kwargs = self._mock_client_instance.begin_analyze_document.call_args
        assert call_kwargs.args[0] == "prebuilt-layout"
        assert call_kwargs.kwargs.get("content_type") == "application/pdf"

    def test_extract_no_paragraphs_results_in_empty_text(self) -> None:
        """Pages with no paragraphs should have an empty text string."""
        result = _make_analyze_result(
            paragraphs=[],
            tables=[],
            pages=[_make_page(1)],
        )
        self._set_analyze_result(result)

        output = OCRService().extract(b"bytes")
        assert output["pages"][0]["text"] == ""
