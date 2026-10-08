/**
 * Subscription, Transaction & Usage Analytics Routes
 *
 * GET /api/payments/subscription              — Current plan + queue + daysRemaining
 * GET /api/payments/transactions              — Paginated invoice/audit history with filters
 * GET /api/payments/transactions/:id          — Single transaction / invoice receipt
 * GET /api/payments/usage-events              — Paginated granular AI request/interaction log
 * GET /api/payments/usage-events/analytics    — Time-series token & request analytics
 * GET /api/payments/dashboard/overview        — Complete consolidated dashboard boot payload
 *
 * All routes require JWT authentication via identifyUser middleware.
 */

import { Router } from 'express';
import { identifyUser } from '../middleware/identifyUser.middleware.js';
import {
    getActiveSubscription,
    getTransactionHistory,
    getTransactionById,
    getUsageEvents,
    getUsageAnalytics,
    getDashboardOverview,
} from '../services/subscription.service.js';

const subscriptionRouter = Router();

// All routes require authentication
subscriptionRouter.use(identifyUser);

/**
 * GET /api/payments/dashboard/overview
 * Consolidated boot payload: plan, credit buckets, 30d analytics, recent txs and logs.
 */
subscriptionRouter.get('/dashboard/overview', async (req, res) => {
    try {
        const accountId = req.accountId || req.user?.id || req.user?._id;
        if (!accountId) {
            return res.status(401).json({ status: 'error', message: 'Account ID not resolved from token' });
        }

        const data = await getDashboardOverview(accountId);
        return res.status(200).json({ status: 'success', data });
    } catch (err) {
        console.error('[subscriptionRouter] GET /dashboard/overview error:', err.message);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch dashboard overview' });
    }
});

/**
 * GET /api/payments/subscription
 * Current plan queue status with lazy expiry promotion.
 */
subscriptionRouter.get('/subscription', async (req, res) => {
    try {
        const accountId = req.accountId || req.user?.id || req.user?._id;
        if (!accountId) {
            return res.status(401).json({ status: 'error', message: 'Account ID not resolved from token' });
        }

        const sub = await getActiveSubscription(accountId);

        if (!sub) {
            return res.status(200).json({
                status: 'success',
                data: {
                    activeTier:   'free',
                    activePlanId: (process.env.PLAN_ID_FREE || '').trim(),
                    status:       'FREE',
                    activeSlot:   null,
                    reservedSlots: [],
                },
            });
        }

        const now = Date.now();
        const MS  = 24 * 60 * 60 * 1000;

        const formatSlot = (slot) => {
            if (!slot) return null;
            const remaining = slot.validUntil
                ? Math.max(0, Math.ceil((new Date(slot.validUntil).getTime() - now) / MS))
                : null;
            return {
                packageId:       slot.packageId,
                tier:            slot.tier,
                planId:          slot.planId,
                validFrom:       slot.validFrom,
                validUntil:      slot.validUntil,
                daysRemaining:   remaining,
                paidAmountPaise: slot.paidAmountPaise,
                carriedDays:     slot.carriedDays,
            };
        };

        return res.status(200).json({
            status: 'success',
            data: {
                activeTier:    sub.activeTier,
                activePlanId:  sub.activePlanId,
                status:        sub.status,
                activeSlot:    formatSlot(sub.activeSlot),
                reservedSlots: (sub.reservedSlots || []).map(formatSlot),
                updatedAt:     sub.updatedAt,
            },
        });

    } catch (err) {
        console.error('[subscriptionRouter] GET /subscription error:', err.message);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch subscription' });
    }
});

/**
 * GET /api/payments/transactions
 * Paginated transaction audit history.
 */
subscriptionRouter.get('/transactions', async (req, res) => {
    try {
        const accountId = req.accountId || req.user?.id || req.user?._id;
        if (!accountId) {
            return res.status(401).json({ status: 'error', message: 'Account ID not resolved from token' });
        }

        const page      = Math.max(1, parseInt(req.query.page)  || 1);
        const limit     = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const type      = req.query.type || undefined;
        const status    = req.query.status || undefined;
        const startDate = req.query.startDate || undefined;
        const endDate   = req.query.endDate || undefined;

        const result = await getTransactionHistory(accountId, { page, limit, type, status, startDate, endDate });

        return res.status(200).json({
            status: 'success',
            data: result,
        });

    } catch (err) {
        console.error('[subscriptionRouter] GET /transactions error:', err.message);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch transaction history' });
    }
});

/**
 * GET /api/payments/transactions/:id
 * Single transaction / invoice receipt details.
 */
subscriptionRouter.get('/transactions/:id', async (req, res) => {
    try {
        const accountId = req.accountId || req.user?.id || req.user?._id;
        if (!accountId) {
            return res.status(401).json({ status: 'error', message: 'Account ID not resolved from token' });
        }

        const tx = await getTransactionById(accountId, req.params.id);
        if (!tx) {
            return res.status(404).json({ status: 'error', message: 'Transaction not found' });
        }

        return res.status(200).json({ status: 'success', data: tx });
    } catch (err) {
        console.error('[subscriptionRouter] GET /transactions/:id error:', err.message);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch transaction' });
    }
});

/**
 * GET /api/payments/usage-events
 * Paginated granular AI usage events (prompt, completion, model, company, agent).
 */
subscriptionRouter.get('/usage-events', async (req, res) => {
    try {
        const accountId = req.accountId || req.user?.id || req.user?._id;
        if (!accountId) {
            return res.status(401).json({ status: 'error', message: 'Account ID not resolved from token' });
        }

        const page      = Math.max(1, parseInt(req.query.page)  || 1);
        const limit     = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const company   = req.query.company || undefined;
        const agentType = req.query.agentType || undefined;
        const search    = req.query.search || undefined;
        const startDate = req.query.startDate || undefined;
        const endDate   = req.query.endDate || undefined;

        const result = await getUsageEvents(accountId, { page, limit, company, agentType, search, startDate, endDate });

        return res.status(200).json({
            status: 'success',
            data: result,
        });
    } catch (err) {
        console.error('[subscriptionRouter] GET /usage-events error:', err.message);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch usage events' });
    }
});

/**
 * GET /api/payments/usage-events/analytics
 * Time-series and distribution analytics for charts.
 */
subscriptionRouter.get('/usage-events/analytics', async (req, res) => {
    try {
        const accountId = req.accountId || req.user?.id || req.user?._id;
        if (!accountId) {
            return res.status(401).json({ status: 'error', message: 'Account ID not resolved from token' });
        }

        const days = Math.min(365, Math.max(1, parseInt(req.query.days) || 30));
        const data = await getUsageAnalytics(accountId, { days });

        return res.status(200).json({ status: 'success', data });
    } catch (err) {
        console.error('[subscriptionRouter] GET /usage-events/analytics error:', err.message);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch usage analytics' });
    }
});

export default subscriptionRouter;
