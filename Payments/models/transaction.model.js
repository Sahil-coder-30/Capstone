import mongoose from 'mongoose';

/**
 * Transaction — Immutable Financial Audit Ledger
 *
 * Every credit operation (purchase, deduction, admin grant, subscription change,
 * refund, reset) writes a permanent record here.
 *
 * The `razorpay.paymentId` field carries a UNIQUE SPARSE index — this is the primary
 * idempotency guard that prevents double-crediting on Razorpay webhook retries.
 *
 * NEVER delete or mutate documents in this collection.
 */
const TransactionSchema = new mongoose.Schema(
    {
        accountId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },
        // Optional legacy field support
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            index: true,
        },
        razorpay: {
            orderId: {
                type: String,
            },
            paymentId: {
                type: String,
            },
            signature: { type: String },
        },
        subscription: {
            subscriptionId: {
                type: mongoose.Schema.Types.ObjectId,
            },
            plan: {
                type: String,
            },
            billingCycle: {
                type: String,
            },
        },
        // External payment aggregator order/payment refs (for Razorpay etc.)
        type: {
            type: String,
            enum: [
                'CREDIT_PURCHASE',         // User bought credits via payment aggregator
                'SUBSCRIPTION_ACTIVATION', // Subscription plan activated / upgraded
                'SUBSCRIPTION_EXTENSION',  // Same plan re-purchased (validity +30 days)
                'SUBSCRIPTION_QUEUED',     // Lower tier plan queued in reservedSlots
                'SUBSCRIPTION_PROMOTED',   // Slot promoted from reserved to active on expiry
                'SUBSCRIPTION_EXPIRED',    // Plan expired, reverted to Free
                'SUBSCRIPTION_CHANGE',     // Tier upgrade / downgrade (legacy)
                'USAGE_DEDUCTION',         // AI token usage deducted (metered billing)
                'ADMIN_GRANT',             // Manual credit grant by admin (support / promo)
                'PROMO_GRANT',             // Automated promotional credit grant
                'REFUND',                  // Payment refunded, credits revoked
                'RESET',                   // Admin reset provider bucket to default
            ],
            required: true,
        },

        // Amount in Indian Rupee paise (smallest unit). 100 paise = ₹1
        amountPaise: {
            type: Number,
            default: 0,
            min: 0,
        },

        currency: {
            type: String,
            default: 'INR',
        },

        // Credits added (+) or removed (-) by this transaction
        creditsDelta: {
            type: Number,
            default: 0,
        },

        // Token count for USAGE_DEDUCTION entries
        tokensConsumed: {
            type: Number,
            default: 0,
            min: 0,
        },

        status: {
            type: String,
            enum: ['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'],
            default: 'SUCCESS',
            required: true,
        },

        // Free-form metadata: packageId, from/to subscription tier, admin note, etc.
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },

        // Human-readable description shown in transaction history UI
        description: {
            type: String,
            default: '',
        },
    },
    {
        timestamps: true,
    }
);

// Compound indexes: fast paginated history queries per account sorted by time
TransactionSchema.index({ accountId: 1, createdAt: -1 });
TransactionSchema.index({ userId: 1, createdAt: -1 });

// Index for reconciliation: find PENDING transactions older than N minutes
TransactionSchema.index({ status: 1, createdAt: 1 });

// IDEMPOTENCY GUARD: prevents double-crediting on Razorpay webhook retries.
// sparse = only indexes documents where razorpay.paymentId exists (not null).
TransactionSchema.index({ 'razorpay.paymentId': 1 }, { unique: true, sparse: true });

const Transaction = mongoose.model('transaction', TransactionSchema);
export default Transaction;
