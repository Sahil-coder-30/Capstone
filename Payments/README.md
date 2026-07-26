# 💳 Payments Service & Standalone Checkout App

> Owns every credit, subscription, and financial billing decision in the platform — combining a Razorpay HMAC-verified Payment Backend Microservice with a dedicated, performance-isolated Standalone Checkout React Application (`checkout.yourdomain.com`).

![Version](https://img.shields.io/badge/version-1.1.0-blue)
![Status](https://img.shields.io/badge/status-Production-brightgreen)
![Runtime](https://img.shields.io/badge/runtime-Node.js%2020%20ESM%20%7C%20Vite%20React-informational)

---

## 📖 Table of Contents
- [Overview & The "Why"](#-overview--the-why)
- [Standalone Checkout Architecture](#-standalone-checkout-architecture)
- [Built Features & Current State](#-built-features--current-state)
- [Architecture & Design Patterns](#-architecture--design-patterns)
- [Usage & Setup](#-usage--setup)
- [Communication & Contracts](#-communication--contracts)
- [Production Readiness](#-production-readiness)
- [Changelog & Migration State](#-changelog--migration-state)

---

## 🎯 Overview & The "Why"

### What this service & application do
The **Payments Service & Standalone Checkout App** is the complete financial ledger and checkout engine of the platform. It handles:
1. **Razorpay Order & Webhook Management**: HMAC-SHA256 verified webhook processing for automated billing and credit grants.
2. **Dedicated Standalone Payment App (`checkout.yourdomain.com`)**: A lightweight, isolated React application built specifically for checkout flows, subscription management, pricing tier comparisons, and invoice downloads.
3. **Credit Balance & Token Bucket System**: Manages per-user AI credit balances with provider-specific token buckets (Mistral, Gemini, OpenAI, Cohere).
4. **Audit Logging & Event Publishing**: Maintains an immutable transaction audit log in MongoDB and publishes `payment.credit.topup` events to RabbitMQ for receipt generation.

### Why the Checkout App is Standalone (Performance & Isolation)

- **WebSocket & Real-Time Isolation:** The main application runs heavy real-time WebSockets, dynamic canvas state, and active code editor re-renders. Running sensitive payment processing inside the main app risks frame drops, UI lag, or socket reconnect interruptions right when a user enters credit card details.
- **Micro-Frontend Architecture:** Moving the payment UI to a standalone, ultra-lean React app ensures sub-second page loads (< 100KB initial bundle), zero WebSocket background interference, and dedicated PCI-DSS scope reduction.
- **Secure Session Handoff:** The main app initiates checkout by requesting a short-lived `checkout_session_id` from the backend, then redirects the user to `checkout.yourdomain.com?session_id=XYZ`. Upon payment completion, the Payment Service updates DB state and triggers a real-time event so the main app refreshes credits instantly.

### The "User" of this service

| Caller / Consumer | Call Type | Purpose |
|---|---|---|
| Main Frontend App | Redirect / Sync REST | Requests `POST /api/payments/checkout-session` and redirects user to Standalone Checkout App |
| Standalone Payment App | Sync REST | Renders pricing tiers, initiates Razorpay SDK checkout, displays receipts |
| Razorpay Webhooks | Inbound HTTP | Payment confirmation — HMAC-SHA256 verified webhook carries final payment status |
| Admin Service (Audit Gateway) | Sync Internal REST | Triggers manual payment reconciliation or credit grant overrides |
| Payments Service → RabbitMQ | Async Event (Produces) | Publishes `payment.credit.topup` / `payment.subscription.changed` events to `payment_notification_queue` |

---

## 🏗️ Standalone Checkout Architecture

```mermaid
sequenceDiagram
    participant MainApp as Main React App
    participant PayApp as Standalone Payment App (checkout.domain.com)
    participant PayService as Payment Backend Microservice
    participant Gateway as Razorpay Gateway

    MainApp->>PayService: 1. POST /api/payments/checkout-session
    PayService-->>MainApp: 2. Return short-lived Checkout Session Token
    MainApp->>PayApp: 3. Redirect to checkout.domain.com?session_id=TOKEN
    PayApp->>PayService: 4. GET /api/payments/session/:id (Fetch package & user details)
    PayApp->>Gateway: 5. Execute Razorpay SDK Checkout
    Gateway-->>PayService: 6. POST /api/payments/webhook (HMAC-SHA256 Verified)
    PayService-->>MainApp: 7. Real-Time Event / Socket ("CREDITS_UPDATED")
    PayApp-->>MainApp: 8. Redirect back to main.domain.com/dashboard?payment=success
```

---

## 🚧 Built Features & Current State

### Current State
| Field | Value |
|---|---|
| **Status** | 🟢 Production |
| **Version** | v1.1.0 |
| **Last Deployed** | 2026-07 |
| **Owner(s)** | Engineering & Billing Team |

### Features Built (Working Today)

**Standalone Frontend Checkout App:**
- Pricing Tier Comparison Matrix & Plan Selector — ✅ done
- Razorpay Payment Gateway Modal Integration — ✅ done
- Transaction History & PDF Invoice Downloader — ✅ done
- Dynamic Session Handoff & Auto-Redirect — ✅ done

**Payment Backend Service Routes:**
- `GET /api/payments/credit/packages` — Returns all subscription plans — ✅ done
- `POST /api/payments/checkout-session` — Generates a short-lived session token for checkout handoff — ✅ done
- `POST /api/payments/webhook` — Razorpay HMAC-SHA256 signature verification & credit top-up — ✅ done
- `GET /api/payments/credit` — Returns user's credit balance and token buckets — ✅ done
- `GET /api/payments/credit/transactions` — Paginated transaction audit log — ✅ done
- `POST /internal/v1/payments/reconcile` — Internal admin reconciliation endpoint — ✅ done

---

## 🏗️ Architecture & Design Patterns

The service follows a controller → service → model stack. Routes are split by access level: public (`/packages`), user-authenticated (`/credit/*`), standalone checkout session (`/checkout-session`), and internal admin (`/internal/v1/*`).

---

## 💻 Usage & Setup

### Run Locally

**Backend Microservice:**
```bash
# Install backend dependencies
cd Payments
npm install

# Run payment backend server
npm run dev
```

**Standalone Checkout React App:**
```bash
# Install frontend dependencies
cd Payments/frontend
npm install

# Run standalone checkout app
npm run dev
```

### Environment Variables
| Variable | Description | Required | Fake Example Value |
|---|---|---|---|
| `PORT` | Service port | Yes | `5002` |
| `MONGO_URI` | MongoDB connection string | Yes | `mongodb://localhost:27017/payments_db` |
| `RAZORPAY_KEY_ID` | Razorpay Key ID | Yes | `rzp_test_fake_key_12345` |
| `RAZORPAY_KEY_SECRET` | Razorpay Key Secret | Yes | `fake_razorpay_secret_key_67890` |
| `RAZORPAY_WEBHOOK_SECRET` | HMAC Webhook verification secret | Yes | `fake_webhook_hmac_secret_key` |
| `RABBITMQ_URL` | AMQP connection string | Yes | `amqp://guest:guest@localhost:5672` |

---

## 📡 Communication & Contracts

### Inbound Contracts
- **REST APIs**: `GET /api/payments/credit/packages`, `POST /api/payments/checkout-session`, `POST /internal/v1/payments/reconcile`
- **Razorpay Webhooks**: `POST /api/payments/webhook` (HMAC-SHA256 verified signature in header `X-Razorpay-Signature`)

### Outbound Contracts
- **RabbitMQ Events**: Publishes `payment.credit.topup` to `payment_notification_queue`.
- **Auth Service HTTP Sync**: Notifies Auth Service of credit balance mirror updates after transaction settlement.

---

## 🛡️ Production Readiness

### Health Check Endpoints
- `GET /healthz` — Returns 200 OK if service process is healthy.
- `GET /ready` — Returns 200 OK if MongoDB and RabbitMQ channel are connected and operational.

---

## 📜 Changelog & Migration State

- **v1.1.0 (2026-07)**: Introduced Standalone React Checkout App (`checkout.yourdomain.com`) with short-lived session token handoff for main-app WebSocket isolation. Added `/internal/v1/payments/reconcile` endpoint for audit-logged Admin Gateway integration.
- **v1.0.0 (2026-07)**: Initial release of Razorpay payment service backend with credit management and RabbitMQ event publishing.
