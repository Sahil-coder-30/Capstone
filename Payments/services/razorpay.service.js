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

import {
    BadRequestError,
    InternalServerError,
    logger,
} from 'faultkit';

let _razorpayInstance = null;

/**
 * Get or initialize the official Razorpay SDK singleton instance.
 * @returns {Razorpay}
 */
export function getRazorpayClient() {
    if (!_razorpayInstance) {
        const key_id = (process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_SECRET_ID || '').trim();
        const key_secret = (process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET_KEY || '').trim();

        if (!key_id || !key_secret) {
            logger.error('[Razorpay SDK] Missing credentials. RAZORPAY_KEY_ID / RAZORPAY_SECRET_ID and RAZORPAY_KEY_SECRET / RAZORPAY_SECRET_KEY must be configured.');
            throw new InternalServerError('Razorpay payment gateway credentials are not configured on the server');
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
 *   a. HMAC signature check via validatePaymentVerification (if orderId & signature provided).
 *   b. fetchPayment(paymentId) — mandatory server-side confirmation against Razorpay's API.
 *      Auto-captures authorized payments if necessary.
 *
 * @param {Object} params
 * @param {string} params.accountId - User account ID (Account._id = Auth user_id)
 * @param {string} params.packageId - Package ID ('pro_regular' / 'pro' or 'max_regular' / 'max')
 * @param {string} [params.orderId]   - Razorpay order ID (e.g. order_9A33XWu170gUtm)
 * @param {string} params.paymentId - Razorpay payment ID (e.g. pay_9A33XWu170gUtm)
 * @param {string} [params.signature] - Razorpay HMAC-SHA256 signature
 * @param {Object} [params.user={}] - User details for notification (email, username)
 * @returns {Promise<Object>} Verification & persistence result
 */
export async function verifyPaymentSignature({
    accountId,
    packageId,
    orderId = null,
    paymentId,
    signature = null,
    user = {},
}) {
    const secret = (process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET_KEY || '').trim();

    if (!paymentId) {
        throw new BadRequestError('paymentId is required for payment verification');
    }

    const pkg = getPackageById(packageId);
    if (!pkg) {
        throw new BadRequestError(`Unknown packageId: ${packageId}. Available plans: Pro (₹499) and Max (₹999)`);
    }

    // ── Step 1: HMAC signature check (if client-side order checkout was used) ──
    if (orderId && signature) {
        if (!secret) {
            throw new InternalServerError('RAZORPAY_KEY_SECRET is required to verify signatures');
        }

        let signatureValid = false;
        try {
            signatureValid = validatePaymentVerification(
                { order_id: orderId, payment_id: paymentId },
                signature,
                secret
            );
        } catch (sigErr) {
            logger.warn({ err: sigErr }, '[Razorpay SDK] validatePaymentVerification threw warning');
        }

        if (!signatureValid) {
            logger.error({ paymentId, orderId }, '[Razorpay SDK] HMAC signature check failed');
            throw new BadRequestError('Payment verification failed: Invalid cryptographic signature');
        }
    } else {
        logger.info({ paymentId }, '[Razorpay SDK] orderId or signature not provided; proceeding with direct server-side verification');
    }

    // ── Step 2: Confirm payment status with Razorpay's API (mandatory source of truth) ─
    let razorpayPayment;
    const client = getRazorpayClient();
    try {
        razorpayPayment = await client.payments.fetch(paymentId);
    } catch (fetchErr) {
        logger.error({ err: fetchErr, paymentId }, '[Razorpay SDK] fetchPayment failed');
        throw new BadRequestError(`Could not confirm payment with Razorpay: ${fetchErr.message}`);
    }

    // If payment is authorized but not yet captured, auto-capture it server-side
    if (razorpayPayment.status === 'authorized') {
        try {
            logger.info({ paymentId, amount: razorpayPayment.amount }, '[Razorpay SDK] Auto-capturing authorized payment');
            razorpayPayment = await client.payments.capture(
                paymentId,
                razorpayPayment.amount,
                razorpayPayment.currency || 'INR'
            );
        } catch (captureErr) {
            logger.error({ err: captureErr, paymentId }, '[Razorpay SDK] Auto-capture failed');
            throw new InternalServerError(`Failed to capture authorized payment: ${captureErr.message}`);
        }
    }

    const capturedStatuses = ['captured', 'authorized'];
    if (!razorpayPayment || !capturedStatuses.includes(razorpayPayment.status)) {
        const actualStatus = razorpayPayment?.status || 'unknown';
        logger.error({ paymentId, status: actualStatus }, '[Razorpay SDK] Payment is not in a captured state');
        throw new BadRequestError(`Payment is not in a captured state. Current status: ${actualStatus}`);
    }

    // Verify paid amount matches the package price (prevent underpayment)
    if (razorpayPayment.amount < pkg.priceINRPaise) {
        logger.error({
            paidAmount: razorpayPayment.amount,
            expectedAmount: pkg.priceINRPaise,
            paymentId,
        }, '[Razorpay SDK] Paid amount is less than expected package price');
        throw new BadRequestError(`Paid amount (₹${razorpayPayment.amount / 100}) does not match package price (₹${pkg.priceINR})`);
    }

    logger.info({
        paymentId,
        status: razorpayPayment.status,
        amount: razorpayPayment.amount,
    }, '[Razorpay SDK] Payment confirmed on Razorpay server');

    // ── Step 3: Atomic DB write — Subscription, Transaction, Credit, Account ─
    const result = await processSubscriptionPayment({
        accountId,
        packageId: pkg.id,
        paymentId,
        orderId: orderId || razorpayPayment.order_id || `direct_${paymentId}`,
        signature,
        amountPaise: razorpayPayment.amount, // use Razorpay's confirmed amount
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
