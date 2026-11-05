// Offline test of the sandbox token endpoint. Uses a throwaway RSA key made
// here, never the real certs, and a stubbed Redis.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.RSA_PRIVATE_KEY = privateKey.export({ type: 'pkcs1', format: 'pem' });
process.env.REDIS_URI ||= 'redis://127.0.0.1:1';

const redis = (await import('../src/config/redis.js')).default;
const counts = new Map();
redis.incr = async (key) => counts.set(key, (counts.get(key) || 0) + 1).get(key);
redis.expire = async () => 1;
redis.disconnect();

const { sandboxTokenController } = await import('../src/controllers/sandboxToken.controller.js');

const call = async (body, userId = 'user-1') => {
    const res = {
        statusCode: 0,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(data) { this.body = data; return this; },
    };
    await sandboxTokenController({ body, user: { id: userId } }, res, (err) => { throw err; });
    return res;
};

test('issues a token bound to one user and one sandbox, with its own audience', async () => {
    const res = await call({ sandboxId: 'sbx-123' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.expiresIn, 7200);

    const claims = jwt.verify(res.body.token, publicKey, {
        algorithms: ['RS256'],
        issuer: 'auth.takshacodespace.in',
        audience: 'taksha-sandbox',
    });
    assert.equal(claims.sub, 'user-1');
    assert.equal(claims.sbx, 'sbx-123');
    assert.equal(jwt.decode(res.body.token, { complete: true }).header.kid, 'auth-rsa-v1');

    assert.throws(
        () => jwt.verify(res.body.token, publicKey, { algorithms: ['RS256'], audience: 'takshacodespace-services' }),
        /audience/,
        'other services must not accept a sandbox token',
    );
});

test('rejects sandbox ids that are not one DNS label', async () => {
    for (const sandboxId of [undefined, '', 'x@10.0.0.5', 'a:8080', 'UPPER', 'a.b', 42]) {
        assert.equal((await call({ sandboxId })).statusCode, 400, String(sandboxId));
    }
});

test('rate limits per user', async () => {
    let last;
    for (let i = 0; i < 31; i += 1) last = await call({ sandboxId: 'sbx-rate' }, 'user-rate');
    assert.equal(last.statusCode, 429);
    assert.equal((await call({ sandboxId: 'sbx-rate' }, 'user-other')).statusCode, 200);
});
