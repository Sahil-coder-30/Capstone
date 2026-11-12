import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { api, newUserId, resetDb, startHarness, stopHarness, tokenFor } from './helpers.js';

let sql;
before(async () => { ({ sql } = await startHarness()); });
after(stopHarness);
beforeEach(resetDb);

const usage = (token, body) => api('POST', '/api/payments/credit/update', { token, body });

test('first request creates a Free account with a 20 credit window', async () => {
    const token = tokenFor(newUserId());
    const res = await api('GET', '/api/payments/credit/check', { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.canQuery, true);
    assert.equal(res.body.hasCredit, true);
    assert.equal(res.body.subscription, 'free');
    assert.equal(res.body.creditsRemaining, 20);
    assert.equal(res.body.windowCreditsTotal, 20);
});

test('requests without a valid token are rejected', async () => {
    assert.equal((await api('GET', '/api/payments/credit/check')).status, 401);
    assert.equal((await api('GET', '/api/payments/credit/check', { token: 'not-a-jwt' })).status, 401);
});

test('usage deducts credits once per requestId', async () => {
    const token = tokenFor(newUserId());
    const body = { company: 'NVIDIA', modelId: 'qwen-coder', agentType: 'codingAgent', requestId: 'r1', promptTokens: 2000, completionTokens: 1000 };

    const first = await usage(token, body);
    assert.equal(first.status, 200);
    assert.equal(first.body.usage.creditsDeducted, 3);
    assert.equal(first.body.usage.company, 'nvidia');
    assert.equal(first.body.credit.creditsRemaining, 17);

    const retry = await usage(token, body);
    assert.equal(retry.status, 200);
    assert.equal(retry.body.usage.duplicate, true);
    assert.equal(retry.body.credit.creditsRemaining, 17);

    const [{ count }] = await sql`select count(*)::int from usage_events`;
    assert.equal(count, 1);
});

test('memory agent usage is recorded but paid by the platform', async () => {
    const token = tokenFor(newUserId());
    const body = { company: 'nvidia', agentType: 'memory', projectId: 'p1', chatId: 's1', requestId: 'mem_1', promptTokens: 1500, completionTokens: 500 };

    const res = await usage(token, body);
    assert.equal(res.status, 200);
    assert.equal(res.body.usage.creditsDeducted, 0);
    assert.equal(res.body.usage.creditsDiscounted, 2);
    assert.equal(res.body.credit.creditsRemaining, 20, 'the window is untouched');

    const [row] = await sql`select agent_type, project_id, chat_id, total_tokens, credits_deducted from usage_events`;
    assert.equal(row.agent_type, 'memory');
    assert.equal(row.project_id, 'p1');
    assert.equal(row.chat_id, 's1');
    assert.equal(row.total_tokens, 2000);
    assert.equal(Number(row.credits_deducted), 0);

    const list = await api('GET', '/api/payments/usage-events', { token });
    assert.equal(list.body.data.events[0].creditsDiscounted, 2);
    const stats = await api('GET', '/api/payments/usage-events/analytics?days=7', { token });
    assert.equal(stats.body.data.totals.totalCreditsDeducted, 0);
    assert.equal(stats.body.data.totals.totalCreditsDiscounted, 2);
});

test('window locks below the lower limit and refills lazily', async () => {
    const userId = newUserId();
    const token = tokenFor(userId);

    const res = await usage(token, { company: 'nvidia',requestId: 'big', totalTokens: 16_000 });
    assert.equal(res.body.credit.creditsRemaining, 4);
    assert.equal(res.body.credit.canQuery, false);
    const refillAt = new Date(res.body.credit.nextRefillAt).getTime();
    assert.ok(Math.abs(refillAt - (Date.now() + 5 * 3600_000)) < 60_000, 'refill about 5 hours out');

    await sql`update accounts set window_refill_at = now() - interval '1 minute' where user_id = ${userId}`;
    const check = await api('GET', '/api/payments/credit/check', { token });
    assert.equal(check.body.creditsRemaining, 20);
    assert.equal(check.body.canQuery, true);
    assert.equal(check.body.nextRefillAt, null);
});

test('credits never go below zero', async () => {
    const token = tokenFor(newUserId());
    const res = await usage(token, { company: 'nvidia',requestId: 'huge', totalTokens: 999_999 });
    assert.equal(res.status, 200);
    assert.equal(res.body.credit.creditsRemaining, 0);
});

test('cannot record usage for another user', async () => {
    const token = tokenFor(newUserId());
    const res = await usage(token, { userId: newUserId(), requestId: 'x', totalTokens: 10 });
    assert.equal(res.status, 403);
});

test('bad token counts are rejected', async () => {
    const token = tokenFor(newUserId());
    assert.equal((await usage(token, { requestId: 'a', promptTokens: -1 })).status, 400);
    assert.equal((await usage(token, { requestId: 'b', promptTokens: 10, completionTokens: 10, totalTokens: 5 })).status, 400);
});

test('GET /credit keeps the fields the Frontend reads', async () => {
    const token = tokenFor(newUserId());
    await usage(token, { company: 'nvidia', requestId: 'a', promptTokens: 300, completionTokens: 200 });
    const res = await api('GET', '/api/payments/credit', { token });
    assert.equal(res.status, 200);
    const c = res.body.credit;
    for (const key of ['subscription', 'credits', 'windowCreditsTotal', 'windowCreditsRemaining', 'totalTokens',
        'promptTokens', 'completionTokens', 'providerCredits', 'billing', 'tierConfig', 'canQuery']) {
        assert.ok(key in c, `missing ${key}`);
    }
    assert.equal(c.totalTokens, 500);
    assert.equal(c.providerCredits[0].company, 'nvidia');
    assert.equal(c.tierConfig.windowCredits, 20);
});

test('credit analytics, transactions and summary for the Frontend', async () => {
    const token = tokenFor(newUserId());
    await usage(token, { company: 'nvidia',agentType: 'copilot', requestId: 'a', totalTokens: 1000 });

    const analytics = await api('GET', '/api/payments/credit/analytics', { token });
    assert.equal(analytics.body.analytics.totals.totalTokens, 1000);
    assert.equal(analytics.body.analytics.byAgent.copilot.requestCount, 1);
    assert.equal(analytics.body.analytics.recentEvents.length, 1);

    const txs = await api('GET', '/api/payments/credit/transactions?page=1&limit=10', { token });
    assert.deepEqual(txs.body.pagination, { page: 1, limit: 10, total: 0, pages: 1 });

    const summary = await api('GET', '/api/payments/credit/transactions/summary', { token });
    assert.equal(summary.body.summary.totalTokensConsumed, 1000);
    assert.equal(summary.body.summary.totalAIRequests, 1);
    assert.equal(summary.body.summary.currentSubscription, 'free');
});

test('packages are public', async () => {
    const res = await api('GET', '/api/payments/credit/packages');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.packages.map((p) => p.id), ['free', 'pro_regular', 'max_regular']);
    assert.ok(!('planIdEnvKey' in res.body.packages[0]));
});

test('usage events list and analytics for payments_frontend', async () => {
    const token = tokenFor(newUserId());
    await usage(token, { company: 'nvidia', modelId: 'qwen-coder', agentType: 'codingAgent', requestId: 'req_abc', totalTokens: 1500 });
    await usage(token, { company: 'some-old-provider', modelId: 'gpt', agentType: 'copilot', requestId: 'req_def', totalTokens: 500 });

    const list = await api('GET', '/api/payments/usage-events?limit=1', { token });
    assert.equal(list.body.data.total, 2);
    assert.equal(list.body.data.totalPages, 2);
    assert.equal(list.body.data.events.length, 1);
    for (const key of ['_id', 'company', 'modelId', 'agentType', 'requestId', 'promptTokens', 'completionTokens', 'totalTokens', 'createdAt']) {
        assert.ok(key in list.body.data.events[0], `missing ${key}`);
    }

    const search = await api('GET', '/api/payments/usage-events?search=qwen', { token });
    assert.equal(search.body.data.total, 1);
    const byCompany = await api('GET', '/api/payments/usage-events?company=unknown', { token });
    assert.equal(byCompany.body.data.total, 1, 'unlisted providers are stored as unknown');

    const stats = await api('GET', '/api/payments/usage-events/analytics?days=7', { token });
    assert.equal(stats.body.data.totals.totalTokens, 2000);
    assert.equal(stats.body.data.totals.totalRequests, 2);
    assert.equal(stats.body.data.byProvider[0].company, 'nvidia');
    assert.equal(stats.body.data.timeline.length, 1);
});
