import { NextRequest } from "next/server";
import { requireTenant } from "@/lib/server/api-helpers";
import { streamQuery } from "@/lib/clients/worker";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chatSessions, chatMessages } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";

const QUERY_TIMEOUT_MS = 120_000; // 2 minutes
// Worker uses last 10 turns. Pull a few extra so trimming logic has headroom.
// Without a LIMIT a long-running chat sends the entire history over HTTP just
// to be discarded by the worker — wastes bandwidth and risks OOM.
const MAX_HISTORY_MESSAGES = 20;

/**
 * SSE query endpoint.
 *
 * Without sessionId: one-off query, no persistence.
 * With sessionId: accumulates assistant response, then saves user message +
 *   assistant message + session title update in a single transaction when the
 *   stream closes. If the worker returns no output (error / empty), nothing
 *   is written — no orphan user messages that never get a reply.
 */
export async function POST(req: NextRequest) {
  const ctx = requireTenant(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json();
  const { question, vesselId, documentId, sessionId } = body;

  if (!question) {
    return new Response(JSON.stringify({ error: "Question is required" }), { status: 400 });
  }

  // ─── If session provided: verify ownership, load history from DB ───────
  let chatHistory: { role: "user" | "assistant"; content: string }[] | undefined;
  let effectiveDocumentId: string | null = documentId || null;
  let effectiveVesselId: string | null = vesselId || null;
  let sessionTitle: string | null = null;

  if (sessionId) {
    const [session] = await db
      .select()
      .from(chatSessions)
      .where(
        and(
          eq(chatSessions.id, sessionId),
          eq(chatSessions.userId, ctx.userId),
          eq(chatSessions.tenantId, ctx.tenantId)
        )
      )
      .limit(1);

    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), { status: 404 });
    }

    // Session-scoped doc/vessel takes precedence — chat preserves its scope
    if (session.documentId) effectiveDocumentId = session.documentId;
    if (session.vesselId) effectiveVesselId = session.vesselId;
    sessionTitle = session.title;

    // Load history from DB (don't trust client — could be stale or tampered).
    // Take the LAST N messages ordered newest-first, then reverse so the LLM
    // sees them in chronological order. Bounded so chats with thousands of
    // messages don't OOM the request.
    const prior = await db
      .select({ role: chatMessages.role, content: chatMessages.content })
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(MAX_HISTORY_MESSAGES);

    chatHistory = prior
      .reverse()
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    // NOTE: user message is NOT saved here. It's saved atomically with the
    // assistant response in wrapStreamForPersistence, only if the stream
    // produces output. This prevents orphan user messages with no reply.
  } else if (body.chatHistory) {
    // Stateless mode: client supplies its own ephemeral history
    chatHistory = body.chatHistory;
  }

  // ─── Forward to worker, abort if it hangs past timeout ────────────
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);

  let workerRes: Response;
  try {
    workerRes = await streamQuery({
      question,
      tenantId: ctx.tenantId,
      vesselId: effectiveVesselId,
      documentId: effectiveDocumentId,
      userId: ctx.userId,
      chatHistory,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      return new Response(JSON.stringify({ error: "Query timed out" }), { status: 504 });
    }
    return new Response(JSON.stringify({ error: "Worker unreachable" }), { status: 502 });
  }

  if (!workerRes.ok || !workerRes.body) {
    clearTimeout(timeout);
    return new Response(JSON.stringify({ error: "Query failed" }), { status: 502 });
  }

  clearTimeout(timeout);

  // ─── If sessionId, wrap stream to intercept events for persistence ─
  if (sessionId) {
    const wrapped = wrapStreamForPersistence(workerRes.body, sessionId, question, sessionTitle);
    return new Response(wrapped, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // Stateless: forward stream unchanged
  return new Response(workerRes.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * Wrap an SSE stream so we can parse events as they fly past, accumulate
 * the assistant's text + sources, and persist everything when the stream
 * closes. User message + assistant message + session title update are written
 * in a single transaction — so either all land or none do.
 *
 * If the stream produces no text (worker error, empty response), nothing is
 * written. No orphan user messages, no sessions stuck in a broken state.
 */
function wrapStreamForPersistence(
  upstream: ReadableStream<Uint8Array>,
  sessionId: string,
  question: string,
  currentTitle: string | null
): ReadableStream<Uint8Array> {
  let accumulatedText = "";
  let finalSources: unknown[] = [];
  let sseBuffer = "";
  const decoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Pass through to client immediately
          controller.enqueue(value);

          // Also parse to capture for persistence
          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split("\n");
          sseBuffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === "text" && event.content) {
                accumulatedText += event.content;
              } else if (event.type === "sources") {
                finalSources = event.content || [];
              }
            } catch {
              // Ignore malformed SSE lines
            }
          }
        }
      } finally {
        controller.close();

        // Only persist if the stream actually produced a response. An empty
        // accumulatedText means the worker errored or returned nothing — don't
        // save the user message either, so the session stays clean.
        if (accumulatedText) {
          try {
            const autoTitle =
              currentTitle === "New chat"
                ? question.length > 60
                  ? question.slice(0, 57).trim() + "..."
                  : question
                : null;

            await db.transaction(async (tx) => {
              // User message first (chronological order matters for history queries)
              await tx.insert(chatMessages).values({
                sessionId,
                role: "user",
                content: question,
              });

              // Assistant response with sources
              await tx.insert(chatMessages).values({
                sessionId,
                role: "assistant",
                content: accumulatedText,
                sources: finalSources.length > 0 ? finalSources : null,
              });

              // Update session metadata
              await tx
                .update(chatSessions)
                .set({
                  ...(autoTitle ? { title: autoTitle } : {}),
                  updatedAt: new Date(),
                })
                .where(eq(chatSessions.id, sessionId));
            });
          } catch (err) {
            console.error("Failed to persist chat messages:", err);
          }
        }
      }
    },
  });
}
