import json
import logging
from uuid import UUID
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services.retrieval.rag import RAGService

logger = logging.getLogger(__name__)
router = APIRouter()


class QueryRequest(BaseModel):
    question: str
    tenant_id: str
    vessel_id: str | None = None
    document_id: str | None = None
    user_id: str | None = None
    # Prior turns in the conversation. Each item: {"role": "user"|"assistant", "content": str}
    chat_history: list[dict] | None = None


def _json_default(obj):
    """JSON serializer fallback — converts UUIDs (from psycopg) to strings."""
    if isinstance(obj, UUID):
        return str(obj)
    raise TypeError(f"Object of type {obj.__class__.__name__} is not JSON serializable")


def _friendly_error_message(err: Exception) -> str:
    """Turn provider exceptions into something the user can act on."""
    text = str(err)
    if "rate_limit_exceeded" in text or "Rate limit" in text or "429" in text:
        return (
            "**Rate limit reached.** The LLM provider is throttling requests. "
            "Wait ~60 seconds and try again, or ask a shorter question."
        )
    if "tokens per minute" in text or "Request too large" in text:
        return (
            "**This document is too large for the free-tier LLM in one shot.** "
            "Try asking a more specific question (e.g. 'list parts from page 2') "
            "or upgrade the LLM tier."
        )
    if "API key" in text or "401" in text or "403" in text:
        return "**LLM authentication failed.** Check the API key for the configured provider."
    return f"**Something went wrong calling the LLM:** `{type(err).__name__}: {text[:200]}`"


@router.post("/query/stream")
async def stream_query(req: QueryRequest):
    """SSE endpoint for streaming RAG answers."""
    rag = RAGService()

    def event_stream():
        try:
            for event in rag.stream_query(
                question=req.question,
                tenant_id=req.tenant_id,
                vessel_id=req.vessel_id,
                document_id=req.document_id,
                chat_history=req.chat_history,
            ):
                yield f"data: {json.dumps(event, default=_json_default)}\n\n"
        except Exception as e:
            # Surface LLM/RAG errors to the client as a final 'text' event
            # so the UI shows what went wrong instead of a blank message.
            logger.exception("Stream query failed")
            msg = _friendly_error_message(e)
            yield f"data: {json.dumps({'type': 'text', 'content': msg})}\n\n"
            yield f"data: {json.dumps({'type': 'sources', 'content': []})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/query")
async def query(req: QueryRequest):
    """Non-streaming query endpoint."""
    rag = RAGService()
    result = rag.query(
        question=req.question,
        tenant_id=req.tenant_id,
        vessel_id=req.vessel_id,
        document_id=req.document_id,
        chat_history=req.chat_history,
    )
    return result
