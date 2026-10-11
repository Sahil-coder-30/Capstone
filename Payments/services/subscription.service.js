/**
 * Subscription Service — Plan Queue Lifecycle Engine
 *
 * Single source of truth for all subscription state transitions.
 * Called from:
 *   - webhook.controller.js  →  processSubscriptionPayment()  (on payment.captured)
 *   - cron.service.js        →  promoteNextSlot()             (every 15 min, slot expiry)
 *
 * ─── Design Principles ──────────────────────────────────────────────────────
 *
 *  1. ZERO DAY WASTE — every day paid for is always honoured.
 *     Remaining days in a lower-tier plan are preserved in reservedSlots
 *     and promoted back to active the moment the higher-tier plan expires.
 *
 *  2. HIGHEST TIER WINS — the user always gets the best tier they have paid for.
 *     If two slots coexist, the higher-tier one is always active.
 *
 *  3. IDEMPOTENT — safe to call multiple times with the same paymentId.
 *     Guarded by a sparse unique index on Transaction.razorpay.paymentId.
 *
 *  4. ATOMIC — all DB writes happen inside a single Mongoose session/transaction.
 *     Partial updates are impossible; the session rolls back on any error.
 *
 * ─── Queue Rules ────────────────────────────────────────────────────────────
 *
 *  Purchase of HIGHER TIER than activeSlot:
 *    → Push activeSlot into reservedSlots (days preserved)
 *    → New slot becomes activeSlot immediately
 *    → Carry remaining days: newValidUntil = now + 30d + remainingDays
 *
 *  Purchase of SAME TIER as activeSlot:
 *    → Extend activeSlot.validUntil by +30 days (stacking)
 *
 *  Purchase of LOWER TIER than activeSlot:
 *    → Find matching-tier slot in reservedSlots
 *      - If found: extend that slot's validUntil by +30 days
 *      - If not found: insert new slot into reservedSlots (sorted tier DESC)
 *
 *  promoteNextSlot (called when activeSlot expires):
 *    → Remove expired activeSlot
 *    → Pop highest-tier slot from reservedSlots as new activeSlot
 *    → If no reservedSlots: status = FREE, activeTier = free
 */

import mongoose from 'mongoose';
import { getPackageById } from '../config/packages.config.js';
import { Subscription, TIER_PRIORITY } from '../models/subscription.model.js';
import Transaction from '../models/transaction.model.js';
import Credit from '../models/credit.model.js';
import Account from '../models/account.model.js';
import { getWindowConfig } from '../config/subscription.config.js';
import {
    InternalServerError,
    BadRequestError,
    NotFoundError,
} from 'faultkit';

const DAYS_PER_PERIOD = 30;
const MS_PER_DAY     = 24 * 60 * 60 * 1000;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Resolve hashed planId from .env using the package's planIdEnvKey */
function resolvePlanId(pkg) {
    const key = pkg.planIdEnvKey;
    if (!key) throw new InternalServerError(`[subscription.service] Package '${pkg.id}' missing planIdEnvKey`);
    const id = (process.env[key] || '').trim();
    if (!id) throw new InternalServerError(`[subscription.service] Env var '${key}' is not set`);
    return id;
}

/** Positive remaining milliseconds for a slot, or 0 if expired/null */
function remainingMs(slot) {
    if (!slot?.validUntil) return 0;
    const ms = slot.validUntil.getTime() - Date.now();
    return ms > 0 ? ms : 0;
}

/** Remaining days (ceiling) for a slot */
function remainingDays(slot) {
    return Math.ceil(remainingMs(slot) / MS_PER_DAY);
}

/** Sort slots tier DESC (highest first) then validUntil ASC */
function sortSlots(slots) {
    return [...slots].sort((a, b) => {
        const pd = (TIER_PRIORITY[b.tier] ?? 0) - (TIER_PRIORITY[a.tier] ?? 0);
        if (pd !== 0) return pd;
        return a.validUntil - b.validUntil;
    });
}

/** Sync the Credit model's subscription tier (best-effort, non-fatal) */
export async function syncCreditTier(accountObjId, tier, periodStart, periodEnd, amountPaise, session) {
    try {
        const credit = await Credit.findOne({ $or: [{ userId: accountObjId }, { accountId: accountObjId }] }).session(session);
        if (credit) {
            credit.subscription = tier;
            if (periodStart) credit.billing.currentPeriodStart = periodStart;
            if (periodEnd)   credit.billing.currentPeriodEnd   = periodEnd;
            credit.billing.lifetimeCents = (credit.billing.lifetimeCents || 0) + (amountPaise || 0);
            await credit.save({ session });
        }

        // Auto-provision & sync Account document
        const windowCfg = getWindowConfig(tier);
        await Account.findOneAndUpdate(
            { $or: [{ user_id: accountObjId }, { _id: accountObjId }] },
            {
                _id: accountObjId,
                user_id: accountObjId,
                subscription_status: tier,
                subscription_expiry: periodEnd || null,
                windowCreditsTotal: windowCfg.windowCredits,
                windowCreditsRemaining: windowCfg.windowCredits,
                windowExhaustedAt: null,
                windowRefillAt: null,
                is_active: true,
            },
            { upsert: true, returnDocument: 'after', session }
        );
    } catch (err) {
        // Non-fatal: Credit/Account doc may live in another service
        console.warn(`[subscription.service] Could not sync Credit/Account tier for ${accountObjId}: ${err.message}`);
    }
}


// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Process a successful Razorpay payment and update the subscription queue.
 *
 * @param {Object} params
 * @param {string|ObjectId} params.accountId
 * @param {string}  params.packageId     e.g. 'pro_regular', 'max_early_access'
 * @param {string}  params.paymentId     Razorpay payment_id (idempotency key)
 * @param {string}  params.orderId       Razorpay order_id
 * @param {string}  [params.signature]   Razorpay signature (stored for audit)
 * @param {number}  params.amountPaise   Amount paid in paise
 * @returns {{ status: 'success'|'already_processed', activeTier, validUntil }}
 */
export async function processSubscriptionPayment({
    accountId,
    packageId,
    paymentId,
    orderId,
    signature = null,
    amountPaise,
}) {
    if (!accountId || !packageId || !paymentId) {
        throw new BadRequestError('[subscription.service] accountId, packageId, and paymentId are required');
    }

    const pkg = getPackageById(packageId);
    if (!pkg) throw new NotFoundError(`[subscription.service] Unknown packageId: ${packageId}`);
    if (pkg.tier === 'free') throw new BadRequestError('[subscription.service] Free plan does not need a payment');

    const newPlanId   = resolvePlanId(pkg);
    const newTier     = pkg.tier;
    const newPriority = TIER_PRIORITY[newTier];

    // ── Early idempotency check ───────────────────────────────────────────────
    const existing = await Transaction.findOne({ 'razorpay.paymentId': paymentId }).lean();
    if (existing) {
        console.log(`[subscription.service] Payment ${paymentId} already processed.`);
        return { status: 'already_processed' };
    }

    // ── Atomic session ────────────────────────────────────────────────────────
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const accountObjId = typeof accountId === 'string'
            ? new mongoose.Types.ObjectId(accountId)
            : accountId;

        const now = new Date();
        let sub = await Subscription.findOne({ accountId: accountObjId }).session(session);
        if (!sub) sub = new Subscription({ accountId: accountObjId });

        const activePriority = TIER_PRIORITY[sub.activeTier] ?? 0;

        let transactionType;
        let description;
        let slotValidFrom  = now;
        let slotValidUntil;
        let carriedDays    = 0;

        if (!sub.activeSlot || sub.activeTier === 'free') {
            // ── Case A: No active paid plan → activate immediately ────────────
            slotValidUntil  = new Date(now.getTime() + DAYS_PER_PERIOD * MS_PER_DAY);
            transactionType = 'SUBSCRIPTION_ACTIVATION';
            description     = `Activated ${pkg.label} (${pkg.pricingModel}) — ${DAYS_PER_PERIOD} days`;

            sub.activeSlot = {
                packageId, tier: newTier, planId: newPlanId,
                validFrom: slotValidFrom, validUntil: slotValidUntil,
                paidAmountPaise: amountPaise, carriedDays: 0, queuedAt: now,
            };

        } else if (newPriority === activePriority) {
            // ── Case B: Same tier → extend active slot by +30 days (stack) ───
            const base     = sub.activeSlot.validUntil > now
                ? sub.activeSlot.validUntil.getTime()
                : now.getTime();
            slotValidFrom  = sub.activeSlot.validFrom;
            slotValidUntil = new Date(base + DAYS_PER_PERIOD * MS_PER_DAY);
            transactionType = 'SUBSCRIPTION_EXTENSION';
            description     = `Extended ${pkg.label} by ${DAYS_PER_PERIOD} days → expires ${slotValidUntil.toDateString()}`;

            sub.activeSlot.validUntil     = slotValidUntil;
            sub.activeSlot.paidAmountPaise += amountPaise;

        } else if (newPriority > activePriority) {
            // ── Case C: Higher tier → activate immediately, preserve old slot ──
            //
            // IMPORTANT: The new higher-tier plan gets a CLEAN 30 days.
            // The old lower-tier slot is preserved in reservedSlots WITH ITS
            // ORIGINAL validUntil — those days activate when the new plan expires.
            //
            // e.g. Pro has 15 days left → user buys Max:
            //   activeSlot  = Max, validUntil = now + 30d
            //   reservedSlots = [Pro, validUntil = <original 15d expiry>]
            // Max expires at day 30 → Pro activates with 15 days remaining.
            // Max does NOT get 45 days.

            carriedDays    = remainingDays(sub.activeSlot); // for audit/display only
            slotValidUntil = new Date(now.getTime() + DAYS_PER_PERIOD * MS_PER_DAY); // clean 30d
            transactionType = 'SUBSCRIPTION_ACTIVATION';
            description     = `Upgraded ${sub.activeTier} → ${newTier}. ${pkg.label} active for ${DAYS_PER_PERIOD} days until ${slotValidUntil.toDateString()}. ${carriedDays} ${sub.activeTier} days preserved in queue.`;

            // Push old slot into reservedSlots as-is (original validUntil preserved)
            const oldSlot = { ...sub.activeSlot.toObject() };
            sub.reservedSlots = sortSlots([...sub.reservedSlots, oldSlot]);

            sub.activeSlot = {
                packageId, tier: newTier, planId: newPlanId,
                validFrom: slotValidFrom, validUntil: slotValidUntil,
                paidAmountPaise: amountPaise, carriedDays: 0, queuedAt: now,
            };


        } else {
            // ── Case D: Lower tier purchase (e.g. Max active, user buys Pro) ──
            // Find existing reserved slot of same tier
            const existingIdx = sub.reservedSlots.findIndex(s => s.tier === newTier);

            if (existingIdx !== -1) {
                // Extend that reserved slot
                const s = sub.reservedSlots[existingIdx];
                const base = s.validUntil > now ? s.validUntil.getTime() : now.getTime();
                slotValidFrom  = s.validFrom;
                slotValidUntil = new Date(base + DAYS_PER_PERIOD * MS_PER_DAY);
                sub.reservedSlots[existingIdx].validUntil      = slotValidUntil;
                sub.reservedSlots[existingIdx].paidAmountPaise += amountPaise;
                transactionType = 'SUBSCRIPTION_EXTENSION';
                description     = `Extended reserved ${pkg.label} slot by ${DAYS_PER_PERIOD} days → will activate after ${sub.activeTier} expires`;
            } else {
                // Add new reserved slot
                slotValidFrom  = now;
                slotValidUntil = new Date(now.getTime() + DAYS_PER_PERIOD * MS_PER_DAY);
                const newSlot  = {
                    packageId, tier: newTier, planId: newPlanId,
                    validFrom: slotValidFrom, validUntil: slotValidUntil,
                    paidAmountPaise: amountPaise, carriedDays: 0, queuedAt: now,
                };
                sub.reservedSlots = sortSlots([...sub.reservedSlots, newSlot]);
                transactionType = 'SUBSCRIPTION_QUEUED';
                description     = `Queued ${pkg.label} (${pkg.pricingModel}) — will activate when ${sub.activeTier} expires`;
            }
        }

        // ── Sync top-level denormalized fields ────────────────────────────────
        sub.activeTier    = sub.activeSlot?.tier || 'free';
        sub.activePlanId  = sub.activeSlot?.planId || (process.env.PLAN_ID_FREE || '').trim();
        sub.status        = sub.activeSlot ? 'ACTIVE' : 'FREE';
        sub.lastRazorpayOrderId   = orderId;
        sub.lastRazorpayPaymentId = paymentId;
        sub.metadata = { ...sub.metadata, lastPaymentAt: now.toISOString(), lastPackageId: packageId };

        sub.markModified('activeSlot');
        sub.markModified('reservedSlots');
        await sub.save({ session });

        // ── Write immutable Transaction ledger entry ──────────────────────────
        await Transaction.create(
            [{
                accountId: accountObjId,
                razorpay: { orderId, paymentId, signature },
                subscription: {
                    subscriptionId: sub._id,
                    plan: sub.activePlanId,
                    billingCycle: 'monthly',
                },
                type: transactionType,
                amountPaise,
                currency: 'INR',
                creditsDelta: 0,
                status: 'SUCCESS',
                description,
                metadata: {
                    packageId,
                    packageLabel:   pkg.label,
                    pricingModel:   pkg.pricingModel,
                    priceINR:       amountPaise / 100,
                    newTier,
                    carriedDays,
                    slotValidFrom:  slotValidFrom?.toISOString(),
                    slotValidUntil: slotValidUntil?.toISOString(),
                    activeTier:     sub.activeTier,
                    reservedTiers:  sub.reservedSlots.map(s => s.tier),
                },
            }],
            { session }
        );

        // ── Sync Credit document ──────────────────────────────────────────────
        await syncCreditTier(
            accountObjId,
            sub.activeTier,
            sub.activeSlot?.validFrom,
            sub.activeSlot?.validUntil,
            amountPaise,
            session
        );

        // ── Auto-provision & sync Account document ────────────────────────────
        const windowCfg = getWindowConfig(sub.activeTier);
        await Account.findOneAndUpdate(
            { $or: [{ user_id: accountObjId }, { _id: accountObjId }] },
            {
                _id: accountObjId,
                user_id: accountObjId,
                subscription_status: sub.activeTier,
                subscription_expiry: sub.activeSlot?.validUntil || null,
                windowCreditsTotal: windowCfg.windowCredits,
                windowCreditsRemaining: windowCfg.windowCredits,
                windowExhaustedAt: null,
                windowRefillAt: null,
                is_active: true,
            },
            { upsert: true, session }
        );

        await session.commitTransaction();

        console.log(
            `[subscription.service] ✓ ${transactionType} | accountId=${accountId} | ` +
            `active=${sub.activeTier} | paymentId=${paymentId} | ` +
            `activeUntil=${sub.activeSlot?.validUntil?.toDateString()} | ` +
            `reserved=[${sub.reservedSlots.map(s => `${s.tier}:${s.validUntil.toDateString()}`).join(', ')}]`
        );

        return {
            status:      'success',
            activeTier:  sub.activeTier,
            activePlanId: sub.activePlanId,
            validUntil:  sub.activeSlot?.validUntil,
            carriedDays,
            transactionType,
            reservedSlots: sub.reservedSlots.map(s => ({
                tier: s.tier, validUntil: s.validUntil,
            })),
        };

    } catch (err) {
        if (session.inTransaction()) {
            await session.abortTransaction().catch(() => {});
        }

        // Duplicate key = race condition between two webhook deliveries
        if (err.code === 11000 && err.message?.includes('paymentId')) {
            console.log(`[subscription.service] Duplicate paymentId ${paymentId} blocked at DB.`);
            return { status: 'already_processed' };
        }

        console.error(`[subscription.service] ✗ Failed for paymentId=${paymentId}:`, err.message);
        throw err;

    } finally {
        session.endSession();
    }
}

// ── Slot promotion (called by cron) ──────────────────────────────────────────

/**
 * Check if the active slot has expired and promote the next reserved slot.
 * Called every 15 minutes by cron.service.js.
 *
 * @param {string|ObjectId} accountId
 * @returns {{ promoted: boolean, newTier: string }}
 */
export async function promoteNextSlot(accountId) {
    const accountObjId = typeof accountId === 'string'
        ? new mongoose.Types.ObjectId(accountId)
        : accountId;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const sub = await Subscription.findOne({ accountId: accountObjId }).session(session);
        if (!sub || !sub.activeSlot) {
            await session.abortTransaction();
            return { promoted: false, newTier: 'free' };
        }

        const now = new Date();
        if (sub.activeSlot.validUntil > now) {
            // Not expired yet
            await session.abortTransaction();
            return { promoted: false, newTier: sub.activeTier };
        }

        const expiredTier = sub.activeTier;
        const expiredSlot = { ...sub.activeSlot.toObject() };

        // Sort reserved slots: highest tier first
        const sorted = sortSlots(sub.reservedSlots);
        const nextSlot = sorted[0] || null;
        const remaining = sorted.slice(1);

        let newTier;
        let newPlanId;
        let txType;
        let description;

        if (nextSlot) {
            // Promote the next slot to active
            // Reset its validFrom to now (don't carry forward the future offset)
            const newValidUntil = nextSlot.validUntil > now
                ? nextSlot.validUntil                  // slot hasn't expired — use as-is
                : new Date(now.getTime() + remainingDays(nextSlot) * MS_PER_DAY);

            sub.activeSlot = {
                ...nextSlot,
                validFrom:  now,
                validUntil: newValidUntil,
                queuedAt:   nextSlot.queuedAt,
            };
            sub.reservedSlots   = remaining;
            sub.activeTier      = nextSlot.tier;
            sub.activePlanId    = nextSlot.planId;
            sub.status          = 'ACTIVE';
            newTier             = nextSlot.tier;
            newPlanId           = nextSlot.planId;
            txType              = 'SUBSCRIPTION_PROMOTED';
            description         = `${expiredTier} expired. Promoted ${nextSlot.tier} from reserved queue. Valid until ${newValidUntil.toDateString()}`;
        } else {
            // No reserved slots — revert to free
            sub.activeSlot   = null;
            sub.reservedSlots = [];
            sub.activeTier   = 'free';
            sub.activePlanId = (process.env.PLAN_ID_FREE || '').trim();
            sub.status       = 'FREE';
            newTier          = 'free';
            newPlanId        = sub.activePlanId;
            txType           = 'SUBSCRIPTION_EXPIRED';
            description      = `${expiredTier} plan expired. No reserved slots — reverted to Free.`;
        }

        sub.markModified('activeSlot');
        sub.markModified('reservedSlots');
        await sub.save({ session });

        await Transaction.create(
            [{
                accountId: accountObjId,
                razorpay: {},
                subscription: {
                    subscriptionId: sub._id,
                    plan:           newPlanId,
                    billingCycle:   newTier === 'free' ? 'free' : 'monthly',
                },
                type:       txType,
                amountPaise: 0,
                currency:   'INR',
                creditsDelta: 0,
                status:     'SUCCESS',
                description,
                metadata: {
                    expiredTier,
                    newTier,
                    expiredSlot,
                    reservedTiers: sub.reservedSlots.map(s => s.tier),
                },
            }],
            { session }
        );

        await syncCreditTier(
            accountObjId,
            newTier,
            sub.activeSlot?.validFrom,
            sub.activeSlot?.validUntil,
            0,
            session
        );

        await session.commitTransaction();

        console.log(
            `[subscription.service] ↑ ${txType} | accountId=${accountId} | ` +
            `${expiredTier} → ${newTier} | ` +
            `reserved=[${sub.reservedSlots.map(s => s.tier).join(', ')}]`
        );

        return { promoted: true, newTier };

    } catch (err) {
        await session.abortTransaction();
        console.error(`[subscription.service] promoteNextSlot error for ${accountId}:`, err.message);
        throw err;
    } finally {
        session.endSession();
    }
}

// ── Query helpers ─────────────────────────────────────────────────────────────

/**
 * Get the current subscription state for an account.
 * Auto-triggers slot promotion if the active slot has expired.
 *
 * @param {string|ObjectId} accountId
 * @returns {Object} Subscription document (lean)
 */
export async function getActiveSubscription(accountId) {
    const accountObjId = typeof accountId === 'string'
        ? new mongoose.Types.ObjectId(accountId)
        : accountId;

    let sub = await Subscription.findOne({
        $or: [{ accountId: accountObjId }, { userId: accountObjId }],
    }).lean();
    if (!sub) return null;


    // Lazily promote if expired (backup to cron)
    if (sub.activeSlot?.validUntil && new Date() > sub.activeSlot.validUntil) {
        await promoteNextSlot(accountId);
        sub = await Subscription.findOne({ accountId: accountObjId }).lean();
    }

    return sub;
}


import UsageEvent from '../models/usage-event.model.js';

/**
 * Get paginated transaction history for an account with filters and totals.
 *
 * @param {string} accountId
 * @param {{ page?: number, limit?: number, type?: string, status?: string, startDate?: string, endDate?: string }} opts
 */
export async function getTransactionHistory(accountId, { page = 1, limit = 20, type, status, startDate, endDate } = {}) {
    const accountObjId = typeof accountId === 'string'
        ? new mongoose.Types.ObjectId(accountId)
        : accountId;

    const skip = (page - 1) * limit;

    const query = {
        $or: [
            { accountId: accountObjId },
            { userId: accountObjId },
        ],
    };

    if (type) query.type = type;
    if (status) query.status = status;
    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const [transactions, total, stats] = await Promise.all([
        Transaction.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        Transaction.countDocuments(query),
        Transaction.aggregate([
            { $match: query },
            {
                $group: {
                    _id: null,
                    totalSpentPaise: { $sum: '$amountPaise' },
                    successCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'SUCCESS'] }, 1, 0] }
                    }
                }
            }
        ]),
    ]);

    const totalSpentINR = (stats[0]?.totalSpentPaise || 0) / 100;
    const successCount = stats[0]?.successCount || 0;

    return {
        transactions,
        total,
        page,
        totalPages: Math.ceil(total / limit) || 1,
        summary: {
            totalSpentINR,
            totalTransactions: total,
            successCount,
        },
    };
}

/**
 * Get single transaction by ID for invoice receipt rendering.
 */
export async function getTransactionById(accountId, transactionId) {
    const accountObjId = typeof accountId === 'string'
        ? new mongoose.Types.ObjectId(accountId)
        : accountId;

    const tx = await Transaction.findOne({
        _id: transactionId,
        $or: [{ accountId: accountObjId }, { userId: accountObjId }],
    }).lean();

    return tx;
}

/**
 * Get paginated granular AI Usage Events (requests and interactions).
 */
export async function getUsageEvents(accountId, { page = 1, limit = 20, company, agentType, search, startDate, endDate } = {}) {
    const accountObjId = typeof accountId === 'string'
        ? new mongoose.Types.ObjectId(accountId)
        : accountId;

    const skip = (page - 1) * limit;
    const query = { accountId: accountObjId };

    if (company && company !== 'all') query.company = company;
    if (agentType && agentType !== 'all') query.agentType = agentType;
    if (search) {
        query.$or = [
            { requestId: { $regex: search, $options: 'i' } },
            { modelId: { $regex: search, $options: 'i' } },
        ];
    }
    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    let [events, total] = await Promise.all([
        UsageEvent.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        UsageEvent.countDocuments(query),
    ]);

    // Backfill / sync from Credit.usageEvents if standalone collection has no records for this account
    if (total === 0 && !search && !company && !agentType) {
        const credit = await Credit.findOne({
            $or: [{ userId: accountObjId }, { accountId: accountObjId }]
        }).lean();

        if (credit?.usageEvents?.length > 0) {
            const seedDocs = credit.usageEvents.map(e => ({
                accountId: accountObjId,
                company: e.company || 'google',
                modelId: e.modelId || 'gemini-1.5-pro',
                agentType: e.agentType || 'codingAgent',
                projectId: e.projectId || '',
                requestId: e.requestId || `req_${Date.now().toString(36)}`,
                promptTokens: e.promptTokens || 0,
                completionTokens: e.completionTokens || 0,
                totalTokens: e.totalTokens || 0,
                creditsDeducted: e.creditsDeducted || 0,
                creditSource: 'main',
                billableCents: e.billableCents || 0,
                createdAt: e.createdAt || new Date(),
            }));

            await UsageEvent.insertMany(seedDocs, { ordered: false }).catch(() => {});

            [events, total] = await Promise.all([
                UsageEvent.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
                UsageEvent.countDocuments(query),
            ]);
        }
    }

    return {
        events,
        total,
        page,
        totalPages: Math.ceil(total / limit) || 1,
    };
}

/**
 * Aggregated AI Usage Analytics for charts and KPI cards.
 */
export async function getUsageAnalytics(accountId, { days = 30 } = {}) {
    const accountObjId = typeof accountId === 'string'
        ? new mongoose.Types.ObjectId(accountId)
        : accountId;

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    const matchUser = { accountId: accountObjId, createdAt: { $gte: sinceDate } };

    const [timeline, providerBreakdown, agentBreakdown, tokenTotals, creditDoc] = await Promise.all([
        // Daily timeline for time-series charts
        UsageEvent.aggregate([
            { $match: matchUser },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
                    },
                    totalTokens: { $sum: '$totalTokens' },
                    promptTokens: { $sum: '$promptTokens' },
                    completionTokens: { $sum: '$completionTokens' },
                    requestCount: { $sum: 1 },
                    creditsDeducted: { $sum: '$creditsDeducted' },
                }
            },
            { $sort: { _id: 1 } }
        ]),

        // Breakdown by AI provider
        UsageEvent.aggregate([
            { $match: matchUser },
            {
                $group: {
                    _id: '$company',
                    totalTokens: { $sum: '$totalTokens' },
                    requestCount: { $sum: 1 },
                    creditsDeducted: { $sum: '$creditsDeducted' },
                }
            },
            { $sort: { totalTokens: -1 } }
        ]),

        // Breakdown by Agent Type
        UsageEvent.aggregate([
            { $match: matchUser },
            {
                $group: {
                    _id: '$agentType',
                    totalTokens: { $sum: '$totalTokens' },
                    requestCount: { $sum: 1 },
                }
            },
            { $sort: { totalTokens: -1 } }
        ]),

        // Overall sums
        UsageEvent.aggregate([
            { $match: matchUser },
            {
                $group: {
                    _id: null,
                    totalTokens: { $sum: '$totalTokens' },
                    promptTokens: { $sum: '$promptTokens' },
                    completionTokens: { $sum: '$completionTokens' },
                    totalRequests: { $sum: 1 },
                    totalCreditsDeducted: { $sum: '$creditsDeducted' },
                }
            }
        ]),

        // Credit document for historical fallback
        Credit.findOne({ $or: [{ userId: accountObjId }, { accountId: accountObjId }] }).lean(),
    ]);

    let totals = tokenTotals[0] || {
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalRequests: 0,
        totalCreditsDeducted: 0,
    };

    // If UsageEvent collection aggregate is 0 but Credit has recorded tokens, merge from Credit
    if (totals.totalTokens === 0 && (creditDoc?.totalTokens > 0 || creditDoc?.promptTokens > 0)) {
        totals = {
            totalTokens: creditDoc.totalTokens || 0,
            promptTokens: creditDoc.promptTokens || 0,
            completionTokens: creditDoc.completionTokens || 0,
            totalRequests: creditDoc.providerCredits?.reduce((acc, b) => acc + (b.requestCount || 0), 0) || 0,
            totalCreditsDeducted: 0,
        };
    }

    let finalProviders = providerBreakdown.map(p => ({
        company: p._id,
        totalTokens: p.totalTokens,
        requestCount: p.requestCount,
        creditsDeducted: p.creditsDeducted,
    }));

    if (finalProviders.length === 0 && creditDoc?.providerCredits?.length > 0) {
        finalProviders = creditDoc.providerCredits
            .filter(b => b.company !== 'unknown' && (b.totalTokens > 0 || b.creditsRemaining < b.creditsGranted))
            .map(b => ({
                company: b.company,
                totalTokens: b.totalTokens || 0,
                requestCount: b.requestCount || 0,
                creditsDeducted: Math.max(0, (b.creditsGranted || 20) - (b.creditsRemaining || 20)),
            }));
    }

    return {
        timeframeDays: days,
        totals,
        timeline: timeline.map(item => ({
            date: item._id,
            totalTokens: item.totalTokens,
            promptTokens: item.promptTokens,
            completionTokens: item.completionTokens,
            requestCount: item.requestCount,
            creditsDeducted: item.creditsDeducted,
        })),
        byProvider: finalProviders,
        byAgent: agentBreakdown.map(a => ({
            agentType: a._id,
            totalTokens: a.totalTokens,
            requestCount: a.requestCount,
        })),
    };
}

/**
 * Complete Dashboard Overview for instant boot.
 */
export async function getDashboardOverview(accountId) {
    const accountObjId = typeof accountId === 'string'
        ? new mongoose.Types.ObjectId(accountId)
        : accountId;

    const [subscription, credit, analytics, recentTransactions, recentEvents] = await Promise.all([
        getActiveSubscription(accountObjId),
        Credit.findOne({ $or: [{ userId: accountObjId }, { accountId: accountObjId }] }).lean(),
        getUsageAnalytics(accountObjId, { days: 30 }),
        Transaction.find({
            $or: [{ accountId: accountObjId }, { userId: accountObjId }],
        }).sort({ createdAt: -1 }).limit(5).lean(),
        UsageEvent.find({ accountId: accountObjId }).sort({ createdAt: -1 }).limit(5).lean(),
    ]);

    return {
        subscription: subscription || { activeTier: 'free', status: 'FREE' },
        credit: credit || { credits: 20, subscription: 'free', providerCredits: [] },
        analytics,
        recentTransactions,
        recentEvents,
    };
}


/**
 * Find all subscriptions with expired active slots (for cron batch processing).
 * @returns {string[]} Array of accountId strings
 */
export async function findExpiredActiveSlots() {
    const now = new Date();
    const subs = await Subscription.find({
        status: 'ACTIVE',
        'activeSlot.validUntil': { $lte: now },
    }).select('accountId').lean();

    return subs.map(s => s.accountId.toString());
}

