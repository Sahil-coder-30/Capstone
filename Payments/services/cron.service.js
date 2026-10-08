/**
 * Scheduled Cron Jobs Service — Payments Service
 *
 * Background scheduled tasks:
 *   1. Hourly  — 7-day referral commission settlement
 *   2. Every 15 min — Subscription slot expiry promotion
 *      Finds all accounts whose active plan has expired and promotes the next
 *      reserved slot (e.g. Pro reactivates when Max expires).
 */

import cron   from 'node-cron';
import os     from 'os';
import crypto from 'crypto';
import redis  from '../config/redis.js';
import Referral from '../models/refral.model.js';
import Account from '../models/account.model.js';
import { findExpiredActiveSlots, promoteNextSlot } from './subscription.service.js';
import { getWindowConfig } from '../config/subscription.config.js';

// Worker ID: unique per pod/process instance (for distributed lock ownership)
const WORKER_ID = process.env.POD_NAME
    || `${os.hostname()}:${process.pid}:${crypto.randomUUID().slice(0, 8)}`;

const REFERRAL_LOCK_KEY      = 'lock:cron:referral_settlement';
const SLOT_LOCK_KEY          = 'lock:cron:slot_promotion';
const CREDIT_REFILL_LOCK_KEY = 'lock:cron:credit_window_refill';
const LOCK_TTL_SECONDS       = 300; // 5 minutes

/**
 * Acquire a distributed Redis lock.
 * Returns true if lock acquired, false if another worker holds it.
 */
async function acquireLock(key) {
    const result = await redis.set(key, WORKER_ID, 'NX', 'EX', LOCK_TTL_SECONDS);
    return result === 'OK';
}

/**
 * Release the lock only if this worker still owns it (atomic Lua CAS).
 */
async function releaseLock(key) {
    const lua = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        else
            return 0
        end
    `;
    await redis.eval(lua, 1, key, WORKER_ID);
}

/**
 * Initialize all automated cron jobs for the Payments Service.
 * Called once during server bootstrap after DB connection is established.
 */
export function initCronJobs() {
    console.log(`[Cron Service] Initializing background cron schedules (Worker: ${WORKER_ID})...`);

    // ── Job 1: 7-Day Referral Commission Settlement (hourly) ─────────────────
    cron.schedule('0 * * * *', async () => {
        const acquired = await acquireLock(REFERRAL_LOCK_KEY);
        if (!acquired) {
            console.log(`[Cron Job] ⏩ Referral lock held by another worker. Skipping.`);
            return;
        }
        try {
            console.log(`[Cron Job] 🕒 Running 7-day referral settlement (Worker: ${WORKER_ID})...`);
            const result = await Referral.settlePendingCommissions();
            if (result.settledCount > 0) {
                console.log(`[Cron Job] ✓ Settled ${result.settledCount} referral(s), ${result.totalCreditsPaid} credits paid.`);
            } else {
                console.log('[Cron Job] No matured referral commissions to settle.');
            }
        } catch (err) {
            console.error('[Cron Job] ✗ Referral settlement error:', err.message);
        } finally {
            await releaseLock(REFERRAL_LOCK_KEY);
        }
    });

    // ── Job 2: Subscription Slot Expiry Promotion (daily at midnight) ──────────
    // This is a nightly cleanup sweep — it catches any slots that expired
    // during the day and haven't been promoted yet (e.g. user was offline).
    //
    // Real-time accuracy is handled lazily on every API call:
    // getActiveSubscription() checks for expiry and calls promoteNextSlot()
    // before returning, so the user always sees the correct tier immediately
    // when they make any /subscription request.
    cron.schedule('0 0 * * *', async () => {
        const acquired = await acquireLock(SLOT_LOCK_KEY);
        if (!acquired) {
            console.log(`[Cron Job] ⏩ Slot promotion lock held by another worker. Skipping.`);
            return;
        }
        try {
            const expiredAccountIds = await findExpiredActiveSlots();

            if (expiredAccountIds.length === 0) {
                console.log('[Cron Job] No expired subscription slots found.');
                await releaseLock(SLOT_LOCK_KEY);
                return;
            }

            console.log(`[Cron Job] ⚡ Promoting ${expiredAccountIds.length} expired subscription slot(s)...`);

            let promoted  = 0;
            let reverted  = 0;
            let errors    = 0;

            for (const accountId of expiredAccountIds) {
                try {
                    const result = await promoteNextSlot(accountId);
                    if (result.promoted) {
                        if (result.newTier === 'free') reverted++;
                        else promoted++;
                    }
                } catch (err) {
                    errors++;
                    console.error(`[Cron Job] ✗ promoteNextSlot failed for accountId=${accountId}:`, err.message);
                }
            }

            console.log(
                `[Cron Job] ✓ Slot promotion complete — ` +
                `promoted: ${promoted}, reverted to free: ${reverted}, errors: ${errors}`
            );
        } catch (err) {
            console.error('[Cron Job] ✗ Slot promotion cron error:', err.message);
        } finally {
            await releaseLock(SLOT_LOCK_KEY);
        }
    });

    // ── Job 3: 5-Hour Credit Window Refill (every 30 minutes) ─────────────────
    // Finds all Account documents whose windowRefillAt timestamp has elapsed
    // (i.e. 5 hours have passed since the window was exhausted) and resets
    // the credit window to the tier-appropriate allocation.
    //
    // Granularity: users may wait up to 30 minutes beyond their exact
    // windowRefillAt timestamp. The frontend shows the exact timestamp so
    // UX is accurate even though the sweep is coarse.
    cron.schedule('*/30 * * * *', async () => {
        const acquired = await acquireLock(CREDIT_REFILL_LOCK_KEY);
        if (!acquired) {
            console.log(`[Cron Job] ⏩ Credit refill lock held by another worker. Skipping.`);
            return;
        }
        try {
            const now = new Date();

            // Find all accounts with an elapsed refill timer
            const exhaustedAccounts = await Account.find({
                windowRefillAt: { $lte: now, $ne: null },
            }).lean();

            if (exhaustedAccounts.length === 0) {
                return;
            }

            console.log(`[Cron Job] 🔋 Refilling credit windows for ${exhaustedAccounts.length} account(s)...`);

            let refilled = 0;
            let errors   = 0;

            // Import Credit here to avoid circular dependency at module load time
            const { default: Credit } = await import('../models/credit.model.js');

            for (const account of exhaustedAccounts) {
                try {
                    // Look up the current tier from the Credit document (source of truth for tier)
                    const credit = await Credit.findOne({
                        $or: [{ userId: account._id }, { accountId: account._id }],
                    }).lean();

                    const tier      = credit?.subscription || account.subscription_status || 'free';
                    const windowCfg = getWindowConfig(tier);

                    await Account.updateOne(
                        { _id: account._id },
                        {
                            windowCreditsRemaining: windowCfg.windowCredits,
                            windowCreditsTotal:     windowCfg.windowCredits,
                            windowExhaustedAt:      null,
                            windowRefillAt:         null,
                        }
                    );
                    refilled++;
                } catch (err) {
                    errors++;
                    console.error(`[Cron Job] ✗ Credit window refill failed for accountId=${account._id}:`, err.message);
                }
            }

            console.log(`[Cron Job] ✓ Credit window refill complete — refilled: ${refilled}, errors: ${errors}`);
        } catch (err) {
            console.error('[Cron Job] ✗ Credit window refill cron error:', err.message);
        } finally {
            await releaseLock(CREDIT_REFILL_LOCK_KEY);
        }
    });

    console.log('[Cron Service] ✓ Referral settlement cron scheduled (hourly at :00).');
    console.log('[Cron Service] ✓ Subscription slot promotion cron scheduled (daily at midnight).');
    console.log('[Cron Service] ✓ Credit window refill cron scheduled (every 30 minutes).');
}
