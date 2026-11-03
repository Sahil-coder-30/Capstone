# Payments Service

Owns accounts, subscriptions, billing (orders, payments, invoices), the transaction log, and the 5-hour AI credit window for Taksha CodeSpace.

| | |
|---|---|
| Runtime | Node.js (ESM), Express 5 |
| Database | Postgres on Supabase, through Drizzle ORM |
| Gateway | Razorpay (orders, checkout signature, webhook HMAC) |
| Also uses | Redis (token blacklist, cron lock), RabbitMQ (`payment_notification_queue`) |
| Port | `PORT` env (5002 local, 5051 in k8s) |

The checkout UI lives in `payments_frontend/`. It is a separate Vite app and is not covered here.

---

## What it does

| Job | Where |
|---|---|
| Account per user, created on first request | `services/account.service.js` |
| AI credit window (check, record usage) | `services/credit.service.js` |
| Subscription slot queue (activate, extend, upgrade, queue, promote) | `services/subscription.service.js` |
| Orders, payments, invoices, transaction history | `services/billing.service.js` |
| Checkout flow (create order, verify, webhook) | `services/checkout.service.js` |
| Razorpay calls | `services/razorpay.service.js` |
| Payment emails | `services/notification.service.js` |
| Nightly expiry sweep | `services/cron.service.js` |

### Credit window

- Every tier has one shared credit window: Free 20, Pro 150, Max 200 credits.
- 1 credit = `TOKENS_PER_AI_CREDIT` tokens (default 1000).
- When the balance drops below 5, the window locks and refills 5 hours later.
- Refill is lazy: the next read after `window_refill_at` resets the balance. No cron.
- `POST /credit/update` is idempotent per `(user, requestId)`.

### Subscription slots

- One `active` slot per user (enforced by a partial unique index), any number of `queued` slots.
- Same tier again: +30 days on the active slot.
- Higher tier: starts now. The old plan moves to the queue with the time it had left (`remaining_ms`).
- Lower tier: queued with 30 days.
- When the active slot ends, the best queued slot starts for its remaining time. Otherwise the user goes back to Free.
- Promotion runs lazily on every read and in a nightly sweep for inactive users.

### Payment safety

- `processSubscriptionPayment` runs in one transaction holding a `SELECT ... FOR UPDATE` lock on the account row.
- The Razorpay payment id is the primary key of `payments`, so the same payment from `/verify` and the webhook is applied once.
- `/verify` checks that the order (from the `orders` table) belongs to the caller.
- Synthetic test payments only work with `NODE_ENV=test`, test keys and `ALLOW_SYNTHETIC_PAYMENTS=true`.

---

## Database

Tables (see `db/schema.js`):

| Table | Purpose |
|---|---|
| `accounts` | One row per user: cached tier, credit window |
| `subscription_slots` | Active and queued plans |
| `orders` | Razorpay orders created by `/create/order` |
| `payments` | Captured payments, keyed by Razorpay payment id |
| `invoices` | One per payment, numbered `TKS-YYYY-NNNNNN` |
| `transactions` | Log of plan and money events |
| `usage_events` | One row per AI request |

Rules:

- User ids are the Auth user id (text). Money is integer paise. Credits are `numeric(14,3)`.
- RLS is on for every table with no policies, so the Supabase public API cannot read them. The service connects as the owner and bypasses RLS.

Migrations:

```bash
npm run db:generate   # after editing db/schema.js
npm run db:migrate    # applies to DATABASE_URL
```

---

## API

All paths are under `/api/payments`. Errors use the FaultKit shape `{ success: false, error: { code, message, details, requestId } }`.

| Method | Path | Auth | Caller |
|---|---|---|---|
| GET | `/credit/packages` | none | Frontend, payments_frontend |
| GET | `/credit` | JWT | Frontend |
| GET | `/credit/check` | JWT | Ai_orchestration, payments_frontend |
| POST | `/credit/update` | JWT | Ai_orchestration |
| GET | `/credit/transactions` | JWT | Frontend |
| GET | `/credit/transactions/summary` | JWT | Frontend |
| GET | `/credit/analytics` | JWT | Frontend |
| POST | `/create/order` | JWT | payments_frontend |
| POST | `/verify` | JWT | payments_frontend |
| POST | `/webhook` | Razorpay HMAC | Razorpay |
| GET | `/subscription` | JWT | payments_frontend |
| GET | `/transactions`, `/transactions/:id` | JWT | payments_frontend |
| GET | `/usage-events`, `/usage-events/analytics` | JWT | payments_frontend |
| GET | `/dashboard/overview` | JWT | payments_frontend |
| GET | `/healthz`, `/readyz` | none | k8s probes (`/readyz` checks the DB) |

JWT: RS256 access token from Auth, key picked by `kid` from `AUTH_JWKS_URI`, checked against the Redis blacklist.

---

## Config

Set these in `.env` (local) or the k8s manifest:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Supabase transaction pooler URL, port 6543 |
| `AUTH_JWKS_URI` | Auth JWKS, for example `http://auth-service/.well-known/jwks.json` |
| `REDIS_URI` | Token blacklist and cron lock |
| `MQ_URL` | RabbitMQ |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Gateway keys |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook HMAC secret (separate from the key secret) |
| `PLAN_ID_FREE`, `PLAN_ID_PRO`, `PLAN_ID_MAX` | Optional plan ids shown to clients |
| `TOKENS_PER_AI_CREDIT` | Optional, default 1000 |

Use the direct Supabase host only if the service runs somewhere with IPv6. Docker and k8s need the pooler.

---

## Run

```bash
cd Payments
npm install
npm run dev
```

## Test

Tests truncate every table, so they only run against a local database:

```bash
cd Payments
docker compose up -d      # Postgres 16 on localhost:5433
npm test
docker compose down
```
