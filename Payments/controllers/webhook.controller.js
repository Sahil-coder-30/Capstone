/**
 * Webhook Controller — Payments Service
 *
 * Official Razorpay SDK Handlers:
 *   POST /api/payments/order    — Create a Razorpay order (user-initiated checkout)
 *   POST /api/payments/verify   — Verify client-side checkout signature & activate plan
 *   POST /api/payments/webhook  — Receive Razorpay payment confirmation (HMAC-verified)
 *
 * Built using official `razorpay` npm package: https://www.npmjs.com/package/razorpay
 */

import razorpayService from '../services/razorpay.service.js';
import { getPackageById } from '../config/packages.config.js';
import { processSubscriptionPayment } from '../services/subscription.service.js';
import { notifyPaymentEvent } from '../services/payment.service.js';

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
                email: req.user?.email || '',
                username: req.user?.username || req.user?.name || '',
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
 * Verify client-side checkout payment signature and activate subscription.
 * Uses official validatePaymentVerification from the `razorpay` package.
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

        // Verify cryptographic signature, update user Account & Subscription, and save Transaction ledger
        const result = await razorpayService.verifyPaymentSignature({
            accountId,
            packageId: packageId || 'pro_regular',
            orderId,
            paymentId,
            signature,
            user: req.user,
        });

        return res.status(200).json({
            status: 'success',
            message: 'Payment verified and subscription activated successfully',
            data: result,
        });

    } catch (err) {
        console.error('[verifyPaymentController] Error verifying payment:', err);
        return res.status(500).json({ status: 'error', message: err.message || 'Payment verification failed' });
    }
}


// ─── POST /api/payments/webhook ───────────────────────────────────────────────

/**
 * Razorpay Webhook — Server-to-Server Payment Confirmation
 * Verified using validateWebhookSignature from the official `razorpay` package.
 */
export async function webhookController(req, res) {
    const rawBody = req.rawBody || req.body;
    let payload;

    if (typeof rawBody === 'string') {
        try {
            payload = JSON.parse(rawBody);
        } catch {
            return res.status(400).json({ status: 'error', message: 'Malformed JSON payload' });
        }
    } else {
        payload = rawBody;
    }

    const signature = req.headers['x-razorpay-signature'];
    if (!signature) {
        return res.status(400).json({
            status:  'error',
            message: 'Missing X-Razorpay-Signature header',
        });
    }

    // Verify webhook signature using official SDK utility
    const isValid = razorpayService.verifyWebhookSignature({
        rawBody,
        signature,
    });

    if (!isValid) {
        console.warn('[webhookController] Webhook signature verification failed');
        return res.status(400).json({
            status:  'error',
            message: 'Webhook signature verification failed',
        });
    }

    // Acknowledge webhook receipt to Razorpay immediately
    res.status(200).json({ status: 'received' });

    const event = payload.event;
    console.log(`[webhookController] Received verified Razorpay event: ${event}`);

    try {
        if (event === 'payment.captured' || event === 'order.paid') {
            await _handlePaymentCaptured(payload.payload?.payment?.entity);
        } else if (event === 'payment.failed') {
            await _handlePaymentFailed(payload.payload?.payment?.entity);
        }
    } catch (err) {
        console.error(`[webhookController] Error processing event ${event}:`, err.message);
    }
}

// ── Private event handlers ────────────────────────────────────────────────────

async function _handlePaymentCaptured(payment) {
    if (!payment) return;

    const {
        id: paymentId,
        order_id: orderId,
        amount: amountPaise,
        notes,
    } = payment;

    const accountId = notes?.accountId;
    const packageId = notes?.packageId;

    if (!accountId || !packageId) {
        console.error('[webhookController] payment.captured missing accountId or packageId in notes', notes);
        return;
    }

    const result = await processSubscriptionPayment({
        accountId,
        packageId,
        paymentId,
        orderId,
        signature: payment.razorpay_signature || null,
        amountPaise,
    });

    if (result.status === 'already_processed') {
        console.log(`[webhookController] Duplicate webhook for paymentId=${paymentId}. Safely ignored.`);
        return;
    }

    console.log(`[webhookController] ✓ Subscription activated via webhook: tier=${result.activeTier} validUntil=${result.validUntil?.toDateString()}`);

    try {
        await notifyPaymentEvent({
            action: 'payment_success',
            email:    notes?.email    ?? 'user@unknown.com',
            username: notes?.username ?? 'Valued Customer',
            transactionDetails: {
                paymentId,
                orderId,
                amountPaise,
                packageId,
                tier:       result.activeTier,
                validUntil: result.validUntil,
                carriedDays: result.carriedDays,
            },
        });
    } catch (notifyErr) {
        console.warn('[webhookController] Failed to send payment confirmation email:', notifyErr.message);
    }
}

async function _handlePaymentFailed(payment) {
    if (!payment) return;
    const { id: paymentId, order_id: orderId, notes } = payment;

    console.warn(`[webhookController] Payment failed: paymentId=${paymentId} orderId=${orderId}`);

    try {
        await notifyPaymentEvent({
            action: 'payment_failed',
            email:    notes?.email    ?? 'user@unknown.com',
            username: notes?.username ?? 'Valued Customer',
            transactionDetails: { paymentId, orderId },
            errorReason: payment.error_description ?? 'Payment could not be processed.',
        });
    } catch (notifyErr) {
        console.warn('[webhookController] Failed to send payment failure email:', notifyErr.message);
    }
}
