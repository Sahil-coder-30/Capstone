# 🔐 Auth Service

> Owns every identity decision in the platform — Google OAuth onboarding, JWT issuance, session refresh, and user profile/preference data — so no other service ever touches credentials.

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
Auth Service is the single identity gateway for the entire platform. It handles Google OAuth 2.0 login, issues short-lived JWT access tokens and long-lived refresh tokens, caches sessions in Redis, manages user profiles and preferences in MongoDB, and publishes authentication lifecycle events (login, logout) to RabbitMQ for downstream consumers (e.g. the Notification Service).

### Why this is its own microservice (not part of a monolith)

- **Bounded context:** Auth owns the exclusive decision of _who is a valid user_ and _what identity they hold_. No other service creates users, issues tokens, or reads raw credentials — they verify JWTs against the shared secret.
- **Independent scaling need:** Authentication is called on every request (token refresh, session validation) but its read load profile — short-lived hot cache hits on Redis — is fundamentally different from the compute-heavy AI Orchestration service. Coupling them would either over-provision Auth or under-provision AI.
- **Independent deployability:** Identity flows change rarely (OAuth provider upgrades, token rotation policy changes) while the AI Orchestration service iterates weekly. Keeping them separate avoids forcing an auth deploy on every AI rollout.
- **Failure isolation:** If Auth goes down, new logins and token refreshes fail — but active sandbox sessions with valid JWTs continue running because every other service verifies tokens locally. The blast radius is login, not the entire platform.
- **Data isolation strategy:** Database-per-service. Auth owns the `auth` MongoDB database exclusively. No other service holds a connection string to it; user data flows out only via JWT claims or RabbitMQ events.

### The "User" of this service

| Caller | Call type | Why it calls this service |
|---|---|---|
| Nginx Ingress → Frontend SPA | Sync REST | User login via `/api/auth/google`, session lookup via `/api/auth/getMe` |
| All backend microservices (AI Orchestration, Sandbox Server, Payments) | JWT verification (local) | Each service independently verifies the JWT signed by this service using the shared `JWT_ACCESS_SECRET` — no runtime call-back required |
| Auth Service itself → RabbitMQ | Async event (Produces) | Publishes `auth.user.loggedIn` / `auth.user.loggedOut` events to the `auth_notification_queue` for the Notification Service to send transactional emails |

---

## 🚧 Built Features & Current State

### Current state
| Field | Value |
|---|---|
| **Status** | 🟢 Production |
| **Version** | v1.0.0 |
| **Last deployed** | 2026-07 |
| **Owner(s)** | Sahil Sharma |
| **Known technical debt** | Credit balance is partially mirrored in the Auth DB (`credit.model.js`) to avoid a cross-service call on every hot-path check; this creates a dual-write risk with the Payments service. A single source of truth in Payments (with a short-lived cache read via Redis) is the planned migration path. |

### Features built (working today)

- `GET /api/auth/google` — Initiates Google OAuth 2.0 PKCE flow via Passport.js — ✅ done
- `GET /api/auth/google/callback` — Receives OAuth callback, upserts user, issues access + refresh tokens in `httpOnly` cookies — ✅ done
- `GET /api/auth/getMe` — Returns the authenticated user's profile, preferences, and credit summary — ✅ done
- `POST /api/auth/refresh` — Validates refresh token from cookie, issues a new access token — ✅ done
- `POST /api/auth/logout` — Clears session cookies and publishes a logout event to RabbitMQ — ✅ done
- `GET /api/auth/credit` — Returns current AI credit balance for the authenticated user — ✅ done
- `GET /api/auth/credit/check` — Lightweight boolean: does this user have credits remaining? — ✅ done
- `POST /api/auth/credit/update` — Deducts tokens after an AI invocation — ✅ done
- `GET /api/auth/preferences` — Returns the user's saved editor/theme preferences — ✅ done
- `GET /api/auth/profile` — Returns the user's public profile — ✅ done
- Consumes nothing from the queue; produces `auth.user.loggedIn` and `auth.user.loggedOut` events to `auth_notification_queue`

### How it was built
- **Language/runtime:** Node.js 20, ESM (`"type": "module"`)
- **Framework:** Express 5
- **Design patterns used:**
  - **Controller → Service → Model layering** — Business logic stays in service files; controllers are thin route handlers; Mongoose models are schema-only. This keeps test surface area small and the auth flow readable without a framework.
  - **Repository-style model access via Mongoose** — Mongoose's model API is used as a lightweight repository; the calling service code never constructs raw queries directly.
  - **Outbox-style event publish** — Auth events are published to RabbitMQ inside the same request cycle that mutates user state. There is no formal outbox table; if the publish fails after a successful DB write, the event is silently dropped. This is the documented technical debt above.
- **Key libraries:** `passport`, `passport-google-oauth20`, `jsonwebtoken`, `ioredis`, `amqplib`, `mongoose`, `cookie-parser`, `morgan`

---

## 🏗️ Architecture & Design Patterns

The service follows a strict controller → service → model layering. Routes declare only the middleware chain and call a controller. Controllers parse and validate the request, delegate to a service, and format the response. Services own business logic and interact with Mongoose models or Redis/RabbitMQ clients. Config files (db, passport strategy, Redis client) are initialized once at startup.

```
Auth/
├── server.js                   # Entry point — binds Express app, connects DB
└── src/
    ├── app/
    │   └── app.js              # Express instance, middleware stack, route mounting
    ├── config/
    │   ├── db.js               # Mongoose connection
    │   ├── passport.js         # Google OAuth strategy registration
    │   └── redis.js            # ioredis client
    ├── controllers/
    │   ├── auth.controller.js  # OAuth callback, getMe, refresh, logout
    │   └── credit.controller.js
    ├── middleware/
    │   └── auth.middleware.js  # identifyUser — verifies JWT, attaches req.user
    ├── models/
    │   ├── user.model.js       # userId, email, googleId, createdAt
    │   ├── profile.model.js    # displayName, avatarUrl, bio
    │   ├── preferences.model.js# theme, keybindings, layout
    │   └── credit.model.js     # aiCredits, tokenUsage, providerBuckets
    ├── routes/
    │   ├── auth.routes.js
    │   ├── credit.routes.js
    │   ├── preferences.routes.js
    │   └── profile.routes.js
    └── utils/
        └── (token helpers, response formatters)
```

---

## ⚙️ Usage & Setup

### Environment variables
> Keys and fake example values only. Never a real secret, connection string, or token.

| Key | Required | Description | Example (fake) |
|---|---|---|---|
| `PORT` | ✅ | Port the service listens on | `3000` |
| `MONGO_URI` | ✅ | MongoDB connection string for the `auth` database | `mongodb+srv://user:FAKE_PASS@cluster.mongodb.net/auth` |
| `JWT_ACCESS_SECRET` | ✅ | Signing secret for short-lived access tokens (shared read-only by all services) | `your-256-bit-random-secret-here` |
| `JWT_REFRESH_SECRET` | ✅ | Signing secret for refresh tokens (Auth-only) | `another-256-bit-random-secret` |
| `GOOGLE_CLIENT_ID` | ✅ | Google OAuth 2.0 client ID | `123456789.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | ✅ | Google OAuth 2.0 client secret | `GOCSPX-fake_secret_value` |
| `MQ_URL` | ✅ | RabbitMQ AMQP connection URL | `amqps://user:pass@broker.cloudamqp.com/vhost` |
| `REDIS_URI` | ✅ | Redis connection URL for session caching | `redis://default:password@host:port` |

### Run locally
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Fill in all required keys above

# 3. Start in dev mode (nodemon watch)
npm run dev

# 4. Run tests (not yet implemented — see Known Technical Debt)
npm test
```

### Run via Docker / Skaffold
```bash
# Build image locally
docker build -t auth:local .

# Run as part of the full cluster
skaffold dev
# Auth is declared in skaffold.yml as image: auth, context: Auth
```

---

## 🔌 Communication & Contracts

### Synchronous (REST)
| Direction | Protocol | Endpoint | Counterpart |
|---|---|---|---|
| Inbound | REST | `GET /api/auth/google` | Frontend SPA (via Nginx Ingress) |
| Inbound | REST | `GET /api/auth/google/callback` | Google OAuth redirect |
| Inbound | REST | `GET /api/auth/getMe` | Frontend SPA |
| Inbound | REST | `POST /api/auth/refresh` | Frontend SPA (on 401 intercept) |
| Inbound | REST | `POST /api/auth/logout` | Frontend SPA |
| Inbound | REST | `GET /api/auth/credit` | Frontend SPA |
| Inbound | REST | `GET /api/auth/credit/check` | AI Orchestration Service (pre-invocation guard) |
| Inbound | REST | `POST /api/auth/credit/update` | AI Orchestration Service (post-invocation deduction) |
| None (outbound sync) | — | — | Auth does not make synchronous calls to other internal services |

### Asynchronous (event/queue)
| Event | Direction | Broker / queue | Payload fields |
|---|---|---|---|
| `auth.user.loggedIn` | Produces | RabbitMQ `auth_notification_queue` | `{ username, email, userId, timestamps, action: "login" }` |
| `auth.user.loggedOut` | Produces | RabbitMQ `auth_notification_queue` | `{ username, email, userId, timestamps, action: "logout" }` |

### Contract source of truth
Route definitions are the source of truth: [`src/routes/auth.routes.js`](./src/routes/auth.routes.js), [`src/routes/credit.routes.js`](./src/routes/credit.routes.js). No OpenAPI spec is generated yet — tracked as technical debt.

---

## 🛡️ Production Readiness

### Health & observability
- **Liveness:** No dedicated `/healthz` endpoint — gap. The K8s deployment currently uses TCP socket probes on the container port.
- **Readiness:** No dedicated `/ready` or `/readyz` endpoint — gap. Adding a check that validates MongoDB + Redis connectivity is a planned item.
- **Graceful shutdown:** No explicit SIGTERM handler. The process exits on signal; in-flight requests may be dropped.
- **Structured logging:** `morgan` in `dev` format for request logs. No structured JSON logging or request-ID propagation — gap.
- **Tracing:** Not implemented.
- **Metrics:** Not implemented.

> ⚠️ **Gap:** Missing `/healthz`, `/readyz`, graceful shutdown, and structured logging are real production gaps, not deferred polish. These should be addressed before operating at scale.

### Security & compliance
- **AuthN/AuthZ:** JWT RS-256 (access token, 15 min TTL) + JWT HS-256 (refresh token, 7 day TTL). Tokens are set as `httpOnly` + `SameSite=Strict` cookies. All protected routes require the `identifyUser` middleware.
- **CORS policy:** Configured per K8s Ingress rules; service itself does not set CORS headers directly.
- **Rate limiting:** Not implemented at the service layer — expected to be enforced at Nginx Ingress level.
- **Hardening:** No `helmet` usage — gap. Input validation relies on Mongoose schema enforcement only.
- **Secrets management:** K8s Secrets (see `k8s/secrets.yml.example`). Secret names: `database` (`AUTH`), `jwt` (`JWT_SECRET`), `google` (OAuth credentials).

### CI/CD & deployment
- **Container:** [`Auth/dockerfile`](./dockerfile) — Node 20 Alpine base.
- **Orchestration:** K8s Deployment: `k8s/auth.deployment.yml`, Service: `k8s/auth.service.yml`. Managed via Skaffold (`skaffold.yml`).
- **Pipeline:** No CI pipeline defined yet — manual `skaffold dev` for development, manual image push for production.
- **Rollback strategy:** Skaffold re-deploys on file change during development. Production rollback is manual (`kubectl rollout undo`).

---

## 📝 Changelog & Migration State
> SemVer discipline: a break to the public contract (REST shape, event payload) is always MAJOR, regardless of how small the internal diff was.

| Version | Date | Change | Migration notes |
|---|---|---|---|
| `v1.0.0` | 2026-07 | Initial production release: Google OAuth, JWT refresh, credit tracking, RabbitMQ event publishing | None — first release |

---

## 🤝 Ownership
- **Maintainer(s):** Sahil Sharma
- **Escalation:** Check project issues or contact the maintainer directly.
