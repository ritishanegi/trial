import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chatSessions, documents } from "@/lib/db/schema";
import { requireTenant } from "@/lib/server/api-helpers";
import { and, desc, eq } from "drizzle-orm";

/**
 * GET  /api/chat/sessions       — list the current user's sessions
 * POST /api/chat/sessions       — create a new session (optionally scoped to a doc/vessel)
 */
export async function GET(req: NextRequest) {
  const ctx = requireTenant(req);
  if (ctx instanceof NextResponse) return ctx;

  // Join with documents to get the scoped doc title (if any) for sidebar display
  const sessions = await db
    .select({
      id: chatSessions.id,
      title: chatSessions.title,
      documentId: chatSessions.documentId,
      vesselId: chatSessions.vesselId,
      createdAt: chatSessions.createdAt,
      updatedAt: chatSessions.updatedAt,
      documentTitle: documents.title,
    })
    .from(chatSessions)
    .leftJoin(documents, eq(chatSessions.documentId, documents.id))
    .where(and(eq(chatSessions.userId, ctx.userId), eq(chatSessions.tenantId, ctx.tenantId)))
    .orderBy(desc(chatSessions.updatedAt))
    .limit(100);

  return NextResponse.json({ sessions });
}

export async function POST(req: NextRequest) {
  const ctx = requireTenant(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  const { documentId, vesselId, title } = body;

  // If documentId is provided, verify the doc belongs to this tenant (defense in depth)
  if (documentId) {
    const [doc] = await db
      .select({ id: documents.id, title: documents.title })
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.tenantId, ctx.tenantId)))
      .limit(1);
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
  }

  const [session] = await db
    .insert(chatSessions)
    .values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      documentId: documentId ?? null,
      vesselId: vesselId ?? null,
      title: title || "New chat",
    })
    .returning();

  return NextResponse.json({ session }, { status: 201 });
}
