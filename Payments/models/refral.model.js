/**
 * Referral Model — Payments Service
 *
 * Tracks unique referral links/hashes generated for users and audit logs
 * of every account that signs up using a referral link.
 *
 * Referral Settlement Flow:
 *  1. When User B uses User A's referral code, a new entry is added to `usedBy` with:
 *     - status: 'pending'
 *     - commissionSettled: false
 *     - eligibleAt: Date.now() + 7 days (7-day refund hold period)
 *  2. After 7 days (`Date.now() >= eligibleAt`), `settlePendingCommissions()` automatically:
 *     - Changes status to 'success'
 *     - Sets commissionSettled to true and stamps settledAt timestamp
 *     - Deposits the 50 credits directly into User A's Referral Credit bucket (`referral_credits` collection)
 *
 * Source of truth: accountId = Account._id
 */

import mongoose from 'mongoose';
import crypto from 'crypto';
import ReferralCredit from './referral-credit.model.js';
import Transaction from './transaction.model.js';

const FREE_REFUND_PERIOD_DAYS = 7;
const FREE_REFUND_PERIOD_MS = FREE_REFUND_PERIOD_DAYS * 24 * 60 * 60 * 1000;

/**
 * Subdocument tracking each user that signed up using this referral hash
 */
const ReferralUsageSchema = new mongoose.Schema(
    {
        /** The account ID of the referred user who signed up */
        accountId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'Account',
        },

        /** Number of credits to be awarded upon successful settlement (default: 50) */
        creditsAwarded: {
            type: Number,
            required: true,
            default: 50,
            min: 0,
        },

        /**
         * Status of the referral reward:
         *  - 'pending': Within the 7-day free refund period
         *  - 'success': 7 days passed; commission settled & credits added to bucket
         *  - 'cancelled': Order/user was refunded or cancelled within 7 days
         */
        status: {
            type: String,
            enum: ['pending', 'success', 'cancelled'],
            default: 'pending',
        },

        /** Whether the 50 credits commission has been paid out to the user's referral bucket */
        commissionSettled: {
            type: Boolean,
            default: false,
        },

        /** Timestamp when the referral code was used */
        usedAt: {
            type: Date,
            default: Date.now,
        },

        /**
         * Date when the 7-day free refund period ends.
         * Once Date.now() >= eligibleAt, commission automatically matures to 'success'.
         */
        eligibleAt: {
            type: Date,
            default: () => new Date(Date.now() + FREE_REFUND_PERIOD_MS),
        },

        /** Timestamp when the 50 credits commission was credited to the referral bucket */
        settledAt: {
            type: Date,
            default: null,
        },
    },
    { _id: true }
);

const referralSchema = new mongoose.Schema(
    {
        /** The account ID of the referral code owner (referrer) */
        accountId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            unique: true,
            index: true,
            ref: 'Account',
        },

        /** Unique shareable referral code (e.g. 'REF-A8F92K') */
        referralHash: {
            type: String,
            required: true,
            unique: true,
            index: true,
            trim: true,
        },

        status: {
            type: String,
            enum: ['active', 'deprecated', 'suspended'],
            default: 'active',
        },

        usedBy: {
            type: [ReferralUsageSchema],
            default: [],
        },

        totalReferrals: {
            type: Number,
            default: 0,
            min: 0,
        },

        totalCreditsEarned: {
            type: Number,
            default: 0,
            min: 0,
        },
    },
    {
        timestamps: true,
    }
);

// ── Static Helpers ─────────────────────────────────────────────────────────────

/**
 * Generate a clean, 8-character unique alphanumeric referral code (e.g., REF-4B8F9A)
 */
referralSchema.statics.generateUniqueCode = function () {
    return 'REF-' + crypto.randomBytes(4).toString('hex').toUpperCase();
};

/**
 * Find or create a referral document for an account.
 * Automatically generates a unique referral hash if creating for the first time.
 *
 * @param {string|ObjectId} accountId
 * @returns {Promise<Document>}
 */
referralSchema.statics.findOrCreateForAccount = async function (accountId) {
    let doc = await this.findOne({ accountId });
    if (!doc) {
        let code = this.generateUniqueCode();
        let collision = await this.findOne({ referralHash: code });
        while (collision) {
            code = this.generateUniqueCode();
            collision = await this.findOne({ referralHash: code });
        }

        doc = await this.create({
            accountId,
            referralHash: code,
            status: 'active',
        });
    }
    return doc;
};

/**
 * Settle all matured pending referral commissions (where eligibleAt <= now).
 *
 * Finds all pending referral usages whose 7-day refund window has passed,
 * updates status to 'success', sets commissionSettled = true, and deposits
 * the 50 credits into the referrer's ReferralCredit bucket.
 *
 * Can be called for a specific accountId or for all pending referrals globally.
 *
 * @param {string|ObjectId} [targetAccountId] - Optional target referrer accountId
 * @returns {Promise<{ settledCount: number, totalCreditsPaid: number }>}
 */
referralSchema.statics.settlePendingCommissions = async function (targetAccountId = null) {
    const now = new Date();
    const query = {
        'usedBy.status': 'pending',
        'usedBy.eligibleAt': { $lte: now },
    };
    if (targetAccountId) {
        query.accountId = targetAccountId;
    }

    const referralDocs = await this.find(query);
    let settledCount = 0;
    let totalCreditsPaid = 0;

    for (const doc of referralDocs) {
        let docModified = false;

        for (const usage of doc.usedBy) {
            if (usage.status === 'pending' && !usage.commissionSettled && usage.eligibleAt <= now) {
                // 1. Fetch or provision referrer's ReferralCredit bucket
                let refCredit = await ReferralCredit.findOne({ accountId: doc.accountId });
                if (!refCredit) {
                    refCredit = new ReferralCredit({ accountId: doc.accountId });
                }

                // Check lifetime cap (1000 credits)
                const currentEarned = refCredit.creditsEarned || 0;
                const lifetimeCap = refCredit.lifetimeCap || 1000;

                if (currentEarned < lifetimeCap) {
                    const headroom = lifetimeCap - currentEarned;
                    const creditsToAdd = Math.min(usage.creditsAwarded, headroom);

                    refCredit.creditsEarned += creditsToAdd;
                    refCredit.creditsRemaining += creditsToAdd;
                    await refCredit.save();

                    // Log financial transaction ledger entry
                    await Transaction.create({
                        accountId: doc.accountId,
                        type: 'REFERRAL_CREDIT',
                        amountPaise: 0,
                        creditsDelta: creditsToAdd,
                        status: 'SUCCESS',
                        aggregator: 'SYSTEM',
                        description: `Referral commission settled: ${creditsToAdd} credits (referred: ${usage.accountId})`,
                        metadata: {
                            referredAccountId: usage.accountId,
                            creditsAwarded: creditsToAdd,
                            maturedAt: usage.eligibleAt,
                        },
                    });

                    doc.totalCreditsEarned += creditsToAdd;
                    totalCreditsPaid += creditsToAdd;
                }

                // 2. Mark usage as settled & success
                usage.status = 'success';
                usage.commissionSettled = true;
                usage.settledAt = now;

                settledCount++;
                docModified = true;
            }
        }

        if (docModified) {
            await doc.save();
        }
    }

    return { settledCount, totalCreditsPaid };
};

// ── Instance Methods ───────────────────────────────────────────────────────────

/**
 * Record a new referral usage for a referred account.
 * Starts in 'pending' status — credits will auto-settle after the 7-day period.
 *
 * @param {string|ObjectId} referredAccountId - The new user's Account ID
 * @param {number} creditsAwarded - Number of credits to be awarded after 7 days (default: 50)
 */
referralSchema.methods.recordUsage = function (referredAccountId, creditsAwarded = 50) {
    const eligibleAt = new Date(Date.now() + FREE_REFUND_PERIOD_MS);

    this.usedBy.push({
        accountId: referredAccountId,
        creditsAwarded,
        status: 'pending',
        commissionSettled: false,
        usedAt: new Date(),
        eligibleAt,
        settledAt: null,
    });

    this.totalReferrals += 1;
};

const Referral = mongoose.model('Referral', referralSchema);
export default Referral;
