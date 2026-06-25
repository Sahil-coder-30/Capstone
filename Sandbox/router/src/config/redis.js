import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URI);

redis.on("connect", () => {
    console.log("successfully connected to the redis...");
});

redis.on("error", ()=>{
    console.log("Failed to connect to the redis...");
});

export const refreshTTL = async (sandboxId) =>{
    await redis.expire(`sandbox:${sandboxId}`, 1200);
}

export default { refreshTTL };