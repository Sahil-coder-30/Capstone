import Redis from 'ioredis';

const redisUri = process.env.REDIS_URI || process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const redis = new Redis(redisUri, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 100, 1000)),
    enableOfflineQueue: false,
});

redis.on('connect', () => console.log('[Payments] Redis connected'));
redis.on('error', (err) => {
    // Suppress connection spam if local redis is down
    if (process.env.NODE_ENV === 'development') {
        // quiet in dev
    } else {
        console.error('[Payments] Redis error:', err.message);
    }
});

/**
 * Returns true if the token has been blacklisted (i.e. the user has logged out).
 */
export const isTokenBlacklisted = async (token) => {
    try {
        if (!redis || redis.status !== 'ready') {
            return false;
        }
        const result = await redis.get(`blacklist:${token}`);
        return result !== null;
    } catch {
        return false;
    }
};

export default redis;
