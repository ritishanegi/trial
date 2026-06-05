import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  createToken,
  verifyToken,
} from "@/lib/auth";

describe("auth.hashPassword + verifyPassword", () => {
  it("hashes a password and verifies a correct match", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(hash).not.toBe("correct-horse-battery-staple");
    expect(await verifyPassword("correct-horse-battery-staple", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("secret-1");
    expect(await verifyPassword("secret-2", hash)).toBe(false);
  });

  it("produces different hashes for the same password (bcrypt salt)", async () => {
    const a = await hashPassword("same-input");
    const b = await hashPassword("same-input");
    expect(a).not.toBe(b);
  });
});

describe("auth.createToken + verifyToken", () => {
  const payload = {
    userId: "550e8400-e29b-41d4-a716-446655440000",
    tenantId: "660e8400-e29b-41d4-a716-446655440001",
    email: "engineer@example.com",
    role: "engineer",
  };

  it("round-trips a valid token", async () => {
    const token = await createToken(payload);
    const decoded = await verifyToken(token);
    expect(decoded?.userId).toBe(payload.userId);
    expect(decoded?.tenantId).toBe(payload.tenantId);
    expect(decoded?.email).toBe(payload.email);
    expect(decoded?.role).toBe(payload.role);
  });

  it("returns null for a tampered token", async () => {
    const token = await createToken(payload);
    const tampered = token.slice(0, -4) + "AAAA";
    expect(await verifyToken(tampered)).toBeNull();
  });

  it("returns null for garbage input", async () => {
    expect(await verifyToken("not-a-jwt")).toBeNull();
    expect(await verifyToken("")).toBeNull();
  });
});
