import Redis from 'ioredis'
import { deletePod } from '../kubernetes/pod.js';
import { deleteService } from '../kubernetes/service.js';
import Project from '../models/Project.model.js';

const redis = new Redis(process.env.REDIS_URI);

const subscriber = new Redis(process.env.REDIS_URI);

const SANDBOX_KEY_PREFIX = 'sandbox:';

export const createSandboxKey = async (sandboxId) =>{
    await redis.set(`${SANDBOX_KEY_PREFIX}${sandboxId}`,JSON.stringify({
        status : "active"
    }) , "EX" , 120);
}

export const deleteSandboxKey = async (sandboxId) => {
    try{
        await redis.del(`${SANDBOX_KEY_PREFIX}${sandboxId}`);
        console.log(`redis key deleted : ${sandboxId}`);
    }catch(err){
        console.error(err);
    }
}

/** True while the sandbox's idle key exists, i.e. the pod is meant to be running. */
export const sandboxKeyExists = async (sandboxId) =>
    (await redis.exists(`${SANDBOX_KEY_PREFIX}${sandboxId}`)) === 1;

/**
 * Tears a sandbox down when its idle key expires.
 * Redis reports EVERY expired key in the database (rate limits, caches of
 * other services share it), so only `sandbox:<id>` keys count, and no
 * failure may escape: an unhandled rejection would crash the server.
 */
export async function handleExpiredKey(key, deps = { deletePod, deleteService, Project }) {
    if (typeof key !== 'string' || !key.startsWith(SANDBOX_KEY_PREFIX)) return false;
    const sandboxId = key.slice(SANDBOX_KEY_PREFIX.length);
    if (!sandboxId) return false;

    console.log(`sandbox expired : ${sandboxId}`);
    const steps = [
        ['pod deleted', () => deps.deletePod(sandboxId)],
        ['service deleted', () => deps.deleteService(sandboxId)],
        ['project set to down', () => deps.Project.updateOne({ sandboxId }, { status: "down" })],
    ];
    for (const [label, run] of steps) {
        try {
            await run();
            console.log(`${label} : ${sandboxId}`);
        } catch (err) {
            console.error(`Expiry cleanup step "${label}" failed for sandbox ${sandboxId}:`, err?.message ?? err);
        }
    }
    return true;
}

subscriber.config("SET" , 'notify-keyspace-events' , 'Ex');

subscriber.subscribe('__keyevent@0__:expired' , (err) => {
    if(err) console.error(err);
})

subscriber.on('message', (_channel, key) => {
    handleExpiredKey(key).catch((err) => console.error('Expiry handler failed:', err));
});

export { redis };
export default { subscriber };
