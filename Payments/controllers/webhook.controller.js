/**
 * Webhook Controller — Payments Service
 *
 * Official Razorpay SDK Handlers:
 *   POST /api/payments/webhook  — Receive Razorpay payment confirmation (HMAC-verified)
 *
 * Built using official `razorpay` npm package: https://www.npmjs.com/package/razorpay
 */

import razorpayService from '../services/razorpay.service.js';
import { processSubscriptionPayment } from '../services/subscription.service.js';
import { notifyPaymentEvent } from '../services/payment.service.js';
import { BadRequestError, logger, toErrorResponse } from 'faultkit';

// Re-export order & verification controllers from payment.controller for full backward compatibility
export { createOrderController, verifyPaymentController } from './payment.controller.js';

// ─── POST /api/payments/webhook ───────────────────────────────────────────────

/**
 * Razorpay Webhook — Server-to-Server Payment Confirmation
 * Verified using validateWebhookSignature from the official `razorpay` package.
 */
export async function webhookController(req, res, next) {
    const sendError = (err) => {
        if (typeof next === 'function') return next(err);
        return res.status(err.statusCode || 400).json(toErrorResponse(err));
    };

    const rawBody = req.rawBody || req.body;
    let payload;

    if (typeof rawBody === 'string') {
        try {
            payload = JSON.parse(rawBody);
        } catch {
            return sendError(new BadRequestError('Malformed JSON payload'));
        }
    } else {
        payload = rawBody;
    }

    const signature = req.headers?.['x-razorpay-signature'];
    if (!signature) {
        return sendError(new BadRequestError('Missing X-Razorpay-Signature header'));
    }

    // Verify webhook signature using official SDK utility
    const isValid = razorpayService.verifyWebhookSignature({
        rawBody,
        signature,
    });

    if (!isValid) {
        logger.warn('[webhookController] Webhook signature verification failed');
        return sendError(new BadRequestError('Webhook signature verification failed'));
    }

    // Acknowledge webhook receipt to Razorpay immediately
    res.status(200).json({ status: 'received' });

    const event = payload?.event;
    logger.info(`[webhookController] Received verified Razorpay event: ${event}`);

    try {
        if (event === 'payment.captured' || event === 'order.paid') {
            await _handlePaymentCaptured(payload?.payload?.payment?.entity);
        } else if (event === 'payment.failed') {
            await _handlePaymentFailed(payload?.payload?.payment?.entity);
        }
    } catch (err) {
        logger.error({ err }, `[webhookController] Error processing event ${event}: ${err.message}`);
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
        logger.error({ notes }, '[webhookController] payment.captured missing accountId or packageId in notes');
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
        logger.info({ paymentId }, '[webhookController] Duplicate webhook for paymentId. Safely ignored.');
        return;
    }

    logger.info({
        activeTier: result.activeTier,
        validUntil: result.validUntil?.toDateString(),
    }, '[webhookController] ✓ Subscription activated via webhook');

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
                tier:        result.activeTier,
                validUntil:  result.validUntil,
                carriedDays: result.carriedDays,
            },
        });
    } catch (notifyErr) {
        logger.warn({ err: notifyErr }, '[webhookController] Failed to send payment confirmation email');
    }
}

async function _handlePaymentFailed(payment) {
    if (!payment) return;
    const { id: paymentId, order_id: orderId, notes } = payment;

    logger.warn({ paymentId, orderId }, '[webhookController] Payment failed');

    try {
        await notifyPaymentEvent({
            action: 'payment_failed',
            email:    notes?.email    ?? 'user@unknown.com',
            username: notes?.username ?? 'Valued Customer',
            transactionDetails: { paymentId, orderId },
            errorReason: payment.error_description ?? 'Payment could not be processed.',
        });
    } catch (notifyErr) {
        logger.warn({ err: notifyErr }, '[webhookController] Failed to send payment failure email');
    }
}
