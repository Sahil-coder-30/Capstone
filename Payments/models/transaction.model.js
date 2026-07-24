import mongoose from 'mongoose';

/**
 * Transaction — Immutable Financial Audit Ledger
 *
 * Every credit operation (purchase, deduction, admin grant, subscription change,
 * refund, reset) writes a permanent record here.
 *
 * The `paymentId` field carries a UNIQUE index — this is the primary idempotency
 * guard that prevents double-crediting on Razorpay webhook retries.
 *
 * NEVER delete or mutate documents in this collection.
 */
const TransactionSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },

        // External payment aggregator order/payment refs (for Razorpay etc.)
        orderId: {
            type: String,
            default: null,
            index: true,
        },
        paymentId: {
            type: String,
            default: null,
            // Unique sparse index: allows multiple null values but prevents duplicate
            // non-null payment IDs (idempotency guard against webhook retries)
            sparse: true,
            unique: true,
            index: true,
        },

        type: {
            type: String,
            enum: [
                'CREDIT_PURCHASE',       // User bought credits via payment aggregator
                'SUBSCRIPTION_CHANGE',   // Tier upgrade / downgrade
                'USAGE_DEDUCTION',       // AI token usage deducted (metered billing)
                'ADMIN_GRANT',           // Manual credit grant by admin (support / promo)
                'PROMO_GRANT',           // Automated promotional credit grant
                'REFUND',                // Payment refunded, credits revoked
                'RESET',                 // Admin reset provider bucket to default
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

        aggregator: {
            type: String,
            enum: ['RAZORPAY', 'INTERNAL', 'ADMIN'],
            default: 'INTERNAL',
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

        // Never allow updates to this collection (enforced at application layer)
        // Documents are append-only
    }
);

// Compound index: fast paginated history queries per user sorted by time
TransactionSchema.index({ userId: 1, createdAt: -1 });

// Index for reconciliation: find PENDING transactions older than N minutes
TransactionSchema.index({ status: 1, createdAt: 1 });

const Transaction = mongoose.model('transaction', TransactionSchema);
export default Transaction;
