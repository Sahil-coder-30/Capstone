/**
 * Test harness: local Postgres, a fake Auth JWKS server, synthetic Razorpay.
 *
 * Tests TRUNCATE every table, so they refuse to run against anything that
 * is not localhost. Start the database with `docker compose up -d`.
 */

import http from 'node:http';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const TEST_DB = process.env.TEST_DATABASE_URL || 'postgres://payments:payments_test@localhost:5433/payments_test';
const host = new URL(TEST_DB).hostname;
if (!['localhost', '127.0.0.1'].includes(host)) {
    throw new Error(`Refusing to run tests against non-local database host "${host}"`);
}

// Must be set before any app module is imported.
Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DB,
    DB_POOL_MAX: '5',
    TOKENS_PER_AI_CREDIT: '1000',
    RAZORPAY_KEY_ID: 'rzp_test_payments_suite',
    RAZORPAY_KEY_SECRET: 'test_key_secret',
    RAZORPAY_WEBHOOK_SECRET: 'test_webhook_secret',
    ALLOW_SYNTHETIC_PAYMENTS: 'true',
    RAZORPAY_FAKE_ORDERS: 'true',
    MQ_URL: 'amqp://127.0.0.1:1',
    REDIS_URI: 'redis://127.0.0.1:1',
});

const KID = 'test-kid-1';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

export function tokenFor(userId, extra = {}) {
    return jwt.sign(
        { sub: userId, id: userId, email: `${userId}@test.dev`, name: 'Test User', role: 'user', ...extra },
        privateKey,
        { algorithm: 'RS256', keyid: KID, issuer: 'auth.takshacodespace.in', audience: 'takshacodespace-services', expiresIn: '15m' },
    );
}

export const newUserId = () => crypto.randomBytes(12).toString('hex');

let jwksServer;
let appServer;
let baseUrl;
let sql;

export async function startHarness() {
    const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };
    jwksServer = http.createServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise((r) => jwksServer.listen(0, '127.0.0.1', r));
    process.env.AUTH_JWKS_URI = `http://127.0.0.1:${jwksServer.address().port}/.well-known/jwks.json`;

    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    const { db, sqlClient } = await import('../db/client.js');
    sql = sqlClient;
    await sql`drop schema if exists public cascade`;
    await sql`drop schema if exists drizzle cascade`;
    await sql`create schema public`;
    await migrate(db, { migrationsFolder: new URL('../db/migrations', import.meta.url).pathname });

    const app = (await import('../app/app.js')).default;
    appServer = app.listen(0, '127.0.0.1');
    await new Promise((r) => appServer.once('listening', r));
    baseUrl = `http://127.0.0.1:${appServer.address().port}`;
    return { sql };
}

export async function stopHarness() {
    await new Promise((r) => appServer.close(r));
    await new Promise((r) => jwksServer.close(r));
    const { closeDb } = await import('../db/client.js');
    await closeDb();
    const { closeMQ } = await import('../config/mq.js');
    await closeMQ();
    const { default: redis } = await import('../config/redis.js');
    redis.disconnect();
}

export async function resetDb() {
    await sql`truncate usage_events, transactions, invoices, subscription_slots, payments, orders, accounts restart identity cascade`;
    await sql`select setval('invoice_number_seq', 1, false)`;
}

export async function api(method, path, { token, body, headers = {}, raw } = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
            'content-type': 'application/json',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            ...headers,
        },
        body: raw ?? (body ? JSON.stringify(body) : undefined),
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json };
}

/** Creates an order and verifies it with a synthetic payment. */
export async function buy(token, packageId, paymentId = `pay_test_${crypto.randomBytes(6).toString('hex')}`) {
    const order = await api('POST', '/api/payments/create/order', { token, body: { packageId } });
    if (order.status !== 201) throw new Error(`create order failed: ${JSON.stringify(order.body)}`);
    const verify = await api('POST', '/api/payments/verify', {
        token,
        body: { orderId: order.body.data.orderId, paymentId, signature: 'test_signature' },
    });
    return { orderId: order.body.data.orderId, paymentId, verify };
}

export function signWebhook(payload) {
    const raw = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex');
    return { raw, signature };
}

export const DAY = 24 * 60 * 60 * 1000;
