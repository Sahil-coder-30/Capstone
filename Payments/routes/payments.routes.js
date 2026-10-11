import { Router } from 'express';
import { identifyUser } from '../middleware/identifyUser.middleware.js';
import {
    createOrderController,
    verifyPaymentController,
} from '../controllers/payment.controller.js';
import { webhookController } from '../controllers/webhook.controller.js';
import subscriptionRouter from './subscription.routes.js';

const paymentRouter = Router();

// ── Order creation ──────────────────────────────────────────────────────────
// Both endpoints are kept for backward compatibility
paymentRouter.post('/create/order', identifyUser, createOrderController);
paymentRouter.post('/order',        identifyUser, createOrderController);

// ── Payment verification ─────────────────────────────────────────────────────
// Called by react-razorpay's onSuccess handler after the user completes checkout.
// No webhook needed — razorpay.service.verifyPaymentSignature() calls
// fetchPayment(paymentId) directly against Razorpay's API to confirm capture
// status server-side before any DB write. This is the ground-truth check.
paymentRouter.post('/verify',  identifyUser, verifyPaymentController);
paymentRouter.post('/confirm', identifyUser, verifyPaymentController);

// ── Razorpay Webhook (Server-to-Server HMAC verification) ────────────────────
paymentRouter.post('/webhook', webhookController);

// ── Subscription & Transaction history routes ───────────────────────────────
// GET /api/payments/subscription
// GET /api/payments/transactions
// GET /api/payments/usage-events
// GET /api/payments/dashboard/overview
paymentRouter.use('/', subscriptionRouter);

export default paymentRouter;