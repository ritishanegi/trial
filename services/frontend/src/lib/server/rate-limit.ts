import redis from "@/lib/clients/redis";

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
}

/**
 * Redis-based sliding window rate limiter.
 * @param key   Unique key (e.g., `login:user@example.com` or `register:192.168.1.1`)
 * @param limit Max requests allowed in the window
 * @param windowSeconds Duration of the window in seconds
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const redisKey = `rl:${key}`;

  const current = await redis.incr(redisKey);

  if (current === 1) {
    // First request — set expiry
    await redis.expire(redisKey, windowSeconds);
  }

  const ttl = await redis.ttl(redisKey);

  return {
    allowed: current <= limit,
    remaining: Math.max(0, limit - current),
    resetInSeconds: ttl > 0 ? ttl : windowSeconds,
  };
}
