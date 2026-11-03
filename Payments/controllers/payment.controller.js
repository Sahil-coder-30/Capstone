/**
 * POST /api/payments/create/order and POST /api/payments/verify
 */

import { startCheckout, verifyCheckout } from '../services/checkout.service.js';

// POST /create/order  body: { packageId }
export async function createOrder(req, res) {
    const data = await startCheckout(req.user, req.body?.packageId);
    res.status(201).json({ status: 'success', data });
}

// POST /verify  body: { orderId, paymentId, signature }
export async function verifyPayment(req, res) {
    const { orderId, paymentId, signature } = req.body || {};
    const data = await verifyCheckout(req.user, { orderId, paymentId, signature });
    res.json({
        status: 'success',
        message: data.status === 'already_processed'
            ? 'Payment was already applied'
            : 'Payment verified and subscription updated',
        data,
    });
}
