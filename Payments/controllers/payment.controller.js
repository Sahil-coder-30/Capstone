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

// ─── POST /api/payments/order ─────────────────────────────────────────────────

/**
 * Create a Razorpay order for a subscription package via official SDK.
 *
 * Body: { packageId: string }
 * Auth: identifyUser (JWT required)
 */
export async function createOrderController(req, res) {
    try {
        const accountId = req.accountId || req.user?.id || req.user?._id || 'guest_account';
        const { packageId } = req.body;

        if (!packageId) {
            return res.status(400).json({ status: 'error', message: 'packageId is required' });
        }

        const pkg = getPackageById(packageId);
        if (!pkg) {
            return res.status(400).json({ status: 'error', message: `Unknown packageId: ${packageId}` });
        }

        if (pkg.priceINR === 0) {
            return res.status(400).json({
                status:  'error',
                message: 'Free plan does not require a payment. It is activated automatically.',
            });
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

        return res.status(201).json({
            status: 'success',
            data: {
                orderId:  order.id,
                amount:   order.amount,
                currency: order.currency,
                keyId:    (process.env.RAZORPAY_KEY_ID || '').trim(),
                package:  pkg,
            },
        });

    } catch (err) {
        const errorDetail = err?.error?.description || err?.message || 'Failed to create payment order.';
        console.error('[createOrderController] Error creating order via Razorpay SDK:', errorDetail, err);
        return res.status(500).json({ status: 'error', message: errorDetail });
    }
}

// ─── POST /api/payments/verify ────────────────────────────────────────────────

/**
 * Verify client-side checkout payment and activate subscription.
 *
 * Flow (no webhook needed):
 *   1. Validate required fields.
 *   2. razorpayService.verifyPaymentSignature() does:
 *        a. HMAC signature check (if orderId + signature provided).
 *        b. fetchPayment(paymentId) — confirms status === 'captured' on Razorpay's servers.
 *        c. processSubscriptionPayment() — atomic DB write (idempotent).
 *        d. notifyPaymentEvent() — invoice email via RabbitMQ.
 *   3. Return result to frontend.
 *
 * Body: { paymentId, orderId, signature, packageId }
 * Auth: identifyUser (JWT required)
 */
export async function verifyPaymentController(req, res) {
    try {
        const accountId = req.accountId || req.user?.id || req.user?._id;
        if (!accountId) {
            return res.status(401).json({ status: 'error', message: 'Unauthorized: Account ID missing from session' });
        }

        const { paymentId, orderId, signature, packageId } = req.body;

        if (!paymentId) {
            return res.status(400).json({ status: 'error', message: 'paymentId is required for payment verification' });
        }
        if (!orderId) {
            return res.status(400).json({ status: 'error', message: 'orderId is required for payment verification' });
        }
        if (!signature) {
            return res.status(400).json({ status: 'error', message: 'signature is required for payment verification' });
        }
        if (!packageId) {
            return res.status(400).json({ status: 'error', message: 'packageId is required for payment verification' });
        }

        const result = await razorpayService.verifyPaymentSignature({
            accountId,
            packageId,
            orderId,
            paymentId,
            signature,
            user: req.user,
        });

        return res.status(200).json({
            status:  'success',
            message: 'Payment verified and subscription activated successfully',
            data:    result,
        });

    } catch (err) {
        console.error('[verifyPaymentController] Error verifying payment:', err.message, err);
        return res.status(500).json({ status: 'error', message: err.message || 'Payment verification failed' });
    }
}
