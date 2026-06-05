import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documents, ingestionJobs } from "@/lib/db/schema";
import { uploadToS3, getUploadUrl } from "@/lib/clients/s3";
import { dispatchIngestion } from "@/lib/clients/worker";
import { rateLimit } from "@/lib/server/rate-limit";
import { requireTenant, verifyVesselOwnership } from "@/lib/server/api-helpers";
import { MAX_FILE_SIZE, DIRECT_UPLOAD_LIMIT } from "@/lib/constants";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";

/**
 * Insert document + ingestion job atomically, then dispatch to the worker.
 * If either insert fails, both are rolled back — no orphan documents with no
 * job, and no orphan jobs pointing to nothing.
 * If the worker dispatch fails AFTER the inserts commit, we mark the job
 * failed inline so the UI shows the error instead of "queued" forever.
 */
async function createDocumentAndDispatch(values: {
  tenantId: string;
  vesselId: string | null;
  title: string;
  docType: string;
  scope: string;
  s3Key: string;
}) {
  const [doc] = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(documents)
      .values({ ...values, ocrStatus: "pending" })
      .returning();
    await tx.insert(ingestionJobs).values({ documentId: created.id, status: "queued" });
    return [created];
  });

  try {
    await dispatchIngestion(doc.id);
  } catch (err) {
    // Inserts already committed — mark the job failed so the user sees the
    // problem instead of an eternal "queued" state. The doc record stays so
    // they can retry by re-uploading.
    console.error("Worker dispatch failed:", err);
    await db
      .update(ingestionJobs)
      .set({
        status: "failed",
        error: err instanceof Error ? err.message : "Failed to dispatch to worker",
      })
      .where(eq(ingestionJobs.documentId, doc.id));
    await db
      .update(documents)
      .set({ ocrStatus: "failed" })
      .where(eq(documents.id, doc.id));
    throw err;
  }

  return doc;
}

export async function POST(req: NextRequest) {
  const ctx = requireTenant(req);
  if (ctx instanceof NextResponse) return ctx;

  // Rate limit: 20 uploads per tenant per minute
  const rl = await rateLimit(`upload:${ctx.tenantId}`, 20, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many uploads. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.resetInSeconds) } }
    );
  }

  const contentType = req.headers.get("content-type") || "";

  // ─── Mode 1: JSON request for presigned upload URL (large files) ───
  if (contentType.includes("application/json")) {
    const body = await req.json();
    const { title, docType, fileName, fileSize, vesselId, scope } = body;

    if (!title || !docType || !fileName) {
      return NextResponse.json(
        { error: "title, docType, and fileName are required" },
        { status: 400 }
      );
    }

    if (!fileName.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Only PDF files are accepted" }, { status: 400 });
    }

    if (fileSize && fileSize > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File exceeds 500MB limit" }, { status: 400 });
    }

    // Defense in depth: don't let one tenant attach docs to another tenant's vessel
    if (vesselId) {
      const denied = await verifyVesselOwnership(vesselId, ctx.tenantId);
      if (denied) return denied;
    }

    const s3Key = `${ctx.tenantId}/${randomUUID()}/${fileName}`;
    const uploadUrl = await getUploadUrl(s3Key, "application/pdf", fileSize || MAX_FILE_SIZE);

    let doc;
    try {
      doc = await createDocumentAndDispatch({
        tenantId: ctx.tenantId,
        vesselId: vesselId || null,
        title,
        docType,
        scope: scope || "vessel",
        s3Key,
      });
    } catch {
      return NextResponse.json(
        { error: "Failed to start document processing. Please try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({ document: doc, uploadUrl }, { status: 201 });
  }

  // ─── Mode 2: FormData upload (small files, <50MB through server) ───
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const title = formData.get("title") as string | null;
  const docType = formData.get("docType") as string | null;
  const vesselId = (formData.get("vesselId") as string) || null;
  const scope = (formData.get("scope") as string) || "vessel";

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Only PDF files are accepted" }, { status: 400 });
  }

  if (file.size > DIRECT_UPLOAD_LIMIT) {
    return NextResponse.json(
      { error: "Files over 50MB must use presigned upload. Send a JSON request with fileName and fileSize." },
      { status: 413 }
    );
  }

  if (!title || !docType) {
    return NextResponse.json({ error: "Title and docType are required" }, { status: 400 });
  }

  // Defense in depth: don't let one tenant attach docs to another tenant's vessel
  if (vesselId) {
    const denied = await verifyVesselOwnership(vesselId, ctx.tenantId);
    if (denied) return denied;
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const s3Key = `${ctx.tenantId}/${randomUUID()}/${file.name}`;

  try {
    await uploadToS3(s3Key, buffer, "application/pdf");
  } catch (err) {
    console.error("S3 upload failed:", err);
    return NextResponse.json({ error: "Failed to upload file to storage" }, { status: 502 });
  }

  let doc;
  try {
    doc = await createDocumentAndDispatch({
      tenantId: ctx.tenantId,
      vesselId,
      title,
      docType,
      scope,
      s3Key,
    });
  } catch {
    // S3 file is now orphaned. Logged for janitor cleanup; UI sees the failure.
    console.error(`Orphan S3 object after dispatch failure: ${s3Key}`);
    return NextResponse.json(
      { error: "Failed to start document processing. Please try again." },
      { status: 502 }
    );
  }

  return NextResponse.json({ document: doc }, { status: 201 });
}
