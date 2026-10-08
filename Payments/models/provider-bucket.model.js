/**
 * ProviderBucket Model — Payments Service
 *
 * One document per (account × provider) pair.
 * Stores the token-bucket rate-limiting state for a single AI provider.
 *
 * Token-bucket behaviour:
 *   - `bucketCapacity` is set from the account's plan (80 / 250 / 600).
 *   - On each authorized AI request, `creditsRemaining` is decremented post-call.
 *   - When `creditsRemaining` hits 0:
 *       • `emptiedAt` is stamped with the current time.
 *       • `refillAt`  is set to emptiedAt + REFILL_HOURS (5h).
 *   - On the next request after `refillAt` has passed, the bucket is refilled
 *     INLINE (lazy) by credit.service before the authorization check.
 *   - If a settled cost goes negative (overdraft), the deficit is saved in
 *     `overdraftCredits` and recovered from the next scheduled refill.
 *
 * Indexes:
 *   - (accountId, company) unique — one bucket per account per provider.
 *   - (refillAt) sparse    — used by any future background refill job.
 *
 * Source of truth: accountId = Account._id
 */

import mongoose from 'mongoose';
import { CREDIT_COMPANIES } from './credit.model.js';
import { PLAN_CREDIT_LIMITS, REFILL_HOURS } from '../config/subscription.config.js';

const ProviderBucketSchema = new mongoose.Schema(
    {
        accountId: {
            type:     mongoose.Schema.Types.ObjectId,
            required: true,
            index:    true,
            ref:      'Account',
        },

        company: {
            type:     String,
            enum:     CREDIT_COMPANIES,
            required: true,
        },

        // ── Token-bucket state ─────────────────────────────────────────────────
        /** Maximum credits this bucket can hold (set from plan at creation / upgrade). */
        bucketCapacity: {
            type:    Number,
            default: PLAN_CREDIT_LIMITS.free,
            min:     0,
        },
        /** Lifetime grants accumulated (for auditing). */
        creditsGranted: {
            type:    Number,
            default: PLAN_CREDIT_LIMITS.free,
            min:     0,
        },
        /** Current spendable balance. Decremented on settle; refilled after REFILL_HOURS. */
        creditsRemaining: {
            type:    Number,
            default: PLAN_CREDIT_LIMITS.free,
            min:     0,
        },
        /** Timestamp when creditsRemaining last hit 0. Null when bucket is not empty. */
        emptiedAt: {
            type:    Date,
            default: null,
        },
        /** Timestamp when the bucket should be refilled (emptiedAt + REFILL_HOURS). */
        refillAt: {
            type:    Date,
            default: null,
        },
        /**
         * Overdraft debt: accumulated when a settled call cost more than the balance.
         * Recovered at next refill: newBalance = bucketCapacity - overdraftCredits.
         */
        overdraftCredits: {
            type:    Number,
            default: 0,
            min:     0,
        },

        // ── Per-provider telemetry (lifetime, for this provider only) ──────────
        promptTokens: {
            type:    Number,
            default: 0,
            min:     0,
        },
        completionTokens: {
            type:    Number,
            default: 0,
            min:     0,
        },
        totalTokens: {
            type:    Number,
            default: 0,
            min:     0,
        },
        billableTokens: {
            type:    Number,
            default: 0,
            min:     0,
        },
        billableCents: {
            type:    Number,
            default: 0,
            min:     0,
        },
        /** Total AI requests made through this bucket. */
        requestCount: {
            type:    Number,
            default: 0,
            min:     0,
        },
        /** Last time a request was settled against this bucket. */
        lastUsedAt: {
            type: Date,
        },
    },
    { timestamps: true }
);

// ── Indexes ────────────────────────────────────────────────────────────────────
// One bucket per (account, provider) — enforced at DB level.
ProviderBucketSchema.index({ accountId: 1, company: 1 }, { unique: true });

// Sparse index on refillAt — used if a background cron job is added later
// to batch-refill empty buckets without waiting for a user request.
ProviderBucketSchema.index({ refillAt: 1 }, { sparse: true });

// ── Static helpers ────────────────────────────────────────────────────────────

/**
 * Find a bucket or create it with plan-correct defaults.
 *
 * @param {string} accountId
 * @param {string} company       - 'gemini' | 'mistral'
 * @param {string} [plan='free'] - Used to seed capacity if the bucket is new.
 * @returns {Promise<Document>}
 */
ProviderBucketSchema.statics.findOrCreate = async function (accountId, company, plan = 'free') {
    const capacity = PLAN_CREDIT_LIMITS[plan] ?? PLAN_CREDIT_LIMITS.free;

    const bucket = await this.findOneAndUpdate(
        { accountId, company },
        {
            $setOnInsert: {
                accountId,
                company,
                bucketCapacity:   capacity,
                creditsGranted:   capacity,
                creditsRemaining: capacity,
                emptiedAt:        null,
                refillAt:         null,
                overdraftCredits: 0,
            },
        },
        { upsert: true, new: true }
    );

    return bucket;
};

/**
 * Apply lazy-refill: if `refillAt` has passed, restore creditsRemaining
 * to (bucketCapacity - overdraftCredits) and clear the debt.
 *
 * Mutates and saves the document. Returns true if a refill was applied.
 *
 * @param {Document} bucket - A ProviderBucket Mongoose document (NOT lean).
 * @returns {Promise<boolean>}
 */
ProviderBucketSchema.statics.tryRefill = async function (bucket) {
    if (!bucket.refillAt || new Date() < bucket.refillAt) return false;

    const debt         = bucket.overdraftCredits || 0;
    const refillAmount = Math.max(0, bucket.bucketCapacity - debt);

    bucket.creditsRemaining  = refillAmount;
    bucket.creditsGranted   += refillAmount;
    bucket.overdraftCredits  = 0;
    bucket.emptiedAt         = null;
    bucket.refillAt          = null;

    await bucket.save();
    return true;
};

const ProviderBucket = mongoose.model('provider_bucket', ProviderBucketSchema);
export { REFILL_HOURS };
export default ProviderBucket;
