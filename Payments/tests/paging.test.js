// Pure unit test of the query helpers. Needs no database.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDateParam, parsePaging } from '../controllers/paging.js';

test('a date param that is not a date is a 400, not a database error', () => {
    assert.throws(() => parseDateParam('yesterday-ish', 'startDate'), (err) => err.statusCode === 400 && /startDate must be a date/.test(err.message));
});

test('a missing or empty date param is ignored', () => {
    assert.equal(parseDateParam(undefined, 'startDate'), undefined);
    assert.equal(parseDateParam('', 'endDate'), undefined);
});

test('a valid date param comes back as an ISO string', () => {
    assert.equal(parseDateParam('2026-11-01', 'startDate'), '2026-11-01T00:00:00.000Z');
});

test('paging stays inside its bounds', () => {
    assert.deepEqual(parsePaging({ page: '0', limit: '500' }), { page: 1, limit: 100 });
    assert.deepEqual(parsePaging({}), { page: 1, limit: 20 });
});
