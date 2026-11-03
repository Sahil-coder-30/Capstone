/**
 * Subscription service: the slot queue.
 *
 * A user has at most one `active` slot and any number of `queued` slots.
 * Buying a higher tier activates it now and moves the old plan to the
 * queue with the time it still had left (`remaining_ms`). When the active
 * slot expires, the best queued slot takes over for its remaining time.
 *
 * All writes here run inside a caller-provided transaction that already
 * holds the account row lock (see billing.service.js and promoteIfExpired).
 */

import { and, asc, eq, lte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { subscriptionSlots, transactions } from '../db/schema.js';
import { lockAccount, setTier } from './account.service.js';
import {
    DAYS_PER_PERIOD,
    TIER_PRIORITY,
    getPackageById,
    getPlanId,
} from '../config/plans.config.js';

export const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PERIOD_MS = DAYS_PER_PERIOD * MS_PER_DAY;

export const daysFromMs = (ms) => Math.ceil(Math.max(0, ms || 0) / MS_PER_DAY);

/** Highest tier first, then the one queued earliest. */
function sortQueue(slots) {
    return [...slots].sort((a, b) => {
        const byTier = (TIER_PRIORITY[b.tier] ?? 0) - (TIER_PRIORITY[a.tier] ?? 0);
        if (byTier !== 0) return byTier;
        return new Date(a.queuedAt) - new Date(b.queuedAt);
    });
}

async function loadSlots(exec, userId) {
    const rows = await exec
        .select()
        .from(subscriptionSlots)
        .where(and(
            eq(subscriptionSlots.userId, userId),
            sql`${subscriptionSlots.status} in ('active', 'queued')`,
        ))
        .orderBy(asc(subscriptionSlots.queuedAt));

    return {
        active: rows.find((r) => r.status === 'active') || null,
        queued: sortQueue(rows.filter((r) => r.status === 'queued')),
    };
}

/**
 * Applies a captured payment to the slot queue.
 * Caller must hold the account lock inside `tx`.
 */
export async function applyPaymentToSlots(tx, { userId, packageId, paymentId, amountPaise }) {
    const pkg = getPackageById(packageId);
    const now = new Date();
    const newPriority = TIER_PRIORITY[pkg.tier];
    const { active, queued } = await loadSlots(tx, userId);
    const activePriority = active ? TIER_PRIORITY[active.tier] : TIER_PRIORITY.free;

    let type;
    let description;
    let slot;
    let carriedDays = 0;

    if (!active) {
        // A: nothing active, start now.
        [slot] = await tx.insert(subscriptionSlots).values({
            userId, packageId: pkg.id, tier: pkg.tier, planId: getPlanId(pkg),
            status: 'active', validFrom: now, validUntil: new Date(now.getTime() + PERIOD_MS),
            paidAmountPaise: amountPaise, paymentId, queuedAt: now,
        }).returning();
        type = 'SUBSCRIPTION_ACTIVATION';
        description = `Activated ${pkg.label} for ${DAYS_PER_PERIOD} days`;
    } else if (newPriority === activePriority) {
        // B: same tier, add 30 days to the active slot.
        const base = Math.max(new Date(active.validUntil).getTime(), now.getTime());
        [slot] = await tx.update(subscriptionSlots).set({
            validUntil: new Date(base + PERIOD_MS),
            paidAmountPaise: sql`${subscriptionSlots.paidAmountPaise} + ${amountPaise}`,
        }).where(eq(subscriptionSlots.id, active.id)).returning();
        type = 'SUBSCRIPTION_EXTENSION';
        description = `Extended ${pkg.label} by ${DAYS_PER_PERIOD} days`;
    } else if (newPriority > activePriority) {
        // C: upgrade. Old plan goes to the queue with the time it had left.
        const leftMs = Math.max(0, new Date(active.validUntil).getTime() - now.getTime());
        carriedDays = daysFromMs(leftMs);
        const sameTierQueued = queued.find((q) => q.tier === active.tier);

        if (sameTierQueued) {
            await tx.update(subscriptionSlots).set({
                remainingMs: sql`${subscriptionSlots.remainingMs} + ${leftMs}`,
                paidAmountPaise: sql`${subscriptionSlots.paidAmountPaise} + ${active.paidAmountPaise}`,
            }).where(eq(subscriptionSlots.id, sameTierQueued.id));
            await tx.update(subscriptionSlots).set({ status: 'expired', validUntil: now })
                .where(eq(subscriptionSlots.id, active.id));
        } else {
            await tx.update(subscriptionSlots).set({
                status: 'queued', remainingMs: leftMs, validFrom: null, validUntil: null, queuedAt: now,
            }).where(eq(subscriptionSlots.id, active.id));
        }

        [slot] = await tx.insert(subscriptionSlots).values({
            userId, packageId: pkg.id, tier: pkg.tier, planId: getPlanId(pkg),
            status: 'active', validFrom: now, validUntil: new Date(now.getTime() + PERIOD_MS),
            paidAmountPaise: amountPaise, carriedDays, paymentId, queuedAt: now,
        }).returning();
        type = 'SUBSCRIPTION_ACTIVATION';
        description = `Upgraded ${active.tier} to ${pkg.tier}. ${carriedDays} ${active.tier} days kept in queue.`;
    } else {
        // D: lower tier than active. Queue it (or extend the queued one).
        const sameTierQueued = queued.find((q) => q.tier === pkg.tier);
        if (sameTierQueued) {
            [slot] = await tx.update(subscriptionSlots).set({
                remainingMs: sql`${subscriptionSlots.remainingMs} + ${PERIOD_MS}`,
                paidAmountPaise: sql`${subscriptionSlots.paidAmountPaise} + ${amountPaise}`,
            }).where(eq(subscriptionSlots.id, sameTierQueued.id)).returning();
            type = 'SUBSCRIPTION_EXTENSION';
            description = `Added ${DAYS_PER_PERIOD} days to queued ${pkg.label}`;
        } else {
            [slot] = await tx.insert(subscriptionSlots).values({
                userId, packageId: pkg.id, tier: pkg.tier, planId: getPlanId(pkg),
                status: 'queued', remainingMs: PERIOD_MS,
                paidAmountPaise: amountPaise, paymentId, queuedAt: now,
            }).returning();
            type = 'SUBSCRIPTION_QUEUED';
            description = `Queued ${pkg.label}. Starts when ${active.tier} ends.`;
        }
    }

    const after = await loadSlots(tx, userId);
    const activeTier = after.active?.tier || 'free';
    return {
        type,
        description,
        slot,
        carriedDays,
        activeTier,
        tierChanged: activeTier !== (active?.tier || 'free'),
        active: after.active,
        queued: after.queued,
    };
}

/**
 * Expires the active slot if its time is up and promotes the next one.
 * Caller must hold the account lock inside `tx`. Loops in case the
 * promoted slot has no time left either.
 */
export async function promoteInTx(tx, userId) {
    let promoted = false;
    let { active, queued } = await loadSlots(tx, userId);

    while (active && new Date(active.validUntil) <= new Date()) {
        const now = new Date();
        await tx.update(subscriptionSlots).set({ status: 'expired' }).where(eq(subscriptionSlots.id, active.id));

        const next = queued[0];
        if (next) {
            const [nextActive] = await tx.update(subscriptionSlots).set({
                status: 'active',
                validFrom: now,
                validUntil: new Date(now.getTime() + Math.max(0, next.remainingMs || 0)),
                remainingMs: null,
            }).where(eq(subscriptionSlots.id, next.id)).returning();

            await tx.insert(transactions).values({
                userId, type: 'SUBSCRIPTION_PROMOTED', slotId: nextActive.id,
                description: `${active.tier} ended. ${next.tier} active until ${nextActive.validUntil.toDateString()}`,
                metadata: { expiredTier: active.tier, newTier: next.tier, slotValidUntil: nextActive.validUntil.toISOString() },
            });
        } else {
            await tx.insert(transactions).values({
                userId, type: 'SUBSCRIPTION_EXPIRED', slotId: active.id,
                description: `${active.tier} ended. Back to Free.`,
                metadata: { expiredTier: active.tier, newTier: 'free' },
            });
        }

        promoted = true;
        ({ active, queued } = await loadSlots(tx, userId));
    }

    if (promoted) await setTier(tx, userId, active?.tier || 'free');
    return { promoted, tier: active?.tier || 'free' };
}

/** Opens its own transaction only when something is due. Safe on every read. */
export async function promoteIfExpired(userId) {
    const [due] = await db
        .select({ id: subscriptionSlots.id })
        .from(subscriptionSlots)
        .where(and(
            eq(subscriptionSlots.userId, userId),
            eq(subscriptionSlots.status, 'active'),
            lte(subscriptionSlots.validUntil, sql`now()`),
        ))
        .limit(1);
    if (!due) return { promoted: false };

    return db.transaction(async (tx) => {
        await lockAccount(tx, userId);
        return promoteInTx(tx, userId);
    });
}

/** User ids whose active slot has expired. Used by the nightly cron. */
export async function findUsersWithExpiredSlots() {
    const rows = await db
        .selectDistinct({ userId: subscriptionSlots.userId })
        .from(subscriptionSlots)
        .where(and(eq(subscriptionSlots.status, 'active'), lte(subscriptionSlots.validUntil, sql`now()`)));
    return rows.map((r) => r.userId);
}

/** Active slot plus queued slots, after lazy promotion. */
export async function getSubscriptionState(userId) {
    await promoteIfExpired(userId);
    return loadSlots(db, userId);
}
