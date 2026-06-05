import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { vessels } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Tenant context extracted from middleware-injected headers.
 */
export interface TenantContext {
  tenantId: string;
  userId: string;
  role: string;
}

/**
 * Extract tenant context from middleware-injected headers.
 * Returns null if headers are missing (unauthenticated request).
 */
export function getTenantContext(req: NextRequest): TenantContext | null {
  const tenantId = req.headers.get("x-tenant-id");
  const userId = req.headers.get("x-user-id");
  const role = req.headers.get("x-user-role");

  if (!tenantId || !userId) return null;

  return { tenantId, userId, role: role ?? "engineer" };
}

/**
 * Guard that returns the tenant context or a 401 JSON response.
 * Use: `const ctx = requireTenant(req); if (ctx instanceof NextResponse) return ctx;`
 */
export function requireTenant(
  req: NextRequest
): TenantContext | NextResponse {
  const ctx = getTenantContext(req);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return ctx;
}

/**
 * Standard error response for Zod validation failures.
 */
export function validationError(error: { errors: unknown[] }) {
  return NextResponse.json(
    { error: "Validation failed", details: error.errors },
    { status: 400 }
  );
}

/**
 * Standard 500 error response with server-side logging.
 */
export function serverError(label: string, error: unknown) {
  console.error(`${label}:`, error);
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 }
  );
}

/**
 * Verify that a vessel belongs to the given tenant.
 *
 * Use this before INSERTing/UPDATEing any row that references vessel_id to
 * prevent a tenant from poisoning their own data with another tenant's
 * vessel id. (The cross-tenant SELECT path is already prevented because
 * every query filters by tenantId, but FK references can still be spoofed
 * at write time without this check.)
 *
 * Returns null if the vessel is valid and belongs to the tenant. Returns
 * a 404 NextResponse if not — caller should early-return it.
 */
export async function verifyVesselOwnership(
  vesselId: string,
  tenantId: string
): Promise<NextResponse | null> {
  const [v] = await db
    .select({ id: vessels.id })
    .from(vessels)
    .where(and(eq(vessels.id, vesselId), eq(vessels.tenantId, tenantId)))
    .limit(1);
  if (!v) {
    return NextResponse.json({ error: "Vessel not found" }, { status: 404 });
  }
  return null;
}
