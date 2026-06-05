from pydantic import BaseModel


class IngestionRequest(BaseModel):
    document_id: str
    s3_key: str
    tenant_id: str


class QueryRequest(BaseModel):
    question: str
    tenant_id: str
    vessel_id: str | None = None


class PromotionRequest(BaseModel):
    document_id: str
    approved_by: str


class ChunkResult(BaseModel):
    text: str
    start_page: int
    end_page: int
    word_offset: int


class SearchResult(BaseModel):
    chunk_text: str
    document_id: str
    page_number: int
    score: float
    scope: str
    source_title: str
