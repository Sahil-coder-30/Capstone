/**
 * Billing Model — Payments Service
 *
 * One document per account.
 * Tracks subscription billing period boundaries and accumulated charges.
 *
 * This document is the source of truth for:
 *   - When the current billing period started and ends.
 *   - How many cents have been accrued but not yet invoiced (metered tiers).
 *   - The account's all-time payment total.
 *
 * Source of truth: accountId = Account._id
 */

import mongoose from 'mongoose';

const BillingSchema = new mongoose.Schema(
    {
        accountId: {
            type:     mongoose.Schema.Types.ObjectId,
            required: true,
            unique:   true,
            index:    true,
            ref:      'Account',
        },

        currency: {
            type:    String,
            default: 'INR',
        },

        /** Start of the current billing period. Reset on each subscription renewal. */
        currentPeriodStart: {
            type:    Date,
            default: () => new Date(),
        },

        /** End of the current billing period (usually currentPeriodStart + 1 month). */
        currentPeriodEnd: {
            type:    Date,
            default: () => {
                const d = new Date();
                d.setMonth(d.getMonth() + 1);
                return d;
            },
        },

        /**
         * Accrued-but-not-yet-invoiced amount in smallest currency unit (paise for INR).
         * Incremented on every metered AI usage event.
         * Reset to 0 when a billing period is settled / invoice is generated.
         */
        unbilledCents: {
            type:    Number,
            default: 0,
            min:     0,
        },

        /** Total amount successfully charged, lifetime, in paise. */
        lifetimeCents: {
            type:    Number,
            default: 0,
            min:     0,
        },
    },
    { timestamps: true }
);

// ── Static helpers ─────────────────────────────────────────────────────────────

/**
 * Find or create a billing document for an account.
 *
 * @param {string} accountId
 * @returns {Promise<Document>}
 */
BillingSchema.statics.findOrCreate = async function (accountId) {
    const doc = await this.findOneAndUpdate(
        { accountId },
        { $setOnInsert: { accountId } },
        { upsert: true, new: true }
    );
    return doc;
};

const Billing = mongoose.model('billing', BillingSchema);
export default Billing;
