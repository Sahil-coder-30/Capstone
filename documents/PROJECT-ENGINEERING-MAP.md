# Taksha CodeSpace — Project Engineering Map

This map organizes core engineering concepts across all microservices and APIs in Taksha CodeSpace. Use this to trace cross-cutting mechanisms, avoid redundant learning, and build unified system understanding.

---

## 1. Authentication & Session Security
- **Core Mechanism**: Google OAuth 2.0 Identity Federation + Asymmetric RS256 JWTs + Rotating Refresh Token Families.
- **Participating APIs**:
  - `GET /api/auth/google` — OAuth Initiation ([Doc](file:///Users/home/Desktop/Projects/Capstone/documents/login-api-deep-dive.md))
  - `GET /api/auth/google/callback` — OAuth Profile Ingestion & Token Issuance ([Doc](file:///Users/home/Desktop/Projects/Capstone/documents/login-api-deep-dive.md))
  - `POST /api/auth/refresh` — Refresh Token Rotation & Reuse Detection
  - `GET /api/auth/getMe` — User Profile Hydration & Access Token Renewal
  - `POST /api/auth/logout` — Redis Token Blacklisting & Family Invalidation
  - `GET /.well-known/jwks.json` — Public Key Discovery for Downstream Verification
- **Key Files**:
  - [`Auth/src/controllers/auth.controller.js`](file:///Users/home/Desktop/Projects/Capstone/Auth/src/controllers/auth.controller.js)
  - [`Auth/src/utils/generateTokens.js`](file:///Users/home/Desktop/Projects/Capstone/Auth/src/utils/generateTokens.js)
  - [`Auth/src/middleware/auth.middleware.js`](file:///Users/home/Desktop/Projects/Capstone/Auth/src/middleware/auth.middleware.js)
  - [`Auth/src/routes/jwks.route.js`](file:///Users/home/Desktop/Projects/Capstone/Auth/src/routes/jwks.route.js)

---

## 2. Asynchronous Event-Driven Messaging (RabbitMQ)
- **Core Mechanism**: AMQP 0-9-1 durable queues with persistent message delivery for non-blocking task offloading.
- **Participating Queues & Events**:
  - `auth_notification_queue`: Consumes `auth.login` events -> Dispatches transactional login security alerts via Nodemailer.
  - `payment_notification_queue`: Consumes invoice events from Payments service.
- **Key Files**:
  - [`Auth/src/config/mq.js`](file:///Users/home/Desktop/Projects/Capstone/Auth/src/config/mq.js)
  - [`Notification/src/emails/template/authNotification.js`](file:///Users/home/Desktop/Projects/Capstone/Notification/src/emails/template/authNotification.js)

---

## 3. In-Memory Caching & Revocation (Redis)
- **Core Mechanism**: Ephemeral TTL-based key-value storage for rate limiting, token blacklisting, and sandbox heartbeats.
- **Participating Components**:
  - `blacklist:<jwt>`: Stores revoked access tokens until remaining TTL expires.
- **Key Files**:
  - [`Auth/src/config/redis.js`](file:///Users/home/Desktop/Projects/Capstone/Auth/src/config/redis.js)

---

## 4. Decentralized Microservice Trust Boundary
- **Core Mechanism**: Zero-DB verification. Downstream microservices (`Ai_orchestration`, `Sandbox`, `Payments`) verify incoming Bearer JWTs locally in memory via the Auth Service's public key (JWKS) with zero inter-service network calls.

---

## 5. Unified Error Normalization & Structured Observability (FaultKit)
- **Core Mechanism**: Zero-overhead OpenAPI error envelopes (`{ success: false, error: { code, message, details, requestId } }`) and Loki-ready ISO-8601 single-line JSON logging with automated credential redaction and distributed correlation tracing (`x-request-id`).
- **Participating Transports & Services**:
  - Express HTTP middleware in `Auth`, `Payments`, `Sandbox`, and `Ai_orchestration`.
  - Asynchronous Socket.io event error formatting in `Ai_orchestration`.
  - RabbitMQ event consumer error isolation and logging in `Notification`.
  - Frontend unified error interceptor in `Frontend` and `payments_frontend`.
- **Architectural Plan**:
  - [FaultKit Distributed Error Handling & Structured Observability Architecture](file:///Users/home/Desktop/Projects/Capstone/documents/faultkit-distributed-error-handling-and-logging-plan.md)

