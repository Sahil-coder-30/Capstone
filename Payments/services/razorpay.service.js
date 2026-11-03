/**
 * Razorpay gateway calls only. No database writes here.
 */

import Razorpay from 'razorpay';
import {
    validatePaymentVerification,
    validateWebhookSignature,
} from 'razorpay/dist/utils/razorpay-utils.js';
import { InternalServerError, logger } from 'faultkit';

let client = null;

const keyId = () => (process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_SECRET_ID || '').trim();
const keySecret = () => (process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET_KEY || '').trim();

export const publicKeyId = () => keyId();

/**
 * Fake payment ids and signatures (pay_test_*, test_*) are accepted only in
 * automated tests: NODE_ENV=test, test-mode keys and an explicit flag.
 */
export function syntheticPaymentsAllowed() {
    const testKeys = keyId().startsWith('rzp_test_') || process.env.RAZORPAY_MODE === 'test';
    return process.env.NODE_ENV === 'test' && testKeys && process.env.ALLOW_SYNTHETIC_PAYMENTS === 'true';
}

export const isSyntheticPaymentId = (id) => /^pay_(test|mock|sim)_/.test(String(id || ''));

function getClient() {
    if (!client) {
        if (!keyId() || !keySecret()) {
            throw new InternalServerError('Razorpay credentials are not configured on the server');
        }
        client = new Razorpay({ key_id: keyId(), key_secret: keySecret() });
    }
    return client;
}

export async function createOrder({ amountPaise, receipt, notes = {} }) {
    if (syntheticPaymentsAllowed() && process.env.RAZORPAY_FAKE_ORDERS === 'true') {
        return { id: `order_test_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, amount: amountPaise, currency: 'INR' };
    }
    return getClient().orders.create({
        amount: Math.round(amountPaise),
        currency: 'INR',
        receipt: receipt.slice(0, 40),
        notes,
    });
}

/** Checks the HMAC that Razorpay Checkout returns to the browser. */
export function isCheckoutSignatureValid({ orderId, paymentId, signature }) {
    try {
        if (validatePaymentVerification({ order_id: orderId, payment_id: paymentId }, signature, keySecret())) {
            return true;
        }
    } catch (err) {
        logger.warn({ err }, '[razorpay] signature check threw');
    }
    if (syntheticPaymentsAllowed() && /^(test|mock)_/.test(String(signature || ''))) {
        logger.info({ paymentId }, '[razorpay] synthetic signature accepted (test mode)');
        return true;
    }
    return false;
}

/** Fetches the payment from Razorpay. Synthetic ids return a fake captured payment in tests. */
export async function fetchPayment(paymentId, { orderId, amountPaise } = {}) {
    if (syntheticPaymentsAllowed() && isSyntheticPaymentId(paymentId)) {
        return { id: paymentId, status: 'captured', amount: amountPaise, currency: 'INR', order_id: orderId, method: 'test' };
    }
    return getClient().payments.fetch(paymentId);
}

export async function capturePayment(payment) {
    return getClient().payments.capture(payment.id, payment.amount, payment.currency || 'INR');
}

/** Checks X-Razorpay-Signature over the exact raw body bytes. */
export function isWebhookSignatureValid({ rawBody, signature }) {
    const secret = (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
    if (!secret) throw new InternalServerError('RAZORPAY_WEBHOOK_SECRET is not configured');
    if (!signature || typeof rawBody !== 'string') return false;
    return validateWebhookSignature(rawBody, signature, secret);
}
