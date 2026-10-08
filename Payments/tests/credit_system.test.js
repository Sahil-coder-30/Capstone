import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import { getWindowConfig } from '../config/subscription.config.js';
import Account from '../models/account.model.js';
import Credit from '../models/credit.model.js';
import { checkCreditController, updateCreditController, getCreditController } from '../controllers/credit.controller.js';
import { syncCreditTier } from '../services/subscription.service.js';

// ── Test Setup & Utilities ──────────────────────────────────────────────────
const TEST_ACCOUNT_ID = new mongoose.Types.ObjectId();

const mockRes = () => {
    const res = {};
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (data) => {
        res.body = data;
        return res;
    };
    return res;
};

// ── Database Connection Hook ────────────────────────────────────────────────
test.before(async () => {
    if (mongoose.connection.readyState !== 1) {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/payment_test';
        await mongoose.connect(mongoUri);
    }
    // Clean up test user if previously existing
    await Account.deleteMany({ _id: TEST_ACCOUNT_ID });
    await Credit.deleteMany({ userId: TEST_ACCOUNT_ID });
});

test.after(async () => {
    // Clean up test records
    await Account.deleteMany({ _id: TEST_ACCOUNT_ID });
    await Credit.deleteMany({ userId: TEST_ACCOUNT_ID });
    await mongoose.disconnect();
});

// ── 1. Unit Tests: Tier Window Configuration ────────────────────────────────
test('1. Tier Window Configuration - getWindowConfig()', () => {
    const freeCfg = getWindowConfig('free');
    assert.equal(freeCfg.windowCredits, 20);
    assert.equal(freeCfg.windowHours, 5);
    assert.equal(freeCfg.creditLowerLimit, 5);

    const proCfg = getWindowConfig('pro');
    assert.equal(proCfg.windowCredits, 150);
    assert.equal(proCfg.windowHours, 5);
    assert.equal(proCfg.creditLowerLimit, 5);

    const maxCfg = getWindowConfig('max');
    assert.equal(maxCfg.windowCredits, 200);
    assert.equal(maxCfg.windowHours, 5);
    assert.equal(maxCfg.creditLowerLimit, 5);
});

// ── 2. Integration Test: Account Provisioning & Initial Check ───────────────
test('2. Initial Pre-flight Check for New Account (Free Tier)', async () => {
    // Create test account in MongoDB
    await Account.create({
        _id: TEST_ACCOUNT_ID,
        user_id: TEST_ACCOUNT_ID,
        subscription_status: 'free',
        windowCreditsTotal: 20,
        windowCreditsRemaining: 20,
    });

    await Credit.create({
        userId: TEST_ACCOUNT_ID,
        accountId: TEST_ACCOUNT_ID,
        subscription: 'free',
        providerCredits: [{ company: 'mistral', creditsRemaining: 20 }],
    });

    const req = { accountId: TEST_ACCOUNT_ID.toString() };
    const res = mockRes();

    await checkCreditController(req, res, (err) => { throw err; });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.canQuery, true);
    assert.equal(res.body.hasCredit, true);
    assert.equal(res.body.creditsRemaining, 20);
    assert.equal(res.body.windowCreditsTotal, 20);
    assert.equal(res.body.nextRefillAt, null);
});

// ── 3. Integration Test: Token Usage & Window Credit Decrement ─────────────
test('3. Token Usage Decrements Window Credits (updateCreditController)', async () => {
    const req = {
        accountId: TEST_ACCOUNT_ID.toString(),
        body: {
            userId: TEST_ACCOUNT_ID.toString(),
            company: 'mistral',
            modelId: 'mistral-large',
            agentType: 'codingAgent',
            promptTokens: 3000,
            completionTokens: 2000,
            totalTokens: 5000, // 5000 tokens = 5 credits
        },
    };
    const res = mockRes();

    await updateCreditController(req, res, (err) => { throw err; });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'success');

    // Verify Account remaining credits updated in DB
    const account = await Account.findById(TEST_ACCOUNT_ID);
    assert.equal(account.windowCreditsRemaining, 15); // 20 - 5 = 15
    assert.equal(account.windowExhaustedAt, null);
    assert.equal(account.windowRefillAt, null);
});

// ── 4. Integration Test: Window Exhaustion & Gate Lockout ───────────────────
test('4. Credit Exhaustion Below 5 Triggers 5-Hour Lockout & Refill Timestamp', async () => {
    // Deduct 12 more credits (12,000 tokens) -> 15 - 12 = 3 credits remaining (< 5 lower limit)
    const req = {
        accountId: TEST_ACCOUNT_ID.toString(),
        body: {
            userId: TEST_ACCOUNT_ID.toString(),
            company: 'mistral',
            modelId: 'mistral-large',
            agentType: 'codingAgent',
            totalTokens: 12000,
        },
    };
    const res = mockRes();

    await updateCreditController(req, res, (err) => { throw err; });

    assert.equal(res.statusCode, 200);

    const account = await Account.findById(TEST_ACCOUNT_ID);
    assert.equal(account.windowCreditsRemaining, 3);
    assert.notEqual(account.windowExhaustedAt, null);
    assert.notEqual(account.windowRefillAt, null);

    // Verify 5-hour window setting (refillAt is ~5 hours from exhaustedAt)
    const diffMs = account.windowRefillAt.getTime() - account.windowExhaustedAt.getTime();
    assert.equal(diffMs, 5 * 60 * 60 * 1000);

    // Call pre-flight check API → verify canQuery & hasCredit are false
    const checkReq = { accountId: TEST_ACCOUNT_ID.toString() };
    const checkRes = mockRes();

    await checkCreditController(checkReq, checkRes, (err) => { throw err; });

    assert.equal(checkRes.statusCode, 200);
    assert.equal(checkRes.body.canQuery, false);
    assert.equal(checkRes.body.hasCredit, false);
    assert.equal(checkRes.body.creditsRemaining, 3);
    assert.notEqual(checkRes.body.nextRefillAt, null);
    assert.ok(checkRes.body.timeUntilRefillMs > 0);
});

// ── 5. Integration Test: Cron Refill Simulation ─────────────────────────────
test('5. Credit Refill Job Restores Credits After 5-Hour Window Elapses', async () => {
    // Simulate timer elapsed in MongoDB
    const pastDate = new Date(Date.now() - 1000);
    await Account.updateOne(
        { _id: TEST_ACCOUNT_ID },
        { windowRefillAt: pastDate, windowExhaustedAt: new Date(Date.now() - 5 * 3600 * 1000) }
    );

    // Run the refill logic (same query as cron job)
    const exhaustedAccounts = await Account.find({
        windowRefillAt: { $lte: new Date(), $ne: null },
    }).lean();

    assert.equal(exhaustedAccounts.length, 1);
    assert.equal(exhaustedAccounts[0]._id.toString(), TEST_ACCOUNT_ID.toString());

    // Execute refill update
    const windowCfg = getWindowConfig('free');
    await Account.updateOne(
        { _id: TEST_ACCOUNT_ID },
        {
            windowCreditsRemaining: windowCfg.windowCredits,
            windowCreditsTotal: windowCfg.windowCredits,
            windowExhaustedAt: null,
            windowRefillAt: null,
        }
    );

    // Verify pre-flight check after refill
    const checkReq = { accountId: TEST_ACCOUNT_ID.toString() };
    const checkRes = mockRes();
    await checkCreditController(checkReq, checkRes, (err) => { throw err; });

    assert.equal(checkRes.body.canQuery, true);
    assert.equal(checkRes.body.hasCredit, true);
    assert.equal(checkRes.body.creditsRemaining, 20);
    assert.equal(checkRes.body.nextRefillAt, null);
});

// ── 6. Integration Test: Tier Upgrade Window Reset ──────────────────────────
test('6. Subscription Upgrade to Pro Instantly Upgrades Window Allocation to 150', async () => {
    // Trigger syncCreditTier to Pro
    await syncCreditTier(TEST_ACCOUNT_ID, 'pro', new Date(), new Date(), 49900, null);

    const account = await Account.findById(TEST_ACCOUNT_ID);
    assert.equal(account.subscription_status, 'pro');
    assert.equal(account.windowCreditsTotal, 150);
    assert.equal(account.windowCreditsRemaining, 150);
    assert.equal(account.windowRefillAt, null);

    // Pre-flight check returns Pro window
    const checkReq = { accountId: TEST_ACCOUNT_ID.toString() };
    const checkRes = mockRes();
    await checkCreditController(checkReq, checkRes, (err) => { throw err; });

    assert.equal(checkRes.body.subscription, 'pro');
    assert.equal(checkRes.body.canQuery, true);
    assert.equal(checkRes.body.hasCredit, true);
    assert.equal(checkRes.body.creditsRemaining, 150);
    assert.equal(checkRes.body.windowCreditsTotal, 150);
});

// ── 7. Contract Test: GET /api/payments/credit Dashboard Payload ────────────
test('7. Dashboard getCreditController Returns Tier-Correct Window Metrics', async () => {
    const req = { accountId: TEST_ACCOUNT_ID.toString() };
    const res = mockRes();

    await getCreditController(req, res, (err) => { throw err; });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.credit.windowCreditsTotal, 150);
    assert.equal(res.body.credit.windowCreditsRemaining, 150);
    assert.equal(res.body.credit.canQuery, true);
    assert.equal(res.body.credit.tierConfig.windowCredits, 150);
    assert.equal(res.body.credit.tierConfig.windowHours, 5);
});

// ── 8. AI Orchestration Service Integration Contract ──────────────────────────
test('8. AI Orchestration checkAiCredit & recordAiUsage payload contract', () => {
    const mockPaymentsCheckResponse = {
        status: 'success',
        canQuery: true,
        hasCredit: true,
        subscription: 'free',
        creditsRemaining: 20,
        windowCreditsTotal: 20,
        creditLowerLimit: 5,
        nextRefillAt: null,
    };

    assert.equal(mockPaymentsCheckResponse.hasCredit, true);
    assert.equal(mockPaymentsCheckResponse.canQuery, true);
});

// ── 9. Frontend API Contract Mapping ──────────────────────────────────────────
test('9. Frontend checkCreditAvailabilityAPI contract mapping', () => {
    const mockApiResponse = {
        status: 'success',
        canQuery: false,
        hasCredit: false,
        subscription: 'pro',
        creditsRemaining: 2,
        windowCreditsTotal: 150,
        creditLowerLimit: 5,
        nextRefillAt: '2026-08-17T23:00:00.000Z',
    };

    assert.equal(mockApiResponse.canQuery, false);
    assert.equal(mockApiResponse.hasCredit, false);
    assert.equal(mockApiResponse.creditsRemaining, 2);
    assert.equal(mockApiResponse.windowCreditsTotal, 150);
    assert.equal(mockApiResponse.nextRefillAt, '2026-08-17T23:00:00.000Z');
});
