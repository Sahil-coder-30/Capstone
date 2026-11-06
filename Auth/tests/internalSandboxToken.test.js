// Offline test of POST /internal/sandbox-token: the shared-token guard and
// the short, scoped sandbox token it issues for the router.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.RSA_PRIVATE_KEY = privateKey.export({ type: 'pkcs1', format: 'pem' });
process.env.INTERNAL_SERVICE_TOKEN = 'internal-secret';

const User = (await import('../src/models/user.model.js')).default;
const knownUser = '65f0c0ffee0000000000abcd';
User.exists = async ({ _id }) => (_id === knownUser ? { _id } : null);

const { requireInternalCaller } = await import('../src/middleware/internalAuth.middleware.js');
const { internalSandboxTokenController } = await import('../src/controllers/internalSandboxToken.controller.js');

const fakeRes = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
});

const guard = (token) => {
    const res = fakeRes();
    let passed = false;
    requireInternalCaller({ headers: token === undefined ? {} : { 'x-internal-token': token } }, res, () => { passed = true; });
    return { passed, status: res.statusCode };
};

const mint = async (body) => {
    const res = fakeRes();
    await internalSandboxTokenController({ body }, res, (err) => { throw err; });
    return res;
};

test('only callers with the shared internal token pass', () => {
    assert.equal(guard('internal-secret').passed, true);
    assert.equal(guard('wrong').status, 401);
    assert.equal(guard(undefined).status, 401);

    const saved = process.env.INTERNAL_SERVICE_TOKEN;
    process.env.INTERNAL_SERVICE_TOKEN = '';
    assert.equal(guard('').status, 503, 'fails closed when not configured');
    process.env.INTERNAL_SERVICE_TOKEN = saved;
});

test('issues a short token with the requested scopes for one sandbox', async () => {
    const res = await mint({ userId: knownUser, sandboxId: 'sbx-1', scopes: ['read', 'write'], ttlSeconds: 300 });
    assert.equal(res.statusCode, 200);
    const claims = jwt.verify(res.body.token, publicKey, { algorithms: ['RS256'], audience: 'taksha-sandbox' });
    assert.equal(claims.sub, knownUser);
    assert.equal(claims.sbx, 'sbx-1');
    assert.equal(claims.scope, 'read write');
    assert.ok(claims.exp - claims.iat === 300);
});

test('rejects bad input and unknown users', async () => {
    const base = { userId: knownUser, sandboxId: 'sbx-1', scopes: ['read'] };
    for (const body of [
        { ...base, userId: 'not-an-id' },
        { ...base, sandboxId: 'x@10.0.0.1' },
        { ...base, scopes: [] },
        { ...base, scopes: ['admin'] },
        { ...base, ttlSeconds: 7200 },
        { ...base, ttlSeconds: 5 },
    ]) {
        assert.equal((await mint(body)).statusCode, 400, JSON.stringify(body));
    }
    assert.equal((await mint({ ...base, userId: '65f0c0ffee0000000000ffff' })).statusCode, 404);
});
