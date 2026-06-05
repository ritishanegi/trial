import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documents, ingestionJobs } from "@/lib/db/schema";
import { requireTenant } from "@/lib/server/api-helpers";
import { eq, and } from "drizzle-orm";
import { getDownloadUrl } from "@/lib/clients/s3";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = requireTenant(req);
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;

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
    .where(eq(ingestionJobs.documentId, doc.id))
    .limit(1);

  const downloadUrl = await getDownloadUrl(doc.s3Key);

  return NextResponse.json({ document: doc, job, downloadUrl });
}
