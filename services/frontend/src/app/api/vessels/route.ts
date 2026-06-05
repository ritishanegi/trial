import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { vessels } from "@/lib/db/schema";
import { requireTenant, validationError, serverError } from "@/lib/server/api-helpers";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

const createVesselSchema = z.object({
  name: z.string().min(2),
  imo: z.string().max(20).optional(),
  vesselType: z.string().max(100).optional(),
  flagState: z.string().max(100).optional(),
});

export async function GET(req: NextRequest) {
  const ctx = requireTenant(req);
  if (ctx instanceof NextResponse) return ctx;

  const result = await db
    .select()
    .from(vessels)
    .where(eq(vessels.tenantId, ctx.tenantId))
    .orderBy(desc(vessels.createdAt));

  return NextResponse.json({ vessels: result });
}

export async function POST(req: NextRequest) {
  const ctx = requireTenant(req);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const body = await req.json();
    const data = createVesselSchema.parse(body);

    const [vessel] = await db
      .insert(vessels)
      .values({
        tenantId: ctx.tenantId,
        name: data.name,
        imo: data.imo || null,
        vesselType: data.vesselType || null,
        flagState: data.flagState || null,
      })
      .returning();

    return NextResponse.json({ vessel }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return validationError(error);
    return serverError("Create vessel error", error);
  }
}
