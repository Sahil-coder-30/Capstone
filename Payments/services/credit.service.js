/**
 * Credit Service — Atomic Credit Allocation Functions
 *
 * This service handles ALL write operations that affect the user's credit balance.
 * It enforces the double-entry ledger pattern: every balance mutation is accompanied
 * by an immutable Transaction document.
 *
 * The `allocatePurchasedCredits` function is your Razorpay webhook integration point.
 * When you set up Razorpay, call this from your `payment.captured` / `order.paid`
 * webhook handler after HMAC-SHA256 signature verification.
 */

import mongoose from 'mongoose';
import Credit, { CREDIT_COMPANIES } from '../models/credit.model.js';
import Transaction from '../models/transaction.model.js';
import { getPackageById } from '../config/packages.config.js';
import { getTierConfig } from '../config/subscription.config.js';

const FREE_CREDITS_PER_COMPANY = 20;

/**
 * Allocate Purchased Credits (Razorpay Webhook Integration Point)
 *
 * Call this from your webhook handler after:
 *  1. Verifying HMAC-SHA256 signature
 *  2. Confirming event is `payment.captured` or `order.paid`
 *
 * This function is IDEMPOTENT: if paymentId was already processed,
 * it returns { status: 'already_credited' } without any DB mutation.
 *
 * @param {Object} params
 * @param {string} params.userId         - MongoDB ObjectId string of the user
 * @param {string} params.packageId      - Package id from packages.config.js (e.g. 'pro_regular')
 * @param {string} params.paymentId      - Razorpay payment_id (unique per transaction)
 * @param {string} params.orderId        - Razorpay order_id
 * @param {number} params.amountPaise    - Amount paid in paise (Razorpay unit)
 * @param {string} [params.aggregator]   - Payment aggregator name (default: 'RAZORPAY')
 *
 * @returns {{ status: 'success'|'already_credited', creditsGranted?: number }}
 */
export async function allocatePurchasedCredits({
    userId,
    packageId,
    paymentId,
    orderId,
    amountPaise,
    aggregator = 'RAZORPAY',
}) {
    if (!userId || !paymentId || !packageId) {
        throw new Error('[credit.service] userId, paymentId, and packageId are required');
    }

    // ── Idempotency Check ──────────────────────────────────────────────────────
    // The unique index on Transaction.paymentId prevents duplicate DB inserts.
    // This explicit check gives us an early return without touching a DB session.
    const existing = await Transaction.findOne({ paymentId });
    if (existing) {
        console.log(`[Credit Service] Payment ${paymentId} already processed. Skipping.`);
        return { status: 'already_credited' };
    }

    const pkg = getPackageById(packageId);
    if (!pkg) {
        throw new Error(`[credit.service] Unknown packageId: ${packageId}`);
    }

    const newTier = pkg.tier;
    const amountINR = amountPaise / 100;

    // ── Atomic DB Session Transaction ─────────────────────────────────────────
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // 1. Find or create the user's Credit document
        let credit = await Credit.findOne({ userId }).session(session);
        if (!credit) {
            credit = new Credit({ userId, subscription: newTier });
        }

        const previousTier = credit.subscription;

        // 2. Upgrade subscription tier
        credit.subscription = newTier;

        // 3. For free→pro/max upgrades, reset billing period
        if (newTier !== 'free') {
            const now = new Date();
            const periodEnd = new Date(now);
            periodEnd.setMonth(periodEnd.getMonth() + 1);
            credit.billing.currentPeriodStart = now;
            credit.billing.currentPeriodEnd = periodEnd;
            credit.billing.unbilledCents = 0;   // Reset unbilled counter on new subscription
        }

        // 4. For free tier purchases (credit top-ups), refill provider buckets
        if (newTier === 'free') {
            CREDIT_COMPANIES
                .filter(c => c !== 'unknown')
                .forEach(company => {
                    const bucket = credit.providerCredits.find(b => b.company === company);
                    if (bucket) {
                        bucket.creditsGranted += FREE_CREDITS_PER_COMPANY;
                        bucket.creditsRemaining += FREE_CREDITS_PER_COMPANY;
                    }
                });
        }

        // 5. Update lifetime billing total
        credit.billing.lifetimeCents = (credit.billing.lifetimeCents || 0) + (amountPaise / 100 * 100);

        await credit.save({ session });

        // 6. Write immutable Transaction ledger entry
        await Transaction.create(
            [{
                userId,
                orderId,
                paymentId,
                type: 'CREDIT_PURCHASE',
                amountPaise,
                currency: 'INR',
                creditsDelta: 0,        // Subscription tiers don't have a fixed credit delta
                status: 'SUCCESS',
                aggregator,
                description: `Subscribed to ${pkg.label} plan (${pkg.pricingModel})`,
                metadata: {
                    packageId,
                    packageLabel: pkg.label,
                    pricingModel: pkg.pricingModel,
                    priceINR: amountINR,
                    previousTier,
                    newTier,
                },
            }],
            { session }
        );

        await session.commitTransaction();

        console.log(`[Credit Service] ✓ User ${userId} subscribed to ${pkg.label} (${pkg.id}). Payment: ${paymentId}`);
        return { status: 'success', newTier, packageId };

    } catch (err) {
        await session.abortTransaction();
        console.error(`[Credit Service] ✗ Credit allocation failed for payment ${paymentId}:`, err.message);
        throw err;
    } finally {
        session.endSession();
    }
}

/**
 * Admin: Manually grant credits to a user
 *
 * @param {Object} params
 * @param {string} params.userId          - Target user ObjectId string
 * @param {string} params.company         - Provider company ('mistral', 'google', etc.) or 'all'
 * @param {number} params.creditsToGrant  - Number of credits to add
 * @param {string} [params.adminId]       - Admin user ID performing the action
 * @param {string} [params.note]          - Reason / support ticket reference
 */
export async function adminGrantCredits({
    userId,
    company,
    creditsToGrant,
    adminId,
    note = '',
}) {
    if (!userId || !company || !creditsToGrant) {
        throw new Error('[credit.service] userId, company, and creditsToGrant are required');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        let credit = await Credit.findOne({ userId }).session(session);
        if (!credit) {
            credit = new Credit({ userId });
        }

        const grantedTo = [];

        if (company === 'all') {
            CREDIT_COMPANIES.filter(c => c !== 'unknown').forEach(c => {
                const bucket = credit.ensureProviderBucket(c);
                bucket.creditsGranted += creditsToGrant;
                bucket.creditsRemaining += creditsToGrant;
                grantedTo.push(c);
            });
        } else {
            const bucket = credit.ensureProviderBucket(company);
            bucket.creditsGranted += creditsToGrant;
            bucket.creditsRemaining += creditsToGrant;
            grantedTo.push(company);
        }

        await credit.save({ session });

        await Transaction.create(
            [{
                userId,
                type: 'ADMIN_GRANT',
                amountPaise: 0,
                creditsDelta: creditsToGrant,
                status: 'SUCCESS',
                aggregator: 'ADMIN',
                description: `Admin granted ${creditsToGrant} credits (${company})`,
                metadata: { adminId, company, grantedTo, note },
            }],
            { session }
        );

        await session.commitTransaction();
        console.log(`[Credit Service] Admin granted ${creditsToGrant} credits to user ${userId} for ${company}`);
        return { status: 'success', grantedTo, creditsGranted: creditsToGrant };
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
}

/**
 * Admin: Reset a user's provider credit buckets to default values
 *
 * @param {Object} params
 * @param {string} params.userId    - Target user ObjectId string
 * @param {string} [params.adminId] - Admin performing the reset
 * @param {string} [params.note]    - Reason for reset
 */
export async function adminResetCredits({ userId, adminId, note = '' }) {
    if (!userId) throw new Error('[credit.service] userId is required');

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        let credit = await Credit.findOne({ userId }).session(session);
        if (!credit) {
            credit = new Credit({ userId });
        }

        // Reset all provider buckets to default (20 credits each)
        credit.providerCredits = CREDIT_COMPANIES
            .filter(c => c !== 'unknown')
            .map(c => ({
                company: c,
                creditsGranted: FREE_CREDITS_PER_COMPANY,
                creditsRemaining: FREE_CREDITS_PER_COMPANY,
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                billableTokens: 0,
                billableCents: 0,
                requestCount: 0,
            }));

        await credit.save({ session });

        await Transaction.create(
            [{
                userId,
                type: 'RESET',
                amountPaise: 0,
                creditsDelta: FREE_CREDITS_PER_COMPANY * CREDIT_COMPANIES.filter(c => c !== 'unknown').length,
                status: 'SUCCESS',
                aggregator: 'ADMIN',
                description: 'Admin reset all provider credit buckets to default',
                metadata: { adminId, note },
            }],
            { session }
        );

        await session.commitTransaction();
        console.log(`[Credit Service] Admin reset credits for user ${userId}`);
        return { status: 'success', message: 'All provider buckets reset to default' };
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
}
