/**
 * Checkout flow: create order, verify from the browser, handle webhooks.
 * Glue between Razorpay (gateway) and billing.service.js (database).
 */

import { BadRequestError, ForbiddenError, NotFoundError, ServiceUnavailableError, logger } from 'faultkit';
import * as razorpay from './razorpay.service.js';
import {
    createOrderRecord,
    getOrder,
    processRefund,
    processSubscriptionPayment,
    recordPaymentFailure,
} from './billing.service.js';
import { sendPaymentFailedEmail, sendPaymentSuccessEmail } from './notification.service.js';
import { getPackageById } from '../config/plans.config.js';

const CAPTURED = ['captured', 'authorized'];

const gatewayTimeoutMs = () => Number(process.env.RAZORPAY_TIMEOUT_MS) || 10_000;

/**
 * The Razorpay SDK has no request timeout, so a stuck gateway would hold the
 * request forever. Fail with a retryable 503 instead.
 */
function withGatewayTimeout(promise, what) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const err = new Error(`Razorpay ${what} timed out after ${gatewayTimeoutMs()}ms`);
            err.statusCode = 504;
            reject(err);
        }, gatewayTimeoutMs());
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function startCheckout(user, packageId) {
    const pkg = getPackageById(packageId);
    if (!pkg) throw new BadRequestError(`Unknown packageId: ${packageId}`);
    if (pkg.pricePaise === 0) throw new BadRequestError('Free plan does not need a payment');

    const shortId = String(user.id).slice(-10);
    const gatewayOrder = await withGatewayTimeout(razorpay.createOrder({
        amountPaise: pkg.pricePaise,
        receipt: `rc_${shortId}_${Date.now().toString(36)}`,
        notes: { userId: String(user.id), packageId: pkg.id },
    }), 'create order');

    await createOrderRecord({
        id: gatewayOrder.id,
        userId: user.id,
        pkg,
        email: user.email,
        username: user.name || user.username,
    });

    return {
        orderId: gatewayOrder.id,
        amount: pkg.pricePaise,
        currency: 'INR',
        keyId: razorpay.publicKeyId(),
        package: { id: pkg.id, label: pkg.label, tier: pkg.tier, priceINR: pkg.priceINR },
    };
}

async function settle({ order, paymentId, amountPaise, currency, signature, method, source }) {
    const result = await processSubscriptionPayment({ order, paymentId, amountPaise, currency, signature, method, source });
    if (result.status === 'success') {
        const pkg = getPackageById(order.packageId);
        sendPaymentSuccessEmail({ order, payment: { id: paymentId, amountPaise: Number(amountPaise), method }, result, packageLabel: pkg.label })
            .catch((err) => logger.warn({ err }, '[checkout] success email failed'));
    }
    return result;
}

/** POST /verify: the browser sends what Razorpay Checkout returned. */
export async function verifyCheckout(user, { orderId, paymentId, signature }) {
    if (![orderId, paymentId, signature].every((v) => typeof v === 'string' && v.trim() !== '' && v.length <= 200)) {
        throw new BadRequestError('orderId, paymentId and signature are required strings');
    }

    const order = await getOrder(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.userId !== String(user.id)) throw new ForbiddenError('This order belongs to another account');

    if (!razorpay.isCheckoutSignatureValid({ orderId, paymentId, signature })) {
        throw new BadRequestError('Payment verification failed: invalid signature');
    }

    let payment;
    try {
        payment = await withGatewayTimeout(
            razorpay.fetchPayment(paymentId, { orderId, amountPaise: order.amountPaise }),
            'fetch payment',
        );
    } catch (err) {
        logger.error({ err, paymentId }, '[checkout] fetchPayment failed');
        if (err.statusCode === 404) throw new NotFoundError('Payment not found on Razorpay');
        throw new ServiceUnavailableError('Could not confirm the payment with Razorpay');
    }

    // A payment with no order id cannot prove it paid this order.
    if (payment.order_id !== orderId) {
        throw new BadRequestError('Payment does not belong to this order');
    }
    if (payment.status === 'authorized') {
        try {
            payment = await withGatewayTimeout(razorpay.capturePayment(payment), 'capture');
        } catch (err) {
            // The capture may still go through on Razorpay; the webhook settles it then.
            logger.error({ err, paymentId }, '[checkout] capture failed');
            throw new ServiceUnavailableError('Could not capture the payment with Razorpay. Please retry shortly.');
        }
    }
    if (!CAPTURED.includes(payment.status)) {
        throw new BadRequestError(`Payment is not captured. Current status: ${payment.status}`);
    }

    const result = await settle({
        order, paymentId, amountPaise: payment.amount, currency: payment.currency, signature, method: payment.method, source: 'verify',
    });

    return { ...result, verified: true, paymentStatus: 'SUCCESS' };
}

/**
 * POST /webhook: signature is already checked by the controller.
 * @param {string} event
 * @param {object} payload  the webhook's `payload` object ({ payment, refund, ... })
 */
export async function handleWebhookEvent(event, payload) {
    const entity = payload?.payment?.entity;

    if (event === 'refund.processed') {
        const refund = payload?.refund?.entity;
        if (!refund?.payment_id) return;
        const result = await processRefund({ paymentId: refund.payment_id, refundId: refund.id, amountPaise: refund.amount });
        if (result.status === 'unknown_payment') {
            logger.error({ refundId: refund.id, paymentId: refund.payment_id }, '[checkout] refund for a payment we never recorded');
        }
        logger.info({ refundId: refund.id, status: result.status }, '[checkout] refund handled');
        return;
    }

    if (!entity?.order_id) return;
    const order = await getOrder(entity.order_id);
    if (!order) {
        // Money may have been captured for an order we have no record of. Loud log,
        // but 200 so Razorpay does not retry a payload we can never apply.
        logger.error({ orderId: entity.order_id, paymentId: entity.id, event }, '[checkout] webhook for unknown order, needs manual check');
        return;
    }

    if (event === 'payment.captured' || event === 'order.paid') {
        const result = await settle({
            order,
            paymentId: entity.id,
            amountPaise: entity.amount,
            currency: entity.currency,
            method: entity.method,
            source: 'webhook',
        });
        logger.info({ paymentId: entity.id, status: result.status }, '[checkout] webhook payment handled');
        return;
    }

    if (event === 'payment.failed') {
        const reason = entity.error_description || 'Payment could not be processed.';
        const recorded = await recordPaymentFailure({ order, paymentId: entity.id, reason });
        if (!recorded) {
            logger.info({ orderId: order.id, paymentId: entity.id }, '[checkout] payment.failed skipped (order paid or already logged)');
            return;
        }
        const pkg = getPackageById(order.packageId);
        sendPaymentFailedEmail({ order, paymentId: entity.id, reason, packageLabel: pkg?.label })
            .catch((err) => logger.warn({ err }, '[checkout] failure email failed'));
    }
}
