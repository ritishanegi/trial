import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documents, ingestionJobs } from "@/lib/db/schema";
import { requireTenant } from "@/lib/server/api-helpers";
import { eq, and } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = requireTenant(req);
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;

  // Verify the document belongs to this tenant
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.tenantId, ctx.tenantId)))
    .limit(1);

  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const [job] = await db
    .select()
    .from(ingestionJobs)
    .where(eq(ingestionJobs.documentId, id))
    .limit(1);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({ job });
}
