/**
 * Billing service: orders, payments, invoices and the transaction log.
 *
 * processSubscriptionPayment is the only place money turns into a plan.
 * It runs in one transaction holding the account lock, and the Razorpay
 * payment id is the primary key of `payments`, so the same payment coming
 * from /verify and from the webhook is applied exactly once.
 */

import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { BadRequestError, NotFoundError } from 'faultkit';
import { db } from '../db/client.js';
import { invoices, orders, payments, transactions, usageEvents } from '../db/schema.js';
import { lockAccount, setTier } from './account.service.js';
import { applyPaymentToSlots, promoteInTx, daysFromMs } from './subscription.service.js';
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
 * @param {object} p
 * @param {object} p.order        row from `orders`
 * @param {string} p.paymentId    Razorpay payment id
 * @param {number} p.amountPaise  amount Razorpay confirmed
 * @param {'verify'|'webhook'} p.source
 */
export async function processSubscriptionPayment({ order, paymentId, amountPaise, signature = null, method = null, source }) {
    const pkg = getPackageById(order.packageId);
    if (!pkg || pkg.tier === 'free') throw new BadRequestError(`Order ${order.id} has no paid package`);
    if (amountPaise < order.amountPaise) {
        throw new BadRequestError(`Paid amount (${amountPaise}) is less than the order amount (${order.amountPaise})`);
    }

    return db.transaction(async (tx) => {
        const userId = order.userId;
        const account = await lockAccount(tx, userId);
        if (!account) throw new NotFoundError(`Account ${userId} not found`);

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
        }).onConflictDoNothing().returning();

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

/** Logs a failed payment attempt. The order stays open so the user can retry. */
export async function recordPaymentFailure({ order, paymentId, reason }) {
    await db.insert(transactions).values({
        userId: order.userId,
        type: 'PAYMENT_FAILED',
        status: 'FAILED',
        amountPaise: order.amountPaise,
        currency: order.currency,
        orderId: order.id,
        description: `Payment failed: ${reason || 'unknown reason'}`,
        metadata: { packageId: order.packageId, failedPaymentId: paymentId || null, reason: reason || null },
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
