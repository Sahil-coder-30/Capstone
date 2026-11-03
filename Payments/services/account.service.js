/**
 * Account service: one row per user in `accounts`.
 *
 * The account holds the cached tier and the 5-hour AI credit window.
 * The window refills lazily: any read through `refreshWindow` resets it
 * once `window_refill_at` has passed, so no refill cron is needed.
 */

import { and, eq, isNotNull, lte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { accounts } from '../db/schema.js';
import { getTierLimits } from '../config/plans.config.js';

/** Creates the account on first sight. Keeps the latest known email. */
export async function ensureAccount(userId, { email } = {}, exec = db) {
    const freeWindow = getTierLimits('free').windowCredits;
    const [row] = await exec
        .insert(accounts)
        .values({
            userId,
            email: email || null,
            windowCreditsTotal: freeWindow,
            windowCreditsRemaining: freeWindow,
        })
        .onConflictDoUpdate({
            target: accounts.userId,
            set: { email: sql`coalesce(excluded.email, ${accounts.email})` },
            setWhere: sql`excluded.email is not null and ${accounts.email} is distinct from excluded.email`,
        })
        .returning();

    if (row) return row;
    return getAccount(userId, exec);
}

export async function getAccount(userId, exec = db) {
    const [row] = await exec.select().from(accounts).where(eq(accounts.userId, userId));
    return row || null;
}

/** Locks the account row for the rest of the transaction. */
export async function lockAccount(tx, userId) {
    const [row] = await tx.select().from(accounts).where(eq(accounts.userId, userId)).for('update');
    return row || null;
}

/** Refills the window if its refill time has passed. Returns the current row. */
export async function refreshWindow(userId, exec = db) {
    const [refilled] = await exec
        .update(accounts)
        .set({
            windowCreditsRemaining: sql`${accounts.windowCreditsTotal}`,
            windowExhaustedAt: null,
            windowRefillAt: null,
        })
        .where(and(
            eq(accounts.userId, userId),
            isNotNull(accounts.windowRefillAt),
            lte(accounts.windowRefillAt, sql`now()`),
        ))
        .returning();

    return refilled || getAccount(userId, exec);
}

/** Sets the cached tier and gives a full window for that tier. */
export async function setTier(tx, userId, tier) {
    const window = getTierLimits(tier).windowCredits;
    const [row] = await tx
        .update(accounts)
        .set({
            tier,
            windowCreditsTotal: window,
            windowCreditsRemaining: window,
            windowExhaustedAt: null,
            windowRefillAt: null,
        })
        .where(eq(accounts.userId, userId))
        .returning();
    return row;
}
