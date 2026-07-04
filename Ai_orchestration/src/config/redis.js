import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URI);

redis.on('connect', () => {
  console.log('Redis is connected');
})

redis.on('error', (err) => {
  console.log("The error occured in the redis:- ", err);
})

/**
 * Check for the blacklisted token
 */
export const isBlacklisted = async (token) => {
  return await redis.get(`blacklist:${token}`);
}

export default redis;
