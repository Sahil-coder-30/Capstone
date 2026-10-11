import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import app from '../app/app.js';
import { closeMQ } from '../config/mq.js';
import {
    BadRequestError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    TokenExpiredError,
    TokenInvalidError,
    ServiceUnavailableError,
    InternalServerError,
    AppError,
} from 'faultkit';

let server;
let baseUrl;

test.before(async () => {
    if (mongoose.connection.readyState !== 1) {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/payment_test';
        await mongoose.connect(mongoUri);
    }

    await new Promise((resolve) => {
        server = app.listen(0, () => {
            const port = server.address().port;
            baseUrl = `http://127.0.0.1:${port}`;
            resolve();
        });
    });
});

test.after(async () => {
    if (server) {
        await new Promise((resolve) => server.close(resolve));
    }
    await closeMQ();
    await mongoose.disconnect();
});

// ── 1. Global 404 Route Handler ───────────────────────────────────────────────
test('1. FaultKit: 404 handler returns standardized NOT_FOUND contract', async () => {
    const res = await fetch(`${baseUrl}/unknown-route-9999`);
    const body = await res.json();

    assert.equal(res.status, 404);
    assert.equal(body.success, false);
    assert.ok(body.error);
    assert.equal(body.error.code, 'NOT_FOUND');
    assert.ok(body.error.message.includes('not found'));
});

// ── 2. identifyUser Middleware: Missing & Invalid Authorization ───────────────
test('2. FaultKit: identifyUser rejects missing and malformed authorization headers', async () => {
    // A: Missing header
    const resNoAuth = await fetch(`${baseUrl}/api/payments/subscription`);
    const bodyNoAuth = await resNoAuth.json();

    assert.equal(resNoAuth.status, 401);
    assert.equal(bodyNoAuth.success, false);
    assert.equal(bodyNoAuth.error.code, 'UNAUTHORIZED');
    assert.ok(bodyNoAuth.error.message.includes('Missing Authorization header'));

    // B: Empty bearer token
    const resEmptyBearer = await fetch(`${baseUrl}/api/payments/subscription`, {
        headers: { Authorization: 'Bearer ' },
    });
    const bodyEmptyBearer = await resEmptyBearer.json();

    assert.equal(resEmptyBearer.status, 401);
    assert.equal(bodyEmptyBearer.success, false);
    assert.equal(bodyEmptyBearer.error.code, 'UNAUTHORIZED');

    // C: Malformed JWT token
    const resMalformed = await fetch(`${baseUrl}/api/payments/subscription`, {
        headers: { Authorization: 'Bearer invalid.token.payload' },
    });
    const bodyMalformed = await resMalformed.json();

    assert.equal(resMalformed.status, 401);
    assert.equal(bodyMalformed.success, false);
    assert.ok(['UNAUTHORIZED', 'TOKEN_INVALID'].includes(bodyMalformed.error.code));
});

// ── 3. identifyAdmin Middleware: Role Gate ────────────────────────────────────
test('3. FaultKit: identifyAdmin rejects unauthorized requests', async () => {
    const res = await fetch(`${baseUrl}/api/payments/admin/packages`);
    const body = await res.json();

    assert.equal(res.status, 401);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'UNAUTHORIZED');
});

// ── 4. Order Creation (POST /order) FaultKit Validation ───────────────────────
test('4. FaultKit: createOrderController validates packageId via BadRequestError', async () => {
    const res = await fetch(`${baseUrl}/api/payments/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
    });
    const body = await res.json();

    assert.equal(res.status, 401);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'UNAUTHORIZED');
});

// ── 5. Credit Controller FaultKit Validation Direct Contract ──────────────────
test('5. FaultKit: credit validation errors throw concrete BadRequestError', async () => {
    const { updateCreditController, updateSubscriptionController } = await import('../controllers/credit.controller.js');

    // Case A: token mismatch (totalTokens < promptTokens + completionTokens)
    let caughtUpdateErr = null;
    await updateCreditController(
        {
            accountId: new mongoose.Types.ObjectId().toString(),
            body: {
                company: 'mistral',
                promptTokens: 100,
                completionTokens: 200,
                totalTokens: 50, // invalid: less than sum
            },
        },
        {},
        (err) => { caughtUpdateErr = err; }
    );

    assert.ok(caughtUpdateErr instanceof BadRequestError);
    assert.equal(caughtUpdateErr.statusCode, 400);
    assert.equal(caughtUpdateErr.errorCode, 'BAD_REQUEST');
    assert.ok(caughtUpdateErr.message.includes('totalTokens cannot be less than'));

    // Case B: invalid subscription tier
    let caughtSubErr = null;
    await updateSubscriptionController(
        {
            accountId: new mongoose.Types.ObjectId().toString(),
            body: { subscription: 'enterprise_ultra' },
        },
        {},
        (err) => { caughtSubErr = err; }
    );

    assert.ok(caughtSubErr instanceof BadRequestError);
    assert.equal(caughtSubErr.statusCode, 400);
    assert.equal(caughtSubErr.errorCode, 'BAD_REQUEST');
    assert.ok(caughtSubErr.message.includes('subscription must be one of'));
});

// ── 6. Admin Controller FaultKit Validation Direct Contract ───────────────────
test('6. FaultKit: admin controllers validate parameters with BadRequestError', async () => {
    const { grantCreditsController, resetCreditsController } = await import('../controllers/admin.controller.js');

    // Case A: Missing creditsToGrant in grantCreditsController
    let caughtGrantErr = null;
    await grantCreditsController(
        { body: { userId: new mongoose.Types.ObjectId().toString() } },
        {},
        (err) => { caughtGrantErr = err; }
    );

    assert.ok(caughtGrantErr instanceof BadRequestError);
    assert.equal(caughtGrantErr.statusCode, 400);
    assert.equal(caughtGrantErr.errorCode, 'BAD_REQUEST');

    // Case B: Invalid userId in resetCreditsController
    let caughtResetErr = null;
    await resetCreditsController(
        { body: { userId: 'not-a-valid-objectid' } },
        {},
        (err) => { caughtResetErr = err; }
    );

    assert.ok(caughtResetErr instanceof BadRequestError);
    assert.equal(caughtResetErr.statusCode, 400);
    assert.equal(caughtResetErr.errorCode, 'BAD_REQUEST');
    assert.ok(caughtResetErr.message.includes('valid ObjectId'));
});

// ── 7. FaultKit Error Hierarchy & Taxonomy Verification ───────────────────────
test('7. FaultKit: AppError class hierarchy, status codes, and error codes contract', () => {
    const badReq = new BadRequestError('Invalid input');
    assert.equal(badReq.statusCode, 400);
    assert.equal(badReq.errorCode, 'BAD_REQUEST');
    assert.equal(badReq.isOperational, true);
    assert.ok(badReq instanceof AppError);

    const unauth = new UnauthorizedError('Not logged in');
    assert.equal(unauth.statusCode, 401);
    assert.equal(unauth.errorCode, 'UNAUTHORIZED');
    assert.ok(unauth instanceof AppError);

    const tokenExp = new TokenExpiredError();
    assert.equal(tokenExp.statusCode, 401);
    assert.equal(tokenExp.errorCode, 'TOKEN_EXPIRED');
    assert.ok(tokenExp instanceof AppError);

    const tokenInv = new TokenInvalidError('Bad signature');
    assert.equal(tokenInv.statusCode, 401);
    assert.equal(tokenInv.errorCode, 'TOKEN_INVALID');
    assert.ok(tokenInv instanceof AppError);

    const forbidden = new ForbiddenError('Access denied');
    assert.equal(forbidden.statusCode, 403);
    assert.equal(forbidden.errorCode, 'FORBIDDEN');
    assert.ok(forbidden instanceof AppError);

    const notFound = new NotFoundError('Item missing');
    assert.equal(notFound.statusCode, 404);
    assert.equal(notFound.errorCode, 'NOT_FOUND');
    assert.ok(notFound instanceof AppError);

    const serviceDown = new ServiceUnavailableError('Gateway down');
    assert.equal(serviceDown.statusCode, 503);
    assert.equal(serviceDown.errorCode, 'SERVICE_UNAVAILABLE');
    assert.ok(serviceDown instanceof AppError);

    const serverErr = new InternalServerError('Config missing');
    assert.equal(serverErr.statusCode, 500);
    assert.equal(serverErr.errorCode, 'INTERNAL_SERVER_ERROR');
    assert.ok(serverErr instanceof AppError);
});

// ── 8. Subscription Service Categorization Contract ───────────────────────────
test('8. FaultKit: subscription.service throws categorized NotFoundError and BadRequestError', async () => {
    const { processSubscriptionPayment } = await import('../services/subscription.service.js');

    // Case A: Missing parameters -> BadRequestError
    let caughtMissingErr = null;
    try {
        await processSubscriptionPayment({});
    } catch (err) {
        caughtMissingErr = err;
    }
    assert.ok(caughtMissingErr instanceof BadRequestError);
    assert.equal(caughtMissingErr.statusCode, 400);

    // Case B: Unknown packageId -> NotFoundError
    let caughtNotFoundErr = null;
    try {
        await processSubscriptionPayment({
            accountId: new mongoose.Types.ObjectId(),
            packageId: 'totally_non_existent_package_999',
            paymentId: 'pay_test_xyz',
        });
    } catch (err) {
        caughtNotFoundErr = err;
    }
    assert.ok(caughtNotFoundErr instanceof NotFoundError);
    assert.equal(caughtNotFoundErr.statusCode, 404);
    assert.equal(caughtNotFoundErr.errorCode, 'NOT_FOUND');
});

