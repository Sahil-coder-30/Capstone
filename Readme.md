# 🚀 AI Sandbox — Platform Architecture & Master Guide

> An enterprise-grade, browser-based cloud IDE where every user gets an isolated Kubernetes sandbox pod containing a live React/Vite development server, an S3 workspace synchronization daemon, an interactive terminal, and an AI coding agent.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Status](https://img.shields.io/badge/status-Production-brightgreen)
![Architecture](https://img.shields.io/badge/architecture-MERN%20%2B%20Kubernetes-informational)

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

### What this platform does
AI Sandbox is a multi-tenant cloud IDE platform built on a MERN + Kubernetes (K8s) microservice architecture. It enables users and AI agents to write, test, preview, and deploy applications securely in real time. Each workspace runs in an isolated K8s Pod equipped with a Vite dev server, a File System API sidecar, a terminal PTY server, and a real-time S3 sync daemon.

### Why this is built as a set of microservices (not a monolith)

- **Bounded context separation:** Authentication, AI Orchestration, K8s Pod Lifecycle, Billing/Payments, and Routing are decoupled into independent services. No service touches another's database or internal state.
- **Asymmetric scaling:** Compute-heavy AI LangGraph loops, fast stateless JWT auth checks, and high-concurrency WebSocket proxies scale independently according to their specific resource demands.
- **Blast radius isolation:** A failure in an AI provider call or payment gateway does not affect active sandbox pods, file editing, or terminal sessions.
- **Data isolation strategy:** Database-per-service (MongoDB databases for `auth`, `ai`, `sandbox`, `payment`). Redis for session caching and pod liveness. S3 for workspace persistence.

### Service Inventory & Callers

| Service | Bounded Context | Datastore | Sync Role | Async Role |
|---|---|---|---|---|
| **Auth Service** | Identity, OAuth, JWT, Users | MongoDB (`auth`), Redis | Handles `/api/auth/*` | Produces to `auth_notification_queue` |
| **AI Orchestration** | LangGraph ReAct agent, LLM routing | MongoDB (`ai`), Redis | Handles `/api/ai/*` | Streams steps via Socket.io |
| **Notification** | Transactional emails | None (Stateless) | Health checks only (`/healthz`, `/ready`) | Consumes `auth` & `payment` queues |
| **Payments** | Razorpay, Credit ledger, Admin | MongoDB (`payment`) | Handles `/api/payments/*` | Produces to `payment_notification_queue` |
| **Sandbox Server** | K8s Pod & Service lifecycle | MongoDB (`sandbox`), Redis | Handles `/api/sandbox/*` | Updates Redis TTL |
| **Sandbox Router** | Subdomain reverse proxy | Redis | Proxies `*.preview.*` & `*.agent.*` | Websocket upgrade proxy |
| **Agent Sidecar** | Filesystem & PTY terminal | Local Pod `/workspace` | File API (`/api/agent/*`) | Socket.io terminal & chokidar |
| **Sync Agent** | Workspace S3 persistence | AWS S3 | None (Daemon) | File watcher sync to S3 |
| **Template** | Seed workspace scaffold | Static Image | Init container copy | None |
| **Frontend** | Browser SPA & IDE layout | Redux State | Calls REST APIs | Connects to Socket.io |

---

## 🚧 Built Features & Current State

### Current state
| Field | Value |
|---|---|
| **Status** | 🟢 Production |
| **Version** | v1.0.0 |
| **Last deployed** | 2026-07 |
| **Owner(s)** | Sahil Sharma |

### Features built (working today)

- **Authentication & Identity**: Google OAuth 2.0, JWT access/refresh token rotation, user profiles, preferences — ✅ done
- **AI Agent Brain**: LangGraph ReAct loop with multi-provider routing (Mistral Devstral, Gemini, OpenAI, Cohere, Tavily), tool-assisted file/terminal execution, chat history CRUD — ✅ done
- **Kubernetes Sandbox Provisioning**: Dynamic multi-container pod creation, automatic service binding, UUID-based subdomain assignment — ✅ done
- **Subdomain Routing & Terminal Proxy**: Host-header dispatch (`*.preview.localhost` → Vite :5173, `*.agent.localhost` → Agent :3000), Socket.io terminal bridge (`xterm.js` + `node-pty`) — ✅ done
- **Real-time File Synchronization**: S3 workspace backup/restore daemon with debouncing and concurrency throttling — ✅ done
- **Credit & Billing Engine**: Razorpay webhook integration with HMAC-SHA256 signature verification, credit buckets, transaction audit log, admin grant/reset panel — ✅ done
- **Notification Engine**: RabbitMQ consumer rendering HTML email templates for auth and payment events via Nodemailer — ✅ done
- **Model Context Protocol (MCP)**: Dynamic tool handshake and connector bridge for external integrations (Postgres, Slack, Jira, Figma) — ✅ done

---

## 🏗️ Architecture & Design Patterns

### System Architecture Diagram

```
                          User (Browser UI / Terminal)
                                      │
                                      ▼
     ┌──────────────────────────────────────────────────────────────────┐
     │                     Nginx Ingress Controller                     │
     │                                                                  │
     │  /api/auth/* ─────────► auth-service                             │
     │  /api/ai/* ───────────► ai-service                               │
     │  /api/sandbox/* ──────► sandbox-service                          │
     │  /api/payments/* ─────► payments-service                         │
     │  *.preview.localhost ─► router-service (proxies to Vite App)     │
     │  *.agent.localhost ───► router-service (proxies to Sidecar API)  │
     └──────────────────────────────────────────────────────────────────┘
            │               │                │               │
            ▼               ▼                ▼               ▼
     ┌─────────────┐ ┌─────────────┐  ┌─────────────┐ ┌─────────────┐
     │    Auth     │ │  Payments   │  │     AI      │ │   Sandbox   │
     │   Service   │ │   Service   │  │Orchestration│ │   Server    │
     │  (Express)  │ │  (Express)  │  │(LangGraph)  │ │(K8s Control)│
     └──────┬──────┘ └──────┬──────┘  └──────┬──────┘ └──────┬──────┘
            │               │                │               │
      MongoDB / Redis       └────────┬───────┘               │
      RabbitMQ Emitter               │                       ▼
            │                        │        ┌──────────────────────────────┐
            ▼                        │        │    Sandbox Pod (per user)    │
     ┌─────────────┐                 │        │                              │
     │Notification │                 │        │  ┌────────────────────────┐  │
     │   Service   │                 │        │  │   sandbox-container    │  │
     │(Mail Engine)│                 │        │  │ (Vite Dev Server :5173)│  │
     └─────────────┘                 │        │  └───────────▲────────────┘  │
                                     │        │              │ Shared        │
                                     │        │  ┌───────────▼────────────┐  │
                                     └────────┼─►│    agent-container     │  │
                                              │  │ (Sidecar File API :3000)│  │
                                              │  └───────────▲────────────┘  │
                                              │              │ /workspace    │
                                              │  ┌───────────▼────────────┐  │
                                              │  │       sync-agent       │  │
                                              │  │  (S3 Workspace Sync)   │  │
                                              │  └───────────┬────────────┘  │
                                              └──────────────┼───────────────┘
                                                             ▼
                                                      AWS S3 Storage
```

### Directory Structure & Mapping

```
Capstone/
├── Ai_orchestration/                # Agent brain (LangGraph ReAct loop, tools)
├── Auth/                            # Identity gateway (Google OAuth, JWT)
├── Frontend/                        # Client dashboard (Monaco, xterm.js, Redux)
├── Notification/                    # RabbitMQ email engine
├── Payments/                        # Razorpay & credit billing ledger
├── Sandbox/
│   ├── Agent/                       # Sidecar filesystem & terminal PTY API
│   ├── router/                      # Subdomain HTTP/WS reverse proxy
│   ├── server/                      # K8s control plane (pod lifecycle)
│   ├── sync-agent/                  # Real-time S3 sync daemon
│   └── template/                    # React 19 + Vite 8 starter seed
└── k8s/                             # Kubernetes manifests & secrets
```

---

## ⚙️ Usage & Setup

### Environment variables
| Key | Required | Description | Example (fake) |
|---|---|---|---|
| `PORT` | ✅ | HTTP listen port per service | `3000` |
| `MONGO_URI` | ✅ | MongoDB connection URI per database | `mongodb+srv://user:fake@cluster.net/db` |
| `REDIS_URI` | ✅ | Redis connection string | `redis://default:password@host:6379` |
| `MQ_URL` | ✅ | RabbitMQ connection URI | `amqps://user:pass@broker.cloudamqp.com/vhost` |
| `JWT_ACCESS_SECRET` | ✅ | Shared JWT access signing key | `your-256-bit-random-secret` |
| `GOOGLE_CLIENT_ID` | ✅ | Google OAuth client ID | `123456789.apps.googleusercontent.com` |
| `MISTRALAI_API_KEY` | ✅ | Mistral AI API key | `fake_mistral_key_xxxx` |
| `RAZORPAY_SECRET_ID` | ✅ | Razorpay Key ID | `rzp_test_fake_key_id` |
| `AWS_BUCKET_NAME` | ✅ | S3 workspace storage bucket | `codespace-sync-bucket` |

### Run locally

```bash
# 1. Install dependencies across microservices
cd Auth && npm install && cd ..
cd Ai_orchestration && npm install && cd ..
cd Payments && npm install && cd ..
cd Notification && npm install && cd ..
cd Sandbox/server && npm install && cd ..
cd Sandbox/router && npm install && cd ..
cd Sandbox/Agent && npm install && cd ..
cd Sandbox/sync-agent && npm install && cd ..
cd Frontend && npm install && cd ..

# 2. Setup Kubernetes dev cluster with Skaffold
skaffold dev

# 3. Access local dashboard
# Open http://localhost:5173 or local Ingress route
```

---

## 🔌 Communication & Contracts

### Synchronous REST Endpoints
- **Auth**: `/api/auth/google`, `/api/auth/getMe`, `/api/auth/refresh`, `/api/auth/logout`
- **AI Orchestration**: `/api/ai/app-agent/invoke`, `/api/ai/app-agent/title`, `/api/ai/chats/*`
- **Sandbox Server**: `/api/sandbox/create-project`, `/api/sandbox/projects`, `/api/sandbox/start/:id`, `/api/sandbox/stop/:id`
- **Payments**: `/api/payments/credit`, `/api/payments/credit/packages`, `/api/payments/credit/transactions`, `/api/payments/admin/*`
- **Agent Sidecar**: `/api/agent/files`, `/api/agent/file`, `/api/agent/update-file`, `/api/agent/execute`

### Asynchronous Event Bus (RabbitMQ)
- `auth_notification_queue`: Consumes `auth.user.loggedIn`, `auth.user.loggedOut`
- `payment_notification_queue`: Consumes `payment.credit.topup`, `payment.subscription.changed`

---

## 🛡️ Production Readiness

### Health & Observability
- **Liveness Probes**: `/healthz` endpoints implemented in services (e.g. Notification, Router). TCP socket liveness probes used for core API pods.
- **Readiness Probes**: `/ready` and `/readyz` endpoints verify datastore (MongoDB, Redis) and broker (RabbitMQ) connectivity before accepting traffic.
- **Graceful Shutdown**: SIGTERM handlers flush in-flight operations (e.g. Sync Agent S3 upload queue) prior to pod termination.

### Security Posture
- **JWT Verification**: RS-256 / HS-256 tokens validated locally across backend services.
- **K8s RBAC**: ServiceAccount `resource-manager` scoped to minimal pod/service verbs in `k8s/rabc.yml`.
- **HMAC Signatures**: Razorpay webhooks verified via HMAC-SHA256 signatures before applying credit updates.

---

## 📝 Changelog & Migration State

| Version | Date | Change Description | Migration Notes |
|---|---|---|---|
| `v1.0.0` | 2026-07 | Production release: MERN + K8s architecture, LangGraph AI agent, S3 sync, Razorpay billing | Initial release |

---

## 🤝 Ownership
- **Maintainer(s)**: Sahil Sharma
- **Escalation**: Open a repository issue or contact platform maintainers.