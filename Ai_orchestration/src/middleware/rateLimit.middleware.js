/**
 * Rate Limiter Middleware — AI Orchestration Service
 *
 * Implements an atomic Redis Token Bucket algorithm supporting continuous refill,
 * tier-based capacities, and a graceful fail-open resilience strategy.
 *
 * End-to-end FaultKit integration:
 * Throws RateLimitError (HTTP 429) and logs via FaultKit structured logger.
 *
 * Tiers:
 * - Free: 20 requests/minute (capacity 20, refill 0.333/sec)
 * - Pro / Max: 60 requests/minute (capacity 60, refill 1.0/sec)
 * - Default / Unassigned: 15 requests/minute (capacity 15, refill 0.25/sec)
 */

import redis from "../config/redis.js";
import { RateLimitError, logger } from "faultkit";

const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local requested_tokens = tonumber(ARGV[3])
local now = tonumber(ARGV[4])

local data = redis.call("HMGET", key, "tokens", "last_updated")
local tokens = tonumber(data[1])
local last_updated = tonumber(data[2])

if not tokens then
    tokens = capacity
    last_updated = now
else
    local delta = math.max(0, now - last_updated)
    tokens = math.min(capacity, tokens + (delta * refill_rate))
    last_updated = now
end

local allowed = 0
local retry_after = 0

if tokens >= requested_tokens then
    tokens = tokens - requested_tokens
    allowed = 1
else
    allowed = 0
    local needed = requested_tokens - tokens
    retry_after = math.ceil(needed / refill_rate)
end

redis.call("HMSET", key, "tokens", tokens, "last_updated", last_updated)
redis.call("EXPIRE", key, 43200)

return { allowed, math.floor(tokens), retry_after }
`;

// Register custom command once on the ioredis instance if not already registered
if (typeof redis.consumeTokenBucket !== "function") {
  redis.defineCommand("consumeTokenBucket", {
    numberOfKeys: 1,
    lua: TOKEN_BUCKET_LUA,
  });
}

const TIER_CONFIG = {
  free: {
    capacity: 20,
    refillRate: 20 / 60, // 0.333 tokens / sec
  },
  pro: {
    capacity: 60,
    refillRate: 60 / 60, // 1.0 tokens / sec
  },
  max: {
    capacity: 60,
    refillRate: 60 / 60, // 1.0 tokens / sec
  },
  default: {
    capacity: 15,
    refillRate: 15 / 60, // 0.25 tokens / sec
  },
};

/**
 * AI HTTP Rate Limiter Middleware
 * Evaluates request quota against Redis token bucket before model orchestration.
 */
export const aiRateLimiter = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.sub;
    const ip = req.ip || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown_client";
    const identifier = userId ? `user:${userId}` : `ip:${ip}`;

    const rawTier = (req.user?.subscription || "free").toLowerCase();
    const tierConfig = TIER_CONFIG[rawTier] || TIER_CONFIG.default;

    const redisKey = `ratelimit:tokenbucket:${identifier}:${rawTier}`;
    const nowEpochSec = Math.floor(Date.now() / 1000);
    const tokensToBurn = 1;

    const [allowed, remainingTokens, retryAfterSeconds] = await redis.consumeTokenBucket(
      redisKey,
      tierConfig.capacity,
      tierConfig.refillRate,
      tokensToBurn,
      nowEpochSec
    );

    res.setHeader("X-RateLimit-Limit", tierConfig.capacity);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, remainingTokens));

    if (allowed !== 1) {
      res.setHeader("Retry-After", retryAfterSeconds);
      return next(
        new RateLimitError(`Too many requests. Please wait ${retryAfterSeconds}s before retrying.`)
      );
    }

    next();
  } catch (err) {
    // Fail-Open Policy: If Redis connectivity degrades, log warning and let request proceed
    logger.warn({ err }, `[aiRateLimiter] Redis rate limiter check failed, failing open: ${err.message}`);
    next();
  }
};

export default aiRateLimiter;
