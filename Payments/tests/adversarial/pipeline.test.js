/**
 * Adversarial edge-case tests for the Payments pipeline.
 *
 * Every test asserts the behaviour we want. They were written to break the
 * pipeline (2026-11-09) and now guard the fixes as regression tests. Uses the same local harness as the main suite:
 * local Postgres (docker compose), fake JWKS, synthetic Razorpay. No network
 * call reaches a real payment provider.
 *
 * Part of `npm test`.
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
    DAY, api, buy, newUserId, resetDb, signWebhook, startHarness, stopHarness, tokenFor,
} from '../helpers.js';

let sql;
before(async () => { ({ sql } = await startHarness()); });
after(stopHarness);
beforeEach(resetDb);

const rand = () => crypto.randomBytes(6).toString('hex');
const subscription = async (token) => (await api('GET', '/api/payments/subscription', { token })).body.data;
const daysLeft = (date) => (new Date(date).getTime() - Date.now()) / DAY;

async function newOrder(token, packageId = 'pro_regular') {
    const r = await api('POST', '/api/payments/create/order', { token, body: { packageId } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body.data;
}

function webhookPayload(event, entity) {
    return { entity: 'event', event, payload: { payment: { entity } } };
}

async function sendWebhook(payload, { signature, contentType = 'application/json', rawOverride } = {}) {
    const signed = signWebhook(payload);
    return api('POST', '/api/payments/webhook', {
        raw: rawOverride ?? signed.raw,
        headers: {
            'content-type': contentType,
            ...(signature === null ? {} : { 'x-razorpay-signature': signature ?? signed.signature }),
        },
    });
}

const captured = (orderId, paymentId, extra = {}) => ({
    id: paymentId, order_id: orderId, amount: 49_900, currency: 'INR', status: 'captured', method: 'upi', ...extra,
});

const count = async (table, where = sql`true`) => (await sql`select count(*)::int as n from ${sql(table)} where ${where}`)[0].n;

// ── 1. Webhook signature ──────────────────────────────────────────────────────

test('W1 webhook with a wrong signature is rejected and writes nothing', async () => {
    const token = tokenFor(newUserId());
    const order = await newOrder(token);
    const r = await sendWebhook(webhookPayload('payment.captured', captured(order.orderId, `pay_${rand()}`)), { signature: 'a'.repeat(64) });
    assert.equal(r.status, 400);
    assert.equal(await count('payments'), 0);
});

test('W2 webhook with no signature header is rejected', async () => {
    const token = tokenFor(newUserId());
    const order = await newOrder(token);
    const r = await sendWebhook(webhookPayload('payment.captured', captured(order.orderId, `pay_${rand()}`)), { signature: null });
    assert.equal(r.status, 400);
    assert.equal(await count('payments'), 0);
});

test('W3 tampered body (amount bumped after signing) is rejected', async () => {
    const token = tokenFor(newUserId());
    const order = await newOrder(token);
    const payload = webhookPayload('payment.captured', captured(order.orderId, `pay_${rand()}`, { amount: 100 }));
    const { signature } = signWebhook(payload);
    payload.payload.payment.entity.amount = 49_900;
    const r = await sendWebhook(payload, { signature });
    assert.equal(r.status, 400);
    assert.equal(await count('payments'), 0);
});

test('W4 garbage signatures (short, uppercase hex, unicode) give 400, never 500', async () => {
    const token = tokenFor(newUserId());
    const order = await newOrder(token);
    const payload = webhookPayload('payment.captured', captured(order.orderId, `pay_${rand()}`));
    const good = signWebhook(payload).signature;
    // (A trailing space is stripped by HTTP itself, so it is not tested.)
    for (const sig of ['x', good.toUpperCase(), 'é'.repeat(64), `${good}${good}`]) {
        const r = await sendWebhook(payload, { signature: sig });
        assert.equal(r.status, 400, `signature ${JSON.stringify(sig)} gave ${r.status}`);
    }
    assert.equal(await count('payments'), 0);
});

test('W5 correctly signed body sent as text/plain is rejected, nothing written', async () => {
    const token = tokenFor(newUserId());
    const order = await newOrder(token);
    const r = await sendWebhook(webhookPayload('payment.captured', captured(order.orderId, `pay_${rand()}`)), { contentType: 'text/plain' });
    assert.ok(r.status >= 400 && r.status < 500, `got ${r.status}`);
    assert.equal(await count('payments'), 0);
});

// ── 2. Idempotency and replays ────────────────────────────────────────────────

test('I1 the same payment.captured webhook replayed 5 times settles once', async () => {
    const userId = newUserId();
    const token = tokenFor(userId);
    const order = await newOrder(token);
    const payload = webhookPayload('payment.captured', captured(order.orderId, `pay_${rand()}`));
    for (let i = 0; i < 5; i++) assert.equal((await sendWebhook(payload)).status, 200);
    assert.equal(await count('payments'), 1);
    assert.equal(await count('invoices'), 1);
    const sub = await subscription(token);
    assert.ok(Math.abs(daysLeft(sub.activeSlot.validUntil) - 30) < 0.01);
});

test('I2 the same webhook fired 10 times in parallel settles once', async () => {
    const token = tokenFor(newUserId());
    const order = await newOrder(token);
    const payload = webhookPayload('payment.captured', captured(order.orderId, `pay_${rand()}`));
    const results = await Promise.all(Array.from({ length: 10 }, () => sendWebhook(payload)));
    assert.deepEqual(results.map((r) => r.status), Array(10).fill(200));
    assert.equal(await count('payments'), 1);
    assert.equal(await count('invoices'), 1);
    assert.equal(await count('transactions', sql`type = 'SUBSCRIPTION_ACTIVATION'`), 1);
});

test('I3 /verify and webhook racing for the same payment settle once', async () => {
    const token = tokenFor(newUserId());
    const order = await newOrder(token);
    const paymentId = `pay_test_${rand()}`;
    const payload = webhookPayload('payment.captured', captured(order.orderId, paymentId));
    const [v, w1, w2] = await Promise.all([
        api('POST', '/api/payments/verify', { token, body: { orderId: order.orderId, paymentId, signature: 'test_sig' } }),
        sendWebhook(payload),
        sendWebhook(webhookPayload('order.paid', captured(order.orderId, paymentId))),
    ]);
    assert.equal(v.status, 200);
    assert.equal(w1.status, 200);
    assert.equal(w2.status, 200);
    assert.equal(await count('payments'), 1);
    const sub = await subscription(token);
    assert.ok(Math.abs(daysLeft(sub.activeSlot.validUntil) - 30) < 0.01);
});

test('I4 /verify replayed 10 times in parallel gives 30 days, not 300', async () => {
    const token = tokenFor(newUserId());
    const order = await newOrder(token);
    const body = { orderId: order.orderId, paymentId: `pay_test_${rand()}`, signature: 'test_sig' };
    const results = await Promise.all(Array.from({ length: 10 }, () => api('POST', '/api/payments/verify', { token, body })));
    const ok = results.filter((r) => r.body?.data?.status === 'success').length;
    const dup = results.filter((r) => r.body?.data?.status === 'already_processed').length;
    assert.equal(ok, 1);
    assert.equal(dup, 9);
    const sub = await subscription(token);
    assert.ok(Math.abs(daysLeft(sub.activeSlot.validUntil) - 30) < 0.01);
});

test('I5 a SECOND captured payment for an already paid order is recorded somewhere (double charge must be visible)', async () => {
    const token = tokenFor(newUserId());
    const order = await newOrder(token);
    const pay1 = `pay_${rand()}`;
    const pay2 = `pay_${rand()}`;
    assert.equal((await sendWebhook(webhookPayload('payment.captured', captured(order.orderId, pay1)))).status, 200);
    const r2 = await sendWebhook(webhookPayload('payment.captured', captured(order.orderId, pay2)));

    // The user's money was captured twice. Either the second payment is stored
    // (payments / transactions) so it can be refunded, or the webhook fails
    // loudly. Silently answering "received" and storing nothing loses ₹499.
    const traces = await count('payments', sql`id = ${pay2}`)
        + await count('transactions', sql`payment_id = ${pay2} or metadata->>'failedPaymentId' = ${pay2} or metadata::text like ${'%' + pay2 + '%'}`);
    assert.ok(traces > 0 || r2.status >= 500, `second payment ${pay2} vanished (webhook said ${r2.status} ${JSON.stringify(r2.body)})`);
});

test('I6 payment.failed webhook replayed 3 times logs one failure (and one email)', async () => {
    const token = tokenFor(newUserId());
    const order = await newOrder(token);
    const payload = webhookPayload('payment.failed', captured(order.orderId, `pay_${rand()}`, { status: 'failed', error_description: 'Bank declined' }));
    for (let i = 0; i < 3; i++) assert.equal((await sendWebhook(payload)).status, 200);
    assert.equal(await count('transactions', sql`type = 'PAYMENT_FAILED'`), 1);
});

test('I7 a late payment.failed (old attempt) after the order is paid does not log a failure / send "payment failed"', async () => {
    const token = tokenFor(newUserId());
    const order = await newOrder(token);
    await sendWebhook(webhookPayload('payment.captured', captured(order.orderId, `pay_${rand()}`)));
    await sendWebhook(webhookPayload('payment.failed', captured(order.orderId, `pay_${rand()}`, { status: 'failed', error_description: 'UPI timeout' })));
    assert.equal(await count('transactions', sql`type = 'PAYMENT_FAILED'`), 0);
});

// ── 3. Concurrency ────────────────────────────────────────────────────────────

test('C1 five Pro purchases settled in parallel give exactly 150 days and 5 unique invoices', async () => {
    const userId = newUserId();
    const token = tokenFor(userId);
    const orders = [];
    for (let i = 0; i < 5; i++) orders.push(await newOrder(token));
    const results = await Promise.all(orders.map((o) => api('POST', '/api/payments/verify', {
        token, body: { orderId: o.orderId, paymentId: `pay_test_${rand()}`, signature: 'test_sig' },
    })));
    assert.deepEqual(results.map((r) => r.status), Array(5).fill(200));
    const sub = await subscription(token);
    assert.ok(Math.abs(daysLeft(sub.activeSlot.validUntil) - 150) < 0.05, `got ${daysLeft(sub.activeSlot.validUntil)} days`);
    const inv = await sql`select distinct invoice_number from invoices`;
    assert.equal(inv.length, 5);
});

test('C2 Pro and Max paid at the same moment: Max active, Pro queued, no day lost', async () => {
    const token = tokenFor(newUserId());
    const pro = await newOrder(token, 'pro_regular');
    const max = await newOrder(token, 'max_regular');
    await Promise.all([
        api('POST', '/api/payments/verify', { token, body: { orderId: pro.orderId, paymentId: `pay_test_${rand()}`, signature: 'test_sig' } }),
        api('POST', '/api/payments/verify', { token, body: { orderId: max.orderId, paymentId: `pay_test_${rand()}`, signature: 'test_sig' } }),
    ]);
    const sub = await subscription(token);
    assert.equal(sub.activeTier, 'max');
    assert.ok(Math.abs(daysLeft(sub.activeSlot.validUntil) - 30) < 0.05);
    assert.equal(sub.reservedSlots.length, 1);
    assert.equal(sub.reservedSlots[0].tier, 'pro');
    assert.ok(sub.reservedSlots[0].daysRemaining >= 30, `pro kept ${sub.reservedSlots[0].daysRemaining} days`);
});

test('C3 the same usage requestId posted 10 times in parallel is charged once', async () => {
    const token = tokenFor(newUserId());
    const body = { requestId: 'req-dup-1', provider: 'nvidia', promptTokens: 3000, completionTokens: 2000 };
    const results = await Promise.all(Array.from({ length: 10 }, () => api('POST', '/api/payments/credit/update', { token, body })));
    assert.deepEqual(results.map((r) => r.status), Array(10).fill(200));
    assert.equal(await count('usage_events'), 1);
    const check = await api('GET', '/api/payments/credit/check', { token });
    assert.equal(check.body.creditsRemaining, 15);
});

test('C4 40 different usage events in parallel: no lost update, balance never below 0', async () => {
    const userId = newUserId();
    const token = tokenFor(userId);
    await api('GET', '/api/payments/credit/check', { token });
    const results = await Promise.all(Array.from({ length: 40 }, (_, i) => api('POST', '/api/payments/credit/update', {
        token, body: { requestId: `r-${i}`, provider: 'nvidia', promptTokens: 250, completionTokens: 0 },
    })));
    assert.deepEqual(results.map((r) => r.status), Array(40).fill(200));
    const [acc] = await sql`select window_credits_remaining::float as rem from accounts where user_id = ${userId}`;
    assert.equal(acc.rem, 10, '20 - 40 * 0.25 = 10');
    assert.equal(await count('usage_events'), 40);
});

// ── 4. Amounts ────────────────────────────────────────────────────────────────

test('A1 client-sent amounts on create/order are ignored (price comes from the server)', async () => {
    const token = tokenFor(newUserId());
    for (const amount of [-1, 0, 1, 1e15, 'NaN']) {
        const r = await api('POST', '/api/payments/create/order', { token, body: { packageId: 'pro_regular', amount, amountPaise: amount } });
        assert.equal(r.status, 201);
        assert.equal(r.body.data.amount, 49_900);
    }
});

test('A2 junk packageIds are rejected with 400', async () => {
    const token = tokenFor(newUserId());
    for (const packageId of ['free', '', '__proto__', 'constructor', 'toString', { id: 'pro_regular' }, null, 'pro_early_access']) {
        const r = await api('POST', '/api/payments/create/order', { token, body: { packageId } });
        assert.equal(r.status, 400, `packageId ${JSON.stringify(packageId)} gave ${r.status}`);
    }
    assert.equal(await count('orders'), 0);
});

test('A3 webhook paying less than the order price grants nothing', async () => {
    const token = tokenFor(newUserId());
    const order = await newOrder(token);
    const r = await sendWebhook(webhookPayload('payment.captured', captured(order.orderId, `pay_${rand()}`, { amount: 100 })));
    assert.equal(r.status, 400);
    assert.equal(await count('payments'), 0);
    assert.equal((await subscription(token)).activeTier, 'free');
});

test('A4 webhook with zero / negative amount grants nothing', async () => {
    const token = tokenFor(newUserId());
    const order = await newOrder(token);
    for (const amount of [0, -49_900, null]) {
        const r = await sendWebhook(webhookPayload('payment.captured', captured(order.orderId, `pay_${rand()}`, { amount })));
        assert.equal(r.status, 400, `amount ${amount} gave ${r.status}`);
    }
    assert.equal(await count('payments'), 0);
});

test('A5 webhook with the amount field missing is a clean 4xx, not a 500 crash', async () => {
    const token = tokenFor(newUserId());
    const order = await newOrder(token);
    const entity = captured(order.orderId, `pay_${rand()}`);
    delete entity.amount;
    const r = await sendWebhook(webhookPayload('payment.captured', entity));
    assert.ok(r.status >= 400 && r.status < 500, `got ${r.status} ${JSON.stringify(r.body)}`);
    assert.equal(await count('payments'), 0);
});

test('A6 webhook with a huge amount (1e19 paise) is a clean 4xx, not a 500 crash', async () => {
    const token = tokenFor(newUserId());
    const order = await newOrder(token);
    const r = await sendWebhook(webhookPayload('payment.captured', captured(order.orderId, `pay_${rand()}`, { amount: 1e19 })));
    assert.ok(r.status >= 400 && r.status < 500, `got ${r.status}`);
});

test('A7 webhook amount sent as a string "49900" is handled like a number', async () => {
    const token = tokenFor(newUserId());
    const order = await newOrder(token);
    const r = await sendWebhook(webhookPayload('payment.captured', captured(order.orderId, `pay_${rand()}`, { amount: '49900' })));
    assert.equal(r.status, 200);
    const [p] = await sql`select amount_paise from payments`;
    assert.equal(Number(p.amount_paise), 49_900);
});

test('A8 overpayment (2x price) is flagged, not silently swallowed as a normal purchase', async () => {
    const token = tokenFor(newUserId());
    const order = await newOrder(token);
    await sendWebhook(webhookPayload('payment.captured', captured(order.orderId, `pay_${rand()}`, { amount: 99_800 })));
    const [t] = await sql`select metadata from transactions where type = 'SUBSCRIPTION_ACTIVATION'`;
    assert.ok(t && (t.metadata.overpaidPaise || t.metadata.overpayment), 'no overpayment marker on the transaction');
});

test('A9 credit/update with token counts above int32 is a clean 400, not a 500', async () => {
    const token = tokenFor(newUserId());
    const r = await api('POST', '/api/payments/credit/update', {
        token, body: { requestId: 'big-1', provider: 'nvidia', promptTokens: 3_000_000_000, completionTokens: 0 },
    });
    assert.equal(r.status, 400, `got ${r.status}`);
});

test('A10 credit/update with negative / NaN / Infinity / object tokens is 400', async () => {
    const token = tokenFor(newUserId());
    for (const v of [-1, 'abc', 'Infinity', '-0.5', { a: 1 }]) {
        const r = await api('POST', '/api/payments/credit/update', { token, body: { requestId: `x-${rand()}`, promptTokens: v } });
        assert.equal(r.status, 400, `promptTokens ${JSON.stringify(v)} gave ${r.status}`);
    }
    assert.equal(await count('usage_events'), 0);
});

test('A11 one giant usage event drains the window to exactly 0 and locks it', async () => {
    const userId = newUserId();
    const token = tokenFor(userId);
    const r = await api('POST', '/api/payments/credit/update', {
        token, body: { requestId: 'huge', provider: 'nvidia', promptTokens: 2_000_000_000, completionTokens: 0 },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.credit.creditsRemaining, 0);
    assert.equal(r.body.credit.canQuery, false);
});

// ── 5. Currency ───────────────────────────────────────────────────────────────

test('X1 webhook with a different currency (USD) for an INR order is rejected', async () => {
    const token = tokenFor(newUserId());
    const order = await newOrder(token);
    const r = await sendWebhook(webhookPayload('payment.captured', captured(order.orderId, `pay_${rand()}`, { currency: 'USD' })));
    assert.ok(r.status >= 400, `USD payment accepted with ${r.status}`);
    assert.equal(await count('payments'), 0);
});

// ── 6. AuthZ and ownership ────────────────────────────────────────────────────

test('Z1 user B cannot verify user A\'s order', async () => {
    const tokenA = tokenFor(newUserId());
    const tokenB = tokenFor(newUserId());
    const order = await newOrder(tokenA);
    const r = await api('POST', '/api/payments/verify', {
        token: tokenB, body: { orderId: order.orderId, paymentId: `pay_test_${rand()}`, signature: 'test_sig' },
    });
    assert.equal(r.status, 403);
    assert.equal(await count('payments'), 0);
});

test('Z2 a user cannot record usage against another account', async () => {
    const token = tokenFor(newUserId());
    const r = await api('POST', '/api/payments/credit/update', { token, body: { userId: newUserId(), requestId: 'z', promptTokens: 1 } });
    assert.equal(r.status, 403);
});

test('Z3 webhook for an unknown order does not write anything', async () => {
    const r = await sendWebhook(webhookPayload('payment.captured', captured('order_does_not_exist', `pay_${rand()}`)));
    assert.equal(r.status, 200);
    assert.equal(await count('payments'), 0);
});

test('Z4 with Redis down, money routes fail closed (503) instead of skipping the logout blacklist', async () => {
    // Test env points Redis at port 1, so Redis is unreachable here.
    const token = tokenFor(newUserId());
    process.env.AUTH_BLACKLIST_FAIL_CLOSED = 'true';
    try {
        const r = await api('POST', '/api/payments/create/order', { token, body: { packageId: 'pro_regular' } });
        assert.equal(r.status, 503, `blacklist skipped, order created with ${r.status}`);
        const verify = await api('POST', '/api/payments/verify', { token, body: { orderId: 'o', paymentId: 'p', signature: 's' } });
        assert.equal(verify.status, 503);
        const read = await api('GET', '/api/payments/subscription', { token });
        assert.equal(read.status, 200, 'reads should stay available');
        const usage = await api('POST', '/api/payments/credit/update', { token, body: { requestId: 'z4', promptTokens: 10 } });
        assert.equal(usage.status, 200, 'usage recording stays open so billing is not lost');
    } finally {
        process.env.AUTH_BLACKLIST_FAIL_CLOSED = 'false';
    }
});

test('Z5 verify with a bad checkout signature is rejected even for a test payment id', async () => {
    const token = tokenFor(newUserId());
    const order = await newOrder(token);
    const r = await api('POST', '/api/payments/verify', {
        token, body: { orderId: order.orderId, paymentId: `pay_test_${rand()}`, signature: 'deadbeef' },
    });
    assert.equal(r.status, 400);
    assert.equal(await count('payments'), 0);
});

test('Z6 verify with orderId / paymentId as objects or arrays is a 400', async () => {
    const token = tokenFor(newUserId());
    const order = await newOrder(token);
    for (const body of [
        { orderId: { $ne: null }, paymentId: 'pay_test_x', signature: 'test_x' },
        { orderId: [order.orderId], paymentId: 'pay_test_x', signature: 'test_x' },
        { orderId: order.orderId, paymentId: ['pay_test_x'], signature: 'test_x' },
    ]) {
        const r = await api('POST', '/api/payments/verify', { token, body });
        assert.ok(r.status >= 400 && r.status < 500, `${JSON.stringify(body)} gave ${r.status}`);
    }
    assert.equal(await count('payments'), 0);
});

// ── 7. Partial failures (DB fault injected with a trigger, local test DB only) ─

test('P1 a DB failure halfway through settling rolls back fully, and a retry then succeeds', async () => {
    const token = tokenFor(newUserId());
    const order = await newOrder(token);
    await sql.unsafe(`
        create or replace function boom() returns trigger language plpgsql as $$ begin raise exception 'injected failure'; end $$;
        create trigger boom_invoices before insert on invoices for each row execute function boom();
    `);
    const body = { orderId: order.orderId, paymentId: `pay_test_${rand()}`, signature: 'test_sig' };
    try {
        const r1 = await api('POST', '/api/payments/verify', { token, body });
        assert.equal(r1.status, 500);
        assert.equal(await count('payments'), 0, 'payment row survived a failed transaction');
        assert.equal(await count('subscription_slots'), 0, 'slot survived a failed transaction');
    } finally {
        await sql.unsafe('drop trigger if exists boom_invoices on invoices; drop function if exists boom();');
    }
    const r2 = await api('POST', '/api/payments/verify', { token, body });
    assert.equal(r2.body.data.status, 'success');
    assert.equal((await subscription(token)).activeTier, 'pro');
});

test('P2 webhook hitting a DB failure returns 5xx so Razorpay retries', async () => {
    const token = tokenFor(newUserId());
    const order = await newOrder(token);
    await sql.unsafe(`
        create or replace function boom() returns trigger language plpgsql as $$ begin raise exception 'injected failure'; end $$;
        create trigger boom_tx before insert on transactions for each row execute function boom();
    `);
    const payload = webhookPayload('payment.captured', captured(order.orderId, `pay_${rand()}`));
    try {
        const r = await sendWebhook(payload);
        assert.ok(r.status >= 500, `got ${r.status}`);
    } finally {
        await sql.unsafe('drop trigger if exists boom_tx on transactions; drop function if exists boom();');
    }
    assert.equal((await sendWebhook(payload)).status, 200);
    assert.equal(await count('payments'), 1);
});

// ── 8. Refunds ────────────────────────────────────────────────────────────────

test('R1 a refund webhook is at least recorded (plan revoked or payment marked refunded)', async () => {
    const token = tokenFor(newUserId());
    const order = await newOrder(token);
    const paymentId = `pay_${rand()}`;
    await sendWebhook(webhookPayload('payment.captured', captured(order.orderId, paymentId)));
    await sendWebhook({
        entity: 'event', event: 'refund.processed',
        payload: {
            refund: { entity: { id: `rfnd_${rand()}`, payment_id: paymentId, amount: 49_900, currency: 'INR', status: 'processed' } },
            payment: { entity: captured(order.orderId, paymentId, { status: 'refunded', amount_refunded: 49_900 }) },
        },
    });
    const [p] = await sql`select status from payments where id = ${paymentId}`;
    const sub = await subscription(token);
    assert.ok(p.status === 'refunded' || sub.activeTier === 'free', `payment still ${p.status}, tier still ${sub.activeTier}`);
});

async function refund(orderId, paymentId, { refundId = `rfnd_${rand()}`, amount = 49_900, paymentAmount = 49_900 } = {}) {
    return sendWebhook({
        entity: 'event', event: 'refund.processed',
        payload: {
            refund: { entity: { id: refundId, payment_id: paymentId, amount, currency: 'INR', status: 'processed' } },
            payment: { entity: captured(orderId, paymentId, { amount: paymentAmount, status: 'refunded', amount_refunded: amount }) },
        },
    });
}

test('R2 the same refund webhook replayed 3 times is applied once', async () => {
    const token = tokenFor(newUserId());
    const order = await newOrder(token);
    const paymentId = `pay_${rand()}`;
    await sendWebhook(webhookPayload('payment.captured', captured(order.orderId, paymentId)));
    for (let i = 0; i < 3; i++) assert.equal((await refund(order.orderId, paymentId, { refundId: 'rfnd_same' })).status, 200);
    assert.equal(await count('transactions', sql`type = 'PAYMENT_REFUNDED'`), 1);
    assert.equal((await subscription(token)).activeTier, 'free');
});

test('R3 refunding the Max upgrade brings back the queued Pro with its days', async () => {
    const userId = newUserId();
    const token = tokenFor(userId);
    await buy(token, 'pro_regular');
    await sql`update subscription_slots set valid_until = now() + interval '12 days' where user_id = ${userId} and status = 'active'`;
    const maxOrder = await newOrder(token, 'max_regular');
    const maxPay = `pay_${rand()}`;
    await sendWebhook(webhookPayload('payment.captured', captured(maxOrder.orderId, maxPay, { amount: 99_900 })));
    assert.equal((await subscription(token)).activeTier, 'max');

    await refund(maxOrder.orderId, maxPay, { amount: 99_900, paymentAmount: 99_900 });
    const sub = await subscription(token);
    assert.equal(sub.activeTier, 'pro');
    assert.ok(Math.abs(daysLeft(sub.activeSlot.validUntil) - 12) < 0.01);
    const check = await api('GET', '/api/payments/credit/check', { token });
    assert.equal(check.body.subscription, 'pro');
});

test('R4 a partial refund is logged but keeps the plan; the rest of the refund then revokes it', async () => {
    const token = tokenFor(newUserId());
    const order = await newOrder(token);
    const paymentId = `pay_${rand()}`;
    await sendWebhook(webhookPayload('payment.captured', captured(order.orderId, paymentId)));
    await refund(order.orderId, paymentId, { amount: 10_000 });
    assert.equal((await subscription(token)).activeTier, 'pro');
    await refund(order.orderId, paymentId, { amount: 39_900 });
    assert.equal((await subscription(token)).activeTier, 'free');
    assert.equal(await count('transactions', sql`type = 'PAYMENT_REFUNDED'`), 2);
});

test('R5 refunding an extension takes back only those 30 days', async () => {
    const token = tokenFor(newUserId());
    await buy(token, 'pro_regular');
    const order = await newOrder(token);
    const paymentId = `pay_${rand()}`;
    await sendWebhook(webhookPayload('payment.captured', captured(order.orderId, paymentId)));
    assert.ok(Math.abs(daysLeft((await subscription(token)).activeSlot.validUntil) - 60) < 0.01);
    await refund(order.orderId, paymentId);
    const sub = await subscription(token);
    assert.equal(sub.activeTier, 'pro');
    assert.ok(Math.abs(daysLeft(sub.activeSlot.validUntil) - 30) < 0.01);
});

test('R6 refund for a payment we never saw is a 200 and writes nothing', async () => {
    const r = await refund('order_x', 'pay_never_seen');
    assert.equal(r.status, 200);
    assert.equal(await count('transactions'), 0);
});

test('I8 duplicate payment replayed is logged once, and /verify reports it', async () => {
    const token = tokenFor(newUserId());
    const order = await newOrder(token);
    await api('POST', '/api/payments/verify', { token, body: { orderId: order.orderId, paymentId: `pay_test_${rand()}`, signature: 'test_sig' } });
    const dupId = `pay_test_${rand()}`;
    const v = await api('POST', '/api/payments/verify', { token, body: { orderId: order.orderId, paymentId: dupId, signature: 'test_sig' } });
    assert.equal(v.body.data.status, 'duplicate_payment');
    await sendWebhook(webhookPayload('payment.captured', captured(order.orderId, dupId)));
    assert.equal(await count('transactions', sql`type = 'PAYMENT_DUPLICATE'`), 1);
    const sub = await subscription(token);
    assert.ok(Math.abs(daysLeft(sub.activeSlot.validUntil) - 30) < 0.01, 'duplicate must not add days');
});

// ── 9. Synthetic payment safety ───────────────────────────────────────────────

test('S1 synthetic (fake) payments are impossible outside NODE_ENV=test', async () => {
    const { syntheticPaymentsAllowed } = await import('../../services/razorpay.service.js');
    const saved = process.env.NODE_ENV;
    try {
        for (const env of ['production', 'development', '', 'TEST', 'test ']) {
            process.env.NODE_ENV = env;
            assert.equal(syntheticPaymentsAllowed(), false, `allowed with NODE_ENV=${JSON.stringify(env)}`);
        }
    } finally {
        process.env.NODE_ENV = saved;
    }
});

// ── 10. Subscription time maths under replay ─────────────────────────────────

test('T1 Pro 15 days left -> buy Max -> Max ends -> Pro has 15 days back', async () => {
    const userId = newUserId();
    const token = tokenFor(userId);
    await buy(token, 'pro_regular');
    await sql`update subscription_slots set valid_until = now() + interval '15 days' where user_id = ${userId} and status = 'active'`;
    await buy(token, 'max_regular');
    await sql`update subscription_slots set valid_until = now() - interval '1 second' where user_id = ${userId} and status = 'active'`;
    const sub = await subscription(token);
    assert.equal(sub.activeTier, 'pro');
    assert.ok(Math.abs(daysLeft(sub.activeSlot.validUntil) - 15) < 0.01);
});

test('T2 everything expired: Max and queued Pro both run out while the user is away -> Free, not stuck', async () => {
    const userId = newUserId();
    const token = tokenFor(userId);
    await buy(token, 'pro_regular');
    await buy(token, 'max_regular');
    await sql`update subscription_slots set valid_until = now() - interval '1 second' where user_id = ${userId} and status = 'active'`;
    await sql`update subscription_slots set remaining_ms = 0 where user_id = ${userId} and status = 'queued'`;
    const sub = await subscription(token);
    assert.equal(sub.activeTier, 'free');
    const check = await api('GET', '/api/payments/credit/check', { token });
    assert.equal(check.body.subscription, 'free');
});

test('T3 a webhook paying an old order after a downgrade path still adds exactly 30 days to the right tier', async () => {
    const userId = newUserId();
    const token = tokenFor(userId);
    const proOrder = await newOrder(token, 'pro_regular');
    await buy(token, 'max_regular');
    await sendWebhook(webhookPayload('payment.captured', captured(proOrder.orderId, `pay_${rand()}`)));
    const sub = await subscription(token);
    assert.equal(sub.activeTier, 'max');
    assert.equal(sub.reservedSlots.length, 1);
    assert.equal(sub.reservedSlots[0].tier, 'pro');
    assert.equal(sub.reservedSlots[0].daysRemaining, 30);
});
