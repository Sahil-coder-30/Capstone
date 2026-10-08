# FaultKit Distributed Error Handling & Structured Observability Architecture

> **Problem Statement in One Sentence**:  
> Taksha requires a unified, zero-overhead error normalization and structured JSON observability fabric across all asynchronous queue workers, token-streaming AI agents, and ephemeral sandbox containers to eliminate silent unhandled crashes, credential leaks, and un-traced cross-service failures under high-concurrency developer workloads.

---

## Scope & System Bounds

### Functional Requirements
1. **Unified Error Contract**: All HTTP, WebSocket (Socket.io), and Message Queue (RabbitMQ) endpoints must return a standardized, machine-readable, OpenAPI-compliant error envelope (`{ success: false, error: { code, message, details, requestId }, requestId }`).
2. **Automated Error Coercion**: Automatically normalize arbitrary thrown objects, native `Error` instances, Mongoose schema validation failures, MongoDB duplicate-key errors (`E11000`), CastErrors, and 3rd-party HTTP client errors (Axios/LLM APIs) into strongly typed `AppError` subclasses with appropriate HTTP status codes.
3. **Structured Cloud-Native Logging**: Replace all unparsed `console.log` and `console.error` calls across microservices with high-performance, single-line ISO-8601 JSON logs streamable to `stdout` for ingestion into Grafana Loki.
4. **End-to-End Correlation ID Propagation**: Extract, generate, and propagate `x-request-id` headers across ingress reverse proxies, inter-service HTTP calls, RabbitMQ AMQP message headers, and WebSocket handshakes.
5. **PII and Credential Redaction**: Automatically censor sensitive authorization tokens, refresh tokens, passwords, cookies, and AI API keys prior to emitting log records to stdout.
6. **AI Domain Error Handling**: Surface domain-specific failures (`INSUFFICIENT_CREDITS`, `CONTEXT_WINDOW_EXCEEDED`, `MODEL_RATE_LIMIT`, `LLM_PROVIDER_DOWN`) directly into the agent orchestration state machine without crashing the node execution loop.

### Non-Functional Requirements
- **Logging Latency Overhead**: $\le 0.1\text{ ms}$ p99 latency overhead per log entry via Pino's asynchronous/low-allocation serialization.
- **Log Volume Budget**: Maintain $\le 5\text{ KB/sec}$ log output per active replica under normal operational load.
- **Production Information Hiding**: In production environments (`NODE_ENV === "production"`), automatically sanitize non-operational 5xx programmer errors into generic safe messages to prevent leaking stack traces or internal topology.
- **Fail-Safe Observability**: Logging or error handling failures must NEVER throw or crash the main thread; proxy traps and circular JSON references must be trapped and sanitized.

### Back-of-the-Envelope Estimates & Capacity Sizing

Let us evaluate the logging volume, storage growth, and CPU overhead across the Taksha cluster at target operational capacity.

#### 1. Cluster Load Assumptions
- **Core Microservices**: 7 services (`Auth`, `Ai_orchestration`, `Payments`, `Notification`, `Sandbox-server`, `Sandbox-router`, `Admin`) $\times$ 3 replicas = 21 pods.
- **Concurrent Ephemeral Sandboxes**: 1,000 active developer sandboxes running language servers and build tasks.
- **Request Throughput**:
  - Core API endpoints: $150\text{ requests/sec}$ cluster-wide.
  - Active LLM Agent Runs: 50 concurrent sessions emitting ~10 tool calls and 50 SSE tokens per minute.
  - RabbitMQ Events: 30 events/sec (Auth alerts, Payment billing records).
  - Sandbox Router Proxy hops: $300\text{ WS/HTTP requests/sec}$.

#### 2. Log Line Math & Throughput
$$\text{HTTP API Logs} = 150\text{ req/sec} \times 2\text{ logs/req (access + complete)} = 300\text{ lines/sec}$$
$$\text{Queue Consumers} = 30\text{ events/sec} \times 2\text{ logs/event} = 60\text{ lines/sec}$$
$$\text{AI Orchestration Agent} = 50\text{ agents} \times 1.5\text{ steps/sec} = 75\text{ lines/sec}$$
$$\text{Sandbox Router & Life Cycle} = 300\text{ req/sec} \times 0.2\text{ (sampled)} = 60\text{ lines/sec}$$
$$\text{Total Ingestion Rate} = 300 + 60 + 75 + 60 = 495 \approx \mathbf{500\text{ log lines/sec}}$$

#### 3. Network Bandwidth & Storage Footprint
- Average structured JSON log line size (with correlation ID, service tag, timestamp, and sanitized metadata): $380\text{ bytes}$.
$$\text{Ingestion Bandwidth} = 500\text{ lines/sec} \times 380\text{ bytes} \approx 190\text{ KB/sec} \approx 1.52\text{ Mbps}$$
$$\text{Daily Raw Volume} = 190\text{ KB/sec} \times 86,400\text{ sec/day} \approx 16.4\text{ GB/day (uncompressed)}$$
- With Grafana Loki gzip chunk compression (typical ratio $5:1$):
$$\text{Compressed Daily Storage} = \frac{16.4\text{ GB}}{5} \approx \mathbf{3.28\text{ GB/day}}$$
$$\text{30-Day Retention Storage} = 3.28\text{ GB/day} \times 30\text{ days} \approx \mathbf{98.4\text{ GB}}$$

---

## 1. Concept in Plain English

When a software system consists of multiple microservices talking over HTTP, WebSockets, and Message Queues, errors and logs become fragmented:
1. One service prints raw text with `console.log("[Auth] User logged in")`, while another prints `console.error(err)`.
2. When an error happens, one service returns `{ status: "error", message: "Failed" }`, another returns `{ success: false, err: "Internal Error" }`, and a third returns an HTML error page from Express default handling.
3. If a request touches the API Gateway $\rightarrow$ Auth Service $\rightarrow$ RabbitMQ $\rightarrow$ Notification Service, and fails midway, there is no shared ID connecting the log messages. Engineers must manually search through hundreds of megabytes of logs trying to guess which failure belongs to which user.

**FaultKit** is a unified toolkit that solves this by providing:
- A standardized hierarchy of error classes (`AppError`, `ValidationError`, `InsufficientCreditsError`, etc.).
- A zero-allocation structured JSON logger (powered by Pino) that formats every log entry with a service name, timestamp, and redaction of passwords/tokens.
- An automated Express middleware that catches any error, extracts a correlation ID (`x-request-id`), maps database errors (Mongoose/Prisma/Axios) to clean HTTP responses, and logs them in JSON format for Grafana Loki.
- Lightweight formatters (`toErrorResponse`) that provide the exact same error format for Socket.io events and RabbitMQ message consumers.

---

## 2. Why It Exists: Failure Modes at Scale

| Scale | Without FaultKit (Current Status Quo) | With FaultKit Architecture |
|---|---|---|
| **1x (Local Dev)** | Random `console.log` output in terminal; unhandled errors crash nodemon or leak raw MongoDB connection errors. | Clear JSON logs or pino-pretty outputs; consistent OpenAPI error responses. |
| **10x (Staging / 100 QPS)** | Microservice logs interleave in Docker; searching for a specific user failure requires scanning terminal text line by line. | Logs stream to Loki; filtering by `{service="auth", level="error"}` isolates issues in under 1 second. |
| **100x (Production / 1,000 QPS)** | `console.log` blocks the Node.js event loop during heavy I/O; raw database stack traces leak database table names and credentials to clients; token leakage in logs creates compliance violations. | Zero-blocking asynchronous stream; automatic redaction of JWTs and API keys; production error masking hides internal code paths. |
| **1,000x (Multi-Region EKS / 10,000 QPS)** | Cascading failures: an unhandled exception in one queue consumer halts message consumption or crashes pods in a CrashLoopBackOff; no correlation ID exists across async boundaries. | Unhandled exceptions coerced to `AppError`; dead-letter queues receive structured payloads with `requestId`; Grafana triggers automated alerts on `RATE_LIMIT_EXCEEDED` or `MODEL_RATE_LIMIT`. |

---

## 3. Core Mechanism: Step-by-Step Execution

```
[Client / Frontend Request] (Headers: x-request-id: req-abc-123)
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Ingress & Context Initialization                         │
│    - Express parses or generates `x-request-id`             │
│    - Injects into Request context & Response headers        │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Controller & Business Logic Execution                    │
│    - Throws `AppError` subclass (e.g. InsufficientCredits)  │
│      OR uncaught Mongoose/Axios error                       │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. FaultKit Global Error Middleware Catch                   │
│    - Safeguard: checks `res.headersSent`                    │
│    - Coercer: `coerceToAppError(err)` runs:                 │
│      • Mongoose ValidationError → ValidationError (400)     │
│      • MongoDB E11000 Duplicate → ConflictError (409)       │
│      • CastError (Invalid ID)   → BadRequestError (400)     │
│      • Native Error             → InternalServerError (500) │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Structured JSON Logging (Pino / Loki Engine)             │
│    - Extracts `err` via `createAppErrorSerializer()`        │
│    - Attaches `service`, `statusCode`, `requestId`, `path`  │
│    - Applies `DEFAULT_REDACT_KEYS` (censors tokens/keys)    │
│    - Emits single-line ISO-8601 JSON to stdout              │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Client Response Sanitization & Delivery                  │
│    - If production & 5xx: Mask message with generic text    │
│    - Response body:                                         │
│      {                                                      │
│        "success": false,                                    │
│        "error": {                                           │
│          "code": "INSUFFICIENT_CREDITS",                    │
│          "message": "Insufficient mistral credits.",        │
│          "details": { "creditsRemaining": 0 },              │
│          "requestId": "req-abc-123"                         │
│        },                                                   │
│        "requestId": "req-abc-123"                           │
│      }                                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Reference Architecture Across Taksha Microservices

```mermaid
flowchart TD
    subgraph Clients["Clients Layer"]
        FE[React Frontend / payments_frontend]
        CLI[Taksha CLI / Extension]
    end

    subgraph Ingress["Ingress & Routing"]
        K8S_ING[Kubernetes Ingress / Router]
    end

    subgraph Services["Core Microservices (EKS Pods)"]
        AUTH[Auth Service\n(faultkit logger + express handler)]
        AI[AI Orchestration\n(LangGraph + Socket.io + faultkit)]
        PAY[Payments Service\n(Razorpay + Cron + faultkit)]
        NOTIF[Notification Service\n(RabbitMQ Consumer + faultkit)]
        SANDBOX[Sandbox Server & Router\n(K8s Orchestration + faultkit)]
    end

    subgraph Messaging["Async Message Bus"]
        RMQ[(RabbitMQ Broker\nHeaders: x-request-id)]
    end

    subgraph Observability["Central Observability Stack"]
        STDOUT[Pod stdout / stderr JSON Stream]
        PROMTAIL[Promtail DaemonSet]
        LOKI[(Grafana Loki)]
        GRAFANA[Grafana Unified Dashboards]
    end

    FE -->|x-request-id: uuid| K8S_ING
    CLI -->|x-request-id: uuid| K8S_ING
    K8S_ING --> AUTH
    K8S_ING --> AI
    K8S_ING --> PAY
    K8S_ING --> SANDBOX

    AUTH -.->|publish login event\n+ x-request-id| RMQ
    PAY -.->|publish invoice event\n+ x-request-id| RMQ
    RMQ -.->|consume message| NOTIF

    AUTH -->|single-line JSON| STDOUT
    AI -->|single-line JSON| STDOUT
    PAY -->|single-line JSON| STDOUT
    NOTIF -->|single-line JSON| STDOUT
    SANDBOX -->|single-line JSON| STDOUT

    STDOUT --> PROMTAIL
    PROMTAIL --> LOKI
    LOKI --> GRAFANA
```

---

## 5. Scalability Deep Dive

### 5.1 Horizontal vs. Vertical Scaling
- **Horizontal Scaling**: FaultKit is completely stateless. Every instance creates a lightweight Pino logger in memory. Adding replicas in Kubernetes requires zero distributed coordination or lock contention.
- **Garbage Collection (GC) Impact**: Pino avoids creating intermediate strings and allocations. Compared to standard `console.log` (which performs synchronous serialization and formatted string interpolation), FaultKit reduces Node.js event-loop lag and V8 heap churn by $> 60\%$ during high-throughput bursts.

### 5.2 Bottleneck Analysis: 10x, 100x, 1000x Load
- **At 10x Load (1,500 req/sec)**:
  - Bottleneck: stdout buffer saturation if logs are overly verbose (`debug` level in production).
  - Remedy: Set `LOG_LEVEL=info` in production via Kubernetes ConfigMaps.
- **At 100x Load (15,000 req/sec)**:
  - Bottleneck: Promtail tailing file descriptors on Kubernetes worker nodes consumes CPU parsing high log volumes.
  - Remedy: Promtail log dropping rules for 2xx access logs or asynchronous batching (`batchwait: 1s`, `batchsize: 1MB`).
- **At 1000x Load (150,000 req/sec)**:
  - Bottleneck: Disk I/O saturation on Kubernetes container log directories (`/var/log/pods`).
  - Remedy: Direct transport of high-volume logs to remote collectors via UDP/Unix sockets, or dynamic log sampling.

### 5.3 Caching Strategy & Redaction
- **No Caching of Errors**: Error responses should include `Cache-Control: no-store, no-cache, must-revalidate` to prevent intermediate proxies or CDNs from caching error states (e.g. 500 or 429).
- **In-Memory Redaction Trie**: FaultKit's `DEFAULT_REDACT_KEYS` compiles key paths (`req.headers.authorization`, `password`, `*.token`, `apiKey`) into an optimized redaction parser, ensuring credentials are never saved in Loki indices or S3 cold storage.

### 5.4 Replication & Distributed Tracing (CAP Consistency)
- **AP-Oriented Logging**: Logging is strictly Eventual/Best-Effort. The loss of a single telemetry log line must NEVER fail a user-facing transaction.
- **Deterministic Trace Propagation**:
  1. If an incoming HTTP request lacks an `x-request-id`, FaultKit or an ingress middleware generates a UUIDv7.
  2. For downstream HTTP calls: `axios.defaults.headers.common['x-request-id'] = req.id`.
  3. For RabbitMQ messages:
     ```javascript
     channel.publish(exchange, routingKey, Buffer.from(payload), {
       headers: { 'x-request-id': req.id }
     });
     ```
  4. For WebSocket events:
     ```javascript
     socket.emit("agent:error", toErrorResponse(err, { requestId: socket.data.requestId }));
     ```

### 5.5 Async Processing & Backpressure Handling
- When a RabbitMQ worker encounters a `ValidationError` or `AppError(isOperational=true)`, it rejects the message with `requeue=false` and logs the structured error with `requestId`.
- If a transient failure occurs (e.g., MongoDB disconnection `MongoNetworkTimeoutError`), the error is flagged as non-operational, logged at `fatal`/`error` level, and routed to a Dead-Letter Queue (DLQ) with an exponential backoff header.

### 5.6 Observability Metrics & Alerts
The combination of FaultKit and Loki enables exact LogQL alerting rules in Prometheus/Grafana:
1. **Critical Uncaught Crash Rate**:
   ```logql
   sum(rate({namespace="taksha"} |= `"level":"error"` | json | isOperational == false [5m])) > 5
   ```
2. **AI Credit Exhaustion Alert**:
   ```logql
   sum(rate({service="ai-orchestration"} |= `"errorCode":"INSUFFICIENT_CREDITS"` [5m])) > 20
   ```
3. **Database Constraint Collisions**:
   ```logql
   sum(rate({service=~".+"} |= `"errorCode":"CONFLICT"` [5m])) > 10
   ```

---

## 6. Trade-offs Table: Alternative Approaches

| Criterion | Custom Ad-Hoc `console.log` + Custom Error Handler | Winston + Morgan | FaultKit (Pino + OpenAPI AppError Engine) |
|---|---|---|---|
| **Event Loop Blocking** | High (synchronous I/O on large strings) | Medium (multiple transport overhead) | **Extremely Low** (asynchronous zero-copy stream) |
| **Output Format** | Unstructured text, multi-line error traces | JSON or text, requires heavy formatting config | **Native single-line ISO-8601 JSON for Grafana Loki** |
| **Sensitive Data Redaction** | Manual (frequently forgotten, leaking JWTs) | Requires complex format plugins | **Built-in `DEFAULT_REDACT_KEYS` automatic redaction** |
| **Error Hierarchy** | Inconsistent across services | None built-in (must build from scratch) | **Comprehensive** (Auth, DB, K8s, AI Orchestration error classes) |
| **Transport Agnostic** | HTTP only | Logger only | **HTTP, WebSockets (Socket.io), RabbitMQ, and Lambdas** |
| **Distributed Tracing** | None | Requires manual wiring | **Automatic extraction & propagation of `x-request-id`** |
| **Memory Footprint** | Low | High (large dependency graph) | **Minimal (1 core runtime dependency: `pino`)** |

---

## 7. Ties to CS & Systems Fundamentals

1. **Structured Logging vs. Unstructured Streams**: Unstructured text logs require regular expression parsing ($O(N)$ string pattern matching at index time) in Loki/Elasticsearch, causing high CPU consumption. JSON logs represent deterministic key-value associative arrays that Promtail and Loki can parse in $O(1)$ amortized streaming time without regex overhead.
2. **Exception Hierarchies & Prototype Chains**: FaultKit leverages JavaScript's prototypal inheritance:
   $$\text{Error} \longleftarrow \text{AppError} \longleftarrow \{\text{BadRequestError}, \text{ConflictError}, \text{InsufficientCreditsError}\}$$
   By preserving `Error.captureStackTrace` and `Object.setPrototypeOf`, V8 JIT compilers retain accurate optimization bailouts, while type checking (`err instanceof AppError`) operates in $O(1)$ prototype lookups.
3. **Distributed Directed Acyclic Graph (DAG) Tracing**: The propagation of `x-request-id` transforms independent microservice log lines into nodes of a causal DAG. A single correlation ID binds the parent edge (HTTP Gateway) to child branches (RabbitMQ workers, AI LLM invocations, Sandbox executions).

---

## 8. Connecting FaultKit to Taksha's Codebase

### 8.1 Auth Service (`Auth/src/app/app.js` & `Auth/src/controllers/auth.controller.js`)
- **Current State**: Uses `morgan("dev")`, has no global error handler, throws raw `Error("User not found")`.
- **FaultKit Upgrade**:
  1. Initialize `createLogger({ service: 'auth' })`.
  2. Replace `throw Error("User not found")` with `throw new NotFoundError("User not found")`.
  3. In `auth.controller.js`, throw `TokenExpiredError` and `UnauthorizedError`.
  4. Register `createExpressErrorHandler()` as the final middleware in `app.js`.
  5. Automatic Mongoose `11000` duplicate key handling ensures duplicate email registrations cleanly return `409 Conflict` instead of crashing.

### 8.2 AI Orchestration (`Ai_orchestration/src/app/app.js` & `Ai_orchestration/src/socket/socket.js`)
- **Current State**: Uses `morgan("combined")`, lacks HTTP error handling, has fragmented `console.log` in WebSocket loops.
- **FaultKit Upgrade**:
  1. Initialize `createLogger({ service: 'ai-orchestration' })`.
  2. In Socket.io events (`agent:invoke`): Wrap graph execution in try/catch and emit `socket.emit("agent:error", toErrorResponse(err, { requestId: socket.data.requestId }))`.
  3. AI-specific errors: When model rate limits occur, throw `new ModelRateLimitError(...)`; when credits are exhausted, throw `new InsufficientCreditsError(...)`.
  4. Automatic redaction ensures user prompts containing API keys or environment secrets are not leaked in log collectors.

### 8.3 Payments Service (`Payments/app/app.js`)
- **Current State**: Has an ad-hoc 4-argument error handler returning `{ status: 'error', message }`, logs with `console.error`.
- **FaultKit Upgrade**:
  1. Replace ad-hoc handler with `createExpressErrorHandler()`.
  2. Razorpay webhook signature verification failures throw `new UnauthorizedError("Invalid webhook signature")`.
  3. Credit balance checks throw `new InsufficientCreditsError("Insufficient balance for requested transaction")`.

### 8.4 Notification Service (`Notification/src/app/app.js`)
- **Current State**: RabbitMQ consumer logs errors via `console.error("auth_notification_queue error:", err.message)`.
- **FaultKit Upgrade**:
  1. Initialize `createLogger({ service: 'notification' })`.
  2. Consume messages, extract `headers['x-request-id']`, and create a child logger: `const log = logger.child({ requestId })`.
  3. In error catch block: `log.error({ err: coerceToAppError(err) }, "Failed to process notification email")`.

### 8.5 Ephemeral Sandbox & Router (`Sandbox/server/src/app/app.js` & `Sandbox/router/src/app.js`)
- **Current State**: Router proxy logs WebSocket upgrades with `console.log`, sandbox server uses ad-hoc error middleware.
- **FaultKit Upgrade**:
  1. Track sandbox lifecycle events (`createPod`, `createService`) using structured fields: `logger.info({ sandboxId, userId }, "Provisioned ephemeral sandbox container")`.
  2. Router proxy logs timeouts with `GatewayTimeoutError` (`504`) and unavailable sandboxes with `ServiceUnavailableError` (`503`).

### 8.6 Frontend Layer (`Frontend` & `payments_frontend`)
- **FaultKit Contract**: Frontend Axios/Fetch interceptor parses the guaranteed OpenAPI response:
  ```javascript
  api.interceptors.response.use(
    (response) => response,
    (error) => {
      const errorData = error.response?.data?.error;
      if (!errorData) {
        toast.error("Network error. Please check your connection.");
        return Promise.reject(error);
      }
      // 1. Toast user-safe message
      toast.error(errorData.message);
      // 2. Map form validation details
      if (errorData.code === "VALIDATION_ERROR" && errorData.details) {
        setFieldErrors(errorData.details);
      }
      // 3. Handle session revocation
      if (errorData.code === "UNAUTHORIZED" || errorData.code === "TOKEN_EXPIRED") {
        window.location.href = "/login";
      }
      return Promise.reject(errorData);
    }
  );
  ```

---

## 9. If Constraints Were Looser: OpenTelemetry eBPF Auto-Instrumentation

If we were not constrained to standard Node.js application-layer packages, an alternative architecture would be **eBPF (Extended Berkeley Packet Filter) kernel-level instrumentation** (e.g. Grafana Beyla) coupled with an **OpenTelemetry Collector Sidecar**:
- **Mechanism**: The Linux kernel intercepts network read/write syscalls, measuring request latencies and HTTP status codes with zero modifications to application code.
- **Why FaultKit Remains Necessary**: eBPF cannot inspect in-memory JavaScript exceptions, Mongoose validation structures, or AI agent state graphs before an HTTP response is constructed. The ideal production architecture couples FaultKit at the application runtime layer (for error normalization and structured business logging) with OpenTelemetry/eBPF at the infrastructure layer (for kernel-level network tracing).

---

## 10. Common Pitfalls & Antipatterns

| Antipattern | Why It Fails in Production | Correct Pattern |
|---|---|---|
| **Calling `logger.error(err)` instead of `logger.error({ err }, "Context message")`** | Pino's error serializer expects an object with an `err` or `error` key. Passing `err` as a string or sole argument drops structured stack details. | Always pass `{ err }` as the first object argument: `logger.error({ err, userId }, "Failed to process transaction")`. |
| **Forgetting `return next(err)` when headers are already sent** | In SSE streaming or chunked transfers, throwing after `res.writeHead` causes Express to attempt writing a 500 header, throwing `ERR_HTTP_HEADERS_SENT`. | FaultKit's `createExpressErrorHandler` automatically checks `res.headersSent` and delegates to `next(err)`. |
| **Catching errors in RabbitMQ consumers without Ack/Nack** | The broker keeps the unacknowledged message in memory indefinitely, causing consumer lag and memory leak in the RabbitMQ cluster. | Always `channel.ack(msg)` on success, or `channel.nack(msg, false, false)` to route to Dead-Letter Queue on failure. |
| **Using `res.status(500).json(err)` directly** | Leaks database connection strings, credentials, and internal file paths to API consumers. | Always route through `createExpressErrorHandler()`, which masks 500 errors in production. |
| **Passing circular objects in details** | Standard `JSON.stringify` crashes the thread with `TypeError: Converting circular structure to JSON`. | FaultKit's `sanitizeDetails()` intercepts circular structures with `[Circular]` sentinels and converts BigInt to strings. |

---

## 11. Phased Implementation Roadmap & Checklist

### Phase 1: Package Installation & Workspace Setup
- [ ] Add `"faultkit": "^1.1.0"` to `dependencies` in:
  - `Auth/package.json`
  - `Ai_orchestration/package.json`
  - `Payments/package.json`
  - `Notification/package.json`
  - `Sandbox/server/package.json`
  - `Sandbox/router/package.json`
- [ ] Run `npm install` across target microservices.

### Phase 2: Core Microservice Error Handler Migration
- [ ] **Auth Service**:
  - Instantiate `createLogger({ service: "auth" })`.
  - Register `createExpressErrorHandler()` as the last middleware in `Auth/src/app/app.js`.
  - Upgrade controllers to throw `AppError` subclasses (`NotFoundError`, `UnauthorizedError`, `ConflictError`).
- [ ] **Payments Service**:
  - Replace ad-hoc error middleware in `Payments/app/app.js` with `createExpressErrorHandler()`.
  - Update credit controllers to throw `InsufficientCreditsError` and `ValidationError`.
- [ ] **Sandbox Server & Router**:
  - Replace `Sandbox/server/src/middleware/error.middleware.js` with `createExpressErrorHandler()`.
  - Add structured request logging with sandbox container IDs.

### Phase 3: Asynchronous Transports (WebSockets & RabbitMQ)
- [ ] **AI Orchestration Socket.io**:
  - In `Ai_orchestration/src/socket/socket.js`, wrap event handlers and stream errors with `toErrorResponse(err, { requestId })`.
  - Replace `console.log` with `createLogger({ service: "ai-orchestration" })`.
- [ ] **Notification RabbitMQ Workers**:
  - In `Notification/src/app/app.js`, extract `x-request-id` from AMQP headers.
  - Log consumer outcomes with structured child loggers.

### Phase 4: Frontend Contract Alignment
- [ ] Add response interceptor in `Frontend` and `payments_frontend` Axios instances to parse `{ success: false, error: { code, message, details, requestId } }`.
- [ ] Align `docs/openapi.yaml` error response schemas with the FaultKit contract.
