"""
Table extraction endpoint — returns an .xlsx file extracted from a document.
"""

import logging
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from app.services.extraction import ExtractionService

logger = logging.getLogger(__name__)

router = APIRouter()


class ExtractRequest(BaseModel):
    document_id: str
    tenant_id: str
    description: str


@router.post("/documents/extract-table")
def extract_table(req: ExtractRequest):
    """
    Extract structured table data from one document and return as .xlsx.

    Body:
        document_id: which document to extract from
        tenant_id:   security check — must own this document
        description: natural language description of what to extract
                     e.g. "parts list with part number, designation, quantity"
    """
    if not req.description.strip():
        raise HTTPException(status_code=400, detail="description is required")

    svc = ExtractionService()
    try:
        xlsx_bytes, filename = svc.extract_to_excel(
            document_id=req.document_id,
            tenant_id=req.tenant_id,
            description=req.description.strip(),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Extraction failed")
        raise HTTPException(status_code=500, detail=f"Extraction failed: {e}")

    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
