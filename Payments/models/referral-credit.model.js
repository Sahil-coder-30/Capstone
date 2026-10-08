/**
 * ReferralCredit Model — Payments Service
 *
 * One document per account.
 * Tracks the global referral credit overflow pool.
 *
 * Rules:
 *   - Credits are earned when a referred user signs up (50 per referral by default).
 *   - `creditsEarned` accumulates lifetime — hard capped at 1000.
 *   - `creditsRemaining` is the spendable balance, decremented when the main
 *     provider bucket is exhausted and the system falls back to referral.
 *   - Referral credits are shared across all providers (not per-provider).
 *   - Once `creditsEarned` reaches `lifetimeCap`, no more referral credits
 *     can be earned. Existing balance is still spendable.
 *
 * Source of truth: accountId = Account._id
 */

import mongoose from 'mongoose';

const ReferralCreditSchema = new mongoose.Schema(
    {
        accountId: {
            type:     mongoose.Schema.Types.ObjectId,
            required: true,
            unique:   true,
            index:    true,
            ref:      'Account',
        },

        /** Total referral credits earned, lifetime (capped at lifetimeCap). */
        creditsEarned: {
            type:    Number,
            default: 0,
            min:     0,
        },

        /** Current spendable balance. Decremented on each fallback AI request. */
        creditsRemaining: {
            type:    Number,
            default: 0,
            min:     0,
        },

        /**
         * Hard lifetime cap — an account cannot earn more than this total.
         * Stored explicitly for audit/display purposes.
         * immutable: true prevents accidental updates via $set.
         */
        lifetimeCap: {
            type:      Number,
            default:   1000,
            immutable: true,
        },
    },
    { timestamps: true }
);

// ── Static helpers ─────────────────────────────────────────────────────────────

/**
 * Find or create the referral credit document for an account.
 *
 * @param {string} accountId
 * @returns {Promise<Document>}
 */
ReferralCreditSchema.statics.findOrCreate = async function (accountId) {
    const doc = await this.findOneAndUpdate(
        { accountId },
        { $setOnInsert: { accountId, creditsEarned: 0, creditsRemaining: 0 } },
        { upsert: true, new: true }
    );
    return doc;
};

const ReferralCredit = mongoose.model('referral_credit', ReferralCreditSchema);
export default ReferralCredit;
