# 🖥️ Frontend — AI Sandbox Dashboard

> The browser-based coding environment — a feature-rich React SPA with a Monaco code editor, xterm.js terminal, live preview iframe, AI agent chat, and Razorpay payment UI, all wired together over Redux and Socket.io.

![Version](https://img.shields.io/badge/version-0.0.0-blue)
![Status](https://img.shields.io/badge/status-Production-brightgreen)
![Runtime](https://img.shields.io/badge/runtime-React%2019%20%2B%20Vite%207%20%2B%20Redux%20Toolkit-informational)

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
Frontend is the user-facing dashboard of the AI Sandbox platform. It is a single-page React 19 application bundled with Vite 7, styled with SCSS, and wired to a Redux Toolkit global store. It renders the complete coding environment: a Monaco-based code editor with file explorer, an xterm.js terminal bridged to the sandbox pod over Socket.io, a live preview iframe pointing to the user's Vite dev server, an AI coding agent chat panel, a Copilot panel, a payment/subscription management UI, and a settings drawer.

### Why this is its own component (not server-rendered or embedded)

- **Bounded context:** The frontend exclusively owns the user interaction model — every user decision, real-time visual update, and keyboard shortcut is handled here. All backend services are stateless from the user's perspective; the frontend is the stateful orchestrator of the user experience.
- **Independent scaling need:** The frontend is a static bundle served by a CDN or Nginx. Its scaling profile (CDN cache hit ratio, edge delivery) is completely independent from any backend service. There is zero server-side rendering cost — all compute stays in the user's browser.
- **Independent deployability:** UI changes (new layout, new AI chat features, new payment tier display) ship continuously and can be rolled back with a CDN cache invalidation without touching any backend service. A broken frontend deploy does not affect data consistency in Auth or Payments.
- **Technology fit:** The richness of the IDE experience (Monaco, xterm.js, GSAP animations, real-time collaborative editing, split-pane layouts) requires a client-rendered architecture. Server-side rendering adds no benefit here and would impose significant complexity.

### The "User" of this service

| Caller | Call type | Why |
|---|---|---|
| Human user (browser) | Direct | This is the primary end-user interface |
| Nginx Ingress | Serves static bundle | Nginx serves the built `dist/` in production; Vite dev server serves in development |

---

## 🚧 Built Features & Current State

### Current state
| Field | Value |
|---|---|
| **Status** | 🟢 Production |
| **Version** | v0.0.0 |
| **Last deployed** | 2026-07 |
| **Owner(s)** | Sahil Sharma |
| **Known technical debt** | The entire application layout and routing is currently managed in a single `App.jsx` file (37KB). As features grow, this will need to be broken into route-level code-split bundles. Additionally, `Dexie` (IndexedDB) is a listed dependency but its usage is not visible in the primary routes — if it was used for offline caching and was abandoned, the dependency should be removed. |

### Features built (working today)

**Auth & Onboarding:**
- Google OAuth login flow with JWT storage and silent refresh on 401 — ✅ done
- Protected route enforcement via Redux auth state — ✅ done
- Entry loader animation (`EntryLoader.jsx`) on initial app boot — ✅ done

**Dashboard:**
- Project listing with create/delete/restore (soft delete) workflow — ✅ done
- Subscription plan display and upgrade UI connected to Payments Service — ✅ done

**Sandbox Workspace:**
- Monaco Editor (`@monaco-editor/react`) with file explorer tree, multi-tab support — ✅ done
- xterm.js terminal (`@xterm/xterm` + `@xterm/addon-fit`) wired to the sidecar agent via Socket.io through the Vite proxy — ✅ done
- Live preview iframe with readiness polling via `/api/preview-ping` proxy — ✅ done
- File tree real-time updates from chokidar events streamed over the agent Socket.io connection — ✅ done
- Split-pane layout with GSAP-powered panel animations — ✅ done

**AI Coding Agent:**
- Chat panel with SSE/Socket.io incremental step streaming from AI Orchestration service — ✅ done
- Agent step display (plan, tool calls, verification) with streaming markdown rendering — ✅ done
- Conversation history, soft-delete, and restore — ✅ done
- Agent title auto-generation — ✅ done

**Copilot:**
- Inline code completion suggestions via Copilot slice — ✅ done
- Copilot chat drawer — ✅ done

**Logs:**
- Real-time Vite container log stream via Socket.io — ✅ done

**Payments:**
- Credit balance display — ✅ done
- Transaction history — ✅ done
- Package selection and Razorpay checkout flow — ✅ done

**Settings:**
- Editor theme and keybinding preferences persisted to Auth Service — ✅ done

### How it was built
- **Language/runtime:** JavaScript (JSX), React 19, Vite 7, SCSS
- **Framework:** React SPA (no SSR)
- **Design patterns used:**
  - **Feature-based slice architecture (Redux Toolkit)** — Global state is partitioned into 9 isolated Redux slices, each co-located with its UI components and async thunks in a `features/<name>/` directory. This prevents cross-feature state leakage and makes each feature independently testable.
  - **Axios interceptor + Redux token refresh** — A global Axios instance wraps all API calls. A 401 interceptor automatically dispatches the `refreshToken` thunk, retries the original request with the new token, and updates the Redux `auth` state — transparently for all features.
  - **Vite proxy cascade for sandbox routing** — The Vite dev server configuration uses a four-level proxy cascade: agent file API (`/api/agent-proxy`), preview health check (`/api/preview-ping`), terminal Socket.io (`/api/terminal-proxy`), and general orchestration (`/api`). Each proxy uses custom `router` functions to extract the `sandboxId` from request headers and dynamically route to the correct pod subdomain.
  - **Socket.io room-scoped real-time updates** — Terminal I/O, file-tree diffs, and AI agent step updates all use Socket.io connections scoped to the active sandbox session, so events from one user's pod never reach another user's UI.
- **Key libraries:** `react`, `react-redux`, `@reduxjs/toolkit`, `@monaco-editor/react`, `@xterm/xterm`, `@xterm/addon-fit`, `socket.io-client`, `axios`, `gsap`, `@gsap/react`, `lucide-react`, `dexie`, `sass`

---

## 🏗️ Architecture & Design Patterns

The application is organized around Redux slices as the primary architectural unit. Each `features/<name>/` directory owns its slice, async thunks (API calls), and UI components. Shared components live in `src/components/`. The app layout, routing, and top-level panels are wired in `src/App.jsx`.

```
Frontend/
├── index.html                          # Vite entry HTML
├── vite.config.js                      # Dev server + 4-level proxy config
├── eslint.config.js
└── src/
    ├── main.jsx                        # React DOM mount, Redux Provider
    ├── App.jsx                         # Top-level layout, routing, panel composition
    ├── App.scss                        # Global SCSS layout (split panes, dark theme)
    ├── store.js                        # Redux store — 9 slice reducers
    ├── components/
    │   ├── Layout.jsx                  # Shared shell layout (sidebar, header, panels)
    │   ├── Markdown.jsx                # Markdown renderer for agent responses
    │   ├── EntryLoader.jsx             # Animated boot screen
    │   ├── TakshaLogoAnimation.jsx     # Brand logo animation
    │   ├── BrandLogo.jsx               # Static brand logo
    │   └── FileIcon.jsx                # File-type icon resolver
    ├── features/
    │   ├── auth/                       # Google OAuth, JWT slice, refresh thunk
    │   ├── sandbox/                    # Sandbox lifecycle (start/stop), previewUrl, agentUrl
    │   ├── editor/                     # Monaco editor, file tree, open tabs
    │   ├── coding-agent/               # AI agent chat, SSE step streaming, history
    │   ├── copilot/                    # Inline suggestions, copilot chat
    │   ├── logs/                       # Vite container log stream
    │   ├── payments/                   # Credit balance, transactions, Razorpay checkout
    │   ├── dashboard/                  # Project list, create/delete/restore
    │   ├── chat/                       # (Alternate/shared chat components)
    │   └── settings/                   # Theme, keybindings, preferences
    ├── services/
    │   └── axios.js                    # Axios instance + 401 interceptor
    └── styles/
        └── (shared SCSS variables, mixins, design tokens)
```

### Redux Store Topology

```javascript
// src/store.js
{
  auth:        { user, accessToken, loginStatus, isAuthenticated },
  sandbox:     { status, sandboxId, previewUrl, agentUrl, projectId },
  editor:      { activeFile, openTabs, fileTree, unsavedChanges },
  codingAgent: { messages, currentStep, isThinking, agentSteps, conversationId },
  copilot:     { suggestions, isCopilotActive },
  logs:        { entries, isStreaming },
  payments:    { balance, transactions, packages, subscriptionTier },
  dashboard:   { projects, trashProjects },
  settings:    { theme, keybindings, layout },
}
```

### Vite Proxy Architecture (Development)

In development, Vite's proxy handles four distinct routing concerns:

| Proxy path | Target | Purpose |
|---|---|---|
| `/api/agent-proxy/*` | `http://<sandboxId>.agent.localhost` | File API + Socket.io to sidecar |
| `/api/terminal-proxy/*` | `http://<sandboxId>.agent.localhost` | Terminal Socket.io (uses `sandboxId` query param) |
| `/api/preview-ping` | `http://<preview-host>` | Health-checks the user's Vite preview URL |
| `/api/*` | `http://localhost` (Ingress) | Auth, AI, Sandbox, Payments APIs |

---

## ⚙️ Usage & Setup

### Environment variables
> Keys and fake example values only. The Frontend reads no environment variables at runtime — all backend URLs are proxied through Vite (dev) or Nginx (production).

| Key | Required | Description | Example (fake) |
|---|---|---|---|
| `VITE_APP_TITLE` | ❌ | Optional application window title override | `AI Sandbox` |
| `VITE_PORT` | ❌ | Local Vite dev server port | `5173` |

> **Note:** The Vite proxy target (`http://localhost`) in `vite.config.js` assumes the Nginx Ingress is accessible at localhost. When running against the Skaffold cluster with local port-forwarding, this works out of the box.

### Run locally
```bash
# 1. Install dependencies
npm install

# 2. Start Vite dev server (port 5173, with proxy)
npm run dev

# 3. Lint
npm run lint

# 4. Build production bundle
npm run build

# 5. Preview production build locally
npm run preview
```

> **Prerequisites:** The backend cluster must be running (via `skaffold dev` in the project root) and the Nginx Ingress must be accessible at `localhost:80`.

---

## 🔌 Communication & Contracts

### Synchronous (REST) — via Axios
| API group | Base path | Counterpart service |
|---|---|---|
| Auth | `/api/auth/*` | Auth Service |
| AI Orchestration | `/api/ai/*` | AI Orchestration Service |
| Sandbox lifecycle | `/api/sandbox/*` | Sandbox Control Server |
| Payments & Credits | `/api/payments/*` | Payments Service |
| Agent File API | `/api/agent-proxy/api/agent/*` | Sandbox Agent Sidecar (proxied via Router) |

### Asynchronous (Socket.io / SSE)
| Connection | Purpose | Counterpart |
|---|---|---|
| `socket.io` via `/api/terminal-proxy` | Terminal I/O (`terminal-input`, `terminal-output`, `terminal-resize`) | Sandbox Agent Sidecar |
| `socket.io` via `/api/agent-proxy` | File-tree change events (`file-change`), Yjs sync | Sandbox Agent Sidecar |
| `socket.io` via `/api/ai` | AI agent step streaming (`agent-step`, `agent-error`) | AI Orchestration Service |

### Contract source of truth
- Auth API: [`Auth/src/routes/`](../Auth/src/routes/)
- AI API: [`Ai_orchestration/src/routes/ai.routes.js`](../Ai_orchestration/src/routes/ai.routes.js)
- Sandbox API: [`Sandbox/server/src/routes/sandbox.routes.js`](../Sandbox/server/src/routes/sandbox.routes.js)
- Payments API: [`Payments/routes/`](../Payments/routes/)
- Agent File API: [`Sandbox/Agent/src/app.js`](../Sandbox/Agent/src/app.js)

---

## 🛡️ Production Readiness

### Health & observability
- **Liveness/Readiness:** Not applicable — static SPA. No dedicated `/healthz` or `/ready` endpoints exist on the client bundle; health is determined by Nginx serving static files.
- **Client-side error tracking:** Not implemented — gap. A Sentry integration would surface production JS errors.
- **Performance monitoring:** Not implemented — gap.

### Security & compliance
- **Auth tokens:** JWT access token stored in Redux state (in-memory). Refresh token in `httpOnly` cookie set by the Auth Service — not accessible to JS. This is the correct pattern.
- **CORS:** All API calls go through the same-origin Vite proxy (dev) or Nginx (prod) — no cross-origin issues.
- **Content Security Policy:** Not configured — gap.
- **Sensitive data:** No credentials, tokens, or API keys are stored in the frontend bundle or localStorage.

### CI/CD & deployment
- **Build:** `npm run build` → outputs to `dist/`. The bundle should be served by Nginx or a CDN.
- **Development:** Served by `vite dev` on port 5173 — not exposed externally.
- **Container:** No Dockerfile in `Frontend/` — the frontend is currently served by a local Vite dev server in development and would require a separate Nginx-based Docker image for production.
- **Pipeline:** No CI pipeline defined. Manual `npm run build` for production bundles.

---

## 📝 Changelog & Migration State

| Version | Date | Change | Migration notes |
|---|---|---|---|
| `v0.0.0` | 2026-07 | Initial release: full IDE layout, Monaco editor, xterm terminal, AI agent chat, Copilot, payments UI, Redux store, Vite proxy | None — first release |

---

## 🤝 Ownership
- **Maintainer(s):** Sahil Sharma
- **Escalation:** Check project issues or contact the maintainer directly.
