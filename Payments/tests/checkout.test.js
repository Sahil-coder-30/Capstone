import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    DAY, api, buy, newUserId, resetDb, signWebhook, startHarness, stopHarness, tokenFor,
} from './helpers.js';

let sql;
before(async () => { ({ sql } = await startHarness()); });
after(stopHarness);
beforeEach(resetDb);

const subscription = async (token) => (await api('GET', '/api/payments/subscription', { token })).body.data;
const daysLeft = (date) => (new Date(date).getTime() - Date.now()) / DAY;

test('buying Pro activates it for 30 days, issues an invoice and a bigger window', async () => {
    const userId = newUserId();
    const token = tokenFor(userId);
    const { verify, orderId } = await buy(token, 'pro_regular');

    assert.equal(verify.status, 200);
    assert.equal(verify.body.data.status, 'success');
    assert.equal(verify.body.data.activeTier, 'pro');
    assert.equal(verify.body.data.transactionType, 'SUBSCRIPTION_ACTIVATION');
    assert.equal(verify.body.data.invoiceNumber, `TKS-${new Date().getFullYear()}-000001`);

    const sub = await subscription(token);
    assert.equal(sub.status, 'ACTIVE');
    assert.equal(sub.activeTier, 'pro');
    assert.ok(Math.abs(daysLeft(sub.activeSlot.validUntil) - 30) < 0.01);
    assert.equal(sub.activeSlot.daysRemaining, 30);

    const check = await api('GET', '/api/payments/credit/check', { token });
    assert.equal(check.body.subscription, 'pro');
    assert.equal(check.body.creditsRemaining, 150);

    const [order] = await sql`select status from orders where id = ${orderId}`;
    assert.equal(order.status, 'paid');
});

test('buying the same tier again adds 30 days', async () => {
    const token = tokenFor(newUserId());
    await buy(token, 'pro_regular');
    const { verify } = await buy(token, 'pro_regular');
    assert.equal(verify.body.data.transactionType, 'SUBSCRIPTION_EXTENSION');
    const sub = await subscription(token);
    assert.ok(Math.abs(daysLeft(sub.activeSlot.validUntil) - 60) < 0.01);
    assert.equal(sub.activeSlot.paidAmountPaise, 99_800);
});

test('upgrade keeps the old plan days, and they come back when the new plan ends', async () => {
    const userId = newUserId();
    const token = tokenFor(userId);
    await buy(token, 'pro_regular');
    // Pretend Pro has 12 days left.
    await sql`update subscription_slots set valid_until = now() + interval '12 days' where user_id = ${userId} and status = 'active'`;

    const { verify } = await buy(token, 'max_regular');
    assert.equal(verify.body.data.activeTier, 'max');
    assert.equal(verify.body.data.carriedDays, 12);
    assert.deepEqual(verify.body.data.reservedSlots, [{ tier: 'pro', remainingDays: 12 }]);

    let sub = await subscription(token);
    assert.equal(sub.activeTier, 'max');
    assert.equal(sub.reservedSlots.length, 1);
    assert.equal(sub.reservedSlots[0].tier, 'pro');
    assert.equal(sub.reservedSlots[0].daysRemaining, 12);
    assert.ok(Math.abs(daysLeft(sub.reservedSlots[0].validUntil) - 42) < 0.01, 'projected end = 30 + 12 days');

    // Max ends (pretend 40 days passed while Pro waited in the queue).
    await sql`update subscription_slots set valid_until = now() - interval '1 second' where user_id = ${userId} and status = 'active'`;

    sub = await subscription(token);
    assert.equal(sub.activeTier, 'pro');
    assert.equal(sub.reservedSlots.length, 0);
    assert.ok(Math.abs(daysLeft(sub.activeSlot.validUntil) - 12) < 0.01, 'Pro gets its 12 days back');

    const check = await api('GET', '/api/payments/credit/check', { token });
    assert.equal(check.body.subscription, 'pro');
    assert.equal(check.body.creditsRemaining, 150);

    const types = (await sql`select type from transactions where user_id = ${userId} order by created_at`).map((r) => r.type);
    assert.deepEqual(types, ['SUBSCRIPTION_ACTIVATION', 'SUBSCRIPTION_ACTIVATION', 'SUBSCRIPTION_PROMOTED']);
});

test('buying a lower tier while a higher one is active queues it', async () => {
    const userId = newUserId();
    const token = tokenFor(userId);
    await buy(token, 'max_regular');
    const { verify } = await buy(token, 'pro_regular');
    assert.equal(verify.body.data.transactionType, 'SUBSCRIPTION_QUEUED');
    assert.equal(verify.body.data.activeTier, 'max');

    const sub = await subscription(token);
    assert.equal(sub.reservedSlots[0].tier, 'pro');
    assert.equal(sub.reservedSlots[0].daysRemaining, 30);

    // Queued invoice has no service period yet.
    const [inv] = await sql`select period_start from invoices i join subscription_slots s on s.payment_id = i.payment_id where s.status = 'queued'`;
    assert.equal(inv.period_start, null);
});

test('plan expiry with nothing queued goes back to Free (nightly sweep)', async () => {
    const userId = newUserId();
    const token = tokenFor(userId);
    await buy(token, 'pro_regular');
    await sql`update subscription_slots set valid_until = now() - interval '1 second' where user_id = ${userId}`;

    const { runSlotPromotionSweep } = await import('../services/cron.service.js');
    const r = await runSlotPromotionSweep();
    assert.deepEqual(r, { found: 1, promoted: 1, failed: 0 });

    const [acc] = await sql`select tier, window_credits_total from accounts where user_id = ${userId}`;
    assert.equal(acc.tier, 'free');
    assert.equal(Number(acc.window_credits_total), 20);
    assert.equal((await subscription(token)).status, 'FREE');
});

test('the same payment from /verify and the webhook at once is applied once', async () => {
    const userId = newUserId();
    const token = tokenFor(userId);
    const order = await api('POST', '/api/payments/create/order', { token, body: { packageId: 'pro_regular' } });
    const orderId = order.body.data.orderId;
    const paymentId = 'pay_test_race01';

    const { raw, signature } = signWebhook({
        event: 'payment.captured',
        payload: { payment: { entity: { id: paymentId, order_id: orderId, amount: 49_900, currency: 'INR', status: 'captured', method: 'upi' } } },
    });

    const results = await Promise.all([
        api('POST', '/api/payments/verify', { token, body: { orderId, paymentId, signature: 'test_sig' } }),
        api('POST', '/api/payments/webhook', { raw, headers: { 'x-razorpay-signature': signature } }),
        api('POST', '/api/payments/verify', { token, body: { orderId, paymentId, signature: 'test_sig' } }),
    ]);
    results.forEach((r) => assert.equal(r.status, 200, JSON.stringify(r.body)));

    const [counts] = await sql`select
        (select count(*)::int from payments) as payments,
        (select count(*)::int from invoices) as invoices,
        (select count(*)::int from transactions) as txs,
        (select count(*)::int from subscription_slots) as slots`;
    assert.deepEqual({ ...counts }, { payments: 1, invoices: 1, txs: 1, slots: 1 });
});

test('cannot verify another user\'s order', async () => {
    const owner = tokenFor(newUserId());
    const order = await api('POST', '/api/payments/create/order', { token: owner, body: { packageId: 'pro_regular' } });

    const thief = tokenFor(newUserId());
    const res = await api('POST', '/api/payments/verify', {
        token: thief,
        body: { orderId: order.body.data.orderId, paymentId: 'pay_test_steal', signature: 'test_sig' },
    });
    assert.equal(res.status, 403);
    const [{ count }] = await sql`select count(*)::int from payments`;
    assert.equal(count, 0);
});

test('verify rejects missing fields, unknown orders and bad signatures', async () => {
    const token = tokenFor(newUserId());
    assert.equal((await api('POST', '/api/payments/verify', { token, body: { paymentId: 'pay_test_x' } })).status, 400);
    assert.equal((await api('POST', '/api/payments/verify', {
        token, body: { orderId: 'order_nope', paymentId: 'pay_test_x', signature: 'test_sig' },
    })).status, 404);

    const order = await api('POST', '/api/payments/create/order', { token, body: { packageId: 'pro_regular' } });
    const bad = await api('POST', '/api/payments/verify', {
        token, body: { orderId: order.body.data.orderId, paymentId: 'pay_test_x', signature: 'forged' },
    });
    assert.equal(bad.status, 400);
});

test('create order validates the package', async () => {
    const token = tokenFor(newUserId());
    assert.equal((await api('POST', '/api/payments/create/order', { token, body: { packageId: 'free' } })).status, 400);
    assert.equal((await api('POST', '/api/payments/create/order', { token, body: { packageId: 'gold' } })).status, 400);
    const ok = await api('POST', '/api/payments/create/order', { token, body: { packageId: 'max' } });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.data.amount, 99_900);
    assert.equal(ok.body.data.keyId, 'rzp_test_payments_suite');
});

test('webhook rejects a bad signature and records failed payments', async () => {
    const userId = newUserId();
    const token = tokenFor(userId);
    const order = await api('POST', '/api/payments/create/order', { token, body: { packageId: 'pro_regular' } });

    const forged = await api('POST', '/api/payments/webhook', {
        raw: JSON.stringify({ event: 'payment.captured' }),
        headers: { 'x-razorpay-signature': 'deadbeef' },
    });
    assert.equal(forged.status, 400);

    const { raw, signature } = signWebhook({
        event: 'payment.failed',
        payload: { payment: { entity: { id: 'pay_test_fail', order_id: order.body.data.orderId, amount: 49_900, error_description: 'Card declined' } } },
    });
    const res = await api('POST', '/api/payments/webhook', { raw, headers: { 'x-razorpay-signature': signature } });
    assert.equal(res.status, 200);

    const [tx] = await sql`select type, status, description from transactions where user_id = ${userId}`;
    assert.equal(tx.type, 'PAYMENT_FAILED');
    assert.equal(tx.status, 'FAILED');
    assert.match(tx.description, /Card declined/);
});

test('transactions and dashboard keep the payments_frontend fields', async () => {
    const userId = newUserId();
    const token = tokenFor(userId);
    const { paymentId, orderId } = await buy(token, 'pro_regular');

    const list = await api('GET', '/api/payments/transactions', { token });
    assert.equal(list.status, 200);
    const tx = list.body.data.transactions[0];
    assert.equal(tx.razorpay.paymentId, paymentId);
    assert.equal(tx.razorpay.orderId, orderId);
    assert.equal(tx.amountPaise, 49_900);
    assert.equal(tx.metadata.packageLabel, 'Taksha AI Pro');
    assert.ok(tx.metadata.slotValidUntil);
    assert.equal(tx.invoiceNumber, `TKS-${new Date().getFullYear()}-000001`);
    assert.equal(list.body.data.summary.totalSpentINR, 499);

    const one = await api('GET', `/api/payments/transactions/${tx._id}`, { token });
    assert.equal(one.body.data._id, tx._id);
    assert.equal((await api('GET', '/api/payments/transactions/not-a-uuid', { token })).status, 404);

    const other = tokenFor(newUserId());
    assert.equal((await api('GET', `/api/payments/transactions/${tx._id}`, { token: other })).status, 404);

    const dash = await api('GET', '/api/payments/dashboard/overview', { token });
    assert.equal(dash.status, 200);
    const d = dash.body.data;
    assert.deepEqual(Object.keys(d).sort(), ['analytics', 'credit', 'recentEvents', 'recentTransactions', 'subscription']);
    assert.equal(d.subscription.activeTier, 'pro');
    assert.equal(d.credit.windowCreditsRemaining, 150);
    assert.equal(d.recentTransactions.length, 1);
});
