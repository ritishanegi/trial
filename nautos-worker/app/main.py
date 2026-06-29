from fastapi import FastAPI
from pydantic import BaseModel

from app.celery_app import celery
from app.routes.query import router as query_router
from app.routes.extraction import router as extraction_router

app = FastAPI(title="NAUTOS Worker", version="0.1.0")
app.include_router(query_router, prefix="/api")
app.include_router(extraction_router, prefix="/api")


class IngestRequest(BaseModel):
    document_id: str


@app.get("/health")
async def health():
    return {"status": "ok", "service": "nautos-worker"}


@app.post("/tasks/ingest")
async def trigger_ingestion(req: IngestRequest):
    """Internal endpoint to trigger ingestion (alternative to Redis dispatch)."""
    task = celery.send_task("ingest_document", args=[req.document_id])
    return {"task_id": task.id, "status": "queued"}


@app.get("/tasks/{task_id}/status")
async def task_status(task_id: str):
    result = celery.AsyncResult(task_id)
    return {
        "task_id": task_id,
        "status": result.status,
        "result": result.result if result.ready() else None,
    }
