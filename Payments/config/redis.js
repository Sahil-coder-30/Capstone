import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URI);

redis.on('connect', () => console.log('[Payments] Redis connected'));
redis.on('error', (err) => console.error('[Payments] Redis error:', err));

/**
 * Returns true if the token has been blacklisted (i.e. the user has logged out).
 *
 * Why Payments checks the blacklist while other services don't:
 *   Payments handles financial operations (credit purchases, subscription changes).
 *   A logged-out token remaining valid for up to 15 minutes is unacceptable in
 *   this context — it could allow a user to initiate a payment after logging out
 *   from a shared device. The Redis round-trip cost is accepted here.
 *
 *   AI Orchestration, Notification, and Sandbox services deliberately skip this
 *   check and accept the 15-minute exposure window as a latency/security tradeoff
 *   (documented in their middleware files).
 */
export const isTokenBlacklisted = async (token) => {
    const result = await redis.get(`blacklist:${token}`);
    return result !== null;
};

export default redis;
