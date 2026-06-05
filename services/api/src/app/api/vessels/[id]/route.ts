import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { vessels, equipment, documents } from "@/lib/db/schema";
import { requireTenant, validationError, serverError } from "@/lib/server/api-helpers";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const updateVesselSchema = z.object({
  name: z.string().min(2).optional(),
  imo: z.string().max(20).optional(),
  vesselType: z.string().max(100).optional(),
  flagState: z.string().max(100).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = requireTenant(req);
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;

  const [vessel] = await db
    .select()
    .from(vessels)
    .where(and(eq(vessels.id, id), eq(vessels.tenantId, ctx.tenantId)))
    .limit(1);

  if (!vessel) {
    return NextResponse.json({ error: "Vessel not found" }, { status: 404 });
  }

  // Parallel fetch for related data
  const [vesselEquipment, vesselDocuments] = await Promise.all([
    db
      .select()
      .from(equipment)
      .where(and(eq(equipment.vesselId, id), eq(equipment.tenantId, ctx.tenantId))),
    db
      .select()
      .from(documents)
      .where(and(eq(documents.vesselId, id), eq(documents.tenantId, ctx.tenantId))),
  ]);

  return NextResponse.json({
    vessel,
    equipment: vesselEquipment,
    documents: vesselDocuments,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = requireTenant(req);
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;

  try {
    const body = await req.json();
    const data = updateVesselSchema.parse(body);

    const [updated] = await db
      .update(vessels)
      .set(data)
      .where(and(eq(vessels.id, id), eq(vessels.tenantId, ctx.tenantId)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Vessel not found" }, { status: 404 });
    }

    return NextResponse.json({ vessel: updated });
  } catch (error) {
    if (error instanceof z.ZodError) return validationError(error);
    return serverError("Update vessel error", error);
  }
}
