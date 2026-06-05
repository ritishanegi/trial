import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documents, vessels, queryLog, users } from "@/lib/db/schema";
import { requireTenant } from "@/lib/server/api-helpers";
import { eq, count, sql, gte, and } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const ctx = requireTenant(req);
  if (ctx instanceof NextResponse) return ctx;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Run independent queries in parallel
  const [
    [docStats],
    [vesselStats],
    [userStats],
    [queryTotal],
    [queriesToday],
    [avgResponseTime],
    dailyQueries,
    topVessels,
    docsByStatus,
  ] = await Promise.all([
    db.select({ total: count() }).from(documents).where(eq(documents.tenantId, ctx.tenantId)),
    db.select({ total: count() }).from(vessels).where(eq(vessels.tenantId, ctx.tenantId)),
    db.select({ total: count() }).from(users).where(eq(users.tenantId, ctx.tenantId)),
    db.select({ total: count() }).from(queryLog).where(eq(queryLog.tenantId, ctx.tenantId)),
    db
      .select({ total: count() })
      .from(queryLog)
      .where(and(eq(queryLog.tenantId, ctx.tenantId), gte(queryLog.createdAt, today))),
    db
      .select({ avg: sql<number>`COALESCE(AVG(${queryLog.responseTimeMs}), 0)` })
      .from(queryLog)
      .where(eq(queryLog.tenantId, ctx.tenantId)),
    db
      .select({ date: sql<string>`DATE(${queryLog.createdAt})`, count: count() })
      .from(queryLog)
      .where(and(eq(queryLog.tenantId, ctx.tenantId), gte(queryLog.createdAt, thirtyDaysAgo)))
      .groupBy(sql`DATE(${queryLog.createdAt})`)
      .orderBy(sql`DATE(${queryLog.createdAt})`),
    db
      .select({ vesselId: queryLog.vesselId, queryCount: count() })
      .from(queryLog)
      .where(eq(queryLog.tenantId, ctx.tenantId))
      .groupBy(queryLog.vesselId)
      .orderBy(sql`count(*) DESC`)
      .limit(5),
    db
      .select({ status: documents.ocrStatus, count: count() })
      .from(documents)
      .where(eq(documents.tenantId, ctx.tenantId))
      .groupBy(documents.ocrStatus),
  ]);

  return NextResponse.json({
    overview: {
      totalDocuments: docStats.total,
      totalVessels: vesselStats.total,
      totalUsers: userStats.total,
      totalQueries: queryTotal.total,
      queriesToday: queriesToday.total,
      avgResponseTimeMs: Math.round(Number(avgResponseTime.avg)),
    },
    dailyQueries,
    topVessels,
    docsByStatus,
  });
}
