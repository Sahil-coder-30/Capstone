import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { BadRequestError, ForbiddenError } from 'faultkit';
import { closeMQ } from '../config/mq.js';
import {
    updateCreditController,
    updateSubscriptionController,
} from '../controllers/credit.controller.js';
import {
    verifyPaymentSignature,
    verifyWebhookSignature,
} from '../services/razorpay.service.js';

// These cases all fail before any DB or Razorpay call, so no fixtures needed.

const captureNext = async (fn, req) => {
    let caught = null;
    await fn(req, {}, (err) => { caught = err; });
    return caught;
};

const withEnv = async (vars, fn) => {
    const previous = {};
    for (const [k, v] of Object.entries(vars)) {
        previous[k] = process.env[k];
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
    try {
        return await fn();
    } finally {
        for (const [k, v] of Object.entries(previous)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
    }
};

test.after(async () => {
    await closeMQ();
});

test('1. PATCH subscription: non-admin cannot self-grant a paid tier', async () => {
    for (const tier of ['pro', 'max']) {
        const err = await captureNext(updateSubscriptionController, {
            user: { id: new mongoose.Types.ObjectId().toString(), role: 'user' },
            body: { subscription: tier },
        });
        assert.ok(err instanceof ForbiddenError, `expected ForbiddenError for ${tier}`);
        assert.equal(err.statusCode, 403);
    }
});

test('2. credit/update: body userId for another account is rejected', async () => {
    const err = await captureNext(updateCreditController, {
        user: { id: new mongoose.Types.ObjectId().toString() },
        body: {
            userId: new mongoose.Types.ObjectId().toString(),
            company: 'mistral',
            totalTokens: 1000,
        },
    });
    assert.ok(err instanceof ForbiddenError);
    assert.equal(err.statusCode, 403);
});

test('3. verifyPaymentSignature: orderId and signature are mandatory', async () => {
    const base = {
        accountId: new mongoose.Types.ObjectId().toString(),
        packageId: 'pro',
        paymentId: 'pay_abc',
    };
    await assert.rejects(() => verifyPaymentSignature({ ...base }), BadRequestError);
    await assert.rejects(() => verifyPaymentSignature({ ...base, orderId: 'order_abc' }), BadRequestError);
    await assert.rejects(() => verifyPaymentSignature({ ...base, signature: 'sig' }), BadRequestError);
});

test('4. verifyPaymentSignature: synthetic test signatures need ALLOW_SYNTHETIC_PAYMENTS', async () => {
    await withEnv({
        RAZORPAY_KEY_ID: 'rzp_test_dummy',
        RAZORPAY_KEY_SECRET: 'dummy_secret',
        RAZORPAY_MODE: 'test',
        ALLOW_SYNTHETIC_PAYMENTS: undefined,
    }, async () => {
        await assert.rejects(
            () => verifyPaymentSignature({
                accountId: new mongoose.Types.ObjectId().toString(),
                packageId: 'max',
                orderId: 'order_fake',
                paymentId: 'pay_test_fake',
                signature: 'test_fake',
            }),
            (err) => err instanceof BadRequestError && /signature/i.test(err.message)
        );
    });
});

test('5. verifyWebhookSignature: accepts the raw Buffer express.json stores', async () => {
    const secret = 'whsec_test_buffer';
    const raw = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: { a: 1 } }));
    const signature = crypto.createHmac('sha256', secret).update(raw).digest('hex');

    await withEnv({ RAZORPAY_WEBHOOK_SECRET: secret }, async () => {
        assert.equal(verifyWebhookSignature({ rawBody: raw, signature }), true);
        assert.equal(verifyWebhookSignature({ rawBody: raw, signature: 'bad' }), false);
    });
});

test('6. verifyWebhookSignature: does not fall back to the API key secret', async () => {
    await withEnv({ RAZORPAY_WEBHOOK_SECRET: undefined, RAZORPAY_KEY_SECRET: 'api_secret' }, async () => {
        assert.throws(() => verifyWebhookSignature({ rawBody: '{}', signature: 'x' }), /RAZORPAY_WEBHOOK_SECRET/);
    });
});
