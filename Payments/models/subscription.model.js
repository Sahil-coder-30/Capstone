import mongoose from 'mongoose';

/**
 * Subscription — Plan Queue per Account
 *
 * One document per user. Tracks the active plan slot and any reserved
 * (queued) plan slots. The system guarantees zero day-waste for the user:
 * remaining days from a lower-tier plan are preserved in reservedSlots
 * and reactivated when higher-tier plans expire.
 *
 * Plan IDs are hashed strings read from .env at runtime:
 *   PLAN_ID_FREE, PLAN_ID_PRO, PLAN_ID_MAX
 *
 * ─── Plan Queue Lifecycle ─────────────────────────────────────────────────
 *
 *  Initial state:   activeTier = 'free', activeSlot = null, reservedSlots = []
 *
 *  Buy Pro:         activeSlot = { tier: 'pro', validUntil: now+30d }
 *  Buy Max (on Pro): activeSlot = { tier: 'max', validUntil: now+30d }
 *                   reservedSlots = [{ tier: 'pro', validUntil: <old expiry> }]
 *  Max expires:     activeSlot promoted from reservedSlots → Pro reactivates
 *  Pro expires:     activeTier = 'free', status = 'FREE'
 *
 *  Buy Pro again (Pro active): activeSlot.validUntil += 30d
 *  Buy Max again (Max active): activeSlot.validUntil += 30d  (Pro still preserved)
 *  Buy Pro (Max active):       find Pro in reservedSlots → extend +30d
 *                              (or add new Pro slot if none reserved yet)
 *
 * ─── Transaction types written to Transaction ledger ─────────────────────
 *   SUBSCRIPTION_ACTIVATION  — new active slot started
 *   SUBSCRIPTION_EXTENSION   — same-tier slot extended (+30d)
 *   SUBSCRIPTION_QUEUED      — slot added to reservedSlots (lower-tier purchase)
 *   SUBSCRIPTION_PROMOTED    — slot promoted from reserved → active on expiry
 *   SUBSCRIPTION_EXPIRED     — active slot expired with no reserved slots
 */

// Tier priority — higher number = higher tier
export const TIER_PRIORITY = { free: 0, pro: 1, max: 2 };

// ── PlanSlot sub-schema ────────────────────────────────────────────────────────
const PlanSlotSchema = new mongoose.Schema(
    {
        // Internal packageId (e.g. 'pro_regular', 'max_early_access')
        packageId: { type: String, required: true },

        // Human-readable tier: 'pro' | 'max'
        tier: { type: String, enum: ['pro', 'max'], required: true },

        // Hashed planId from .env
        planId: { type: String, required: true },

        // When this slot's validity window starts
        validFrom: { type: Date, required: true },

        // When this slot expires (null = no expiry, should never happen for paid)
        validUntil: { type: Date, required: true },

        // Amount paid when this slot was created / extended (in paise)
        paidAmountPaise: { type: Number, default: 0, min: 0 },

        // Days carried over from a previous slot when this was a promoted upgrade
        carriedDays: { type: Number, default: 0 },

        // Timestamp when this slot was added to the queue (for audit)
        queuedAt: { type: Date, default: () => new Date() },
    },
    { _id: false }
);

// ── Subscription schema ────────────────────────────────────────────────────────
const SubscriptionSchema = new mongoose.Schema(
    {
        // One document per account — enforced by unique index
        accountId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            unique: true,
            index: true,
        },

        // Current effective tier (denormalized from activeSlot for fast reads)
        activeTier: {
            type: String,
            enum: ['free', 'pro', 'max'],
            default: 'free',
            index: true,
        },

        // Hashed planId of the current active tier (from .env)
        activePlanId: {
            type: String,
            default: () => (process.env.PLAN_ID_FREE || '').trim() || null,
        },

        // The plan slot currently being consumed. null = user is on Free.
        activeSlot: {
            type: PlanSlotSchema,
            default: null,
        },

        // Lower-tier (or same-tier future) plan slots waiting to activate.
        // Sorted by tier DESC so highest tier is promoted first on conflict.
        reservedSlots: {
            type: [PlanSlotSchema],
            default: [],
        },

        // Overall subscription state
        status: {
            type: String,
            enum: ['FREE', 'ACTIVE', 'EXPIRED'],
            default: 'FREE',
            index: true,
        },

        // Most recent Razorpay refs (for quick admin lookup)
        lastRazorpayOrderId:   { type: String, default: null },
        lastRazorpayPaymentId: { type: String, default: null },

        // Free-form extras (admin notes, promo codes)
        metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    { timestamps: true }
);

// Find subscriptions whose active slot has expired (for cron promotion job)
SubscriptionSchema.index({ status: 1, 'activeSlot.validUntil': 1 });

export const Subscription = mongoose.model('Subscription', SubscriptionSchema);
