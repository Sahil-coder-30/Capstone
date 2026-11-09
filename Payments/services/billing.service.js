/**
 * Billing service: orders, payments, invoices and the transaction log.
 *
 * processSubscriptionPayment is the only place money turns into a plan.
 * It runs in one transaction holding the account lock, and the Razorpay
 * payment id is the primary key of `payments`, so the same payment coming
 * from /verify and from the webhook is applied exactly once.
 */

import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { BadRequestError, NotFoundError, logger } from 'faultkit';
import { db } from '../db/client.js';
import { invoices, orders, payments, transactions, usageEvents } from '../db/schema.js';
import { lockAccount, setTier } from './account.service.js';
import { applyPaymentToSlots, promoteInTx, daysFromMs, removePaidPeriod } from './subscription.service.js';
import { getPackageById, getPlanId } from '../config/plans.config.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Orders ────────────────────────────────────────────────────────────────────

export async function createOrderRecord({ id, userId, pkg, email, username }) {
    const [row] = await db.insert(orders).values({
        id,
        userId,
        packageId: pkg.id,
        amountPaise: pkg.pricePaise,
        currency: 'INR',
        email: email || null,
        username: username || null,
    }).returning();
    return row;
}

export async function getOrder(orderId) {
    if (!orderId) return null;
    const [row] = await db.select().from(orders).where(eq(orders.id, orderId));
    return row || null;
}

// ── Payments ──────────────────────────────────────────────────────────────────

/**
 * Money from the gateway as a positive integer number of paise.
 * Accepts a numeric string ("49900"). Rejects missing, zero, negative,
 * fractional and unsafe (> 2^53) values with a 400, so a bad payload never
 * reaches the database as a 500.
 */
export function toAmountPaise(value) {
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (typeof n !== 'number' || !Number.isSafeInteger(n) || n <= 0) {
        throw new BadRequestError(`Invalid payment amount: ${JSON.stringify(value ?? null)}`);
    }
    return n;
}

/**
 * @param {object} p
 * @param {object} p.order        row from `orders`
 * @param {string} p.paymentId    Razorpay payment id
 * @param {number} p.amountPaise  amount Razorpay confirmed
 * @param {string} p.currency     currency Razorpay confirmed, must match the order
 * @param {'verify'|'webhook'} p.source
 */
export async function processSubscriptionPayment({ order, paymentId, amountPaise: rawAmount, currency, signature = null, method = null, source }) {
    const pkg = getPackageById(order.packageId);
    if (!pkg || pkg.tier === 'free') throw new BadRequestError(`Order ${order.id} has no paid package`);
    if (typeof paymentId !== 'string' || !paymentId) throw new BadRequestError('Payment id is missing');
    const amountPaise = toAmountPaise(rawAmount);
    const paidCurrency = String(currency || '').trim().toUpperCase();
    if (paidCurrency !== order.currency) {
        throw new BadRequestError(`Payment currency (${paidCurrency || 'none'}) does not match the order currency (${order.currency})`);
    }
    if (amountPaise < order.amountPaise) {
        throw new BadRequestError(`Paid amount (${amountPaise}) is less than the order amount (${order.amountPaise})`);
    }
    const overpaidPaise = amountPaise - order.amountPaise;
    if (overpaidPaise > 0) {
        logger.warn({ orderId: order.id, paymentId, amountPaise, orderAmountPaise: order.amountPaise }, '[billing] payment is more than the order amount');
    }

    return db.transaction(async (tx) => {
        const userId = order.userId;
        const account = await lockAccount(tx, userId);
        if (!account) throw new NotFoundError(`Account ${userId} not found`);

        // One order is paid by one payment. A second captured payment for the
        // same order means the user was charged twice: keep a record so it can
        // be refunded, never drop it silently.
        const [existing] = await tx.select({ id: payments.id }).from(payments).where(eq(payments.orderId, order.id));
        if (existing) {
            if (existing.id === paymentId) return { status: 'already_processed' };
            return recordDuplicatePayment(tx, { order, paymentId, amountPaise, currency: paidCurrency, originalPaymentId: existing.id, source });
        }

        const [payment] = await tx.insert(payments).values({
            id: paymentId,
            orderId: order.id,
            userId,
            amountPaise,
            currency: order.currency,
            status: 'captured',
            method,
            signature,
            source,
            capturedAt: new Date(),
        }).onConflictDoNothing({ target: payments.id }).returning();

        if (!payment) return { status: 'already_processed' };

        // Settle an expired plan first so the new payment sees the real state.
        await promoteInTx(tx, userId);

        const result = await applyPaymentToSlots(tx, { userId, packageId: pkg.id, paymentId, amountPaise });
        const isActiveNow = result.slot.status === 'active';

        const [invoice] = await tx.insert(invoices).values({
            userId,
            paymentId,
            packageId: pkg.id,
            description: result.description,
            amountPaise,
            currency: order.currency,
            periodStart: isActiveNow ? result.slot.validFrom : null,
            periodEnd: isActiveNow ? result.slot.validUntil : null,
        }).returning();

        const [txRow] = await tx.insert(transactions).values({
            userId,
            type: result.type,
            amountPaise,
            currency: order.currency,
            orderId: order.id,
            paymentId,
            slotId: result.slot.id,
            description: result.description,
            metadata: {
                packageId: pkg.id,
                packageLabel: pkg.label,
                pricingModel: pkg.pricingModel,
                priceINR: amountPaise / 100,
                newTier: pkg.tier,
                activeTier: result.activeTier,
                carriedDays: result.carriedDays,
                slotValidFrom: result.slot.validFrom?.toISOString() || null,
                slotValidUntil: result.slot.validUntil?.toISOString() || null,
                reservedTiers: result.queued.map((q) => q.tier),
                invoiceNumber: invoice.invoiceNumber,
                plan: getPlanId(pkg),
                billingCycle: 'monthly',
                ...(overpaidPaise > 0 ? { overpaidPaise } : {}),
            },
        }).returning();

        await tx.update(orders).set({ status: 'paid' }).where(eq(orders.id, order.id));

        if (result.tierChanged) await setTier(tx, userId, result.activeTier);

        return {
            status: 'success',
            transactionId: txRow.id,
            transactionType: result.type,
            invoiceNumber: invoice.invoiceNumber,
            activeTier: result.activeTier,
            activePlanId: result.active?.planId || null,
            validUntil: result.active?.validUntil || null,
            carriedDays: result.carriedDays,
            reservedSlots: result.queued.map((q) => ({ tier: q.tier, remainingDays: daysFromMs(q.remainingMs) })),
        };
    });
}

async function recordDuplicatePayment(tx, { order, paymentId, amountPaise, currency, originalPaymentId, source }) {
    const [seen] = await tx.select({ id: transactions.id }).from(transactions).where(and(
        eq(transactions.type, 'PAYMENT_DUPLICATE'),
        sql`${transactions.metadata}->>'duplicatePaymentId' = ${paymentId}`,
    ));
    if (!seen) {
        await tx.insert(transactions).values({
            userId: order.userId,
            type: 'PAYMENT_DUPLICATE',
            status: 'PENDING',
            amountPaise,
            currency,
            orderId: order.id,
            description: 'Second payment for an order that was already paid. Needs a refund.',
            metadata: { duplicatePaymentId: paymentId, originalPaymentId, source, needsRefund: true },
        });
        logger.error({ orderId: order.id, paymentId, originalPaymentId, amountPaise }, '[billing] duplicate payment for a paid order, refund needed');
    }
    return { status: 'duplicate_payment', duplicatePaymentId: paymentId, originalPaymentId };
}

/**
 * Logs a failed payment attempt. The order stays open so the user can retry.
 * Skips the log when the order is already paid (a late failure of an older
 * attempt) or when this failed payment id was already logged (webhook replay).
 * @returns {Promise<boolean>} true when a new failure was recorded
 */
export async function recordPaymentFailure({ order, paymentId, reason }) {
    return db.transaction(async (tx) => {
        const [current] = await tx.select({ status: orders.status }).from(orders).where(eq(orders.id, order.id)).for('update');
        if (!current || current.status === 'paid') return false;

        if (paymentId) {
            const [seen] = await tx.select({ id: transactions.id }).from(transactions).where(and(
                eq(transactions.orderId, order.id),
                eq(transactions.type, 'PAYMENT_FAILED'),
                sql`${transactions.metadata}->>'failedPaymentId' = ${paymentId}`,
            ));
            if (seen) return false;
        }

        await tx.insert(transactions).values({
            userId: order.userId,
            type: 'PAYMENT_FAILED',
            status: 'FAILED',
            amountPaise: order.amountPaise,
            currency: order.currency,
            orderId: order.id,
            description: `Payment failed: ${reason || 'unknown reason'}`,
            metadata: { packageId: order.packageId, failedPaymentId: paymentId || null, reason: reason || null },
        });
        return true;
    });
}

// ── Refunds ───────────────────────────────────────────────────────────────────

/**
 * Applies a processed Razorpay refund. Idempotent on the refund id.
 * A full refund marks the payment refunded and takes back the 30 days that
 * payment bought (an expired plan is then promoted or dropped to Free).
 * A partial refund is only logged.
 */
export async function processRefund({ paymentId, refundId, amountPaise: rawAmount }) {
    if (!paymentId || !refundId) throw new BadRequestError('Refund needs a payment id and a refund id');
    const amountPaise = toAmountPaise(rawAmount);

    const [found] = await db.select({ userId: payments.userId }).from(payments).where(eq(payments.id, paymentId));
    if (!found) return { status: 'unknown_payment' };

    return db.transaction(async (tx) => {
        await lockAccount(tx, found.userId);
        const [payment] = await tx.select().from(payments).where(eq(payments.id, paymentId)).for('update');

        const [seen] = await tx.select({ id: transactions.id }).from(transactions).where(and(
            eq(transactions.type, 'PAYMENT_REFUNDED'),
            sql`${transactions.metadata}->>'refundId' = ${refundId}`,
        ));
        if (seen) return { status: 'already_processed' };

        const [{ refundedPaise }] = await tx.select({
            refundedPaise: sql`coalesce(sum(${transactions.amountPaise}), 0)::bigint`,
        }).from(transactions).where(and(eq(transactions.paymentId, paymentId), eq(transactions.type, 'PAYMENT_REFUNDED')));

        const totalRefunded = Number(refundedPaise) + amountPaise;
        const fullRefund = totalRefunded >= payment.amountPaise;
        let revoked = null;

        if (fullRefund && payment.status !== 'refunded') {
            await tx.update(payments).set({ status: 'refunded' }).where(eq(payments.id, paymentId));
            const [paidTx] = await tx.select({ slotId: transactions.slotId }).from(transactions).where(and(
                eq(transactions.paymentId, paymentId),
                sql`${transactions.type} in ('SUBSCRIPTION_ACTIVATION', 'SUBSCRIPTION_EXTENSION', 'SUBSCRIPTION_QUEUED')`,
            ));
            if (paidTx?.slotId) revoked = await removePaidPeriod(tx, paidTx.slotId, payment.amountPaise);
        }

        await tx.insert(transactions).values({
            userId: payment.userId,
            type: 'PAYMENT_REFUNDED',
            status: 'REFUNDED',
            amountPaise,
            currency: payment.currency,
            orderId: payment.orderId,
            paymentId,
            slotId: revoked?.slotId || null,
            description: fullRefund ? 'Payment refunded. Plan time from this payment removed.' : 'Partial refund.',
            metadata: { refundId, fullRefund, totalRefundedPaise: totalRefunded, revokedFromStatus: revoked?.fromStatus || null },
        });

        const after = await promoteInTx(tx, payment.userId);
        return { status: 'success', fullRefund, tier: after.tier };
    });
}

// ── Transaction history ───────────────────────────────────────────────────────

const txSelect = {
    tx: transactions,
    invoiceNumber: invoices.invoiceNumber,
};

function txFilters(userId, { type, status, startDate, endDate } = {}) {
    const where = [eq(transactions.userId, userId)];
    if (type) where.push(sql`${transactions.type}::text = ${type}`);
    if (status) where.push(sql`${transactions.status}::text = ${status}`);
    if (startDate) where.push(gte(transactions.createdAt, new Date(startDate)));
    if (endDate) where.push(lte(transactions.createdAt, new Date(endDate)));
    return and(...where);
}

const flatten = (r) => ({ ...r.tx, invoiceNumber: r.invoiceNumber || null });

export async function listTransactions(userId, { page = 1, limit = 20, ...filters } = {}) {
    const where = txFilters(userId, filters);
    const [rows, [stats]] = await Promise.all([
        db.select(txSelect).from(transactions)
            .leftJoin(invoices, eq(invoices.paymentId, transactions.paymentId))
            .where(where)
            .orderBy(desc(transactions.createdAt))
            .limit(limit).offset((page - 1) * limit),
        db.select({
            total: sql`count(*)::int`,
            successCount: sql`count(*) filter (where ${transactions.status} = 'SUCCESS')::int`,
            spentPaise: sql`coalesce(sum(${transactions.amountPaise}) filter (where ${transactions.status} = 'SUCCESS'), 0)::bigint`,
        }).from(transactions).where(where),
    ]);

    return {
        rows: rows.map(flatten),
        total: stats.total,
        page,
        totalPages: Math.ceil(stats.total / limit) || 1,
        summary: {
            totalSpentINR: Number(stats.spentPaise) / 100,
            totalTransactions: stats.total,
            successCount: stats.successCount,
        },
    };
}

export async function getTransaction(userId, id) {
    if (!UUID_RE.test(String(id || ''))) return null;
    const [row] = await db.select(txSelect).from(transactions)
        .leftJoin(invoices, eq(invoices.paymentId, transactions.paymentId))
        .where(and(eq(transactions.userId, userId), eq(transactions.id, id)));
    return row ? flatten(row) : null;
}

export async function recentTransactions(userId, limit = 5) {
    const rows = await db.select(txSelect).from(transactions)
        .leftJoin(invoices, eq(invoices.paymentId, transactions.paymentId))
        .where(eq(transactions.userId, userId))
        .orderBy(desc(transactions.createdAt))
        .limit(limit);
    return rows.map(flatten);
}

/** Money spent and AI usage totals for the summary card. */
export async function getSpendSummary(userId) {
    const [[spend], [usage]] = await Promise.all([
        db.select({
            spentPaise: sql`coalesce(sum(${payments.amountPaise}), 0)::bigint`,
            purchases: sql`count(*)::int`,
        }).from(payments).where(and(eq(payments.userId, userId), eq(payments.status, 'captured'))),
        db.select({
            tokens: sql`coalesce(sum(${usageEvents.totalTokens}), 0)::bigint`,
            requests: sql`count(*)::int`,
        }).from(usageEvents).where(eq(usageEvents.userId, userId)),
    ]);
    return {
        totalSpentINR: Number(spend.spentPaise) / 100,
        totalPurchases: spend.purchases,
        totalTokensConsumed: Number(usage.tokens),
        totalAIRequests: usage.requests,
    };
}
