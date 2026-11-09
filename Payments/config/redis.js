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

/**
 * Blacklist state of a token: 'revoked' (user logged out), 'ok', or
 * 'unknown' when Redis cannot be asked. The caller decides how to treat
 * 'unknown' (fail closed for routes that move money).
 */
export async function tokenBlacklistStatus(token) {
    if (redis.status !== 'ready') return 'unknown';
    try {
        return (await redis.get(`blacklist:${token}`)) !== null ? 'revoked' : 'ok';
    } catch {
        return 'unknown';
    }
}

/** True when the user has logged out with this token. Fails open. */
export async function isTokenBlacklisted(token) {
    return (await tokenBlacklistStatus(token)) === 'revoked';
}

export default redis;
