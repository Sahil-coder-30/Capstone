/**
 * Credit service: the 5-hour AI credit window.
 *
 *  - checkCredit:  can this user send an AI request right now?
 *  - recordUsage:  log one AI request and take its credits from the window,
 *                  in one transaction. Same (user, requestId) twice is a no-op.
 *
 * 1 credit = TOKENS_PER_CREDIT tokens. When the balance drops below the
 * tier's lower limit, the window locks and refills `windowHours` later.
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { accounts, usageEvents } from '../db/schema.js';
import { refreshWindow } from './account.service.js';
import { promoteIfExpired } from './subscription.service.js';
import { getTierLimits, TOKENS_PER_CREDIT } from '../config/plans.config.js';

// The AI service only uses NVIDIA-hosted models. Anything else is stored
// as 'unknown' so usage is still recorded and billed.
export const PROVIDERS = ['nvidia', 'unknown'];

export const AGENT_TYPES = ['codingAgent', 'copilot', 'appAgent', 'title', 'unknown'];

export function normalizeProvider(value) {
    const v = String(value || '').trim().toLowerCase();
    return PROVIDERS.includes(v) ? v : 'unknown';
}

export function normalizeAgentType(value) {
    const v = String(value || '').trim();
    return AGENT_TYPES.includes(v) ? v : 'unknown';
}

export const creditsForTokens = (tokens) => Math.round((tokens / TOKENS_PER_CREDIT) * 1000) / 1000;

/** Window state shaped for API responses. */
export function windowState(account) {
    const limits = getTierLimits(account.tier);
    const remaining = Number(account.windowCreditsRemaining);
    const refillAt = account.windowRefillAt ? new Date(account.windowRefillAt) : null;
    return {
        tier: account.tier,
        canQuery: remaining >= limits.creditLowerLimit,
        windowCreditsTotal: Number(account.windowCreditsTotal),
        windowCreditsRemaining: remaining,
        creditLowerLimit: limits.creditLowerLimit,
        windowRefillAt: refillAt,
        windowExhaustedAt: account.windowExhaustedAt || null,
        timeUntilRefillMs: refillAt ? Math.max(0, refillAt.getTime() - Date.now()) : null,
    };
}

/** Promotes an expired plan, refills a due window, then returns the window. */
export async function checkCredit(userId) {
    await promoteIfExpired(userId);
    const account = await refreshWindow(userId);
    return windowState(account);
}

/**
 * Records one AI request and deducts its credits atomically.
 * @returns {{ duplicate: boolean, creditsDeducted: number, account }}
 */
export async function recordUsage(userId, usage) {
    await promoteIfExpired(userId);

    return db.transaction(async (tx) => {
        const account = await refreshWindow(userId, tx);
        const limits = getTierLimits(account.tier);
        const creditsDeducted = creditsForTokens(usage.totalTokens);

        const [event] = await tx.insert(usageEvents).values({
            userId,
            requestId: usage.requestId,
            provider: usage.provider,
            modelId: usage.modelId,
            agentType: usage.agentType,
            projectId: usage.projectId,
            chatId: usage.chatId,
            tier: account.tier,
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
            creditsDeducted,
        }).onConflictDoNothing({ target: [usageEvents.userId, usageEvents.requestId] }).returning();

        if (!event) {
            return { duplicate: true, creditsDeducted: 0, account };
        }

        // All right-hand sides read the OLD row values, so the "crossed the
        // lower limit" test compares before and after in one statement.
        const after = sql`greatest(0, ${accounts.windowCreditsRemaining} - ${creditsDeducted})`;
        const crossed = sql`${accounts.windowCreditsRemaining} >= ${limits.creditLowerLimit} and ${after} < ${limits.creditLowerLimit}`;
        const [updated] = await tx.update(accounts).set({
            windowCreditsRemaining: after,
            windowExhaustedAt: sql`case when ${crossed} then now() else ${accounts.windowExhaustedAt} end`,
            windowRefillAt: sql`case when ${crossed} then now() + make_interval(hours => ${limits.windowHours}) else ${accounts.windowRefillAt} end`,
        }).where(eq(accounts.userId, userId)).returning();

        return { duplicate: false, creditsDeducted, account: updated, event };
    });
}
