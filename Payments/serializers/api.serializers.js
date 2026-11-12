/**
 * Maps database rows to the JSON shapes the clients already read
 * (Frontend, payments_frontend, Ai_orchestration). Field names here are
 * the public API contract; change them only together with the clients.
 */

import { getTierLimits, TOKENS_PER_CREDIT } from '../config/plans.config.js';
import { daysFromMs, MS_PER_DAY } from '../services/subscription.service.js';
import { creditsDiscounted } from '../services/credit.service.js';

// ── Credit ────────────────────────────────────────────────────────────────────

export function serializeTierConfig(tier) {
    const t = getTierLimits(tier);
    return {
        id: t.id,
        label: t.label,
        billing: 'credits',
        dailyTokenCap: t.dailyTokenCap,
        monthlyTokenCap: t.monthlyTokenCap,
        requestsPerMinute: t.requestsPerMinute,
        features: t.features,
        windowCredits: t.windowCredits,
        windowHours: t.windowHours,
        creditLowerLimit: t.creditLowerLimit,
    };
}

/** GET /credit/check (also read by Ai_orchestration). */
export function serializeCreditCheck(w) {
    return {
        canQuery: w.canQuery,
        hasCredit: w.canQuery,
        subscription: w.tier,
        creditsRemaining: w.windowCreditsRemaining,
        windowCreditsTotal: w.windowCreditsTotal,
        creditLowerLimit: w.creditLowerLimit,
        nextRefillAt: w.windowRefillAt,
        windowExhaustedAt: w.windowExhaustedAt,
        timeUntilRefillMs: w.timeUntilRefillMs,
    };
}

/** GET /credit and the `credit` block of the dashboard. */
export function serializeCredit({ userId, window, usage, activeSlot }) {
    return {
        userId,
        accountId: userId,
        subscription: window.tier,
        credits: window.windowCreditsRemaining,
        canQuery: window.canQuery,
        windowCreditsTotal: window.windowCreditsTotal,
        windowCreditsRemaining: window.windowCreditsRemaining,
        windowRefillAt: window.windowRefillAt,
        windowExhaustedAt: window.windowExhaustedAt,
        promptTokens: usage.totals.promptTokens,
        completionTokens: usage.totals.completionTokens,
        totalTokens: usage.totals.totalTokens,
        // One shared window for all providers; per-provider numbers are usage only.
        providerCredits: usage.byProvider.map((p) => ({
            company: p.provider,
            creditsRemaining: window.windowCreditsRemaining,
            creditsGranted: window.windowCreditsTotal,
            promptTokens: p.promptTokens,
            completionTokens: p.completionTokens,
            totalTokens: p.totalTokens,
            requestCount: p.requestCount,
            creditsUsed: p.creditsDeducted,
            lastUsedAt: p.lastUsedAt,
        })),
        billing: {
            currency: 'INR',
            currentPeriodStart: activeSlot?.validFrom || null,
            currentPeriodEnd: activeSlot?.validUntil || null,
        },
        tokensPerCredit: TOKENS_PER_CREDIT,
        tierConfig: serializeTierConfig(window.tier),
    };
}

// ── Subscription ──────────────────────────────────────────────────────────────

function slotView(slot, { validFrom, validUntil }) {
    const until = validUntil ? new Date(validUntil) : null;
    const isQueued = slot.status === 'queued';
    return {
        id: slot.id,
        packageId: slot.packageId,
        tier: slot.tier,
        planId: slot.planId,
        status: slot.status,
        validFrom,
        validUntil: until,
        // Queued: days of plan it holds. Active: days until it ends.
        daysRemaining: isQueued || !until
            ? daysFromMs(slot.remainingMs)
            : Math.max(0, Math.ceil((until.getTime() - Date.now()) / MS_PER_DAY)),
        paidAmountPaise: slot.paidAmountPaise,
        carriedDays: slot.carriedDays,
    };
}

/** GET /subscription. Queued slots get projected start and end dates. */
export function serializeSubscription({ active, queued }) {
    if (!active) {
        return {
            activeTier: 'free',
            activePlanId: (process.env.PLAN_ID_FREE || '').trim() || 'free',
            status: 'FREE',
            activeSlot: null,
            reservedSlots: [],
        };
    }

    let cursor = new Date(active.validUntil).getTime();
    const reservedSlots = queued.map((q) => {
        const start = new Date(cursor);
        cursor += Math.max(0, q.remainingMs || 0);
        return slotView(q, { validFrom: start, validUntil: new Date(cursor) });
    });

    return {
        activeTier: active.tier,
        activePlanId: active.planId,
        status: 'ACTIVE',
        activeSlot: slotView(active, { validFrom: active.validFrom, validUntil: active.validUntil }),
        reservedSlots,
        updatedAt: active.updatedAt,
    };
}

// ── Transactions ──────────────────────────────────────────────────────────────

export function serializeTransaction(t) {
    return {
        _id: t.id,
        id: t.id,
        accountId: t.userId,
        userId: t.userId,
        type: t.type,
        status: t.status,
        amountPaise: Number(t.amountPaise),
        amountINR: Number(t.amountPaise) / 100,
        currency: t.currency,
        razorpay: { orderId: t.orderId || null, paymentId: t.paymentId || null },
        subscription: { plan: t.metadata?.plan || null, billingCycle: t.metadata?.billingCycle || null },
        invoiceNumber: t.invoiceNumber || null,
        description: t.description,
        metadata: t.metadata || {},
        createdAt: t.createdAt,
    };
}

// ── Usage ─────────────────────────────────────────────────────────────────────

export function serializeUsageEvent(e) {
    return {
        _id: String(e.id),
        id: String(e.id),
        accountId: e.userId,
        company: e.provider,
        provider: e.provider,
        modelId: e.modelId,
        agentType: e.agentType,
        projectId: e.projectId,
        requestId: e.requestId,
        chatId: e.chatId,
        subscription: e.tier,
        promptTokens: e.promptTokens,
        completionTokens: e.completionTokens,
        totalTokens: e.totalTokens,
        creditsDeducted: Number(e.creditsDeducted),
        creditsDiscounted: creditsDiscounted(e.agentType, e.totalTokens),
        createdAt: e.createdAt,
    };
}

/** GET /usage-events/analytics and the dashboard `analytics` block. */
export function serializeUsageAnalytics(a) {
    return {
        timeframeDays: a.days,
        totals: {
            totalTokens: a.totals.totalTokens,
            promptTokens: a.totals.promptTokens,
            completionTokens: a.totals.completionTokens,
            totalRequests: a.totals.requestCount,
            totalCreditsDeducted: a.totals.creditsDeducted,
            totalCreditsDiscounted: a.byAgent.reduce((total, b) => total + creditsDiscounted(b.agentType, b.totalTokens), 0),
        },
        timeline: a.timeline,
        byProvider: a.byProvider.map((p) => ({
            company: p.provider,
            totalTokens: p.totalTokens,
            requestCount: p.requestCount,
            creditsDeducted: p.creditsDeducted,
        })),
        byAgent: a.byAgent.map((b) => ({
            agentType: b.agentType,
            totalTokens: b.totalTokens,
            requestCount: b.requestCount,
            creditsDiscounted: creditsDiscounted(b.agentType, b.totalTokens),
        })),
    };
}
