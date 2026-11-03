/**
 * /api/payments/credit/*
 * Credit window, usage recording and the Frontend app's billing views.
 */

import { randomUUID } from 'crypto';
import { BadRequestError, ForbiddenError } from 'faultkit';
import {
    checkCredit,
    normalizeAgentType,
    normalizeProvider,
    recordUsage,
    windowState,
} from '../services/credit.service.js';
import { getUsageTotals, recentUsageEvents } from '../services/usage.service.js';
import { getSubscriptionState } from '../services/subscription.service.js';
import { getSpendSummary, listTransactions } from '../services/billing.service.js';
import { getPublicPackages } from '../config/plans.config.js';
import {
    serializeCredit,
    serializeCreditCheck,
    serializeTransaction,
    serializeUsageEvent,
} from '../serializers/api.serializers.js';
import { parsePaging } from './paging.js';

const toTokenCount = (value, field) => {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n) || n < 0) throw new BadRequestError(`${field} must be a non-negative number`);
    return Math.floor(n);
};

/** Full credit view used by GET /credit and the dashboard. */
export async function buildCreditView(userId) {
    const window = await checkCredit(userId);
    const [usage, slots] = await Promise.all([getUsageTotals(userId), getSubscriptionState(userId)]);
    return serializeCredit({ userId, window, usage, activeSlot: slots.active });
}

// GET /credit
export async function getCredit(req, res) {
    res.json({ status: 'success', credit: await buildCreditView(req.user.id) });
}

// GET /credit/check
export async function getCreditCheck(req, res) {
    res.json({ status: 'success', ...serializeCreditCheck(await checkCredit(req.user.id)) });
}

// POST /credit/update (called by Ai_orchestration after each AI response)
export async function postCreditUpdate(req, res) {
    const userId = req.user.id;
    const body = req.body || {};
    if (body.userId && String(body.userId) !== userId) {
        throw new ForbiddenError('Cannot record usage for another account');
    }

    const promptTokens = toTokenCount(body.promptTokens, 'promptTokens');
    const completionTokens = toTokenCount(body.completionTokens, 'completionTokens');
    const totalTokens = body.totalTokens === undefined
        ? promptTokens + completionTokens
        : toTokenCount(body.totalTokens, 'totalTokens');
    if (totalTokens < promptTokens + completionTokens) {
        throw new BadRequestError('totalTokens cannot be less than promptTokens + completionTokens');
    }

    const provider = normalizeProvider(body.company || body.provider);
    const result = await recordUsage(userId, {
        requestId: String(body.requestId || '').trim().slice(0, 200) || `req_${randomUUID()}`,
        provider,
        modelId: String(body.modelId || '').slice(0, 200),
        agentType: normalizeAgentType(body.agentType),
        projectId: String(body.projectId || '').slice(0, 200),
        chatId: body.chatId ? String(body.chatId).slice(0, 200) : null,
        promptTokens,
        completionTokens,
        totalTokens,
    });

    const window = windowState(result.account);
    res.json({
        status: 'success',
        message: result.duplicate ? 'Usage already recorded for this requestId' : 'Usage recorded',
        credit: serializeCreditCheck(window),
        usage: {
            company: provider,
            subscription: window.tier,
            creditsDeducted: result.creditsDeducted,
            totalTokens,
            duplicate: result.duplicate,
        },
    });
}

// GET /credit/packages (public)
export function getPackages(_req, res) {
    res.json({ status: 'success', packages: getPublicPackages() });
}

// GET /credit/transactions
export async function getCreditTransactions(req, res) {
    const { page, limit } = parsePaging(req.query);
    const result = await listTransactions(req.user.id, { page, limit, type: req.query.type || undefined });
    res.json({
        status: 'success',
        pagination: { page, limit, total: result.total, pages: result.totalPages },
        transactions: result.rows.map(serializeTransaction),
    });
}

// GET /credit/transactions/summary
export async function getCreditTransactionSummary(req, res) {
    const userId = req.user.id;
    const [spend, slots, window] = await Promise.all([
        getSpendSummary(userId),
        getSubscriptionState(userId),
        checkCredit(userId),
    ]);
    res.json({
        status: 'success',
        summary: {
            ...spend,
            totalBillableINR: 0,
            currentSubscription: window.tier,
            currentPeriodStart: slots.active?.validFrom || null,
            currentPeriodEnd: slots.active?.validUntil || null,
        },
    });
}

// GET /credit/analytics
export async function getCreditAnalytics(req, res) {
    const userId = req.user.id;
    const [usage, recent, window] = await Promise.all([
        getUsageTotals(userId),
        recentUsageEvents(userId, 30),
        checkCredit(userId),
    ]);

    const byAgent = {};
    for (const e of recent) {
        byAgent[e.agentType] ??= { totalTokens: 0, requestCount: 0 };
        byAgent[e.agentType].totalTokens += e.totalTokens;
        byAgent[e.agentType].requestCount += 1;
    }

    res.json({
        status: 'success',
        analytics: {
            totals: {
                promptTokens: usage.totals.promptTokens,
                completionTokens: usage.totals.completionTokens,
                totalTokens: usage.totals.totalTokens,
            },
            byProvider: usage.byProvider.map((p) => ({
                company: p.provider,
                totalTokens: p.totalTokens,
                promptTokens: p.promptTokens,
                completionTokens: p.completionTokens,
                requestCount: p.requestCount,
                creditsRemaining: window.windowCreditsRemaining,
                creditsGranted: window.windowCreditsTotal,
                lastUsedAt: p.lastUsedAt,
            })),
            byAgent,
            recentEvents: recent.map(serializeUsageEvent),
        },
    });
}
