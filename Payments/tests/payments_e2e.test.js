import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';

import Account from '../models/account.model.js';
import Credit from '../models/credit.model.js';
import { Subscription } from '../models/subscription.model.js';
import Transaction from '../models/transaction.model.js';
import UsageEvent from '../models/usage-event.model.js';

import {
    processSubscriptionPayment,
    promoteNextSlot,
    getActiveSubscription,
    getTransactionHistory,
    getTransactionById,
    getUsageEvents,
    getUsageAnalytics,
    getDashboardOverview,
} from '../services/subscription.service.js';

import {
    createOrderController,
    verifyPaymentController,
} from '../controllers/payment.controller.js';

import {
    getCreditController,
    getTransactionSummaryController,
    getTransactionsController,
    getAnalyticsController,
} from '../controllers/credit.controller.js';

import { webhookController } from '../controllers/webhook.controller.js';
import razorpayService from '../services/razorpay.service.js';
import { closeMQ } from '../config/mq.js';


// ── Test Setup & Helpers ────────────────────────────────────────────────────
const TEST_ACCOUNT_ID = new mongoose.Types.ObjectId();
const TEST_WEBHOOK_SECRET = 'test_webhook_secret_key_12345';

const mockRes = () => {
    const res = {};
    res.statusCode = 200;
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

    // Clean up test collections for isolated test run
    await Promise.all([
        Account.deleteMany({ _id: TEST_ACCOUNT_ID }),
        Credit.deleteMany({ $or: [{ userId: TEST_ACCOUNT_ID }, { accountId: TEST_ACCOUNT_ID }] }),
        Subscription.deleteMany({ accountId: TEST_ACCOUNT_ID }),
        Transaction.deleteMany({ $or: [{ accountId: TEST_ACCOUNT_ID }, { userId: TEST_ACCOUNT_ID }] }),
        UsageEvent.deleteMany({ accountId: TEST_ACCOUNT_ID }),
    ]);

    // Seed default baseline account and credit documents
    await Account.create({
        _id: TEST_ACCOUNT_ID,
        user_id: TEST_ACCOUNT_ID,
        subscription_status: 'free',
        windowCreditsTotal: 20,
        windowCreditsRemaining: 20,
        is_active: true,
    });

    await Credit.create({
        userId: TEST_ACCOUNT_ID,
        accountId: TEST_ACCOUNT_ID,
        subscription: 'free',
        providerCredits: [
            { company: 'mistral', creditsGranted: 20, creditsRemaining: 20 },
            { company: 'google', creditsGranted: 20, creditsRemaining: 20 },
            { company: 'openai', creditsGranted: 20, creditsRemaining: 20 },
        ],
    });
});

test.after(async () => {
    // Teardown test records
    await Promise.all([
        Account.deleteMany({ _id: TEST_ACCOUNT_ID }),
        Credit.deleteMany({ $or: [{ userId: TEST_ACCOUNT_ID }, { accountId: TEST_ACCOUNT_ID }] }),
        Subscription.deleteMany({ accountId: TEST_ACCOUNT_ID }),
        Transaction.deleteMany({ $or: [{ accountId: TEST_ACCOUNT_ID }, { userId: TEST_ACCOUNT_ID }] }),
        UsageEvent.deleteMany({ accountId: TEST_ACCOUNT_ID }),
    ]);
    await closeMQ();
    await mongoose.disconnect();
});

// ── 1. Order Creation & Package Validation ──────────────────────────────────
test('1. createOrderController: validates package constraints & rejects free plan', async () => {
    // Free plan must not allow paid checkout
    const freeReq = {
        accountId: TEST_ACCOUNT_ID.toString(),
        body: { packageId: 'free' },
    };
    const freeRes = mockRes();
    let errorCaught = null;

    await createOrderController(freeReq, freeRes, (err) => { errorCaught = err; });
    assert.ok(errorCaught, 'Expected free plan order creation to throw error');
    assert.equal(errorCaught.statusCode || errorCaught.status, 400);

    // Unknown packageId rejected
    let unknownErr = null;
    await createOrderController(
        { accountId: TEST_ACCOUNT_ID.toString(), body: { packageId: 'invalid_package_xyz' } },
        mockRes(),
        (err) => { unknownErr = err; }
    );
    assert.ok(unknownErr);
    assert.equal(unknownErr.statusCode || unknownErr.status, 400);

    // Missing packageId rejected
    let missingErr = null;
    await createOrderController(
        { accountId: TEST_ACCOUNT_ID.toString(), body: {} },
        mockRes(),
        (err) => { missingErr = err; }
    );
    assert.ok(missingErr);
    assert.equal(missingErr.statusCode || missingErr.status, 400);
});

// ── 2. First-Time Subscription Activation: Free -> Pro ──────────────────────
test('2. processSubscriptionPayment: atomic synchronization across all 4 models on Pro purchase', async () => {
    const paymentId = `pay_test_${Date.now()}_01`;
    const orderId = `order_test_${Date.now()}_01`;

    const result = await processSubscriptionPayment({
        accountId: TEST_ACCOUNT_ID,
        packageId: 'pro_monthly',
        paymentId,
        orderId,
        amountPaise: 49900,
    });

    assert.equal(result.status, 'success');
    assert.equal(result.activeTier, 'pro');
    assert.ok(result.validUntil instanceof Date);

    // 1. Verify Subscription document
    const sub = await Subscription.findOne({ accountId: TEST_ACCOUNT_ID });
    assert.ok(sub);
    assert.equal(sub.activeTier, 'pro');
    assert.equal(sub.status, 'ACTIVE');
    assert.equal(sub.activeSlot.packageId, 'pro_monthly');
    assert.equal(sub.activeSlot.tier, 'pro');
    assert.equal(sub.activeSlot.paidAmountPaise, 49900);
    assert.equal(sub.reservedSlots.length, 0);

    // 2. Verify Account document (window allocation)
    const account = await Account.findById(TEST_ACCOUNT_ID);
    assert.equal(account.subscription_status, 'pro');
    assert.equal(account.windowCreditsTotal, 150);
    assert.equal(account.windowCreditsRemaining, 150);
    assert.equal(account.windowExhaustedAt, null);
    assert.equal(account.windowRefillAt, null);

    // 3. Verify Credit document
    const credit = await Credit.findOne({ $or: [{ userId: TEST_ACCOUNT_ID }, { accountId: TEST_ACCOUNT_ID }] });
    assert.equal(credit.subscription, 'pro');
    assert.ok(credit.billing.currentPeriodEnd);

    // 4. Verify Transaction ledger entry
    const tx = await Transaction.findOne({ 'razorpay.paymentId': paymentId });
    assert.ok(tx);
    assert.equal(tx.type, 'SUBSCRIPTION_ACTIVATION');
    assert.equal(tx.amountPaise, 49900);
    assert.equal(tx.status, 'SUCCESS');
    assert.equal(tx.metadata.newTier, 'pro');
});

// ── 3. Plan Stacking: Pro + Pro adds +30 days ───────────────────────────────
test('3. processSubscriptionPayment: stacking same tier extends activeSlot by +30 days', async () => {
    const initialSub = await Subscription.findOne({ accountId: TEST_ACCOUNT_ID });
    const initialExpiry = initialSub.activeSlot.validUntil.getTime();

    const paymentId = `pay_test_${Date.now()}_02`;
    const orderId = `order_test_${Date.now()}_02`;

    const result = await processSubscriptionPayment({
        accountId: TEST_ACCOUNT_ID,
        packageId: 'pro_monthly',
        paymentId,
        orderId,
        amountPaise: 49900,
    });

    assert.equal(result.status, 'success');
    assert.equal(result.activeTier, 'pro');

    const updatedSub = await Subscription.findOne({ accountId: TEST_ACCOUNT_ID });
    const newExpiry = updatedSub.activeSlot.validUntil.getTime();

    // Verify exactly +30 days added
    const diffDays = Math.round((newExpiry - initialExpiry) / (24 * 60 * 60 * 1000));
    assert.equal(diffDays, 30);
    assert.equal(updatedSub.activeSlot.paidAmountPaise, 49900 * 2);

    // Verify transaction type is SUBSCRIPTION_EXTENSION
    const tx = await Transaction.findOne({ 'razorpay.paymentId': paymentId });
    assert.equal(tx.type, 'SUBSCRIPTION_EXTENSION');
    assert.equal(tx.amountPaise, 49900);
});

// ── 4. Plan Upgrade with Queue Preservation: Pro -> Max ─────────────────────
test('4. processSubscriptionPayment: upgrade from Pro to Max preserves Pro in reservedSlots', async () => {
    const paymentId = `pay_test_${Date.now()}_03`;
    const orderId = `order_test_${Date.now()}_03`;

    const result = await processSubscriptionPayment({
        accountId: TEST_ACCOUNT_ID,
        packageId: 'max_monthly',
        paymentId,
        orderId,
        amountPaise: 99900,
    });

    assert.equal(result.status, 'success');
    assert.equal(result.activeTier, 'max');

    const sub = await Subscription.findOne({ accountId: TEST_ACCOUNT_ID });
    assert.equal(sub.activeTier, 'max');
    assert.equal(sub.activeSlot.tier, 'max');

    // Preserved Pro slot in reserved queue
    assert.equal(sub.reservedSlots.length, 1);
    assert.equal(sub.reservedSlots[0].tier, 'pro');

    // Account updated to Max tier (200 credits)
    const account = await Account.findById(TEST_ACCOUNT_ID);
    assert.equal(account.subscription_status, 'max');
    assert.equal(account.windowCreditsTotal, 200);
    assert.equal(account.windowCreditsRemaining, 200);

    const tx = await Transaction.findOne({ 'razorpay.paymentId': paymentId });
    assert.equal(tx.type, 'SUBSCRIPTION_ACTIVATION');
    assert.equal(tx.metadata.newTier, 'max');
});

// ── 5. Lower-Tier Purchase Queuing: Max buys Pro ────────────────────────────
test('5. processSubscriptionPayment: lower tier purchase while on Max queues into reservedSlots', async () => {
    const paymentId = `pay_test_${Date.now()}_04`;
    const orderId = `order_test_${Date.now()}_04`;

    const result = await processSubscriptionPayment({
        accountId: TEST_ACCOUNT_ID,
        packageId: 'pro_monthly',
        paymentId,
        orderId,
        amountPaise: 49900,
    });

    assert.equal(result.status, 'success');
    assert.equal(result.activeTier, 'max'); // Max remains active!

    const sub = await Subscription.findOne({ accountId: TEST_ACCOUNT_ID });
    assert.equal(sub.activeTier, 'max');
    assert.equal(sub.reservedSlots.length, 1);
    assert.equal(sub.reservedSlots[0].tier, 'pro');

    // Pro slot got extended by 30 days
    const tx = await Transaction.findOne({ 'razorpay.paymentId': paymentId });
    assert.equal(tx.type, 'SUBSCRIPTION_EXTENSION');
});

// ── 6. Idempotency & Replay Attack Defense ───────────────────────────────────
test('6. Idempotency: replaying identical paymentId returns already_processed without duplicate ledger', async () => {
    const duplicatePaymentId = `pay_dup_${Date.now()}`;
    const orderId = `order_dup_${Date.now()}`;

    // First attempt -> succeeds
    const firstResult = await processSubscriptionPayment({
        accountId: TEST_ACCOUNT_ID,
        packageId: 'pro_monthly',
        paymentId: duplicatePaymentId,
        orderId,
        amountPaise: 49900,
    });
    assert.equal(firstResult.status, 'success');

    // Second attempt with exact same paymentId -> caught by idempotency guard
    const replayResult = await processSubscriptionPayment({
        accountId: TEST_ACCOUNT_ID,
        packageId: 'pro_monthly',
        paymentId: duplicatePaymentId,
        orderId,
        amountPaise: 49900,
    });
    assert.equal(replayResult.status, 'already_processed');

    // Ensure strictly 1 transaction exists in the database
    const txCount = await Transaction.countDocuments({ 'razorpay.paymentId': duplicatePaymentId });
    assert.equal(txCount, 1);
});

// ── 7. Slot Expiration & Lazy Promotion: Max expires -> Pro promotes ────────
test('7. promoteNextSlot: promotes queued Pro slot when Max expires', async () => {
    // Simulate Max expiration by setting validUntil to the past
    const pastDate = new Date(Date.now() - 5000);
    await Subscription.updateOne(
        { accountId: TEST_ACCOUNT_ID },
        { 'activeSlot.validUntil': pastDate }
    );

    const promotionResult = await promoteNextSlot(TEST_ACCOUNT_ID);
    assert.equal(promotionResult.newTier, 'pro');

    const sub = await Subscription.findOne({ accountId: TEST_ACCOUNT_ID });
    assert.equal(sub.activeTier, 'pro');
    assert.equal(sub.status, 'ACTIVE');
    assert.equal(sub.reservedSlots.length, 0);

    // Account reflects Pro window (150 credits)
    const account = await Account.findById(TEST_ACCOUNT_ID);
    assert.equal(account.subscription_status, 'pro');
    assert.equal(account.windowCreditsTotal, 150);
    assert.equal(account.windowCreditsRemaining, 150);

    // Transaction logged
    const promoTx = await Transaction.findOne({
        accountId: TEST_ACCOUNT_ID,
        type: 'SUBSCRIPTION_PROMOTED',
    }).sort({ createdAt: -1 });
    assert.ok(promoTx);
    assert.equal(promoTx.metadata.newTier, 'pro');
});

// ── 8. Reverting to Free on Complete Expiry ──────────────────────────────────
test('8. promoteNextSlot: reverts to Free tier when last active slot expires', async () => {
    // Expire the promoted Pro slot with empty reservedSlots
    const pastDate = new Date(Date.now() - 5000);
    await Subscription.updateOne(
        { accountId: TEST_ACCOUNT_ID },
        { 'activeSlot.validUntil': pastDate, reservedSlots: [] }
    );

    const expireResult = await promoteNextSlot(TEST_ACCOUNT_ID);
    assert.equal(expireResult.newTier, 'free');

    const sub = await Subscription.findOne({ accountId: TEST_ACCOUNT_ID });
    assert.equal(sub.activeTier, 'free');
    assert.equal(sub.status, 'FREE');
    assert.equal(sub.activeSlot, null);

    // Account reset to Free tier (20 credits)
    const account = await Account.findById(TEST_ACCOUNT_ID);
    assert.equal(account.subscription_status, 'free');
    assert.equal(account.windowCreditsTotal, 20);
    assert.equal(account.windowCreditsRemaining, 20);

    const expireTx = await Transaction.findOne({
        accountId: TEST_ACCOUNT_ID,
        type: 'SUBSCRIPTION_EXPIRED',
    }).sort({ createdAt: -1 });
    assert.ok(expireTx);
});

// ── 9. Server-to-Server Razorpay Webhook Integration ────────────────────────
test('9. webhookController: verifies HMAC-SHA256 signature and processes payment.captured', async () => {
    const webhookPaymentId = `pay_wh_${Date.now()}`;
    const webhookOrderId = `order_wh_${Date.now()}`;

    const webhookBody = {
        event: 'payment.captured',
        payload: {
            payment: {
                entity: {
                    id: webhookPaymentId,
                    order_id: webhookOrderId,
                    amount: 49900,
                    status: 'captured',
                    notes: {
                        accountId: TEST_ACCOUNT_ID.toString(),
                        packageId: 'pro_monthly',
                        email: 'test@takshacodespace.in',
                        username: 'DevTester',
                    },
                },
            },
        },
    };

    const rawBodyString = JSON.stringify(webhookBody);

    // Compute legitimate HMAC-SHA256 signature
    const validSignature = crypto
        .createHmac('sha256', TEST_WEBHOOK_SECRET)
        .update(rawBodyString)
        .digest('hex');

    // Case A: Missing signature -> rejected 400
    const invalidReq1 = {
        rawBody: rawBodyString,
        body: webhookBody,
        headers: {},
    };
    const invalidRes1 = mockRes();
    await webhookController(invalidReq1, invalidRes1);
    assert.equal(invalidRes1.statusCode, 400);

    // Case B: Tampered signature -> rejected 400
    const invalidReq2 = {
        rawBody: rawBodyString,
        body: webhookBody,
        headers: { 'x-razorpay-signature': 'tampered_invalid_signature_hex' },
    };
    const invalidRes2 = mockRes();
    process.env.RAZORPAY_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    await webhookController(invalidReq2, invalidRes2);
    assert.equal(invalidRes2.statusCode, 400);

    // Case C: Valid signature -> processed 200 & updates DB
    // express.json's verify hook hands the controller a Buffer, not a string.
    const validReq = {
        rawBody: Buffer.from(rawBodyString),
        body: webhookBody,
        headers: { 'x-razorpay-signature': validSignature },
    };
    const validRes = mockRes();
    await webhookController(validReq, validRes);
    assert.equal(validRes.statusCode, 200);

    // Confirm transaction persisted in DB from webhook
    const whTx = await Transaction.findOne({ 'razorpay.paymentId': webhookPaymentId });
    assert.ok(whTx);
    assert.equal(whTx.amountPaise, 49900);
    assert.equal(whTx.status, 'SUCCESS');
});

// ── 10. Financial Aggregation Pipeline: getTransactionSummaryController ─────
test('10. Financial Ledger Aggregation: verifies exact totals, purchases, and billable amounts', async () => {
    // Seed 2 AI usage deductions
    await Transaction.create([
        {
            accountId: TEST_ACCOUNT_ID,
            type: 'USAGE_DEDUCTION',
            amountPaise: 250, // ₹2.50
            tokensConsumed: 2500,
            status: 'SUCCESS',
            description: 'AI usage test 1',
        },
        {
            accountId: TEST_ACCOUNT_ID,
            type: 'USAGE_DEDUCTION',
            amountPaise: 750, // ₹7.50
            tokensConsumed: 7500,
            status: 'SUCCESS',
            description: 'AI usage test 2',
        },
    ]);

    const req = { accountId: TEST_ACCOUNT_ID.toString() };
    const res = mockRes();

    await getTransactionSummaryController(req, res, (err) => { throw err; });

    assert.equal(res.statusCode, 200);
    const summary = res.body.summary;
    assert.ok(summary);

    // Check purchase aggregations (sum of paid amounts > 0)
    assert.ok(summary.totalSpentINR > 0);
    assert.ok(summary.totalPurchases > 0);

    // Check usage aggregations (sum of usage deduction tokens and paise)
    assert.ok(summary.totalTokensConsumed >= 10000);
    assert.ok(summary.totalAIRequests >= 2);
    assert.equal(summary.totalBillableINR, 10); // (250 + 750) / 100 = ₹10.00
});

// ── 11. AI Usage Events Time-Series & Multi-Provider Aggregation ─────────────
test('11. UsageEvent Aggregation: getUsageAnalytics calculates accurate provider & daily grouping', async () => {
    const today = new Date();
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000);

    const validChatId1 = new mongoose.Types.ObjectId();
    const validChatId2 = new mongoose.Types.ObjectId();

    await UsageEvent.create([
        {
            accountId: TEST_ACCOUNT_ID,
            chatId: validChatId1,
            company: 'google',
            modelId: 'gemini-1.5-pro',
            agentType: 'codingAgent',
            promptTokens: 1000,
            completionTokens: 500,
            totalTokens: 1500,
            creditsDeducted: 2,
            createdAt: today,
        },
        {
            accountId: TEST_ACCOUNT_ID,
            chatId: validChatId2,
            company: 'mistral',
            modelId: 'devstral-24b',
            agentType: 'appAgent',
            promptTokens: 2000,
            completionTokens: 1000,
            totalTokens: 3000,
            creditsDeducted: 3,
            createdAt: yesterday,
        },
    ]);

    const analytics = await getUsageAnalytics(TEST_ACCOUNT_ID, { days: 30 });

    assert.ok(analytics);
    assert.ok(analytics.totals.totalTokens >= 4500);
    assert.ok(analytics.totals.promptTokens >= 3000);
    assert.ok(analytics.totals.completionTokens >= 1500);

    // Provider breakdown
    const googleProv = analytics.byProvider.find(p => p.company === 'google');
    assert.ok(googleProv);
    assert.ok(googleProv.totalTokens >= 1500);

    const mistralProv = analytics.byProvider.find(p => p.company === 'mistral');
    assert.ok(mistralProv);
    assert.ok(mistralProv.totalTokens >= 3000);

    // Timeline grouping (at least 1 or 2 distinct day buckets)
    assert.ok(analytics.timeline.length >= 1);
});

// ── 12. Complete Dashboard Overview Boot Payload ────────────────────────────
test('12. getDashboardOverview: returns consolidated dashboard boot payload without errors', async () => {
    const overview = await getDashboardOverview(TEST_ACCOUNT_ID);

    assert.ok(overview);
    assert.ok(overview.subscription);
    assert.ok(overview.credit);
    assert.ok(overview.analytics);
    assert.ok(Array.isArray(overview.recentTransactions));
    assert.ok(Array.isArray(overview.recentEvents));
});

// ── 13. Client-Side Payment Verification (POST /verify) ─────────────────────
test('13. verifyPaymentController: input validation and auth boundaries', async () => {
    // Missing auth -> 401
    let unauthErr = null;
    await verifyPaymentController({ body: {} }, mockRes(), (err) => { unauthErr = err; });
    assert.ok(unauthErr);
    assert.equal(unauthErr.statusCode || unauthErr.status, 401);

    // Missing paymentId -> 400
    let missingPayIdErr = null;
    await verifyPaymentController(
        { accountId: TEST_ACCOUNT_ID.toString(), body: { packageId: 'pro_monthly' } },
        mockRes(),
        (err) => { missingPayIdErr = err; }
    );
    assert.ok(missingPayIdErr);
    assert.equal(missingPayIdErr.statusCode || missingPayIdErr.status, 400);

    // Missing packageId -> 400
    let missingPkgErr = null;
    await verifyPaymentController(
        { accountId: TEST_ACCOUNT_ID.toString(), body: { paymentId: 'pay_xyz' } },
        mockRes(),
        (err) => { missingPkgErr = err; }
    );
    assert.ok(missingPkgErr);
    assert.equal(missingPkgErr.statusCode || missingPkgErr.status, 400);
});
