from azure.ai.documentintelligence import DocumentIntelligenceClient
from azure.core.credentials import AzureKeyCredential

from app.config import settings


class OCRService:
    """Azure Document Intelligence client for structured document extraction."""

    def __init__(self):
        self.client = DocumentIntelligenceClient(
            endpoint=settings.azure_di_endpoint,
            credential=AzureKeyCredential(settings.azure_di_key),
        )

    def extract(self, pdf_bytes: bytes) -> dict:
        """
        Extract text, tables, and key-value pairs from a PDF.
        Returns {pages: [{page_number, text, tables}], total_pages}
        """
        poller = self.client.begin_analyze_document(
            "prebuilt-layout",
            body=pdf_bytes,
            content_type="application/pdf",
            output_content_format="markdown",
        )
        result = poller.result()

        pages = []
        page_texts: dict[int, list[str]] = {}

        if result.paragraphs:
            for para in result.paragraphs:
                for region in para.bounding_regions or []:
                    page_num = region.page_number
                    if page_num not in page_texts:
                        page_texts[page_num] = []
                    page_texts[page_num].append(para.content)

        tables_by_page: dict[int, list[list[list[str]]]] = {}
        if result.tables:
            for table in result.tables:
                for region in table.bounding_regions or []:
                    page_num = region.page_number
                    if page_num not in tables_by_page:
                        tables_by_page[page_num] = []

                    rows: dict[int, dict[int, str]] = {}
                    for cell in table.cells:
                        ri = cell.row_index
                        ci = cell.column_index
                        if ri not in rows:
                            rows[ri] = {}
                        rows[ri][ci] = cell.content

                    table_data = []
                    for ri in sorted(rows.keys()):
                        row_cells = rows[ri]
                        max_col = max(row_cells.keys()) + 1
                        table_data.append(
                            [row_cells.get(ci, "") for ci in range(max_col)]
                        )
                    tables_by_page[page_num].append(table_data)

        total_pages = result.pages[-1].page_number if result.pages else 0

        for page_num in range(1, total_pages + 1):
            text = "\n".join(page_texts.get(page_num, []))
            pages.append({
                "page_number": page_num,
                "text": text,
                "tables": tables_by_page.get(page_num, []),
            })

        return {"pages": pages, "total_pages": total_pages}
