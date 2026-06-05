import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chatSessions, chatMessages, documents } from "@/lib/db/schema";
import { requireTenant } from "@/lib/server/api-helpers";
import { and, asc, eq } from "drizzle-orm";

/**
 * GET    /api/chat/sessions/:id — fetch session + all messages
 * PATCH  /api/chat/sessions/:id — rename session
 * DELETE /api/chat/sessions/:id — delete session (cascades to messages)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = requireTenant(req);
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;

  const [session] = await db
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
    .where(
      and(
        eq(chatSessions.id, id),
        eq(chatSessions.userId, ctx.userId),
        eq(chatSessions.tenantId, ctx.tenantId)
      )
    )
    .limit(1);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const messages = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, id))
    .orderBy(asc(chatMessages.createdAt));

  return NextResponse.json({ session, messages });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = requireTenant(req);
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;
  const body = await req.json();
  const { title } = body;

  if (typeof title !== "string" || title.length < 1 || title.length > 255) {
    return NextResponse.json({ error: "Title must be 1-255 characters" }, { status: 400 });
  }

  const [updated] = await db
    .update(chatSessions)
    .set({ title, updatedAt: new Date() })
    .where(
      and(
        eq(chatSessions.id, id),
        eq(chatSessions.userId, ctx.userId),
        eq(chatSessions.tenantId, ctx.tenantId)
      )
    )
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({ session: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = requireTenant(req);
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;

  const result = await db
    .delete(chatSessions)
    .where(
      and(
        eq(chatSessions.id, id),
        eq(chatSessions.userId, ctx.userId),
        eq(chatSessions.tenantId, ctx.tenantId)
      )
    )
    .returning();

  if (result.length === 0) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
