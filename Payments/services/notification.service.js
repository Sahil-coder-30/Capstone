/**
 * Payment emails. Publishes to `payment_notification_queue`; the
 * Notification service renders and sends them.
 *
 * `amount` is sent in rupees because the Notification template formats it
 * as-is (it only divides by 100 for large integers).
 */

import { logger } from 'faultkit';
import { sendPaymentNotification } from '../config/mq.js';

async function publish(payload) {
    if (!payload.email) {
        logger.warn({ action: payload.action }, '[notification] no email on record, email skipped');
        return false;
    }
    return sendPaymentNotification({ ...payload, timestamps: Date.now() });
}

export async function sendPaymentSuccessEmail({ order, payment, result, packageLabel }) {
    return publish({
        action: 'payment_success',
        email: order.email,
        username: order.username || 'there',
        invoiceNumber: result.invoiceNumber,
        transactionDetails: {
            paymentId: payment.id,
            orderId: order.id,
            amount: payment.amountPaise / 100,
            amountPaise: payment.amountPaise,
            currency: order.currency,
            method: payment.method || undefined,
            status: 'success',
            description: packageLabel,
            invoiceNumber: result.invoiceNumber,
            tier: result.activeTier,
            validUntil: result.validUntil,
            carriedDays: result.carriedDays,
        },
    });
}

export async function sendPaymentFailedEmail({ order, paymentId, reason, packageLabel }) {
    return publish({
        action: 'payment_failed',
        email: order.email,
        username: order.username || 'there',
        transactionDetails: {
            paymentId,
            orderId: order.id,
            amount: order.amountPaise / 100,
            amountPaise: order.amountPaise,
            currency: order.currency,
            status: 'failed',
            description: packageLabel,
            errorReason: reason || 'Payment could not be processed.',
        },
    });
}
