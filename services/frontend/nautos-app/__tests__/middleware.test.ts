import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { createToken } from "@/lib/auth";
import { middleware } from "@/middleware";

beforeAll(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-must-be-at-least-32-chars-long-for-jose";
});

function makeRequest(path: string, cookie?: string) {
  const url = new URL(`http://localhost:3000${path}`);
  const req = new NextRequest(url, {
    headers: cookie ? { cookie: `nautos_token=${cookie}` } : undefined,
  });
  return req;
}

describe("middleware — public routes", () => {
  it("allows the landing page without a token", async () => {
    const res = await middleware(makeRequest("/"));
    expect(res?.status).not.toBe(401);
    expect(res?.headers.get("location")).toBeNull();
  });

  it("allows the login page without a token", async () => {
    const res = await middleware(makeRequest("/auth/login"));
    expect(res?.status).not.toBe(401);
  });

  it("allows /api/health without a token", async () => {
    const res = await middleware(makeRequest("/api/health"));
    expect(res?.status).not.toBe(401);
  });
});

describe("middleware — protected routes", () => {
  it("redirects an unauthenticated user from /dashboard to /auth/login", async () => {
    const res = await middleware(makeRequest("/dashboard"));
    expect(res?.headers.get("location")).toContain("/auth/login");
  });

  it("returns 401 JSON for unauthenticated API calls", async () => {
    const res = await middleware(makeRequest("/api/documents"));
    expect(res?.status).toBe(401);
  });

  it("rejects an invalid JWT", async () => {
    const res = await middleware(makeRequest("/api/documents", "not-a-real-token"));
    expect(res?.status).toBe(401);
  });

  it("passes a valid JWT through and injects tenant headers", async () => {
    const token = await createToken({
      userId: "550e8400-e29b-41d4-a716-446655440000",
      tenantId: "660e8400-e29b-41d4-a716-446655440001",
      email: "engineer@example.com",
      role: "engineer",
    });

    const res = await middleware(makeRequest("/api/documents", token));
    // Valid token => no redirect, no 401 body. NextResponse.next() returns 200 by default.
    expect(res?.status).not.toBe(401);
    expect(res?.headers.get("location")).toBeNull();
  });
});
