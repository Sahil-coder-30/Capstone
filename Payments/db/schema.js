/**
 * Payments database schema (Postgres, Drizzle ORM).
 *
 * Rules:
 *  - user_id is the Auth user id (24-char hex string), stored as text.
 *  - Money is integer paise (bigint). Credits are numeric(14,3).
 *  - Every table has RLS enabled with no policies, so the Supabase public
 *    API (anon / authenticated keys) cannot read it. The service connects
 *    as the database owner, which bypasses RLS.
 */

import { sql } from 'drizzle-orm';
import {
    pgTable,
    pgEnum,
    pgSequence,
    text,
    integer,
    bigint,
    numeric,
    timestamp,
    uuid,
    jsonb,
    index,
    uniqueIndex,
    check,
} from 'drizzle-orm/pg-core';

// ── Enums ─────────────────────────────────────────────────────────────────────

export const tierEnum = pgEnum('tier', ['free', 'pro', 'max']);

export const slotStatusEnum = pgEnum('slot_status', ['active', 'queued', 'expired']);

export const orderStatusEnum = pgEnum('order_status', ['created', 'paid', 'failed']);

export const paymentStatusEnum = pgEnum('payment_status', ['captured', 'failed', 'refunded']);

export const transactionTypeEnum = pgEnum('transaction_type', [
    'SUBSCRIPTION_ACTIVATION',
    'SUBSCRIPTION_EXTENSION',
    'SUBSCRIPTION_QUEUED',
    'SUBSCRIPTION_PROMOTED',
    'SUBSCRIPTION_EXPIRED',
    'PAYMENT_FAILED',
    'PAYMENT_REFUNDED',
    'PAYMENT_DUPLICATE',
]);

export const transactionStatusEnum = pgEnum('transaction_status', ['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED']);

export const invoiceNumberSeq = pgSequence('invoice_number_seq', { startWith: 1 });

// ── Shared column helpers ─────────────────────────────────────────────────────

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
    .$onUpdate(() => new Date());
const paise = (name) => bigint(name, { mode: 'number' });
const credits = (name) => numeric(name, { precision: 14, scale: 3, mode: 'number' });

// ── accounts ──────────────────────────────────────────────────────────────────

export const accounts = pgTable('accounts', {
    userId: text('user_id').primaryKey(),
    email: text('email'),
    tier: tierEnum('tier').notNull().default('free'),
    windowCreditsTotal: credits('window_credits_total').notNull().default(20),
    windowCreditsRemaining: credits('window_credits_remaining').notNull().default(20),
    windowExhaustedAt: timestamp('window_exhausted_at', { withTimezone: true }),
    windowRefillAt: timestamp('window_refill_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}, (t) => [
    check('accounts_window_remaining_non_negative', sql`${t.windowCreditsRemaining} >= 0`),
    index('accounts_window_refill_at_idx').on(t.windowRefillAt),
]).enableRLS();

// ── orders ────────────────────────────────────────────────────────────────────

export const orders = pgTable('orders', {
    id: text('id').primaryKey(),                       // Razorpay order id
    userId: text('user_id').notNull().references(() => accounts.userId),
    packageId: text('package_id').notNull(),
    amountPaise: paise('amount_paise').notNull(),
    currency: text('currency').notNull().default('INR'),
    status: orderStatusEnum('status').notNull().default('created'),
    email: text('email'),
    username: text('username'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}, (t) => [
    index('orders_user_id_idx').on(t.userId, t.createdAt.desc()),
    check('orders_amount_positive', sql`${t.amountPaise} > 0`),
]).enableRLS();

// ── payments ──────────────────────────────────────────────────────────────────

export const payments = pgTable('payments', {
    id: text('id').primaryKey(),                       // Razorpay payment id = idempotency key
    orderId: text('order_id').notNull().unique().references(() => orders.id),
    userId: text('user_id').notNull().references(() => accounts.userId),
    amountPaise: paise('amount_paise').notNull(),
    currency: text('currency').notNull().default('INR'),
    status: paymentStatusEnum('status').notNull(),
    method: text('method'),
    signature: text('signature'),
    source: text('source').notNull(),                  // 'verify' | 'webhook'
    capturedAt: timestamp('captured_at', { withTimezone: true }),
    createdAt: createdAt(),
}, (t) => [
    index('payments_user_id_idx').on(t.userId, t.createdAt.desc()),
]).enableRLS();

// ── subscription_slots ────────────────────────────────────────────────────────

export const subscriptionSlots = pgTable('subscription_slots', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => accounts.userId),
    packageId: text('package_id').notNull(),
    tier: tierEnum('tier').notNull(),
    planId: text('plan_id').notNull(),
    status: slotStatusEnum('status').notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    // Queued slots keep how much time they have left, not a fixed end date,
    // so days are not lost while a higher tier is active.
    remainingMs: bigint('remaining_ms', { mode: 'number' }),
    paidAmountPaise: paise('paid_amount_paise').notNull().default(0),
    carriedDays: integer('carried_days').notNull().default(0),
    paymentId: text('payment_id').references(() => payments.id),
    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}, (t) => [
    uniqueIndex('subscription_slots_one_active_per_user').on(t.userId).where(sql`status = 'active'`),
    index('subscription_slots_user_status_idx').on(t.userId, t.status),
    index('subscription_slots_status_valid_until_idx').on(t.status, t.validUntil),
    index('subscription_slots_payment_id_idx').on(t.paymentId),
]).enableRLS();

// ── invoices ──────────────────────────────────────────────────────────────────

export const invoices = pgTable('invoices', {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceNumber: text('invoice_number').notNull().unique()
        .default(sql`('TKS-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('invoice_number_seq')::text, 6, '0'))`),
    userId: text('user_id').notNull().references(() => accounts.userId),
    paymentId: text('payment_id').notNull().unique().references(() => payments.id),
    packageId: text('package_id').notNull(),
    description: text('description').notNull(),
    amountPaise: paise('amount_paise').notNull(),
    currency: text('currency').notNull().default('INR'),
    periodStart: timestamp('period_start', { withTimezone: true }),
    periodEnd: timestamp('period_end', { withTimezone: true }),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    index('invoices_user_id_idx').on(t.userId, t.issuedAt.desc()),
]).enableRLS();

// ── transactions (audit log of money and plan events) ─────────────────────────

export const transactions = pgTable('transactions', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => accounts.userId),
    type: transactionTypeEnum('type').notNull(),
    status: transactionStatusEnum('status').notNull().default('SUCCESS'),
    amountPaise: paise('amount_paise').notNull().default(0),
    currency: text('currency').notNull().default('INR'),
    orderId: text('order_id'),
    paymentId: text('payment_id').references(() => payments.id),
    slotId: uuid('slot_id').references(() => subscriptionSlots.id),
    description: text('description').notNull().default(''),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: createdAt(),
}, (t) => [
    index('transactions_user_created_idx').on(t.userId, t.createdAt.desc()),
    index('transactions_payment_id_idx').on(t.paymentId),
    index('transactions_slot_id_idx').on(t.slotId),
]).enableRLS();

// ── usage_events (one row per AI request) ─────────────────────────────────────

export const usageEvents = pgTable('usage_events', {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: text('user_id').notNull().references(() => accounts.userId),
    requestId: text('request_id').notNull(),
    provider: text('provider').notNull(),
    modelId: text('model_id').notNull().default(''),
    agentType: text('agent_type').notNull().default('unknown'),
    projectId: text('project_id').notNull().default(''),
    chatId: text('chat_id'),
    tier: tierEnum('tier').notNull(),
    promptTokens: integer('prompt_tokens').notNull().default(0),
    completionTokens: integer('completion_tokens').notNull().default(0),
    totalTokens: integer('total_tokens').notNull().default(0),
    creditsDeducted: credits('credits_deducted').notNull().default(0),
    createdAt: createdAt(),
}, (t) => [
    uniqueIndex('usage_events_user_request_uq').on(t.userId, t.requestId),
    index('usage_events_user_created_idx').on(t.userId, t.createdAt.desc()),
    check('usage_events_tokens_non_negative', sql`${t.promptTokens} >= 0 AND ${t.completionTokens} >= 0 AND ${t.totalTokens} >= 0`),
]).enableRLS();
