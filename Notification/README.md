# 📬 Notification Service

> The only service that touches email delivery — consumes RabbitMQ events from Auth and Payments and sends transactional emails, so no other service ever holds SMTP credentials or constructs email templates.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Status](https://img.shields.io/badge/status-Production-brightgreen)
![Runtime](https://img.shields.io/badge/runtime-Node.js%2020%20ESM-informational)

---

## 📖 Table of Contents
- [Overview & The "Why"](#-overview--the-why)
- [Built Features & Current State](#-built-features--current-state)
- [Architecture & Design Patterns](#-architecture--design-patterns)
- [Usage & Setup](#-usage--setup)
- [Communication & Contracts](#-communication--contracts)
- [Production Readiness](#-production-readiness)
- [Changelog & Migration State](#-changelog--migration-state)

---

## 🎯 Overview & The "Why"

### What this service does
Notification Service is a pure async event consumer. It listens to two RabbitMQ queues (`auth_notification_queue` and `payment_notification_queue`), deserializes the message payload, renders the appropriate HTML email template (auth lifecycle events or payment receipts/invoices), and delivers the email via Nodemailer using a Gmail App Password + Google OAuth Refresh Token configuration. It has no REST endpoints exposed to other services other than health probes.

### Why this is its own microservice (not part of a monolith)

- **Bounded context:** Notification exclusively owns the decision of _what gets sent to a user's inbox and how it looks_. Auth knows a login happened; Notification knows what the login email looks like and how to send it. Separating these means email template changes, SMTP provider swaps, or deliverability tuning never require touching the Auth or Payments codebase.
- **Independent scaling need:** Email delivery is genuinely bursty (spike during a marketing push or a mass-payment event) and I/O-bound on SMTP. Auth and Payments are request-latency-sensitive and must not block on email delivery. Decoupling via a queue means Auth can ack the user immediately; Notification drains the queue at its own pace.
- **Independent deployability:** Email templates, subject lines, and SMTP configuration change on a completely different cadence from auth flows or payment logic. A broken template change should not require re-deploying Auth or Payments.
- **Failure isolation:** If Notification goes down, messages accumulate in the RabbitMQ queue (durable). When it restarts, it catches up on undelivered emails. Auth and Payments continue operating normally — the user just receives the email slightly later.
- **Data isolation strategy:** Notification holds no database. It is stateless beyond the queue message it is currently processing. No MongoDB connection — the only persistence is the RabbitMQ message acknowledgment.

### The "User" of this service

| Caller | Call type | Why it calls this service |
|---|---|---|
| Auth Service | Async event (Produces to `auth_notification_queue`) | Triggers login, logout, and account-event emails |
| Payments Service | Async event (Produces to `payment_notification_queue`) | Triggers payment receipt, credit top-up, and subscription change emails |
| Kubernetes liveness/readiness probes | Sync REST | `GET /healthz` and `GET /readyz` — pod health management |

---

## 🚧 Built Features & Current State

### Current state
| Field | Value |
|---|---|
| **Status** | 🟢 Production |
| **Version** | v1.0.0 |
| **Last deployed** | 2026-07 |
| **Owner(s)** | Sahil Sharma |
| **Known technical debt** | The SMTP credential is a Gmail App Password with a Google Refresh Token — not a transactional email provider (SendGrid, Postmark, etc.). This is adequate for low volume but has no bounce tracking, delivery analytics, or suppression lists. A provider migration is the next step for production scale. Additionally, failed messages are `nack`'d with `requeue: false` (dead-lettered/dropped) rather than sent to a dead-letter queue — undeliverable emails are silently lost. |

### Features built (working today)

- `GET /healthz` — Returns 200 with `{ message: "Notification service is healthy" }` — ✅ done
- `GET /readyz` — Returns 200 with `{ message: "Notification service is ready" }` — ✅ done
- Consumes `auth_notification_queue` → renders `authNotification.js` HTML template → sends email via Nodemailer — ✅ done
- Consumes `payment_notification_queue` → renders `paymentNotification.js` HTML template → sends payment receipt/invoice email — ✅ done
- Per-message `channel.ack` on success and `channel.nack(msg, false, false)` on failure — ✅ done

### How it was built
- **Language/runtime:** Node.js 20, ESM (`"type": "module"`)
- **Framework:** Express 5 (health probe endpoints only; no REST business logic)
- **Design patterns used:**
  - **Pure consumer pattern** — The service is entirely driven by `channel.consume()` callbacks. There is no polling, no cron, no REST-triggered work. This keeps the code surface minimal and the failure domain limited to queue message processing.
  - **Template function pattern** — `buildAuthEmail()` and `buildPaymentEmail()` are pure functions that take a payload object and return `{ subject, html, text }`. This makes templates testable in isolation without needing a queue or SMTP connection.
- **Key libraries:** `amqplib`, `nodemailer`, `express`, `mongoose` (listed in deps but not actively used — gap, should be removed), `morgan`

---

## 🏗️ Architecture & Design Patterns

The service boots Express for health probes, immediately connects to RabbitMQ, and registers two `channel.consume()` callbacks. Each callback is self-contained: parse → template → send → ack/nack. There is no separate controller or service layer because the business logic is too simple to warrant it. The email `sendEmail` utility is the only shared function.

```
Notification/
├── server.js                          # Entry — starts Express on port 4000
└── src/
    ├── app/
    │   └── app.js                     # Express setup + RabbitMQ consumer registration
    ├── config/
    │   └── mq.js                      # amqplib channel, AUTH_QUEUE, PAYMENT_QUEUE constants
    ├── emails/
    │   └── template/
    │       ├── authNotification.js    # Pure fn: payload → { subject, html, text }
    │       └── paymentNotification.js # Pure fn: payload → { subject, html, text }
    └── services/
        └── email.js                   # sendEmail({ to, subject, text, html }) via Nodemailer
```

---

## ⚙️ Usage & Setup

### Environment variables
> Keys and fake example values only. Never a real secret, connection string, or token.

| Key | Required | Description | Example (fake) |
|---|---|---|---|
| `PORT` | ✅ | Port the service listens on (hard-coded to 4000 in server.js currently) | `4000` |
| `MQ_URL` | ✅ | RabbitMQ AMQP connection URL | `amqps://user:pass@broker.cloudamqp.com/vhost` |
| `EMAIL_USER` | ✅ | Gmail address used as the SMTP sender | `youremail@gmail.com` |
| `GMAIL_APP_PASSWORD` | ✅ | Gmail App Password (16-char, generated in Google Account security) | `abcd efgh ijkl mnop` |
| `GOOGLE_CLIENT_ID` | ✅ | Google OAuth Client ID (for refresh token auth flow) | `123456789.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | ✅ | Google OAuth Client Secret | `GOCSPX-fake_secret_value` |
| `GOOGLE_REFRESH_TOKEN` | ✅ | Google OAuth refresh token for the sender Gmail account | `1//04fake_refresh_token_value` |

### Run locally
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Fill in MQ_URL and Gmail credentials above

# 3. Start in dev mode (nodemon)
npm run dev

# 4. Run tests (not yet implemented)
npm test
```

### Run via Docker / Skaffold
```bash
# Build image locally
docker build -t notification:local .

# Run as part of the full cluster
skaffold dev
# Declared in skaffold.yml as image: notification, context: Notification
```

---

## 🔌 Communication & Contracts

### Synchronous (REST)
| Direction | Protocol | Endpoint | Counterpart |
|---|---|---|---|
| Inbound | REST | `GET /healthz` | Kubernetes liveness probe |
| Inbound | REST | `GET /readyz` | Kubernetes readiness probe |
| None (outbound sync) | — | — | Does not call any internal service synchronously |

### Asynchronous (event/queue)
| Event | Direction | Broker / queue | Expected payload fields |
|---|---|---|---|
| `auth.user.loggedIn` / `auth.user.loggedOut` | Consumes | RabbitMQ `auth_notification_queue` | `{ username, email, userId, timestamps, action }` |
| Payment receipt / subscription event | Consumes | RabbitMQ `payment_notification_queue` | `{ username, email, action, transactionDetails, items, invoiceNumber, timestamps }` |

> **Queue naming convention:** `auth_notification_queue` and `payment_notification_queue`. Queue names are defined as constants in [`src/config/mq.js`](./src/config/mq.js).

### Contract source of truth
[`src/app/app.js`](./src/app/app.js) — consumer registrations show the exact fields destructured from each message type. Email template functions in [`src/emails/template/`](./src/emails/template/) are the canonical reference for what the payload must contain.

---

## 🛡️ Production Readiness

### Health & observability
- **Liveness:** `GET /healthz` — returns 200 if the Express process is alive. Does not check RabbitMQ connectivity — gap.
- **Readiness:** `GET /ready` (or `/readyz`) — returns 200 but does not actually verify the RabbitMQ channel is open and consuming — gap. A real readiness check should verify `channel.consumerCount > 0`.
- **Graceful shutdown:** No SIGTERM handler. If the pod is killed mid-message, the in-flight message will be `nack`'d by RabbitMQ after the connection drops and re-queued — so delivery is at-least-once in theory, but in practice the `nack` with `requeue: false` means the message is dropped.
- **Structured logging:** `morgan` for HTTP requests; `console.log/error` for queue events. No request IDs, no structured JSON — gap.
- **Tracing / Metrics:** Not implemented.

> ⚠️ **Gap:** The `channel.nack(msg, false, false)` call drops failed messages permanently instead of routing them to a dead-letter queue. This means a template bug or transient SMTP failure silently loses the email with no recovery path.

### Security & compliance
- **AuthN/AuthZ:** No inbound auth required — this service has no user-facing REST endpoints. Queue messages are trusted because the RabbitMQ connection itself is authenticated.
- **CORS policy:** Not applicable — no cross-origin REST endpoints.
- **Rate limiting:** Not applicable — throughput is bounded by the RabbitMQ queue depth and SMTP provider limits.
- **Hardening:** No `helmet` (no relevant attack surface for a queue consumer with only health probe endpoints).
- **Secrets management:** K8s Secrets. Secret name: `google` (OAuth credentials + email user); `MQ_URL` from `database` secret.

### CI/CD & deployment
- **Container:** [`Notification/dockerfile`](./dockerfile) — Node 20 Alpine base.
- **Orchestration:** K8s Deployment: `k8s/notification-deployment.yml`, Service: `k8s/notification-service.yml`.
- **Pipeline:** No CI pipeline defined. Manual Skaffold for development.
- **Rollback strategy:** Manual `kubectl rollout undo`.

---

## 📝 Changelog & Migration State
> MAJOR = any change to the consumed queue message payload schema (breaks the contract with Auth or Payments producers).

| Version | Date | Change | Migration notes |
|---|---|---|---|
| `v1.0.0` | 2026-07 | Initial release: auth and payment queue consumers, Gmail delivery, HTML email templates | None — first release |

---

## 🤝 Ownership
- **Maintainer(s):** Sahil Sharma
- **Escalation:** Check project issues or contact the maintainer directly.
