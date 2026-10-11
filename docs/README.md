# 📚 Taksha CodeSpace — Engineering Documentation Suite

> **Canonical System Documentation Index**  
> **Platform**: Taksha Cloud AI CodeSpace & Sandboxed Execution Platform  
> **Repository**: `Capstone`

Welcome to the definitive engineering documentation for Taksha CodeSpace. Every document in this directory adheres to the **Scalability-First Documentation Protocol**, providing end-to-end implementation details, mathematical capacity bounds, failure recovery protocols, and code references grounded directly in the production codebase.

---

## 🗺️ Documentation Directory Map

```
docs/
├── README.md                                          ← You are here: Master Documentation Index
├── openapi.yaml                                       ← Universal OpenAPI 3.1.0 Contract (113KB)
│
├── architecture/                                      ← Canonical System Master Blueprints (The "Why" & "How")
│   ├── 01-ai-agent-orchestration.md                   ← Orion v3 & Clio 9-Node StateGraph Master Blueprint
│   ├── 02-mcp-sandbox-sidecar.md                      ← Single MCP Server & Orchestrator Scoped Projection
│   ├── 03-auth-and-security.md                        ← RS256 JWKS Asymmetric Auth & Token Family Rotation
│   ├── 04-distributed-transports-streaming.md         ← SSE over HTTP/2, gRPC East-West RPC, & RabbitMQ AMQP
│   ├── 05-observability-and-error-handling.md         ← FaultKit RFC-7807 Errors & Prometheus/Loki Stack
│   ├── 06-api-contracts-and-specifications.md         ← OpenAPI 3.1 Spec-First Standard & TypeScript SDK Gen
│   ├── 07-payments-and-subscriptions.md               ← Razorpay Dual-Check Ledger & Zero Day-Waste Queue
│   ├── 08-browser-agent-extension.md                  ← Chrome MV3 Extension (DOM Telemetry & Visual QA)
│   ├── 09-webgl-ui-performance.md                     ← 60FPS WebGL Canvas & Hardware-Accelerated UI
│   └── auth-architecture-reference.md                 ← Comprehensive 700-line Low-Level Auth Reference
│
├── deep-dives/                                        ← Technical Deep-Dives & Research Benchmarks
│   ├── orion-v3-production-graph-deep-dive.md         ← Grounded node-by-node analysis of code.agent.js
│   ├── orion-v3-benchmarks-world-comparison.md        ← Comparative audit vs Claude Code, Cursor, Devin
│   └── ai-orchestration-pipeline-middleware.md        ← Express SSE runner, lifecycle, and model fallbacks
│
├── infrastructure/                                    ← Cluster Operations & Kubernetes
│   ├── k8s-skaffold-production-guide.md               ← Canonical EKS & Skaffold deployment manual
│   ├── grafana-prometheus-loki-stack.md               ← Prometheus Operator & Grafana Alloy logging stack
│   └── sandbox-reverse-proxy-router.md                ← Subdomain reverse proxy & terminal WebSocket bridge
│
├── frontend/                                          ← Client Architecture & Design System
│   └── frontend-architecture-and-design-tokens.md     ← 4-Layer React 19 architecture & dual-theme tokens
│
├── prd/                                               ← Product Specifications
│   └── taksha-codespace-prd.md                        ← Authoritative Product Requirements Document (PRD)
│
├── api/                                               ← Low-Level API Designs & Contracts
│   └── post-code-agent-invoke.md                      ← Detailed LLD for the POST /api/ai/agent/invoke stream
│
└── diagrams/                                          ← Schematics & Visual Design Assets
    ├── final-capstone.excalidraw                      ← Master system architecture Excalidraw canvas
    ├── codespace-latest.excalidraw                    ← Interactive workspace flow Excalidraw canvas
    ├── taksha-logo.html                               ← Standalone SVG logo asset
    ├── taksha-color-palette.html                      ← Interactive design tokens & color palette visualizer
    ├── taksha-logo-animation.md                       ← GSAP logo animation timeline specification
    └── taksha-landing-page-blueprint.html             ← Landing page visual blueprint
```

---

## 🏛️ The 9 Architectural Master Blueprints

| # | Master Document | Scope & System Responsibility | Key Engineering Decision |
|---|---|---|---|
| **01** | [01-ai-agent-orchestration.md](file:///Users/home/Desktop/Projects/Capstone/docs/architecture/01-ai-agent-orchestration.md) | Orion v3 LangGraph Brain & Clio Copilot | Decouples sub-100ms non-autoregressive Jev routing from System 2 frontier LLM coding; eliminates loops via SHA-256 error signature deduplication and tri-layer mechanical compiler verification. |
| **02** | [02-mcp-sandbox-sidecar.md](file:///Users/home/Desktop/Projects/Capstone/docs/architecture/02-mcp-sandbox-sidecar.md) | Model Context Protocol in Sandboxes | Single role-agnostic MCP server (`POST /mcp`) in the sandbox sidecar. `Ai_orchestration` enforces least-privilege tool projection per agent role, cutting prompt tokens by >80% with 0.0ms cached discovery. |
| **03** | [03-auth-and-security.md](file:///Users/home/Desktop/Projects/Capstone/docs/architecture/03-auth-and-security.md) | Distributed Identity & Key Management | RS256 asymmetric signing with JWKS (`/.well-known/jwks.json`). In-memory access tokens (XSS immune) + `httpOnly` refresh cookies with cryptographic Token Family replay protection. |
| **04** | [04-distributed-transports-streaming.md](file:///Users/home/Desktop/Projects/Capstone/docs/architecture/04-distributed-transports-streaming.md) | Transport Protocols & Inter-Service RPC | Tri-modal transport: SSE over HTTP/2 for client streaming; gRPC over HTTP/2 with Protobuf for East-West credit/terminal RPC; RabbitMQ (AMQP) for decoupled fire-and-forget emails. |
| **05** | [05-observability-and-error-handling.md](file:///Users/home/Desktop/Projects/Capstone/docs/architecture/05-observability-and-error-handling.md) | Telemetry, Metrics & Distributed Logging | FaultKit RFC-7807 error responses across all microservices, Pino structured JSON logging with credential redaction, and Prometheus Operator with strict route normalization (`/api/sandbox/:id`). |
| **06** | [06-api-contracts-and-specifications.md](file:///Users/home/Desktop/Projects/Capstone/docs/architecture/06-api-contracts-and-specifications.md) | Universal API Specifications & Contracts | OpenAPI 3.1.0 monolithic specification (`docs/openapi.yaml`) driving compile-time TypeScript SDK generation (`openapi-typescript`) and ingress-layer schema validation. |
| **07** | [07-payments-and-subscriptions.md](file:///Users/home/Desktop/Projects/Capstone/docs/architecture/07-payments-and-subscriptions.md) | Financial Ledger, Credits & Razorpay | Single-path synchronous client verification with mandatory server-side Razorpay `fetchPayment` capture confirmation. Idempotent ledger with zero day-waste subscription promotion queue. |
| **08** | [08-browser-agent-extension.md](file:///Users/home/Desktop/Projects/Capstone/docs/architecture/08-browser-agent-extension.md) | Autonomous Browser QA & Telemetry | Manifest V3 Chrome Extension giving Orion/Clio "Eyes & Hands" (DOM accessibility tree inspection, screenshot deltas, and synthetic interactions) with zero compute overhead on K8s. |
| **09** | [09-webgl-ui-performance.md](file:///Users/home/Desktop/Projects/Capstone/docs/architecture/09-webgl-ui-performance.md) | Hardware-Accelerated UI & Rendering | 60 FPS WebGL shader canvas with visibility gating, context loss recovery, and DPR clamping to preserve client battery and GPU resources. |

---

## 🔒 5 Non-Negotiable System Invariants

1. **Mechanical Compiler Truth**: The AI agent never grades its own work. The actual sandbox compiler (`npm run build`) and runtime HMR error socket provide binary pass/fail verification.
2. **Zero-Trust Asymmetric Auth**: Downstream microservices never touch or store the RSA-2048 private key. They verify JWTs locally using cached public keys fetched from `/.well-known/jwks.json`.
3. **Least-Privilege Scoped MCP**: The sandbox sidecar exposes a single standard `/mcp` server, while `Ai_orchestration` projects strictly authorized tool subsets per agent node (`ALLOWED_TOOLS_BY_ROLE`).
4. **Loop-Termination Guarantee**: Agent loops terminate in $O(1)$ time upon duplicate error signatures using SHA-256 digests (`errorSignatureHistory`) or upon hitting the 16-transition circuit breaker.
5. **Idempotent Financial Ledger**: Payments are credited only after server-side cryptographic signature validation and Razorpay API capture confirmation, guarded by unique sparse database indices.
