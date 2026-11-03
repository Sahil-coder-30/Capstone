/**
 * /api/payments/*
 * Checkout (payments_frontend), Razorpay webhook and the payments dashboard.
 */

import { Router } from 'express';
import { identifyUser } from '../middleware/identifyUser.middleware.js';
import { createOrder, verifyPayment } from '../controllers/payment.controller.js';
import { razorpayWebhook } from '../controllers/webhook.controller.js';
import {
    getDashboardOverview,
    getSubscription,
    getTransactionById,
    getTransactions,
    getUsageEvents,
    getUsageEventsAnalytics,
} from '../controllers/subscription.controller.js';

const router = Router();

// Server to server, authenticated by HMAC signature instead of a JWT.
router.post('/webhook', razorpayWebhook);

router.use(identifyUser);

router.post('/create/order', createOrder);
router.post('/verify', verifyPayment);

router.get('/subscription', getSubscription);
router.get('/transactions', getTransactions);
router.get('/transactions/:id', getTransactionById);
router.get('/usage-events', getUsageEvents);
router.get('/usage-events/analytics', getUsageEventsAnalytics);
router.get('/dashboard/overview', getDashboardOverview);

export default router;
