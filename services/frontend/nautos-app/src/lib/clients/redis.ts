import Redis from "ioredis";

/**
 * Shared Redis client for rate limiting and caching.
 * Connection pooling is handled by ioredis internally.
 */
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379/0");

export default redis;
