/**
 * POST /api/payments/webhook (Razorpay, server to server)
 *
 * The HMAC is checked over req.rawBody, the exact bytes Razorpay signed
 * (set by express.json's verify hook in app.js).
 */

import { BadRequestError, logger } from 'faultkit';
import { isWebhookSignatureValid } from '../services/razorpay.service.js';
import { handleWebhookEvent } from '../services/checkout.service.js';

const HANDLED = new Set(['payment.captured', 'order.paid', 'payment.failed', 'refund.processed']);

export async function razorpayWebhook(req, res) {
    const rawBody = Buffer.isBuffer(req.rawBody) ? req.rawBody.toString('utf8') : null;
    if (!rawBody) throw new BadRequestError('Webhook raw body is unavailable');

    const signature = req.headers['x-razorpay-signature'];
    if (!isWebhookSignatureValid({ rawBody, signature })) {
        throw new BadRequestError('Webhook signature verification failed');
    }

    const payload = JSON.parse(rawBody);
    const event = payload?.event;
    if (!HANDLED.has(event)) {
        return res.json({ status: 'ignored' });
    }

    // Process before replying: a 5xx makes Razorpay retry, and the payment id
    // primary key makes a retry safe.
    try {
        await handleWebhookEvent(event, payload?.payload);
    } catch (err) {
        logger.error({ err, event }, '[webhook] processing failed');
        throw err;
    }
    res.json({ status: 'received' });
}
