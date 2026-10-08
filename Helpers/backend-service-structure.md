# Backend Service — Folder Structure & Coding Conventions

> **Purpose**: This document tells an AI agent exactly how to scaffold and write a new backend microservice in this monorepo. Follow every rule here without deviation.

---

## 1. Monorepo Layout

Each microservice lives as its own **top-level folder** inside the Capstone monorepo root.

```
Capstone/
├── Auth/
├── Payments/
├── Admin/
├── Notification/
├── Ai_orchestration/
├── Sandbox/
├── Helpers/            ← shared docs / skills (not a service)
├── Frontend/
├── k8s/                ← Kubernetes manifests
└── skaffold.yml
```

Every service folder is **fully self-contained** — its own `package.json`, `.env`, `dockerfile`, and source code. There is no shared `node_modules` between services.

---

## 2. Service Root Files

```
<ServiceName>/
├── server.js           ← ONLY entry point. Starts HTTP listener.
├── app/
│   └── app.js          ← Express app factory. No HTTP listen here.
├── config/
├── controllers/
├── middleware/
├── models/
├── routes/
├── services/
├── scripts/            ← One-off or cron scripts (optional)
├── package.json
├── .env
├── .gitignore
├── .dockerignore
└── dockerfile
```

### Key Rule — server.js vs app/app.js

| File | What goes here | What NEVER goes here |
|---|---|---|
| `server.js` | `app.listen()`, `dotenv.config()`, DB connect call | Route definitions, middleware, business logic |
| `app/app.js` | Express app creation, all middleware, all route mounts, health probes, 404 handler, global error handler | `app.listen()`, any I/O or DB calls |

**server.js is always exactly this pattern — do not add anything else:**

```js
import dotenv from 'dotenv'
import app from "./app/app.js";
import { connectToDb } from "./config/db.js";

dotenv.config();

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
    await connectToDb();
    console.log(`Server is running on port ${PORT}`);
});
```

**app/app.js always follows this skeleton:**

```js
import express from 'express';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import someRouter from '../routes/some.routes.js';

const app = express();

// ── Core Middleware ───────────────────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/<service>/<resource>', someRouter);

// ── Health Probes ─────────────────────────────────────────────────────────────
app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok', service: '<service-name>', message: '<Service> is healthy' });
});

app.get('/readyz', (_req, res) => {
    res.status(200).json({ status: 'ok', service: '<service-name>', message: '<Service> is ready' });
});

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ status: 'error', message: 'Route not found' });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
// Must have 4 parameters — Express identifies this as an error-handling middleware
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
    const statusCode = err.statusCode || err.status || 500;
    const message = err.message || 'Internal server error';

    console.error(`[<Service> Error] ${statusCode} — ${message}`, err.stack || '');

    res.status(statusCode).json({
        status: 'error',
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
});

export default app;
```

> **Rule**: Health probes `/healthz` and `/readyz` are **mandatory** on every service. The global error handler always has exactly 4 params (`err, _req, res, _next`).

---

## 3. config/ Folder

Holds all infrastructure connection modules. Each file exports one or more named functions — never a class, never a singleton instance leaking module-level state.

```
config/
├── db.js               ← MongoDB / Mongoose connection
├── redis.js            ← Redis / ioredis client + helper fns
├── mq.js               ← RabbitMQ / amqplib connection + publish helpers
├── packages.config.js  ← Static product/pricing config (not infrastructure)
└── subscription.config.js
```

**config/db.js pattern — always:**

```js
import mongoose from "mongoose";

export const connectToDb = async () => {
    try {
        const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
        if (!uri) throw new Error('MONGO_URI is not defined in environment variables');
        await mongoose.connect(uri);
        console.log('[<Service> DB] Connected to MongoDB successfully');
    } catch (error) {
        console.error('[<Service> DB] Connection error:', error.message);
        process.exit(1);
    }
};
```

> Config functions use **tagged console logs** `[ServiceName DB]`, `[ServiceName Redis]`, etc. for grep-ability in k8s logs.

---

## 4. models/ Folder

All Mongoose schemas. Naming convention: `<resource>.model.js`.

```
models/
├── credit.model.js
├── transaction.model.js
├── account.model.js
└── billing.model.js
```

**Rules:**
- Export **named constants** (enums/arrays) at the top of the file alongside the model, e.g. `export const SUBSCRIPTION_TIERS = ['free', 'pro', 'max']` — controllers import them directly instead of hardcoding strings.
- Sub-schemas (`{ _id: false }`) are defined inline in the same file as their parent schema.
- No business logic inside models. Models are pure schema definitions + statics if truly needed.
- Always add `min: 0` on numeric fields that must never go negative.

**Model file pattern:**

```js
import mongoose from 'mongoose';

export const SOME_ENUM = ['value1', 'value2'];

const SubSchema = new mongoose.Schema({ ... }, { _id: false });

const MainSchema = new mongoose.Schema({
    field: { type: String, enum: SOME_ENUM, required: true },
    // ...
}, { timestamps: true });

const ModelName = mongoose.model('ModelName', MainSchema);
export default ModelName;
```

---

## 5. routes/ Folder

Naming convention: `<resource>.routes.js`. Each route file owns one Express Router for one resource domain.

```
routes/
├── credit.routes.js
├── webhook.routes.js
└── admin.routes.js
```

**Rules:**
- Import and destructure all controller functions at the top.
- Group routes with inline comments using the `// ── Section Name ──` banner style.
- Apply middleware at the **router level** using `router.use(middleware)` for auth gates — this draws a clear public/authenticated boundary rather than repeating the middleware on every route.
- Never put business logic in a route file. Routes only wire middleware + controller.

**Route file pattern:**

```js
import express from 'express';
import { identifyUser } from '../middleware/identifyUser.middleware.js';
import {
    getFooController,
    createFooController,
} from '../controllers/foo.controller.js';

const router = express.Router();

// ── Public Routes (no auth required) ─────────────────────────────────────────
router.get('/public-endpoint', getFooController);

// ── Authenticated Routes ──────────────────────────────────────────────────────
router.use(identifyUser);

router.get('/', getFooController);
router.post('/create', createFooController);

export default router;
```

---

## 6. controllers/ Folder

Naming convention: `<resource>.controller.js`. Each file exports **named async arrow functions** — one function per HTTP handler.

```
controllers/
├── credit.controller.js
├── webhook.controller.js
└── admin.controller.js
```

**Rules:**
- Controllers are always `export const somethingController = async (req, res) => { ... }`.
- Response shape is always `{ status: 'success' | 'error', ... }`.
- Early return on error with the correct HTTP status code.
- Helper functions (pure utilities, not Express handlers) live at the top of the controller file under a `// ── Helpers ──` banner, or in a shared `services/` file if reused across controllers.
- Constants that scope only to this controller live under `// ── Constants ──` at the top.
- Use banners consistently: `// ── Section Name ───────────────` for visual grouping.

**Controller file pattern:**

```js
import SomeModel from '../models/some.model.js';
import { someServiceFn } from '../services/some.service.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const SOME_LIMIT = 100;

// ── Helpers ───────────────────────────────────────────────────────────────────
const validateInput = (value) => { /* ... */ };

// ── Controllers ───────────────────────────────────────────────────────────────
export const getFooController = async (req, res) => {
    try {
        const userId = req.user.id;
        const data = await SomeModel.findOne({ userId });

        if (!data) {
            return res.status(404).json({ status: 'error', message: 'Resource not found' });
        }

        return res.status(200).json({ status: 'success', data });
    } catch (error) {
        console.error('[<Service>] getFooController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

export const createFooController = async (req, res) => {
    try {
        const { field1, field2 } = req.body;
        if (!field1) {
            return res.status(400).json({ status: 'error', message: 'field1 is required' });
        }

        const result = await SomeModel.create({ field1, field2 });
        return res.status(201).json({ status: 'success', data: result });
    } catch (error) {
        console.error('[<Service>] createFooController error:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};
```

---

## 7. middleware/ Folder

Naming convention: `<purpose>.middleware.js`. Each file exports one or more named middleware functions.

```
middleware/
├── identifyUser.middleware.js      ← JWT verification, attaches req.user
├── identifyAdmin.middleware.js     ← Admin role check (runs after identifyUser)
├── verifyToken.middleware.js       ← Lightweight token presence check
└── rate-limit.middleware.js        ← Express-rate-limit configs per route
```

**Rules:**
- Auth middleware always attaches `req.user` (decoded JWT payload) and `req.user.id` (resolved from `sub`, `id`, or `_id` claim) and `req.authToken` (raw token string).
- JWKS public keys are fetched from the Auth service at `process.env.AUTH_JWKS_URI`. **No local certs or hardcoded keys**.
- Keys are cached in module-level variables (not a class). Cache TTL is 24 hours. On `kid` miss, force-refresh once before failing.
- Always check `algorithms: ['RS256']`, `issuer`, and `audience` in `jwt.verify` options.
- Error responses from middleware always use `{ status: 'error', message: '...' }` shape.
- Tagged block comments `// ── Block name ──` are used within the middleware body to separate logical steps (e.g., blacklist check, signature verification, identity claim validation).

**Middleware function signature:**

```js
export const identifyUser = async (req, res, next) => {
    // ...auth logic...
    req.user      = decodedToken;
    req.user.id   = userId;
    req.authToken = token;
    next();
};
```

---

## 8. services/ Folder

Naming convention: `<domain>.service.js`. Contains **pure business logic** or **integration adapters** (MQ publish, third-party API calls) that are too complex or reusable to live inside a controller.

```
services/
├── credit.service.js       ← credit deduction / grant logic
├── payment.service.js      ← Razorpay notification dispatchers
└── cron.service.js         ← Scheduled background jobs
```

**Rules:**
- All exports are named async arrow functions.
- Services never touch `req` or `res` — they are pure Node.js functions.
- Services receive plain data, do their work, and return plain data or throw.
- JSDoc is written on every exported function: `@param`, `@returns` (or `@throws`).
- Console log format: `[Service Name] Description of what happened for <identifier>`.

**Service file pattern:**

```js
import { externalClient } from '../config/mq.js';

/**
 * Does something meaningful.
 * @param {Object} params
 * @param {string} params.userId - The user ID
 * @returns {Promise<Object>} Result payload
 */
export const doSomethingService = async ({ userId }) => {
    if (!userId) throw new Error('userId is required');

    const result = await externalClient.publish({ userId });
    console.log(`[SomeService] Completed operation for ${userId}`);
    return result;
};
```

---

## 9. Module System & Language

- **`"type": "module"`** in `package.json` — always ES Modules, never CommonJS.
- All imports use `.js` extensions: `import foo from './foo.js'`.
- No TypeScript. Pure JavaScript throughout.
- No `require()` anywhere.

---

## 10. Standard Dependencies

Every new backend service starts with these dependencies (exact packages used across the project):

| Package | Purpose |
|---|---|
| `express` | HTTP framework (v5+) |
| `dotenv` | Environment variables |
| `mongoose` | MongoDB ODM |
| `jsonwebtoken` | JWT decode / verify |
| `cookie-parser` | Cookie parsing |
| `morgan` | HTTP request logger (always `'dev'` in local) |
| `ioredis` | Redis client |
| `amqplib` | RabbitMQ client |
| `nodemon` | Dev auto-restart |

**package.json scripts block — always:**

```json
"scripts": {
    "dev":   "nodemon -L server.js",
    "start": "node server.js"
}
```

> Note: `nodemon -L` (legacy watch mode) is intentional — required for Docker volume mounts on macOS.

---

## 11. API URL Naming Convention

All routes follow: `/api/<service>/<resource>/<action-or-param>`

| Service | Base path |
|---|---|
| Payments | `/api/payments/...` |
| Auth | `/api/auth/...` |
| Admin | `/api/admin/...` |
| Notification | `/api/notifications/...` |
| AI Orchestration | `/api/ai/...` |

---

## 12. Response Shape Contract

**Every** controller response — success or error — uses this exact envelope:

```js
// Success
res.status(200).json({ status: 'success', data: { ... } });
res.status(201).json({ status: 'success', data: { ... } });

// Client error
res.status(400).json({ status: 'error', message: 'Descriptive message' });
res.status(401).json({ status: 'error', message: 'Unauthorized: reason' });
res.status(404).json({ status: 'error', message: 'Resource not found' });

// Server error
res.status(500).json({ status: 'error', message: error.message });
```

---

## 13. Code Style & Tone

- **Comments are banners, not prose**: Use `// ── Section Name ───────────────` to delimit logical blocks within a file. Never write paragraph-style comments mid-function.
- **JSDoc only on exported functions** in `services/`. Controllers and routes use inline banners instead.
- **Early return on error**: Never nest happy-path code inside `if (condition)` — guard + return, then continue.
- **Destructure at the top** of every handler: `const { field1, field2 } = req.body;`
- **No magic numbers**: Constants go at the top of the file under `// ── Constants ──`.
- **Tagged logs everywhere**: Every `console.log` / `console.error` is prefixed with `[ServiceName ComponentName]`, e.g. `[Payments DB]`, `[Payment Service]`, `[Credit Controller]`.
- **Process exit on infra failures**: If DB/Redis cannot connect on startup, call `process.exit(1)` — do not silently absorb the error.
- **Middleware placement in routes**: Auth middleware is applied with `router.use()` to create a clear public/authenticated boundary. Do not repeat the middleware on every individual route.

---

## 14. Dockerfile Pattern

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE <PORT>
CMD ["node", "server.js"]
```

> Always `node:20-alpine`. Always `CMD ["node", "server.js"]` (production), never nodemon in Docker.

---

## 15. Quick Scaffold Checklist

When an AI agent creates a new backend service, it MUST produce:

- [ ] `server.js` — entry point only
- [ ] `app/app.js` — Express app with middleware, routes, health probes, 404, error handler
- [ ] `config/db.js` — MongoDB connection with tagged log and `process.exit(1)` on failure
- [ ] `config/redis.js` — if Redis is needed
- [ ] `config/mq.js` — if RabbitMQ is needed
- [ ] `models/<resource>.model.js` — one file per data entity, exported enums at top
- [ ] `routes/<resource>.routes.js` — one router per domain, public/auth boundary with `router.use()`
- [ ] `controllers/<resource>.controller.js` — named exports, `// ── Constants/Helpers/Controllers ──` banners
- [ ] `middleware/identifyUser.middleware.js` — JWKS from Auth service, RS256, attaches `req.user`
- [ ] `services/<domain>.service.js` — if external integrations or reusable business logic exist
- [ ] `package.json` — `"type": "module"`, correct scripts, standard dependencies
- [ ] `.env` — placeholder with all required keys listed
- [ ] `dockerfile` — node:20-alpine, `CMD ["node", "server.js"]`
- [ ] `/healthz` and `/readyz` endpoints in `app.js`
