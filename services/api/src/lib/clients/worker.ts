/**
 * Dispatch tasks to the Python Celery worker via its HTTP API.
 *
 * The worker-api (FastAPI) exposes dedicated endpoints for each task type.
 * This avoids hand-rolling the Celery protocol or pushing raw messages to Redis.
 */

const WORKER_URL = process.env.WORKER_URL || "http://worker-api:8000";

/**
 * Dispatch a document ingestion task.
 * Returns the Celery task ID for polling.
 */
export async function dispatchIngestion(documentId: string): Promise<string> {
  const res = await fetch(`${WORKER_URL}/tasks/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document_id: documentId }),
  });

  if (!res.ok) {
    throw new Error(`Worker dispatch failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.task_id;
}

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Stream a RAG query through the worker.
 * Returns the raw Response for SSE forwarding.
 *
 * When `documentId` is provided, the worker enters scoped mode and answers
 * using only that document's chunks (bypassing top-K filtering). Used by
 * the "Ask about this document" flow.
 *
 * `chatHistory` provides multi-turn context — previous user/assistant turns
 * are sent so the LLM understands follow-up questions.
 */
export async function streamQuery(params: {
  question: string;
  tenantId: string;
  vesselId: string | null;
  documentId?: string | null;
  userId: string | null;
  chatHistory?: ChatHistoryMessage[];
  signal?: AbortSignal;
}): Promise<Response> {
  return fetch(`${WORKER_URL}/api/query/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: params.question,
      tenant_id: params.tenantId,
      vessel_id: params.vesselId,
      document_id: params.documentId ?? null,
      user_id: params.userId,
      chat_history: params.chatHistory ?? null,
    }),
    signal: params.signal,
  });
}
