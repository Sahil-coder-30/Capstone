import express from 'express';
import { identifyUser } from '../middleware/identifyUser.middleware.js';
import {
    getCreditController,
    checkCreditController,
    updateCreditController,
    updateSubscriptionController,
    getTransactionsController,
    getTransactionSummaryController,
    getAnalyticsController,
    getPackagesController,
} from '../controllers/credit.controller.js';

const router = express.Router();

// ── Public Routes (no auth required) ─────────────────────────────────────────
// Returns subscription plans for the pricing page
router.get('/packages', getPackagesController);

// ── Authenticated Routes ──────────────────────────────────────────────────────
router.use(identifyUser);

// Credit balance & provider buckets
router.get('/', getCreditController);
router.get('/check', checkCreditController);
router.post('/update', updateCreditController);

// Subscription tier management
router.patch('/subscription', updateSubscriptionController);

// Transaction history & summary
router.get('/transactions', getTransactionsController);
router.get('/transactions/summary', getTransactionSummaryController);

// Usage analytics
router.get('/analytics', getAnalyticsController);

export default router;
