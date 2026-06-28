import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URI);

redis.on('connect', () => console.log('[Auth] Redis connected'));
redis.on('error', (err) => console.error('[Auth] Redis error:', err));

// ─── Token Blacklist ──────────────────────────────────────────────────────────
// We store the JWT jti (or the full token) as a blacklisted key until its
// natural expiry, so the identifyUser middleware can reject it instantly.

/**
 * Add a token to the blacklist.
 * ttlSeconds should equal the remaining lifetime of the token so the key
 * is automatically cleaned up when the token would have expired anyway.
 */
export const blacklistToken = async (token, ttlSeconds) => {
    await redis.set(`blacklist:${token}`, '1', 'EX', ttlSeconds);
};

/**
 * Returns true if the token has been blacklisted (i.e. the user logged out).
 */
export const isTokenBlacklisted = async (token) => {
    const result = await redis.get(`blacklist:${token}`);
    return result !== null;
};

export default redis;
