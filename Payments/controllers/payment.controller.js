/**
 * Payment Controller — Payments Service
 *
 * Official Razorpay SDK Handlers:
 *   POST /api/payments/order   — Create a Razorpay order (user-initiated checkout)
 *   POST /api/payments/verify  — Verify client-side checkout signature & activate plan
 *
 * Built using official `razorpay` npm package: https://www.npmjs.com/package/razorpay
 *
 * Webhook is NOT used. Server-side payment truth is established by calling
 * fetchPayment(paymentId) directly on Razorpay's API inside verifyPaymentSignature().
 * This is the recommended approach for client-side checkout flows and removes the
 * need for a publicly-reachable webhook endpoint and a separate webhook secret.
 */

import razorpayService from '../services/razorpay.service.js';
import { getPackageById } from '../config/packages.config.js';
import {
    BadRequestError,
    UnauthorizedError,
    logger,
} from 'faultkit';

// ─── POST /api/payments/order ─────────────────────────────────────────────────

/**
 * Create a Razorpay order for a subscription package via official SDK.
 *
 * Body: { packageId: string }
 * Auth: identifyUser (JWT required)
 */
export async function createOrderController(req, res, next) {
    try {
        const accountId = req.accountId || req.user?.id || req.user?._id || 'guest_account';
        const { packageId } = req.body;

        if (!packageId) {
            throw new BadRequestError('packageId is required');
        }

        const pkg = getPackageById(packageId);
        if (!pkg) {
            throw new BadRequestError(`Unknown packageId: ${packageId}`);
        }

        if (pkg.priceINR === 0) {
            throw new BadRequestError('Free plan does not require a payment. It is activated automatically.');
        }

        // Generate receipt ID (max 40 chars)
        const safeAccountId = String(accountId).replace(/[^a-zA-Z0-9]/g, '').slice(-10);
        const receipt = `rc_${safeAccountId}_${Date.now().toString(36)}`.slice(0, 40);

        const order = await razorpayService.createOrder({
            amountPaise: pkg.priceINRPaise,
            currency: 'INR',
            receipt,
            notes: {
                accountId: String(accountId),
                packageId: String(packageId),
                email:     req.user?.email    || '',
                username:  req.user?.username || req.user?.name || '',
            },
        });

        const activeKeyId = (process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_SECRET_ID || '').trim();

        return res.status(201).json({
            status: 'success',
            data: {
                orderId:  order.id,
                amount:   order.amount,
                currency: order.currency,
                keyId:    activeKeyId,
                package:  pkg,
            },
        });

    } catch (err) {
        logger.error({ err }, '[createOrderController] Error creating order via Razorpay SDK');
        next(err);
    }
}

// ─── POST /api/payments/verify ────────────────────────────────────────────────

/**
 * Verify client-side checkout payment and activate subscription.
 *
 * Flow:
 *   1. Validate required fields (paymentId, packageId).
 *   2. razorpayService.verifyPaymentSignature() does:
 *        a. HMAC signature check (if orderId + signature provided).
 *        b. fetchPayment(paymentId) — confirms status === 'captured'/'authorized' on Razorpay's servers.
 *        c. processSubscriptionPayment() — atomic DB write (idempotent).
 *        d. notifyPaymentEvent() — invoice email via RabbitMQ.
 *   3. Return result to frontend.
 *
 * Body: { paymentId, orderId?, signature?, packageId }
 * Auth: identifyUser (JWT required)
 */
export async function verifyPaymentController(req, res, next) {
    try {
        const accountId = req.accountId || req.user?.id || req.user?._id;
        if (!accountId) {
            throw new UnauthorizedError('Unauthorized: Account ID missing from session');
        }

        const { paymentId, orderId, signature, packageId } = req.body;

        if (!paymentId) {
            throw new BadRequestError('paymentId is required for payment verification');
        }
        if (!packageId) {
            throw new BadRequestError('packageId is required for payment verification');
        }

        const result = await razorpayService.verifyPaymentSignature({
            accountId,
            packageId,
            orderId: orderId || null,
            paymentId,
            signature: signature || null,
            user: req.user,
        });

        return res.status(200).json({
            status:  'success',
            message: 'Payment verified and subscription activated successfully',
            data:    result,
        });

    } catch (err) {
        logger.error({ err }, '[verifyPaymentController] Error verifying payment');
        next(err);
    }
}
