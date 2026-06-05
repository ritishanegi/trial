import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { requireTenant } from "@/lib/server/api-helpers";
import { count, eq, desc } from "drizzle-orm";

// Pagination defaults. Unbounded list queries OOM the browser when tenants
// have thousands of documents — pull a page at a time instead.
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(req: NextRequest) {
  const ctx = requireTenant(req);
  if (ctx instanceof NextResponse) return ctx;

  const url = new URL(req.url);
  // Parse + clamp pagination args (untrusted query params)
  const rawLimit = Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Math.max(1, Math.min(MAX_LIMIT, Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT));
  const rawOffset = Number(url.searchParams.get("offset") ?? 0);
  const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0);

  // Run page query + total count in parallel
  const [docs, [totalRow]] = await Promise.all([
    db
      .select()
      .from(documents)
      .where(eq(documents.tenantId, ctx.tenantId))
      .orderBy(desc(documents.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(documents)
      .where(eq(documents.tenantId, ctx.tenantId)),
  ]);

  return NextResponse.json({
    documents: docs,
    pagination: {
      limit,
      offset,
      total: totalRow.total,
      hasMore: offset + docs.length < totalRow.total,
    },
  });
}
