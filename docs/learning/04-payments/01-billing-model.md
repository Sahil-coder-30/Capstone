# Payments 1: billing model (Postgres, slots, credit window, Razorpay)

> **Shipped:** v1 on Mongo 2026-07-24; rewritten on Postgres 2026-11-03 (`80d8fc7` `82c56ee` `fed87b3`) · **Earlier fixes:** `26166c2` `f047cc4` (2026-10-30)
> **Code:** `Payments/db/schema.js`, `services/{billing,subscription,credit,checkout,razorpay}.service.js`, `config/plans.config.js`
> **One line:** subscriptions you can stack without losing days, and AI usage metered in a 5-hour credit window.

## 1. Data

Postgres on Supabase through Drizzle. Tables: `accounts`, `subscription_slots`, `orders`, `payments`, `invoices`, `transactions`, `usage_events`. Money is integer paise; credits `numeric(14,3)`. RLS on with no policies, so Supabase's public API reads nothing. `DATABASE_URL` is the transaction pooler (port 6543), so `postgres.js` runs with `prepare: false`.

Plans: Free, Pro (Rs 499), Max (Rs 999), each 30 days.

| Tier | Credits per 5-hour window | Lower limit |
|---|---|---|
| Free | 20 | 5 |
| Pro | 150 | 5 |
| Max | 200 | 5 |

1 credit = 1000 tokens (`TOKENS_PER_AI_CREDIT`).

## 2. Checkout flow

```
Browser ─POST /create/order {packageId}─► Payments: price from server config → Razorpay order → orders row
Browser ─ Razorpay modal ─► pays
Browser ─POST /verify {orderId, paymentId, signature}─►  order must belong to caller
                                                         HMAC check (constant time)
                                                         re-fetch payment from Razorpay
Razorpay ─POST /webhook (HMAC over raw body)──────────►
          both paths → processSubscriptionPayment():
             BEGIN; SELECT account FOR UPDATE;
             INSERT payments(id = razorpay payment id)   ← primary key = applies once
             invoice + transaction + slot change + tier update; COMMIT
          → payment_notification_queue (email to the address on the order)
```

## 3. Subscription slots

A user has at most one `active` slot (partial unique index) and any number of `queued` slots.

- Same tier bought again: extend the active slot by 30 days.
- Higher tier: it becomes active now; the old plan moves to the queue with `remaining_ms` (days it still had).
- Lower tier: queued behind the active one.
- Active expires: the best queued slot takes over for its remaining time. Promotion happens lazily on every read and in a nightly cron behind a Redis `SET NX` lock.

## 4. Credit window

`checkCredit` (before a run) and `recordUsage` (after) in `credit.service.js`. When the balance drops below the lower limit, the window locks and refills 5 hours later. Refill is lazy on read (no refill cron). `recordUsage` runs in one transaction: insert into `usage_events` (unique on `(user_id, request_id)`, so a retry is a no-op), then `greatest(0, remaining - cost)` with a DB check that credits never go negative. Usage is always billed to the token's user, never a body `userId`.

## 5. Decisions

| Decision | Rejected | Why |
|---|---|---|
| Postgres (Supabase) | Stay on Mongo | Money needs multi-row ACID transactions, row locks, unique constraints and CHECKs. Each Payments write touches 4–5 tables |
| Payment id as primary key | "Check if exists, then insert" | The DB enforces once-only even when verify and webhook race |
| Account row lock (`FOR UPDATE`) per settlement | Optimistic retries | All money changes for one user are serialised; simple and correct at this scale |
| Both `/verify` and webhook settle | Webhook only; verify only | Verify gives instant UX; the webhook catches closed tabs. Idempotency makes doing both safe |
| Webhook processes before replying | Reply 200 then process | If processing fails, Razorpay retries |
| Price from server config, never the client | Accept amount from the client | Client amounts are attacker input |
| Lazy window refill and lazy slot promotion | Cron jobs for each | Always correct on read, no cron drift; the nightly sweep is only a safety net |
| Queued slots keep `remaining_ms` | Fixed end dates | An upgrade pauses the old plan instead of burning its days |
| Paid tiers only from a verified payment (`f047cc4`) | `PATCH /subscription` to set tier | Users could upgrade themselves for free. Now only downgrade-to-free is allowed |

## 6. Interview questions

**Q1. Why did you move Payments from MongoDB to Postgres?**
A: Settling a payment writes the payment, invoice, transaction, subscription slot and account tier together. I wanted all-or-nothing transactions, a row lock per account, unique constraints for idempotency and CHECK constraints so credits cannot go negative. Postgres gives all of that natively.

**Q2. The webhook and /verify can arrive at the same time. How do you avoid granting 60 days?**
A: Both call the same function inside a transaction that locks the account row and inserts into `payments` with the Razorpay payment id as primary key. The second insert conflicts and does nothing. Tests fire verify and webhook together, and 10 parallel verifies, and check exactly 30 days.

**Q3. Design a usage-based credit system.**
A: Record each request as a usage event with a unique `(user_id, request_id)`, deduct in the same transaction with a floor at zero, refill lazily by comparing `now` with the stored refill time on read. Check before the request (cheap, can fail open) and charge after with the idempotency key.

**Q4. A user on Pro with 15 days left buys Max. What happens?**
A: Max becomes active for 30 days. Pro goes to the queue with 15 days stored as `remaining_ms`. When Max ends, Pro is promoted with its 15 days, lazily on the next read or by the nightly sweep.

**Q5. Why use the Supabase transaction pooler, and what does it break?**
A: Pods open many short connections; the pooler (PgBouncer-style, transaction mode) shares a few real connections. Transaction mode cannot keep prepared statements across transactions, so the driver runs with `prepare: false`. The direct host is also IPv6 only, which fails from Docker.

## 7. Revise in 60 seconds

- Postgres + Drizzle, money in paise, RLS on, pooler with `prepare: false`.
- Settle = one transaction, account row lock, payment id as PK.
- Slots: one active, queued keep `remaining_ms`; lazy promotion + nightly locked sweep.
- Credits: 5-hour window, lazy refill, `(user_id, request_id)` unique, floor at 0.
- Price and user always from the server/token.
