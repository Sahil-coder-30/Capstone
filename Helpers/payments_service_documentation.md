# Payments Service — Comprehensive Technical Documentation

> **Service Name:** Payments Service (`payments`)  
> **Port:** `5002`  
> **Architecture:** Decoupled Microservice, JWKS Token Authentication, Event-Driven, Multi-Bucket Token Rate Limiting  
> **Primary Database:** MongoDB (`payment` database)  

---

## 1. Executive Summary & Architecture Overview

The **Payments Service** is a dedicated microservice responsible for credit balance accounting, tiered subscription management, AI request rate-limiting, referral commission processing, and Razorpay payment integration.

```
                        ┌─────────────────────────────────────┐
                        │          Auth Service               │
                        │   (JWKS: /.well-known/jwks.json)    │
                        └──────────────────┬──────────────────┘
                                           │ RS256 Public Keys
                                           ▼
┌──────────────────┐  Bearer JWT   ┌──────────────────────────────────┐
│  Client / Gateway│──────────────►│    identifyUser Middleware       │
└──────────────────┘               └──────────────────┬───────────────┘
                                                      │ Resolves / Creates
                                                      ▼
                                           ┌──────────────────────────┐
                                           │   Account (_id = accountId)│
                                           └──────────┬───────────────┘
                                                      │ Source of Truth
             ┌───────────────────┬────────────────────┼───────────────────┬───────────────────┐
             ▼                   ▼                    ▼                   ▼                   ▼
    ┌─────────────────┐ ┌─────────────────┐ ┌──────────────────┐ ┌─────────────────┐ ┌─────────────────┐
    │  Credit Summary │ │ ProviderBuckets │ │ Referral Credits │ │    Referrals    │ │   Transactions  │
    │   (credits)     │ │(provider_buckets│ │(referral_credits)│ │   (referrals)   │ │  (transactions) │
    └─────────────────┘ └─────────────────┘ └──────────────────┘ └─────────────────┘ └─────────────────┘
```

### Key Architectural Principles:
1. **Single Source of Truth (`accountId`):** Every model references `Account._id`. The service resolves user JWTs statelessly against the Auth Service JWKS endpoint and bridges `user_id` to an internal `Account`.
2. **5-Separated Collections:** Heavy subdocuments (provider buckets, referral history, usage events) are split into standalone collections to prevent document bloat and guarantee sub-millisecond query performance.
3. **Two-Phase Credit Deduction:** AI calls are pre-checked before execution (Phase 1) and settled with actual token cost post-execution (Phase 2).
4. **No Revenue Loss Overdraft Protection:** If a heavy AI request drives a balance negative, the debt is recorded as `overdraftCredits` and automatically recouped from the next scheduled 5-hour refill.
5. **7-Day Referral Hold & Automated Settlement:** Referral commissions are held for 7 days (free refund window) before being credited to the user's bucket via an hourly cron job and lazy inline checks.

---

## 2. Database Models Schema Reference

### 2.1 `Account` Model (`accounts` collection)
The identity bridge between Auth Service (`user_id`) and Payments (`Account._id`).

```js
{
  _id: ObjectId,                     // accountId (Primary key for all Payments models)
  user_id: ObjectId,                 // Auth Service User ID (Indexed, Unique)
  subscription_status: 'free' | 'pro' | 'max',
  subscription_expiry: Date | null,
  is_active: Boolean,                // Default: true
  createdAt: Date,
  updatedAt: Date
}
```

### 2.2 `Credit` Model (`credits` collection)
Lean summary document tracking lifetime aggregate token consumption.

```js
{
  accountId: ObjectId,               // Ref: 'Account' (Unique, Indexed)
  plan: 'free' | 'pro' | 'max',       // Current active subscription tier
  promptTokens: Number,              // Aggregate prompt tokens consumed
  completionTokens: Number,          // Aggregate completion tokens consumed
  totalTokens: Number,               // Aggregate total tokens consumed
  totalCreditsUsed: Number           // Lifetime credits deducted
}
```

### 2.3 `ProviderBucket` Model (`provider_buckets` collection)
Per-provider (`gemini`, `mistral`) token-bucket rate-limiting state.

```js
{
  accountId: ObjectId,               // Ref: 'Account'
  company: 'gemini' | 'mistral',     // Provider name (Compound Unique Index: accountId + company)
  bucketCapacity: Number,            // Max credits based on plan (free: 80, pro: 250, max: 600)
  creditsGranted: Number,            // Cumulative grants
  creditsRemaining: Number,          // Current spendable balance
  emptiedAt: Date | null,            // Timestamp when bucket hit 0
  refillAt: Date | null,             // Timestamp when bucket will auto-refill (emptiedAt + 5h)
  overdraftCredits: Number,          // Overdraft debt to recover at next refill
  promptTokens: Number,              // Provider-specific prompt tokens
  completionTokens: Number,          // Provider-specific completion tokens
  totalTokens: Number,               // Provider-specific total tokens
  requestCount: Number,              // Request counter
  lastUsedAt: Date
}
```

### 2.4 `ReferralCredit` Model (`referral_credits` collection)
Global referral credit overflow pool shared across all AI providers.

```js
{
  accountId: ObjectId,               // Ref: 'Account' (Unique, Indexed)
  creditsEarned: Number,             // Cumulative referral credits earned (Capped at 1000)
  creditsRemaining: Number,          // Current spendable overflow balance
  lifetimeCap: 1000                  // Immutable hard cap
}
```

### 2.5 `Referral` Model (`referrals` collection)
Manages user referral codes and tracks individual referred user sign-ups with 7-day refund hold states.

```js
{
  accountId: ObjectId,               // Referrer Account ID (Ref: 'Account', Unique)
  referralHash: String,              // Shareable code (e.g. 'REF-4B8F9A', Unique, Indexed)
  status: 'active' | 'deprecated' | 'suspended',
  usedBy: [
    {
      accountId: ObjectId,           // Referred user Account ID
      creditsAwarded: 50,            // Commission amount
      status: 'pending' | 'success' | 'cancelled',
      commissionSettled: Boolean,    // True once paid out
      usedAt: Date,                  // Sign-up timestamp
      eligibleAt: Date,              // Maturity date (usedAt + 7 days)
      settledAt: Date | null          // Payout timestamp
    }
  ],
  totalReferrals: Number,
  totalCreditsEarned: Number
}
```

### 2.6 `UsageEvent` Model (`usage_events` collection)
Granular, append-only per-request AI execution log.

```js
{
  accountId: ObjectId,               // Ref: 'Account' (Indexed)
  company: 'gemini' | 'mistral',
  modelId: String,                   // e.g. 'gemini-1.5-pro'
  agentType: 'codingAgent' | 'copilot' | 'appAgent' | 'title' | 'unknown',
  projectId: String,
  requestId: String,
  chatId: ObjectId,
  promptTokens: Number,
  completionTokens: Number,
  totalTokens: Number,
  creditsDeducted: Number,
  creditSource: 'main' | 'referral',
  overdraftIncurred: Number,
  createdAt: Date
}
```

### 2.7 `Transaction` Model (`transactions` collection)
Immutable financial audit ledger and Razorpay idempotency anchor.

```js
{
  accountId: ObjectId,               // Ref: 'Account' (Indexed)
  orderId: String,                   // Razorpay order ID
  paymentId: String,                 // Razorpay payment ID (Unique Sparse Index)
  type: 'CREDIT_PURCHASE' | 'SUBSCRIPTION_CHANGE' | 'USAGE_DEDUCTION' | 'REFERRAL_CREDIT' | 'REFUND' | 'RESET',
  amountPaise: Number,               // Payment amount in paise (1 INR = 100 paise)
  currency: 'INR',
  creditsDelta: Number,
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED',
  aggregator: 'RAZORPAY' | 'INTERNAL' | 'SYSTEM',
  description: String,
  metadata: Object,
  createdAt: Date
}
```

---

## 3. Core Business Logic & Workflows

### 3.1 Two-Phase Credit Deduction Flow

To prevent expensive AI calls from being blocked unnecessarily while ensuring exact token-based billing:

```
Step 1: Client makes AI Request
           │
           ▼
Phase 1: Rate Limit Middleware (creditRateLimit / authorizeAIRequest)
           │ Checks: creditsRemaining > 10 (MIN_CREDITS_THRESHOLD)
           ├─ YES: Allow request ➔ Attach req.creditInfo.authorizedSource ('main' | 'referral')
           └─ NO:  Reject with HTTP 429 & Retry-After header
           │
           ▼
Step 2: AI Execution (Gemini / Mistral API call runs)
           │ Returns actual input & output token counts
           ▼
Phase 2: Settlement (settleAIRequest)
           │ Deducts calculated actualCreditsUsed from authorizedSource
           ├─ Balance goes negative? ➔ Stamp overdraftCredits, floor balance to 0
           ├─ Main bucket drained?  ➔ Stamp emptiedAt and refillAt (now + 5 hours)
           └─ Create UsageEvent audit record & update Credit lifetime totals
```

### 3.2 Lazy 5-Hour Token Bucket Refill

Provider buckets auto-refill **inline (lazily)** when requested after `refillAt` has passed:
- `refillAmount = Math.max(0, bucketCapacity - overdraftCredits)`
- Debt is cleared (`overdraftCredits = 0`), and credits are restored without financial loss.

### 3.3 7-Day Referral Holding & Commission Settlement

```
Day 0: User B signs up using User A's referral code
           │
           ▼
`referrals` record added under User A with status: 'pending', eligibleAt: now + 7 days
           │
           ▼ (7 Days Pass)
           │
Dual-Engine Settlement:
 ├── Hourly Cron Job (initCronJobs): Scans for eligibleAt <= now, auto-settles in background
 └── Lazy Settlement (checkBucketController / getReferralDetailsController): Auto-settles when user checks balance
           │
           ▼
Outcome:
 ├── Referral usage status ➔ 'success', commissionSettled ➔ true
 ├── 50 credits deposited into User A's `referral_credits` document
 └── Immutable `REFERRAL_CREDIT` transaction recorded in ledger
```

### 3.4 Razorpay Webhook & Payment Confirmation

1. **Order Creation (`POST /api/payments/order`):**
   - Validates `packageId` and creates Razorpay Order with `amount` in paise and `receipt: accountId_packageId_timestamp`.
2. **Webhook Receiver (`POST /api/payments/webhook`):**
   - Uses `express.raw()` body parser for crypto-accurate signature verification.
   - Verifies `X-Razorpay-Signature` header via `HMAC-SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET)`.
   - Returns HTTP `200 OK` immediately to prevent Razorpay retries.
   - Asynchronously invokes `allocatePurchasedCredits()` (guaranteed idempotent by unique `paymentId` index in `Transaction`).
   - Dispatches payment notification event over RabbitMQ (`MQ_URL`).

---

## 4. API Endpoints Specification

### Public Routes (No Auth Required)
| Method | Path | Description |
|---|---|---|
| `GET` | `/healthz` | Service health check probe |
| `GET` | `/readyz` | Service readiness check probe |
| `GET` | `/api/payments/packages` | Returns public subscription plans & pricing |

### Authenticated Routes (Requires `Authorization: Bearer <JWT>`)
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/payments/` | Returns user's full `Credit` summary document |
| `GET` | `/api/payments/check/bucket` | Runs lazy refills & 7-day referral settlement, returns bucket status |
| `GET` | `/api/payments/check` | Alias for `/check/bucket` |
| `GET` | `/api/payments/transactions` | Returns paginated user transaction audit history |
| `GET` | `/api/payments/transactions/summary` | Returns aggregated payment totals & credit stats |
| `GET` | `/api/payments/analytics` | Returns paginated `UsageEvent` token usage log |
| `GET` | `/api/payments/referral/details` | Returns referral code, share link, and referred user status list |
| `POST` | `/api/payments/referral/apply` | Redeems a referral code (`{ referralHash }`), starting 7-day hold |
| `POST` | `/api/payments/referral/earn` | Internal trigger to record referral completion |
| `POST` | `/api/payments/order` | Creates a Razorpay checkout order (`{ packageId }`) |

### Webhook Route (HMAC Server-to-Server Auth)
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/payments/webhook` | Receives Razorpay `payment.captured` & `payment.failed` webhooks |

---

## 5. Environment Variables Configuration

```env
PORT=5002

# ── MongoDB Connection ─────────────────────────────────────────────────────────
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/payment

# ── Auth Service JWKS ──────────────────────────────────────────────────────────
AUTH_JWKS_URI=http://localhost:5000/.well-known/jwks.json

# ── Razorpay Payment Gateway ───────────────────────────────────────────────────
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...

# ── Redis (Token Blacklist & Rate Limiting) ────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ── RabbitMQ (CloudAMQP Notification Queue) ───────────────────────────────────
MQ_URL=amqps://user:pass@warthog.lmq.cloudamqp.com/user

# ── Token Billing Conversion ──────────────────────────────────────────────────
TOKENS_PER_AI_CREDIT=1000
AI_BILLING_CENTS_PER_1K_TOKENS=2
```

---

## 6. Deep-Dive Guide: Cron Jobs in Microservices (Basics to Advanced)

### 6.1 What is a Cron Job? (The Fundamentals)

In traditional web development, servers operate reactively:
- **HTTP Request Cycle:** A client sends a request $\rightarrow$ Node.js executes logic $\rightarrow$ sends a response $\rightarrow$ goes idle.

However, many backend tasks must occur **proactively** on a schedule without user interaction:
- Auto-settling referral commissions after a 7-day holding window.
- Resetting daily/monthly token quotas.
- Purging expired temporary sessions.
- Sending subscription renewal reminders.

A **Cron Job** is an automated background task triggered by a time-based scheduler rather than an incoming HTTP request.

---

### 6.2 The 5-Field Cron Expression Standard

Cron syntax uses a string of 5 space-separated fields representing different time units:

```
 ┌────────────── Minute (0 - 59)
 │ ┌──────────── Hour (0 - 23, 0 = Midnight)
 │ │ ┌────────── Day of Month (1 - 31)
 │ │ │ ┌──────── Month (1 - 12)
 │ │ │ │ ┌────── Day of Week (0 - 6, 0 = Sunday)
 │ │ │ │ │
 * * * * *
```

#### Essential Cron Expressions Reference:

| Expression | Meaning | Typical Microservice Use-Case |
|---|---|---|
| `0 * * * *` | **Every hour at minute 0** | Referral settlement (used in our service) |
| `0 0 * * *` | **Every midnight at 00:00** | Daily metrics reset, ledger archiving |
| `*/15 * * * *` | **Every 15 minutes** | Health checks, stuck payment reconciliation |
| `0 9 * * 1` | **Every Monday at 9:00 AM** | Weekly usage report email dispatch |
| `0 0 1 * *` | **1st day of every month** | Monthly subscription billing resets |

---

### 6.3 Cron Architecture in the Payments Service

We implemented background cron processing using the `node-cron` library in a dedicated module:

#### File: [`services/cron.service.js`](file:///Users/home/Desktop/Capstone/Payments/services/cron.service.js)

```js
import cron from 'node-cron';
import Referral from '../models/refral.model.js';

export function initCronJobs() {
    console.log('[Cron Service] Initializing background cron schedules...');

    // Runs every hour on the hour ('0 * * * *')
    cron.schedule('0 * * * *', async () => {
        try {
            console.log('[Cron Job] 🕒 Running hourly 7-day referral commission settlement...');
            const result = await Referral.settlePendingCommissions();
            if (result.settledCount > 0) {
                console.log(`[Cron Job] ✓ Settled ${result.settledCount} matured referral(s).`);
            }
        } catch (err) {
            console.error('[Cron Job] ✗ Error running referral settlement cron:', err.message);
        }
    });
}
```

#### Bootstrap Order in [`server.js`](file:///Users/home/Desktop/Capstone/Payments/server.js):

Cron jobs require a live database connection before running. We initialize `initCronJobs()` strictly **after** MongoDB connects:

```js
async function bootstrap() {
    await connectToDb();    // 1. Establish DB connection first
    initCronJobs();          // 2. Schedule background cron tasks
    app.listen(PORT, ...);  // 3. Start HTTP server
}
```

---

### 6.4 Advanced Production Patterns & Architectures

#### Pattern 1: Dual-Engine Architecture (Lazy + Cron Hybrid)
- **Why Lazy Alone is Insufficient:** If a referrer never logs into the platform, a pure lazy implementation will leave their commission pending forever.
- **Why Cron Alone is Insufficient:** If a user logs in 5 minutes after their 7th day ends, waiting for the next cron cycle might cause a delayed UI update.
- **Our Hybrid Solution:**
  - **Hourly Cron Job:** Runs automatically in the background to handle batch processing for all users globally.
  - **Lazy Trigger:** Embedded inside `checkBucketController` to settle instantly when a user views their dashboard.

#### Pattern 2: Distributed Locking / Leader Election (Multi-Pod Kubernetes Scaling)
In a production cloud environment, your microservice is scaled across multiple containers/pods (e.g. `Pod-A`, `Pod-B`, `Pod-C`).

```
                              ┌──────────┐
                              │  Pod-A   │ ──► Executes Cron @ 00:00
                              └──────────┘
Distributed Lock (Redis) ───► ┌──────────┐
                              │  Pod-B   │ ──► Lock Busy (Skips execution)
                              └──────────┘
                              ┌──────────┐
                              │  Pod-C   │ ──► Lock Busy (Skips execution)
                              └──────────┘
```

> ⚠️ **The Multi-Pod Problem:** If all 3 pods run `node-cron`, at `00:00` **ALL 3 PODS WILL FIRE SIMULTANEOUSLY**, resulting in database race conditions or duplicate payouts.

**Advanced Production Solution (Redis Redlock Pattern):**

```js
import cron from 'node-cron';
import { redis } from '../config/redis.js';

cron.schedule('0 * * * *', async () => {
    // Acquire a 5-minute Redis lock using SET ... NX (Only 1 pod succeeds)
    const acquiredLock = await redis.set('lock:cron:referral_settlement', process.env.POD_NAME, 'NX', 'EX', 300);
    
    if (!acquiredLock) {
        // Another instance is already processing this schedule — exit cleanly
        return;
    }

    try {
        await Referral.settlePendingCommissions();
    } finally {
        await redis.del('lock:cron:referral_settlement'); // Release lock
    }
});
```

#### Pattern 3: Idempotency & Error Boundaries
1. **Idempotent Settlement Queries:** Cron jobs must be safe to re-run multiple times without duplicate side effects. Our MongoDB query explicitly checks `commissionSettled === false` and `status === 'pending'`.
2. **Process Crash Prevention:** An uncaught exception inside a cron callback can bring down the entire Node.js server. Always wrap cron execution in a top-level `try/catch` block.
