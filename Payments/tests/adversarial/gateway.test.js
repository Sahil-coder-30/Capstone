/**
 * Adversarial tests for /verify when the Razorpay gateway misbehaves:
 * hangs, 5xx, 404, wrong order, wrong currency, capture failure.
 *
 * razorpay.service.js is replaced with a scripted fake (node:test module
 * mocks), so nothing ever reaches Razorpay.
 *
 * Part of `npm test` (needs --experimental-test-module-mocks).
 */

// Short gateway timeout so G1 does not wait the full production 10s.
process.env.RAZORPAY_TIMEOUT_MS ||= '3000';

import { test, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// What the fake gateway does on the next fetch/capture. Tests set this.
const gw = { fetch: null, capture: null };

mock.module('../../services/razorpay.service.js', {
    namedExports: {
        publicKeyId: () => 'rzp_test_fake',
        syntheticPaymentsAllowed: () => false,
        isSyntheticPaymentId: () => false,
        createOrder: async ({ amountPaise }) => ({ id: `order_${crypto.randomBytes(6).toString('hex')}`, amount: amountPaise, currency: 'INR' }),
        isCheckoutSignatureValid: ({ signature }) => signature === 'good',
        fetchPayment: async (paymentId, ctx) => gw.fetch(paymentId, ctx),
        capturePayment: async (payment) => gw.capture(payment),
        isWebhookSignatureValid: () => true,
    },
});

const { api, newUserId, resetDb, startHarness, stopHarness, tokenFor } = await import('../helpers.js');

let sql;
before(async () => { ({ sql } = await startHarness()); });
after(stopHarness);
beforeEach(async () => { await resetDb(); gw.fetch = null; gw.capture = null; });

const rand = () => crypto.randomBytes(6).toString('hex');
const count = async (table) => (await sql`select count(*)::int as n from ${sql(table)}`)[0].n;

async function setup() {
    const token = tokenFor(newUserId());
    const r = await api('POST', '/api/payments/create/order', { token, body: { packageId: 'pro_regular' } });
    assert.equal(r.status, 201);
    return { token, orderId: r.body.data.orderId, paymentId: `pay_${rand()}` };
}

const verify = (token, orderId, paymentId) =>
    api('POST', '/api/payments/verify', { token, body: { orderId, paymentId, signature: 'good' } });

const payment = (orderId, paymentId, extra = {}) => ({
    id: paymentId, order_id: orderId, amount: 49_900, currency: 'INR', status: 'captured', method: 'card', ...extra,
});

test('G1 Razorpay hanging forever: /verify answers within 15s instead of hanging', { timeout: 30_000 }, async () => {
    const { token, orderId, paymentId } = await setup();
    let release;
    gw.fetch = () => new Promise((resolve) => { release = () => resolve(payment(orderId, paymentId)); });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    let status = 'no answer in 15s';
    const pending = verify(token, orderId, paymentId);
    try {
        const r = await Promise.race([
            pending,
            new Promise((resolve) => ctrl.signal.addEventListener('abort', () => resolve(null))),
        ]);
        if (r) status = r.status;
    } finally {
        clearTimeout(timer);
        release?.();
        await pending; // let the stuck request finish so it does not race the next test's TRUNCATE
    }
    assert.notEqual(status, 'no answer in 15s', 'no gateway timeout: the request (and a DB-free worker slot) hangs as long as Razorpay does');
});

test('G2 Razorpay 5xx -> 503, nothing written', async () => {
    const { token, orderId, paymentId } = await setup();
    gw.fetch = async () => { const e = new Error('Bad gateway'); e.statusCode = 502; throw e; };
    const r = await verify(token, orderId, paymentId);
    assert.equal(r.status, 503);
    assert.equal(await count('payments'), 0);
});

test('G3 Razorpay 404 (payment id does not exist) -> 404, nothing written', async () => {
    const { token, orderId, paymentId } = await setup();
    gw.fetch = async () => { const e = new Error('not found'); e.statusCode = 404; throw e; };
    const r = await verify(token, orderId, paymentId);
    assert.equal(r.status, 404);
    assert.equal(await count('payments'), 0);
});

test('G4 payment that belongs to a different order is rejected', async () => {
    const { token, orderId, paymentId } = await setup();
    gw.fetch = async () => payment('order_someone_else', paymentId);
    const r = await verify(token, orderId, paymentId);
    assert.equal(r.status, 400);
    assert.equal(await count('payments'), 0);
});

test('G5 payment with NO order_id at all is rejected (cannot prove it paid this order)', async () => {
    const { token, orderId, paymentId } = await setup();
    gw.fetch = async () => payment(null, paymentId);
    const r = await verify(token, orderId, paymentId);
    assert.equal(r.status, 400, `got ${r.status}`);
    assert.equal(await count('payments'), 0);
});

test('G6 payment amount below price is rejected', async () => {
    const { token, orderId, paymentId } = await setup();
    gw.fetch = async () => payment(orderId, paymentId, { amount: 100 });
    const r = await verify(token, orderId, paymentId);
    assert.equal(r.status, 400);
    assert.equal(await count('payments'), 0);
});

test('G7 payment in a different currency (USD) is rejected', async () => {
    const { token, orderId, paymentId } = await setup();
    gw.fetch = async () => payment(orderId, paymentId, { currency: 'USD' });
    const r = await verify(token, orderId, paymentId);
    assert.equal(r.status, 400, `USD accepted with ${r.status}`);
    assert.equal(await count('payments'), 0);
});

test('G8 status failed / refunded / created is rejected', async () => {
    const { token, orderId } = await setup();
    for (const status of ['failed', 'refunded', 'created']) {
        const paymentId = `pay_${rand()}`;
        gw.fetch = async () => payment(orderId, paymentId, { status });
        const r = await verify(token, orderId, paymentId);
        assert.equal(r.status, 400, `${status} gave ${r.status}`);
    }
    assert.equal(await count('payments'), 0);
});

test('G9 authorized payment whose capture call fails -> 503 (retryable), nothing written', async () => {
    const { token, orderId, paymentId } = await setup();
    gw.fetch = async () => payment(orderId, paymentId, { status: 'authorized' });
    gw.capture = async () => { const e = new Error('upstream timeout'); e.statusCode = 504; throw e; };
    const r = await verify(token, orderId, paymentId);
    assert.equal(r.status, 503, `got ${r.status}`);
    assert.equal(await count('payments'), 0);
});

test('G10 capture that throws a non-HTTP error (network reset) is still a clean 5xx with nothing written', async () => {
    const { token, orderId, paymentId } = await setup();
    gw.fetch = async () => payment(orderId, paymentId, { status: 'authorized' });
    gw.capture = async () => { throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }); };
    const r = await verify(token, orderId, paymentId);
    assert.ok(r.status >= 500, `got ${r.status}`);
    assert.equal(await count('payments'), 0);
});

test('G11 authorized -> captured works and settles once', async () => {
    const { token, orderId, paymentId } = await setup();
    gw.fetch = async () => payment(orderId, paymentId, { status: 'authorized' });
    gw.capture = async (p) => ({ ...p, status: 'captured' });
    const r = await verify(token, orderId, paymentId);
    assert.equal(r.status, 200);
    assert.equal(r.body.data.activeTier, 'pro');
    assert.equal(await count('payments'), 1);
});
