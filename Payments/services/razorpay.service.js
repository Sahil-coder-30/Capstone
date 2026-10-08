/**
 * Razorpay Service — Payments Backend
 *
 * Official Razorpay SDK Integration for Taksha Payments Platform
 * Uses the official `razorpay` npm package: https://www.npmjs.com/package/razorpay
 *
 * Handles:
 *  - Order creation via official SDK
 *  - Cryptographic signature verification via validatePaymentVerification / validateWebhookSignature
 *  - Direct persistence of user data, payment status, subscription status, and transaction ledger
 */

import Razorpay from 'razorpay';
import {
    validatePaymentVerification,
    validateWebhookSignature,
} from 'razorpay/dist/utils/razorpay-utils.js';

import { getPackageById } from '../config/packages.config.js';
import { processSubscriptionPayment } from './subscription.service.js';
import { notifyPaymentEvent } from './payment.service.js';

let _razorpayInstance = null;

/**
 * Get or initialize the official Razorpay SDK singleton instance.
 * @returns {Razorpay}
 */
export function getRazorpayClient() {
    if (!_razorpayInstance) {
        const key_id = (process.env.RAZORPAY_KEY_ID || '').trim();
        const key_secret = (process.env.RAZORPAY_KEY_SECRET || '').trim();

        if (!key_id || !key_secret) {
            throw new Error('[Razorpay SDK] RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be configured in environment variables');
        }

        _razorpayInstance = new Razorpay({
            key_id,
            key_secret,
        });
    }
    return _razorpayInstance;
}

/**
 * Create a new Razorpay Order via the official SDK.
 *
 * @param {Object} params
 * @param {number} params.amountPaise - Amount in Indian paise (e.g. 49900 for Pro, 99900 for Max)
 * @param {string} [params.currency='INR'] - Currency ISO code
 * @param {string} params.receipt - Unique order receipt ID (max 40 chars)
 * @param {Object} [params.notes={}] - Key-value metadata notes attached to order
 * @returns {Promise<Object>} Razorpay order entity
 */
export async function createOrder({ amountPaise, currency = 'INR', receipt, notes = {} }) {
    const client = getRazorpayClient();
    const order = await client.orders.create({
        amount: Math.round(amountPaise),
        currency,
        receipt: receipt.slice(0, 40),
        notes,
    });
    return order;
}

/**
 * Verify client-side checkout payment and directly persist:
 *  1. User Account data & active subscription status
 *  2. Subscription document with 30-day active slot & preserved queue
 *  3. Immutable Transaction audit ledger record with SUCCESS payment status
 *  4. Credit model tier synchronization
 *  5. RabbitMQ invoice notification
 *
 * Verification order (no webhook needed):
 *   a. HMAC signature check via validatePaymentVerification (fast, cryptographic).
 *   b. fetchPayment(paymentId) — mandatory server-side confirmation against Razorpay's API.
 *      Both must pass. This replaces the webhook as the authoritative payment truth source.
 *
 * @param {Object} params
 * @param {string} params.accountId - User account ID (Account._id = Auth user_id)
 * @param {string} params.packageId - Package ID ('pro_regular' / 'pro' or 'max_regular' / 'max')
 * @param {string} params.orderId   - Razorpay order ID (e.g. order_9A33XWu170gUtm)
 * @param {string} params.paymentId - Razorpay payment ID (e.g. pay_9A33XWu170gUtm)
 * @param {string} params.signature - Razorpay HMAC-SHA256 signature
 * @param {Object} [params.user={}] - User details for notification (email, username)
 * @returns {Promise<Object>} Verification & persistence result
 */
export async function verifyPaymentSignature({
    accountId,
    packageId,
    orderId,
    paymentId,
    signature,
    user = {},
}) {
    const secret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
    if (!secret) {
        throw new Error('[Razorpay SDK] RAZORPAY_KEY_SECRET is required to verify signatures');
    }

    if (!paymentId) {
        throw new Error('paymentId is required for payment verification');
    }
    if (!orderId) {
        throw new Error('orderId is required for payment verification');
    }
    if (!signature) {
        throw new Error('signature is required for payment verification');
    }

    const pkg = getPackageById(packageId);
    if (!pkg) {
        throw new Error(`Unknown packageId: ${packageId}. Available plans: Pro (₹499) and Max (₹999)`);
    }

    // ── Step 1: HMAC signature check (cryptographic fast path) ───────────────
    let signatureValid = false;
    try {
        signatureValid = validatePaymentVerification(
            { order_id: orderId, payment_id: paymentId },
            signature,
            secret
        );
    } catch (sigErr) {
        console.warn('[Razorpay SDK] validatePaymentVerification threw error:', sigErr.message);
    }

    if (!signatureValid) {
        console.error('[Razorpay SDK] HMAC signature check failed for paymentId:', paymentId);
        throw new Error('Payment verification failed: Invalid cryptographic signature');
    }

    // ── Step 2: Confirm payment status with Razorpay's API (mandatory) ───────
    // This is the server-side source of truth that replaces the webhook.
    // A valid HMAC proves the client payload wasn't tampered with, but we still
    // confirm the payment was actually captured on Razorpay's end before any DB write.
    let razorpayPayment;
    try {
        razorpayPayment = await fetchPayment(paymentId);
    } catch (fetchErr) {
        console.error('[Razorpay SDK] fetchPayment failed:', fetchErr.message);
        throw new Error(`Could not confirm payment with Razorpay: ${fetchErr.message}`);
    }

    const capturedStatuses = ['captured', 'authorized'];
    if (!razorpayPayment || !capturedStatuses.includes(razorpayPayment.status)) {
        const actualStatus = razorpayPayment?.status || 'unknown';
        console.error(`[Razorpay SDK] Payment ${paymentId} is not captured. Status: ${actualStatus}`);
        throw new Error(`Payment is not in a captured state. Current status: ${actualStatus}`);
    }

    console.log(`[Razorpay SDK] Payment ${paymentId} confirmed on Razorpay: status=${razorpayPayment.status}, amount=${razorpayPayment.amount}`);

    // ── Step 3: Atomic DB write — Subscription, Transaction, Credit, Account ─
    const result = await processSubscriptionPayment({
        accountId,
        packageId: pkg.id,
        paymentId,
        orderId,
        signature,
        amountPaise: razorpayPayment.amount, // use Razorpay's confirmed amount, not client-sent
    });

    // ── Step 4: Dispatch invoice receipt email via RabbitMQ ──────────────────
    try {
        await notifyPaymentEvent({
            action: 'payment_success',
            email:    user?.email    || 'user@takshacodespace.in',
            username: user?.username || user?.name || 'Developer User',
            transactionDetails: {
                paymentId,
                orderId,
                amountPaise: razorpayPayment.amount,
                packageId:   pkg.id,
                tier:        result.activeTier,
                validUntil:  result.validUntil,
                carriedDays: result.carriedDays,
            },
        });
    } catch (notifyErr) {
        console.warn('[Razorpay SDK] Payment receipt notification event skipped:', notifyErr.message);
    }

    return {
        success:          true,
        verified:         true,
        paymentStatus:    'SUCCESS',
        transactionStatus: 'SUCCESS',
        activeTier:       result.activeTier,
        validUntil:       result.validUntil,
        carriedDays:      result.carriedDays,
        transactionType:  result.transactionType,
        reservedSlots:    result.reservedSlots,
    };
}

/**
 * Verify server-to-server webhook signature using official SDK utility.
 *
 * @param {Object} params
 * @param {string|Buffer} params.rawBody - Raw request body string or buffer
 * @param {string} params.signature - X-Razorpay-Signature header value
 * @param {string} [params.webhookSecret] - Optional custom webhook secret
 * @returns {boolean} True if webhook is authentic
 */
export function verifyWebhookSignature({ rawBody, signature, webhookSecret }) {
    const secret = webhookSecret || (process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET || '').trim();
    if (!secret) {
        throw new Error('[Razorpay SDK] Webhook secret is required to verify webhook signatures');
    }

    const bodyString = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
    return validateWebhookSignature(bodyString, signature, secret);
}

/**
 * Fetch payment details directly from Razorpay servers via the official SDK.
 *
 * @param {string} paymentId - Razorpay payment ID
 * @returns {Promise<Object>} Razorpay payment entity
 */
export async function fetchPayment(paymentId) {
    const client = getRazorpayClient();
    return await client.payments.fetch(paymentId);
}

/**
 * Fetch order details directly from Razorpay servers via the official SDK.
 *
 * @param {string} orderId - Razorpay order ID
 * @returns {Promise<Object>} Razorpay order entity
 */
export async function fetchOrder(orderId) {
    const client = getRazorpayClient();
    return await client.orders.fetch(orderId);
}

export default {
    getRazorpayClient,
    createOrder,
    verifyPaymentSignature,
    verifyWebhookSignature,
    fetchPayment,
    fetchOrder,
};
