// Offline test of the refresh cookie helpers. Uses a throwaway RSA key.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.RSA_PRIVATE_KEY = privateKey.export({ type: 'pkcs1', format: 'pem' });

const { setRefreshCookie, clearRefreshCookie, REFRESH_COOKIE_PATH } = await import('../src/utils/generateTokens.js');

const fakeRes = () => {
    const calls = [];
    return {
        calls,
        cookie: (name, value, opts) => calls.push({ op: 'set', name, value, path: opts.path, httpOnly: opts.httpOnly }),
        clearCookie: (name, opts) => calls.push({ op: 'clear', name, path: opts.path }),
    };
};

test('the refresh cookie is sent to /refresh and /logout', () => {
    assert.equal(REFRESH_COOKIE_PATH, '/api/auth');
    for (const route of ['/api/auth/refresh', '/api/auth/logout']) {
        assert.ok(route.startsWith(`${REFRESH_COOKIE_PATH}/`));
    }
});

test('setting the cookie removes the copy at the old path first', () => {
    const res = fakeRes();
    setRefreshCookie(res, 'abc');
    assert.deepEqual(res.calls, [
        { op: 'clear', name: 'refreshToken', path: '/api/auth/refresh' },
        { op: 'set', name: 'refreshToken', value: 'abc', path: '/api/auth', httpOnly: true },
    ]);
});

test('clearing removes the cookie at both paths', () => {
    const res = fakeRes();
    clearRefreshCookie(res);
    assert.deepEqual(res.calls.map((c) => c.path).sort(), ['/api/auth', '/api/auth/refresh']);
});
