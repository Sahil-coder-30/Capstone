/**
 * /api/payments/credit/*
 * Called by Ai_orchestration (check, update) and the Frontend app.
 */

import { Router } from 'express';
import { identifyUser } from '../middleware/identifyUser.middleware.js';
import {
    getCredit,
    getCreditAnalytics,
    getCreditCheck,
    getCreditTransactions,
    getCreditTransactionSummary,
    getPackages,
    postCreditUpdate,
} from '../controllers/credit.controller.js';

const router = Router();

router.get('/packages', getPackages);

router.use(identifyUser);
router.get('/', getCredit);
router.get('/check', getCreditCheck);
router.post('/update', postCreditUpdate);
router.get('/transactions', getCreditTransactions);
router.get('/transactions/summary', getCreditTransactionSummary);
router.get('/analytics', getCreditAnalytics);

export default router;
