import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock ioredis BEFORE importing the module under test
const incr = vi.fn();
const expire = vi.fn();
const ttl = vi.fn();

vi.mock("@/lib/clients/redis", () => ({
  default: {
    incr: (...args: unknown[]) => incr(...args),
    expire: (...args: unknown[]) => expire(...args),
    ttl: (...args: unknown[]) => ttl(...args),
  },
}));

import { rateLimit } from "@/lib/server/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => {
    incr.mockReset();
    expire.mockReset();
    ttl.mockReset();
  });

  it("allows the first request and sets the expiry", async () => {
    incr.mockResolvedValue(1);
    ttl.mockResolvedValue(900);

    const result = await rateLimit("login:user@example.com", 5, 900);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(expire).toHaveBeenCalledWith("rl:login:user@example.com", 900);
  });

  it("allows requests up to the limit", async () => {
    incr.mockResolvedValue(5);
    ttl.mockResolvedValue(600);

    const result = await rateLimit("login:user@example.com", 5, 900);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("blocks requests over the limit", async () => {
    incr.mockResolvedValue(6);
    ttl.mockResolvedValue(500);

    const result = await rateLimit("login:user@example.com", 5, 900);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.resetInSeconds).toBe(500);
  });

  it("does not re-set the expiry on subsequent requests", async () => {
    incr.mockResolvedValue(2);
    ttl.mockResolvedValue(800);

    await rateLimit("login:user@example.com", 5, 900);
    expect(expire).not.toHaveBeenCalled();
  });
});
