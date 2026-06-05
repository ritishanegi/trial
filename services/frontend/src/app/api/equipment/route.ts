import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { equipment } from "@/lib/db/schema";
import { requireTenant, validationError, serverError, verifyVesselOwnership } from "@/lib/server/api-helpers";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod";

const createEquipmentSchema = z.object({
  manufacturer: z.string().min(1),
  modelType: z.string().min(1),
  serialNumber: z.string().optional(),
  vesselId: z.string().uuid().optional(),
});

export async function GET(req: NextRequest) {
  const ctx = requireTenant(req);
  if (ctx instanceof NextResponse) return ctx;

  const url = new URL(req.url);
  const vesselId = url.searchParams.get("vesselId");

  const result = vesselId
    ? await db
        .select()
        .from(equipment)
        .where(and(eq(equipment.vesselId, vesselId), eq(equipment.tenantId, ctx.tenantId)))
        .orderBy(desc(equipment.createdAt))
    : await db
        .select()
        .from(equipment)
        .where(eq(equipment.tenantId, ctx.tenantId))
        .orderBy(desc(equipment.createdAt));

  return NextResponse.json({ equipment: result });
}

export async function POST(req: NextRequest) {
  const ctx = requireTenant(req);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const body = await req.json();
    const data = createEquipmentSchema.parse(body);

    // Defense in depth: verify the vessel belongs to this tenant before
    // attaching equipment to it (prevents poisoning FK with another tenant's id)
    if (data.vesselId) {
      const denied = await verifyVesselOwnership(data.vesselId, ctx.tenantId);
      if (denied) return denied;
    }

    const [item] = await db
      .insert(equipment)
      .values({
        tenantId: ctx.tenantId,
        manufacturer: data.manufacturer,
        modelType: data.modelType,
        serialNumber: data.serialNumber || null,
        vesselId: data.vesselId || null,
      })
      .returning();

    return NextResponse.json({ equipment: item }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return validationError(error);
    return serverError("Create equipment error", error);
  }
}
