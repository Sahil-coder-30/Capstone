# Complete Credit, Token & Subscription System Documentation

This document provides a comprehensive technical reference for the **Credit, Token & Subscription System** operating within the `Payments` microservice.

---

## 1. System Overview & Unit Economics

The system manages user subscription tiers, AI provider token limits, double-entry financial audit ledgers, and usage-based metered billing.

### Subscription Tier Unit Economics (Monthly per User)

| Tier | Pod Compute Cost | AI Tokens Cost | Razorpay Fee (2.36%) | Total Cost | Price Charged | Net Margin |
|---|---|---|---|---|---|---|
| **Free** | ₹17.47 | ₹14.02 | ₹0.00 | **₹34.99** | **₹0.00** | -₹34.99 *(CAC budget)* |
| **Pro (Early Access)** | ₹128.13 | ₹81.34 | ₹7.06 | **₹228.52** | **₹299.00** | **+₹70.48** |
| **Pro (Regular)** | ₹128.13 | ₹81.34 | ₹11.78 | **₹233.24** | **₹499.00** | **+₹265.76** |
| **Max (Early Access)** | ₹349.44 | ₹298.74 | ₹23.58 | **₹699.76** | **₹999.00** | **+₹299.24** |
| **Max (Regular)** | ₹349.44 | ₹298.74 | ₹35.38 | **₹711.56** | **₹1,499.00** | **+₹787.44** |

---

## 2. Data Models & Ledger Architecture

### A. Credit Model (`payment.credits` collection)
Stores per-user credit buckets, total token counters, billing cycles, and recent usage events.

- `userId` (ObjectId, unique index)
- `subscription` (`'free'` | `'pro'` | `'max'`)
- `providerCredits` (Array of provider buckets: `mistral`, `google`, `cohere`, `openai`, `anthropic`):
  - `creditsGranted`, `creditsRemaining`, `promptTokens`, `completionTokens`, `totalTokens`, `billableTokens`, `billableCents`, `requestCount`
- `promptTokens`, `completionTokens`, `totalTokens` (Aggregated across all providers)
- `billing`: `currency`, `currentPeriodStart`, `currentPeriodEnd`, `unbilledCents`, `lifetimeCents`
- `usageEvents`: Array of recent AI requests (trimmed to 500 entries)

### B. Transaction Model (`payment.transactions` collection)
Immutable audit ledger recording **every** financial and credit mutation.

- `userId` (ObjectId, indexed)
- `orderId` (String, indexed)
- `paymentId` (String, **sparse unique index** — prevents duplicate credit allocation on webhook retries)
- `type`: `'CREDIT_PURCHASE'` | `'SUBSCRIPTION_CHANGE'` | `'USAGE_DEDUCTION'` | `'ADMIN_GRANT'` | `'PROMO_GRANT'` | `'REFUND'` | `'RESET'`
- `amountPaise` (Number, currency in paise)
- `creditsDelta` (Number)
- `tokensConsumed` (Number)
- `status`: `'PENDING'` | `'SUCCESS'` | `'FAILED'` | `'REFUNDED'`
- `aggregator`: `'RAZORPAY'` | `'INTERNAL'` | `'ADMIN'`
- `metadata` (Mixed object: `packageId`, `pricingModel`, `previousTier`, `newTier`, etc.)

---

## 3. Complete API Endpoint Reference

Base URL: `/api/payments`

### Public Endpoints (No Authentication Required)

#### `GET /api/payments/credit/packages`
Returns all available subscription packages with prices, feature highlights, and pricing models for frontend pricing pages.

- **Headers**: None
- **Response `200 OK`**:
```json
{
  "status": "success",
  "packages": [
    {
      "id": "free",
      "label": "Free",
      "tier": "free",
      "priceINR": 0,
      "description": "Start building with AI. No credit card required.",
      "highlights": ["20 AI credits per provider", "50,000 tokens/day limit"]
    },
    {
      "id": "pro_early_access",
      "label": "Pro",
      "tier": "pro",
      "pricingModel": "early_access",
      "priceINR": 299,
      "badge": "Early Access",
      "popular": true
    },
    {
      "id": "pro_regular",
      "label": "Pro",
      "tier": "pro",
      "pricingModel": "regular",
      "priceINR": 499
    },
    {
      "id": "max_early_access",
      "label": "Max",
      "tier": "max",
      "pricingModel": "early_access",
      "priceINR": 999
    },
    {
      "id": "max_regular",
      "label": "Max",
      "tier": "max",
      "pricingModel": "regular",
      "priceINR": 1499
    }
  ]
}
```

---

### User Endpoints (Requires User Cookie or `Authorization: Bearer <token>`)

#### `GET /api/payments/credit`
Retrieves credit balances, token totals, provider breakdown, and active subscription config for the logged-in user.

- **Response `200 OK`**:
```json
{
  "status": "success",
  "credit": {
    "userId": "6a4959f0ff6c807dfce2f40c",
    "subscription": "pro",
    "totalTokens": 2928025,
    "credits": 100,
    "providerCredits": [
      { "company": "mistral", "creditsRemaining": 20, "totalTokens": 15000 },
      { "company": "google", "creditsRemaining": 70, "totalTokens": 2913025 }
    ],
    "tierConfig": {
      "id": "pro",
      "label": "Pro",
      "billing": "metered",
      "dailyTokenCap": null,
      "features": { "codingAgent": true, "copilot": true, "appAgent": true }
    }
  }
}
```

#### `GET /api/payments/credit/check?company=google`
Checks if user has sufficient credits to execute an AI request. Called by `Ai_orchestration` before running models.

- **Query Params**: `company` or `provider` (`google` | `mistral` | `cohere` | `openai` | `anthropic`)
- **Response `200 OK`**:
```json
{
  "status": "success",
  "hasCredit": true,
  "subscription": "pro",
  "company": "google",
  "credits": 70,
  "billable": true
}
```

#### `POST /api/payments/credit/update`
Records token consumption and deducts credits (for `free` tier) or records billable tokens (for `pro`/`max` metered tiers). Writes a `USAGE_DEDUCTION` ledger entry.

- **Request Body**:
```json
{
  "company": "google",
  "modelId": "gemini-2.0-flash",
  "agentType": "codingAgent",
  "promptTokens": 1200,
  "completionTokens": 800,
  "totalTokens": 2000
}
```
- **Response `200 OK`**:
```json
{
  "status": "success",
  "message": "Billable token usage recorded successfully",
  "usage": {
    "company": "google",
    "subscription": "pro",
    "creditsDeducted": 0,
    "billableCents": 4,
    "totalTokens": 2000
  }
}
```

#### `PATCH /api/payments/credit/subscription`
Upgrades or downgrades user subscription tier. Writes a `SUBSCRIPTION_CHANGE` ledger entry.

- **Request Body**: `{ "subscription": "pro" }`
- **Response `200 OK`**:
```json
{
  "status": "success",
  "message": "Subscription updated successfully",
  "subscription": "pro",
  "previousTier": "free"
}
```

#### `GET /api/payments/credit/transactions`
Retrieves paginated financial transaction history for the logged-in user.

- **Query Params**: `page` (default: 1), `limit` (default: 20), `type`
- **Response `200 OK`**:
```json
{
  "status": "success",
  "pagination": { "page": 1, "limit": 20, "total": 1, "pages": 1 },
  "transactions": [
    {
      "type": "CREDIT_PURCHASE",
      "amountPaise": 29900,
      "status": "SUCCESS",
      "aggregator": "RAZORPAY",
      "description": "Subscribed to Pro plan (early_access)",
      "createdAt": "2026-07-23T17:41:34.000Z"
    }
  ]
}
```

#### `GET /api/payments/credit/transactions/summary`
Returns spending and usage statistics for the user account.

#### `GET /api/payments/credit/analytics`
Returns token usage breakdown by provider and agent type, plus recent usage events.

---

### Admin Endpoints (Requires `ADMIN_EMAILS` verification)

All admin routes are mounted under `/api/payments/admin` and require JWT auth from an email listed in `ADMIN_EMAILS` in `Payments/.env`.

#### `POST /api/payments/admin/grant`
Manually grants credits to a user (e.g. for support resolution, promotions). Writes `ADMIN_GRANT` ledger entry.

- **Request Body**:
```json
{
  "userId": "6a4959f0ff6c807dfce2f40c",
  "company": "google",
  "creditsToGrant": 50,
  "note": "Promo credit grant"
}
```

#### `POST /api/payments/admin/reset`
Resets all provider credit buckets for a user to standard default (20 credits per provider). Writes `RESET` ledger entry.

- **Request Body**: `{ "userId": "6a4959f0ff6c807dfce2f40c" }`

#### `GET /api/payments/admin/users`
Returns paginated list of all users' credit accounts and tier distribution breakdown (`free`, `pro`, `max`).

#### `GET /api/payments/admin/transactions`
Returns full system-wide financial audit log with aggregate revenue totals in INR.

#### `GET /api/payments/admin/packages`
Returns all subscription plans alongside internal unit economics (pod compute, AI tokens, Razorpay fee, net margin).

---

## 4. Razorpay Integration Guide

When you implement Razorpay payment checkout, use the helper export in `Payments/services/credit.service.js`:

```javascript
import { allocatePurchasedCredits } from '../services/credit.service.js';

// In your Razorpay Webhook Controller:
export async function handleRazorpayWebhook(req, res) {
  // 1. Verify HMAC-SHA256 signature
  // 2. Check event type
  if (event.event === 'payment.captured' || event.event === 'order.paid') {
    const payment = event.payload.payment.entity;
    
    await allocatePurchasedCredits({
      userId: payment.notes.userId,
      packageId: payment.notes.packageId,
      paymentId: payment.id,
      orderId: payment.order_id,
      amountPaise: payment.amount,
      aggregator: 'RAZORPAY',
    });
  }
  
  return res.status(200).json({ status: 'ok' });
}
```

Because `allocatePurchasedCredits` uses MongoDB session transactions and checks the sparse unique index on `Transaction.paymentId`, duplicate webhooks sent by Razorpay are automatically safely ignored.
