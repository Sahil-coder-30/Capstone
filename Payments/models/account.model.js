/**
 * Account Model — Payments Service
 *
 * One Account document is created per user the first time they interact with
 * the Payments service. It bridges the external Auth service identity (user_id)
 * to the internal Payments identity (Account._id = accountId).
 *
 * Source of truth chain:
 *   Auth Service JWT → user_id (sub claim)
 *        │
 *        └─► Account.user_id  (foreign key from Auth)
 *             └─► Account._id  ← accountId used by Credit & Transaction models
 *
 * Why a separate Account layer?
 *  - Decouples Payments from the Auth service schema. Auth can change user IDs,
 *    migrate databases, or be replaced — Payments stays stable.
 *  - Provides a single place to store subscription state, expiry, and billing
 *    metadata that isn't tied to the credit ledger.
 *  - Enables the Payments service to be queried by accountId without needing
 *    to contact the Auth service on every request.
 */

import mongoose from 'mongoose';
import { SUBSCRIPTION_TIERS } from '../config/subscription.config.js';

const accountSchema = new mongoose.Schema(
    {
        /**
         * The user's ID from the Auth service (extracted from the JWT `sub` claim).
         * Unique and indexed — used to look up the Account on every authenticated request.
         */
        user_id: {
            type:     mongoose.Schema.Types.ObjectId,
            required: true,
            unique:   true,
            index:    true,
        },

        /**
         * Current subscription tier. Kept in sync by credit.service.js when a
         * payment is confirmed. Denormalised here for fast reads without joining
         * to the Credit document.
         */
        subscription_status: {
            type:    String,
            enum:    Object.keys(SUBSCRIPTION_TIERS),
            default: 'free',
        },

        /**
         * When the current paid subscription expires.
         * null for free-tier accounts (no expiry).
         */
        subscription_expiry: {
            type:    Date,
            default: null,
        },

        /**
         * Whether the account has been soft-deleted / suspended.
         * Rate-limit middleware should reject requests from suspended accounts.
         */
        is_active: {
            type:    Boolean,
            default: true,
        },

        // ── 5-Hour Credit Window ───────────────────────────────────────────────

        /**
         * Total credits allocated for the current window (matches tier config).
         * Set when the account is provisioned or when the tier changes.
         * Free = 20, Pro = 150, Max = 200.
         */
        windowCreditsTotal: {
            type:    Number,
            default: 20,
            min:     0,
        },

        /**
         * Credits remaining in the active 5-hour window.
         * Decremented on every AI request via credit.controller.js updateCreditController.
         * When this drops below 5 (creditLowerLimit), canQuery = false.
         */
        windowCreditsRemaining: {
            type:    Number,
            default: 20,
            min:     0,
        },

        /**
         * Timestamp when windowCreditsRemaining first dropped below creditLowerLimit.
         * null = window is healthy / never exhausted.
         * The 5-hour refill timer counts from this moment.
         */
        windowExhaustedAt: {
            type:    Date,
            default: null,
        },

        /**
         * Timestamp when the cron job should refill this account's window.
         * = windowExhaustedAt + windowHours * 3600 * 1000.
         * null = window is healthy, no refill pending.
         * Indexed so the cron can find expired-window accounts efficiently.
         */
        windowRefillAt: {
            type:    Date,
            default: null,
            index:   true,
        },

    },
    {
        timestamps: true,   // createdAt = account creation date (useful for cohort analysis)
    }
);

// ── Index ──────────────────────────────────────────────────────────────────────
// Already covered by unique: true on user_id above.
// Extra compound index for list queries filtered by plan + creation date.
accountSchema.index({ subscription_status: 1, createdAt: -1 });

const Account = mongoose.model('Account', accountSchema);
export default Account;