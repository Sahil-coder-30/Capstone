import Redis from 'ioredis';

const redisUri = process.env.REDIS_URI || process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// lazyConnect: server.js calls redis.connect() at startup.
const redis = new Redis(redisUri, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => Math.min(times * 200, 5000),
    enableOfflineQueue: false,
});

redis.on('ready', () => console.log('[Payments] Redis connected'));
redis.on('error', (err) => {
    if (process.env.NODE_ENV !== 'test') console.error('[Payments] Redis error:', err.message);
});

/** True when the user has logged out with this token. */
export async function isTokenBlacklisted(token) {
    if (redis.status !== 'ready') return false;
    try {
        return (await redis.get(`blacklist:${token}`)) !== null;
    } catch {
        return false;
    }
}

export default redis;
