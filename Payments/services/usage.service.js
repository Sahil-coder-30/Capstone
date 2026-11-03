/**
 * Usage service: reads over `usage_events` for history, totals and charts.
 * Writes happen in credit.service.js (recordUsage).
 */

import { and, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { usageEvents } from '../db/schema.js';

const num = (v) => Number(v || 0);

function eventFilters(userId, { provider, agentType, search, startDate, endDate } = {}) {
    const where = [eq(usageEvents.userId, userId)];
    if (provider && provider !== 'all') where.push(eq(usageEvents.provider, provider));
    if (agentType && agentType !== 'all') where.push(eq(usageEvents.agentType, agentType));
    if (search) {
        const pattern = `%${String(search).replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
        where.push(or(ilike(usageEvents.requestId, pattern), ilike(usageEvents.modelId, pattern)));
    }
    if (startDate) where.push(gte(usageEvents.createdAt, new Date(startDate)));
    if (endDate) where.push(lte(usageEvents.createdAt, new Date(endDate)));
    return and(...where);
}

export async function listUsageEvents(userId, { page = 1, limit = 20, ...filters } = {}) {
    const where = eventFilters(userId, filters);
    const [rows, [{ total }]] = await Promise.all([
        db.select().from(usageEvents).where(where)
            .orderBy(desc(usageEvents.createdAt))
            .limit(limit).offset((page - 1) * limit),
        db.select({ total: sql`count(*)::int` }).from(usageEvents).where(where),
    ]);
    return { rows, total, page, totalPages: Math.ceil(total / limit) || 1 };
}

export async function recentUsageEvents(userId, limit = 5) {
    return db.select().from(usageEvents)
        .where(eq(usageEvents.userId, userId))
        .orderBy(desc(usageEvents.createdAt))
        .limit(limit);
}

const sums = {
    promptTokens: sql`coalesce(sum(${usageEvents.promptTokens}), 0)::bigint`,
    completionTokens: sql`coalesce(sum(${usageEvents.completionTokens}), 0)::bigint`,
    totalTokens: sql`coalesce(sum(${usageEvents.totalTokens}), 0)::bigint`,
    requestCount: sql`count(*)::int`,
    creditsDeducted: sql`coalesce(sum(${usageEvents.creditsDeducted}), 0)`,
};

const toTotals = (r = {}) => ({
    promptTokens: num(r.promptTokens),
    completionTokens: num(r.completionTokens),
    totalTokens: num(r.totalTokens),
    requestCount: num(r.requestCount),
    creditsDeducted: num(r.creditsDeducted),
});

/** Lifetime totals and per-provider totals for one user. */
export async function getUsageTotals(userId) {
    const [[all], byProvider] = await Promise.all([
        db.select(sums).from(usageEvents).where(eq(usageEvents.userId, userId)),
        db.select({ provider: usageEvents.provider, lastUsedAt: sql`max(${usageEvents.createdAt})`, ...sums })
            .from(usageEvents)
            .where(eq(usageEvents.userId, userId))
            .groupBy(usageEvents.provider)
            .orderBy(desc(sums.totalTokens)),
    ]);
    return {
        totals: toTotals(all),
        byProvider: byProvider.map((p) => ({ provider: p.provider, lastUsedAt: p.lastUsedAt, ...toTotals(p) })),
    };
}

/** Time series and breakdowns for the last `days` days. */
export async function getUsageAnalytics(userId, { days = 30 } = {}) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const where = and(eq(usageEvents.userId, userId), gte(usageEvents.createdAt, since));
    const day = sql`to_char(${usageEvents.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`;

    const [[all], timeline, byProvider, byAgent] = await Promise.all([
        db.select(sums).from(usageEvents).where(where),
        db.select({ date: day, ...sums }).from(usageEvents).where(where).groupBy(day).orderBy(day),
        db.select({ provider: usageEvents.provider, ...sums }).from(usageEvents).where(where)
            .groupBy(usageEvents.provider).orderBy(desc(sums.totalTokens)),
        db.select({ agentType: usageEvents.agentType, ...sums }).from(usageEvents).where(where)
            .groupBy(usageEvents.agentType).orderBy(desc(sums.totalTokens)),
    ]);

    return {
        days,
        totals: toTotals(all),
        timeline: timeline.map((t) => ({ date: t.date, ...toTotals(t) })),
        byProvider: byProvider.map((p) => ({ provider: p.provider, ...toTotals(p) })),
        byAgent: byAgent.map((a) => ({ agentType: a.agentType, ...toTotals(a) })),
    };
}
