import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { requireTenant } from "@/lib/server/api-helpers";
import { and, eq } from "drizzle-orm";

const WORKER_URL = process.env.WORKER_URL || "http://worker-api:8000";
const EXTRACT_TIMEOUT_MS = 180_000; // 3 minutes — LLM can be slow on large docs

/**
 * POST /api/documents/:id/extract-table
 * Body: { description: string }
 *
 * Proxies to the worker's /api/documents/extract-table after verifying tenant
 * ownership of the document, then streams the .xlsx back to the browser.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = requireTenant(req);
  if (ctx instanceof NextResponse) return ctx;

  const { id: documentId } = await params;

  // Verify tenant owns this document
  const [doc] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.tenantId, ctx.tenantId)))
    .limit(1);

  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const body = await req.json();
  const description = (body.description ?? "").toString().trim();
  if (!description) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXTRACT_TIMEOUT_MS);

  let workerRes: Response;
  try {
    workerRes = await fetch(`${WORKER_URL}/api/documents/extract-table`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        document_id: documentId,
        tenant_id: ctx.tenantId,
        description,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({ error: "Extraction timed out" }, { status: 504 });
    }
    return NextResponse.json({ error: "Worker unreachable" }, { status: 502 });
  }
  clearTimeout(timeout);

  if (!workerRes.ok) {
    const errorBody = await workerRes.json().catch(() => ({ detail: "Extraction failed" }));
    return NextResponse.json(
      { error: errorBody.detail || "Extraction failed" },
      { status: workerRes.status }
    );
  }

  // Pass the binary xlsx straight through with the filename the worker chose
  const contentType = workerRes.headers.get("Content-Type") || "application/octet-stream";
  const contentDisposition = workerRes.headers.get("Content-Disposition") || "attachment";

  return new Response(workerRes.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": contentDisposition,
    },
  });
}
