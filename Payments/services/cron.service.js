/**
 * Background jobs. Each job takes a Redis lock (SET NX) so only one pod
 * runs it at a time.
 *
 * Only one job is left: the nightly sweep that ends expired plans for users
 * who were not active (active users are promoted lazily on every request).
 * The credit window refills lazily too, so it needs no job.
 */

import cron from 'node-cron';
import os from 'os';
import crypto from 'crypto';
import redis from '../config/redis.js';
import { findUsersWithExpiredSlots, promoteIfExpired } from './subscription.service.js';

const WORKER_ID = process.env.POD_NAME || `${os.hostname()}:${process.pid}:${crypto.randomUUID().slice(0, 8)}`;
const SLOT_LOCK_KEY = 'lock:cron:slot_promotion';
const LOCK_TTL_SECONDS = 300;

async function acquireLock(key) {
    return (await redis.set(key, WORKER_ID, 'NX', 'EX', LOCK_TTL_SECONDS)) === 'OK';
}

async function releaseLock(key) {
    const lua = 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
    await redis.eval(lua, 1, key, WORKER_ID);
}

export async function runSlotPromotionSweep() {
    const userIds = await findUsersWithExpiredSlots();
    let promoted = 0;
    let failed = 0;
    for (const userId of userIds) {
        try {
            const r = await promoteIfExpired(userId);
            if (r.promoted) promoted++;
        } catch (err) {
            failed++;
            console.error(`[cron] promotion failed for ${userId}:`, err.message);
        }
    }
    return { found: userIds.length, promoted, failed };
}

export function initCronJobs() {
    cron.schedule('0 0 * * *', async () => {
        let locked = false;
        try {
            locked = await acquireLock(SLOT_LOCK_KEY);
            if (!locked) return;
            const r = await runSlotPromotionSweep();
            console.log(`[cron] slot sweep: found=${r.found} promoted=${r.promoted} failed=${r.failed}`);
        } catch (err) {
            console.error('[cron] slot sweep error:', err.message);
        } finally {
            if (locked) await releaseLock(SLOT_LOCK_KEY).catch(() => {});
        }
    });
    console.log('[cron] nightly slot promotion scheduled (00:00)');
}
