/**
 * /api/payments/{subscription,transactions,usage-events,dashboard}
 * Read views used by payments_frontend.
 */

import { NotFoundError } from 'faultkit';
import { getSubscriptionState } from '../services/subscription.service.js';
import { getTransaction, listTransactions, recentTransactions } from '../services/billing.service.js';
import { getUsageAnalytics, listUsageEvents, recentUsageEvents } from '../services/usage.service.js';
import {
    serializeSubscription,
    serializeTransaction,
    serializeUsageAnalytics,
    serializeUsageEvent,
} from '../serializers/api.serializers.js';
import { buildCreditView } from './credit.controller.js';
import { parsePaging } from './paging.js';

const parseDays = (v) => Math.min(365, Math.max(1, parseInt(v, 10) || 30));

// GET /subscription
export async function getSubscription(req, res) {
    const state = await getSubscriptionState(req.user.id);
    res.json({ status: 'success', data: serializeSubscription(state) });
}

// GET /transactions
export async function getTransactions(req, res) {
    const { page, limit } = parsePaging(req.query);
    const { type, status, startDate, endDate } = req.query;
    const result = await listTransactions(req.user.id, { page, limit, type, status, startDate, endDate });
    res.json({
        status: 'success',
        data: {
            transactions: result.rows.map(serializeTransaction),
            total: result.total,
            page: result.page,
            totalPages: result.totalPages,
            summary: result.summary,
        },
    });
}

// GET /transactions/:id
export async function getTransactionById(req, res) {
    const tx = await getTransaction(req.user.id, req.params.id);
    if (!tx) throw new NotFoundError('Transaction not found');
    res.json({ status: 'success', data: serializeTransaction(tx) });
}

// GET /usage-events
export async function getUsageEvents(req, res) {
    const { page, limit } = parsePaging(req.query);
    const { company, agentType, search, startDate, endDate } = req.query;
    const result = await listUsageEvents(req.user.id, {
        page, limit, provider: company, agentType, search, startDate, endDate,
    });
    res.json({
        status: 'success',
        data: {
            events: result.rows.map(serializeUsageEvent),
            total: result.total,
            page: result.page,
            totalPages: result.totalPages,
        },
    });
}

// GET /usage-events/analytics
export async function getUsageEventsAnalytics(req, res) {
    const analytics = await getUsageAnalytics(req.user.id, { days: parseDays(req.query.days) });
    res.json({ status: 'success', data: serializeUsageAnalytics(analytics) });
}

// GET /dashboard/overview
export async function getDashboardOverview(req, res) {
    const userId = req.user.id;
    const credit = await buildCreditView(userId);
    const [state, analytics, transactions, events] = await Promise.all([
        getSubscriptionState(userId),
        getUsageAnalytics(userId, { days: 30 }),
        recentTransactions(userId, 5),
        recentUsageEvents(userId, 5),
    ]);
    res.json({
        status: 'success',
        data: {
            subscription: serializeSubscription(state),
            credit,
            analytics: serializeUsageAnalytics(analytics),
            recentTransactions: transactions.map(serializeTransaction),
            recentEvents: events.map(serializeUsageEvent),
        },
    });
}
