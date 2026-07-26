# ⚡ Sandbox Template (Starter Workspace)

> A pre-built React + Vite starter application that is copied into every new sandbox pod as the user's initial `/workspace` — the seed from which all AI-assisted projects grow.

![Version](https://img.shields.io/badge/version-0.0.0-blue)
![Status](https://img.shields.io/badge/status-Production-brightgreen)
![Runtime](https://img.shields.io/badge/runtime-React%2019%20%2B%20Vite%208-informational)

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
The Template is a minimal React 19 + Vite 8 application that serves as the starter workspace for every new sandbox environment. It is not a running service — it exists as a Docker image whose container filesystem is copied into the sandbox pod's shared `emptyDir` volume by an init container (`init-container` step in the pod spec). Once copied, the Vite dev server container boots with this workspace, and the AI agent or user can begin building immediately on a clean, working foundation.

### Why this is its own microservice (not part of a monolith)

- **Bounded context:** The Template exclusively owns the question of _what a fresh sandbox workspace looks like_. The Sandbox Control Server knows how to provision the pod; the Template knows what files to put in it. Separating these means the starter project can be changed (e.g., adding a routing library, changing the default Vite config, shipping a design system scaffold) without touching the Sandbox Control Server or any other service.
- **Independent deployability:** Template updates (new starter dependencies, ESLint config changes, default component structure) iterate on a product/design cadence. Pod provisioning logic iterates on an infrastructure cadence. Decoupling allows template improvements to ship continuously without gating on infrastructure releases.
- **Failure isolation:** The Template is a one-time init step — it is not a long-running process. If the image pull fails, only that specific pod creation fails. Other services (Auth, AI, Payments) are completely unaffected.
- **Data isolation strategy:** No database, no state. The Template is a static image whose sole purpose is to seed a filesystem. It writes no data and reads no external data at runtime.

### The "User" of this service

| Caller | Call type | Why it calls this service |
|---|---|---|
| Kubernetes init container (on pod creation) | Docker image pull + copy | The pod spec's init container runs the template image and copies `/workspace` contents to the shared `emptyDir` volume |
| Sandbox Control Server | Pod template reference | The Sandbox Control Server's pod manifest references the `template` image as the init container |

---

## 🚧 Built Features & Current State

### Current state
| Field | Value |
|---|---|
| **Status** | 🟢 Production |
| **Version** | v0.0.0 |
| **Last deployed** | 2026-07 |
| **Owner(s)** | Sahil Sharma |
| **Known technical debt** | The template uses the minimal Vite React scaffold with no pre-installed design system, routing library, or state management. The AI agent is expected to install these on demand. A richer starter (with React Router, a base CSS reset, or an initial component) would reduce the agent's setup overhead on every new project. This is a deliberate product decision, not a technical constraint. |

### Features built (working today)

- Minimal React 19 SPA (`App.jsx`, `main.jsx`) — clean slate for AI to build upon — ✅ done
- Vite 8 dev server configuration — ✅ done
- ESLint configuration (React hooks + refresh rules) — ✅ done
- Pre-configured `vite.config.js` with the project-standard server settings (host, port, HMR) — ✅ done
- Dockerfile configured as an init-container image (copies files, does not run a server) — ✅ done

### How it was built
- **Language/runtime:** React 19, Vite 8, ESM
- **Framework:** React (view-only SPA scaffold)
- **Design patterns used:**
  - **Init container pattern** — The Dockerfile does not expose a port or run a long-lived process. Its purpose is to provide a filesystem seed via the image layer, which Kubernetes copies from the container into a shared volume using an init container spec.
- **Key libraries (dev):** `vite`, `@vitejs/plugin-react`, `eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`

---

## 🏗️ Architecture & Design Patterns

The Template is a flat Vite project with no custom service layer. Its significance is in the Dockerfile, which stages the files for init-container use.

```
Sandbox/template/
├── index.html              # Vite entry HTML
├── vite.config.js          # Vite configuration (host, port, HMR settings)
├── eslint.config.js        # ESLint rules
├── dockerfile              # Init-container image (no CMD/ENTRYPOINT that runs a server)
├── public/
│   └── (static assets)
├── skills/                 # Agent skill files for code generation guidance
└── src/
    ├── App.jsx             # Root component (minimal — blank slate)
    └── main.jsx            # React DOM mount
```

---

## ⚙️ Usage & Setup

### Environment variables
> Keys and fake example values only.

| Key | Required | Description | Example (fake) |
|---|---|---|---|
| `NODE_ENV` | ❌ | Node environment mode (defaults to development) | `development` |
| `PORT` | ❌ | Local Vite dev server port | `5173` |

### Run locally (for template development/testing)
```bash
# 1. Install dependencies
npm install

# 2. Start Vite dev server (for developing the template itself)
npm run dev

# 3. Build (to validate the template compiles cleanly)
npm run build
```

### Run via Docker / Skaffold
```bash
# Build the init-container image
docker build -t template:local .

# As part of the cluster — Skaffold builds and references this image in pod specs
skaffold dev
# Declared in skaffold.yml as image: template, context: Sandbox/template
```

---

## 🔌 Communication & Contracts

### Synchronous (REST)
None — the Template is not a running service and exposes no endpoints.

### Asynchronous (event/queue)
None.

### Contract source of truth
The implicit contract is the file structure of `/workspace` after the init container runs. The Sandbox Agent's file tree API and the AI agent's tool layer both assume this structure exists when the pod is ready.

---

## 🛡️ Production Readiness

### Health & observability
Not applicable — this is an init-container image, not a long-running service. No dedicated `/healthz` or `/ready` endpoints exist for this static template container.

### Security & compliance
- **Secrets management:** No secrets — the template contains no credentials.
- **Image content:** The template image should not contain `node_modules` — the init container copies source files only, and `npm install` runs in the Vite sandbox container. Verify the `.dockerignore` excludes `node_modules`.

### CI/CD & deployment
- **Container:** [`Sandbox/template/dockerfile`](./dockerfile) — Node 20 Alpine base; copies source files into the image.
- **Orchestration:** Referenced as the init container image in sandbox pod specs managed by Sandbox Control Server.
- **Skaffold:** `image: template` in `skaffold.yml` — watches `src/**`.

---

## 📝 Changelog & Migration State

| Version | Date | Change | Migration notes |
|---|---|---|---|
| `v0.0.0` | 2026-07 | Initial template: minimal React 19 + Vite 8 scaffold | None — first release. Existing sandboxes already provisioned are not affected; only new pods use this template. |

---

## 🤝 Ownership
- **Maintainer(s):** Sahil Sharma
- **Escalation:** Check project issues or contact the maintainer directly.
