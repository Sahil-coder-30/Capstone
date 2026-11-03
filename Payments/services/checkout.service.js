/**
 * Checkout flow: create order, verify from the browser, handle webhooks.
 * Glue between Razorpay (gateway) and billing.service.js (database).
 */

import { BadRequestError, ForbiddenError, NotFoundError, ServiceUnavailableError, logger } from 'faultkit';
import * as razorpay from './razorpay.service.js';
import {
    createOrderRecord,
    getOrder,
    processSubscriptionPayment,
    recordPaymentFailure,
} from './billing.service.js';
import { sendPaymentFailedEmail, sendPaymentSuccessEmail } from './notification.service.js';
import { getPackageById } from '../config/plans.config.js';

const CAPTURED = ['captured', 'authorized'];

export async function startCheckout(user, packageId) {
    const pkg = getPackageById(packageId);
    if (!pkg) throw new BadRequestError(`Unknown packageId: ${packageId}`);
    if (pkg.pricePaise === 0) throw new BadRequestError('Free plan does not need a payment');

    const shortId = String(user.id).slice(-10);
    const gatewayOrder = await razorpay.createOrder({
        amountPaise: pkg.pricePaise,
        receipt: `rc_${shortId}_${Date.now().toString(36)}`,
        notes: { userId: String(user.id), packageId: pkg.id },
    });

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

async function settle({ order, paymentId, amountPaise, signature, method, source }) {
    const result = await processSubscriptionPayment({ order, paymentId, amountPaise, signature, method, source });
    if (result.status === 'success') {
        const pkg = getPackageById(order.packageId);
        sendPaymentSuccessEmail({ order, payment: { id: paymentId, amountPaise, method }, result, packageLabel: pkg.label })
            .catch((err) => logger.warn({ err }, '[checkout] success email failed'));
    }
    return result;
}

/** POST /verify: the browser sends what Razorpay Checkout returned. */
export async function verifyCheckout(user, { orderId, paymentId, signature }) {
    if (!orderId || !paymentId || !signature) {
        throw new BadRequestError('orderId, paymentId and signature are required');
    }

    const order = await getOrder(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.userId !== String(user.id)) throw new ForbiddenError('This order belongs to another account');

    if (!razorpay.isCheckoutSignatureValid({ orderId, paymentId, signature })) {
        throw new BadRequestError('Payment verification failed: invalid signature');
    }

    let payment;
    try {
        payment = await razorpay.fetchPayment(paymentId, { orderId, amountPaise: order.amountPaise });
    } catch (err) {
        logger.error({ err, paymentId }, '[checkout] fetchPayment failed');
        if (err.statusCode === 404) throw new NotFoundError('Payment not found on Razorpay');
        throw new ServiceUnavailableError('Could not confirm the payment with Razorpay');
    }

    if (payment.order_id && payment.order_id !== orderId) {
        throw new BadRequestError('Payment does not belong to this order');
    }
    if (payment.status === 'authorized') {
        payment = await razorpay.capturePayment(payment);
    }
    if (!CAPTURED.includes(payment.status)) {
        throw new BadRequestError(`Payment is not captured. Current status: ${payment.status}`);
    }

    const result = await settle({
        order, paymentId, amountPaise: payment.amount, signature, method: payment.method, source: 'verify',
    });

    return { ...result, verified: true, paymentStatus: 'SUCCESS' };
}

/** POST /webhook: signature is already checked by the controller. */
export async function handleWebhookEvent(event, entity) {
    if (!entity?.order_id) return;
    const order = await getOrder(entity.order_id);
    if (!order) {
        logger.warn({ orderId: entity.order_id, event }, '[checkout] webhook for unknown order ignored');
        return;
    }

    if (event === 'payment.captured' || event === 'order.paid') {
        const result = await settle({
            order,
            paymentId: entity.id,
            amountPaise: entity.amount,
            method: entity.method,
            source: 'webhook',
        });
        logger.info({ paymentId: entity.id, status: result.status }, '[checkout] webhook payment handled');
        return;
    }

    if (event === 'payment.failed') {
        const reason = entity.error_description || 'Payment could not be processed.';
        await recordPaymentFailure({ order, paymentId: entity.id, reason });
        const pkg = getPackageById(order.packageId);
        sendPaymentFailedEmail({ order, paymentId: entity.id, reason, packageLabel: pkg?.label })
            .catch((err) => logger.warn({ err }, '[checkout] failure email failed'));
    }
}
