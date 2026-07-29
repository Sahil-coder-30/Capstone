# Authentication Architecture — Takshacodespace Platform

> **Audience:** Any engineer (new or existing) joining this project.
> **Goal:** After reading this document you will understand every token, every function, every network call, and every security decision — from "Sign in with Google" to calling a protected AI API.

---

## Table of Contents

1. [Glossary](#1-glossary)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [The Two Tokens](#3-the-two-tokens)
4. [Key Rotation — Why & How](#4-key-rotation--why--how)
5. [Backend — Auth Service (Port 5000)](#5-backend--auth-service)
6. [Frontend — Main App (Port 5173)](#6-frontend--main-app)
7. [Frontend — Payments App (/payments)](#7-frontend--payments-app)
8. [Backend — Microservice Token Verification](#8-backend--microservice-token-verification)
9. [Blacklist Coverage — Security Tradeoff](#9-blacklist-coverage--security-tradeoff)
10. [Complete Flow Diagrams](#10-complete-flow-diagrams)
11. [Security Properties](#11-security-properties)
12. [Cookie Scoping — Dev vs Production](#12-cookie-scoping)
13. [Key & Certificate Architecture](#13-key--certificate-architecture)
14. [Changelog — Issues Fixed](#14-changelog--issues-fixed)

---

## 1. Glossary

| Term | What it means |
|:---|:---|
| **JWT** | JSON Web Token. Three base64-encoded parts: `header.payload.signature`. Payload carries user data; signature proves it wasn't tampered with. |
| **RS256** | Asymmetric signing algorithm. Uses a **private key** to *sign*, **public key** to *verify*. Only Auth has the private key. |
| **kid** | Key ID. A field in the JWT header (`{ "alg": "RS256", "kid": "auth-rsa-v1" }`) that identifies *which* key was used to sign this token. Required for key rotation. |
| **Access Token** | Short-lived (15 min) RS256-signed JWT. Sent in every API request as `Authorization: Bearer <token>`. |
| **Refresh Token** | Long-lived (30 day) random 128-char hex string (opaque — NOT a JWT). Stored as an `httpOnly` cookie. Used only to get a new access token. |
| **httpOnly Cookie** | A browser cookie that JavaScript **cannot read** via `document.cookie`. Sent automatically by the browser on matching requests. Prevents XSS theft. |
| **Bearer Token** | HTTP authentication scheme. Header: `Authorization: Bearer <JWT>`. |
| **JWKS** | JSON Web Key Set. Public API (`/.well-known/jwks.json`) served by Auth that exposes the RSA public key(s). Microservices fetch the full array and look up keys by `kid`. |
| **Key Rotation** | Replacing the RSA key pair used to sign JWTs. During rotation, Auth serves both the old and new JWK in the JWKS array so in-flight tokens with the old `kid` still verify correctly. |
| **Token Family** | A UUID grouping all refresh tokens from one login session. Replay attack on any token revokes the entire family. |
| **Token Rotation** | On each refresh, old refresh token marked `used: true`, brand new one issued. Reusing an old one = attack detected. |
| **Blacklist** | Redis entry for a logged-out access token. TTL = remaining token lifetime. Auth checks this; Payments also checks it (financial operations). |
| **In-Memory Storage** | Access token stored in JS module variable (`let _accessToken = null`). Lives for the session, wiped on page refresh. XSS-safe — not in `localStorage` or any cookie. |
| **Interceptor** | Axios middleware that runs before every request (inject token) or after every response (handle 401 silently). |
| **sameSite: lax** | Cookie policy — allowed on top-level navigations, blocked on cross-site AJAX. Prevents CSRF attacks. |

---

## 2. System Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         BROWSER / CLIENT                              │
│                                                                      │
│  ┌───────────────────────┐    ┌──────────────────────────────────┐   │
│  │   Main Frontend        │    │   Payments Frontend               │   │
│  │   takshacode.in/       │    │   takshacode.in/payments/        │   │
│  │   _accessToken (mem)   │    │   _accessToken (mem)             │   │
│  │   Request Interceptor  │    │   Request Interceptor            │   │
│  │   401 Refresh Handler  │    │   401 Refresh Handler            │   │
│  └──────────┬─────────────┘    └─────────────────┬────────────────┘   │
│             │  Authorization: Bearer <JWT>         │                   │
│             │  Cookie: refreshToken (httpOnly auto) │                   │
└─────────────┼─────────────────────────────────────┼───────────────────┘
              │                                     │
              ▼                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│               NGINX INGRESS CONTROLLER (ingressClassName: nginx)        │
│       The only component with a public IP. All services are ClusterIP. │
│                                                                        │
│  Routing by URL path prefix (from k8s/ingress.yml):                   │
│   /api/auth/*      ──► auth-service:80                                 │
│   /api/ai/*        ──► ai-service:80                                   │
│   /api/payments/*  ──► payments-service:80                             │
│   /api/sandbox/*   ──► sandbox-service:80                              │
│   *.preview.localhost / *.agent.localhost ──► router-service:80        │
└───┬────────────────┬────────────────┬─────────────────┬────────────────┘
    │                │                │                 │
    ▼                ▼                ▼                 ▼
┌──────────┐  ┌──────────┐  ┌─────────────┐  ┌──────────────┐  ┌──────────┐
│ K8s SVC  │  │  K8s SVC │  │   K8s SVC   │  │   K8s SVC    │  │  K8s SVC │
│auth-svc  │  │  ai-svc  │  │payments-svc │  │notification- │  │sandbox-  │
│ClusterIP │  │ClusterIP │  │  ClusterIP  │  │ svc ClusterIP│  │svc Clstr │
│:80 →3000 │  │:80 →3000 │  │  :80 →5051  │  │  :80 →4000   │  │:80 →3000 │
└────┬─────┘  └────┬─────┘  └──────┬──────┘  └──────┬───────┘  └────┬─────┘
     │              │               │                │              │
     ▼              ▼               ▼                ▼              ▼
┌─────────┐  ┌───────────┐  ┌──────────┐  ┌──────────────┐  ┌──────────┐
│  AUTH   │  │  AI ORCH  │  │ PAYMENTS │  │ NOTIFICATION │  │ SANDBOX  │
│   POD   │  │    POD    │  │   POD    │  │     POD      │  │  SERVER  │
│ :3000   │  │   :3000   │  │  :5051   │  │    :4000     │  │  POD:3000│
│         │  │           │  │          │  │              │  │          │
│private  │  │verifyToken│  │identifyUser│ │verifyToken  │  │identifyUser│
│.pem +   │  │kid-aware  │  │kid-aware  │ │kid-aware    │  │kid-aware  │
│public   │  │JWKS cache │  │JWKS cache │ │JWKS cache   │  │JWKS cache │
│.pem     │  │no blacklst│  │+BLACKLIST │ │no blacklst  │  │no blacklst│
└────┬────┘  └─────┬─────┘  └────┬─────┘  └──────┬───────┘  └─────┬────┘
     │              ▲             ▲                ▲               ▲
     │  K8s DNS: http://auth-service/.well-known/jwks.json
     │  (services talk by service name, NOT localhost:PORT)
     │              └─────────────┴────────────────┴───────────────┘
     │                     JWKS kid-aware fetch (24h cache, JWK array)
     ▼
┌──────────┐    ┌─────────────────────────────────────────────┐
│ MONGODB  │    │                    REDIS                     │
│ Refresh  │    │  Key: blacklist:<token>   Value: "1"         │
│ Token    │    │  TTL: remaining token lifetime               │
│ (SHA256  │    │                                             │
│ hashed,  │    │  Written by: Auth service (on logout)        │
│ families)│    │  Read by:   Auth service + Payments service  │
└──────────┘    └─────────────────────────────────────────────┘
```

**Key architecture facts:**
- NGINX Ingress is the **only public-facing component** — all backend services are `ClusterIP` (invisible to the internet)
- Services communicate via **Kubernetes DNS service names** (e.g. `http://auth-service/...`), never via `localhost:PORT`
- Each K8s Service listens on **port 80** and `targetPort`s to the pod's actual port (varies per service)
- The Sandbox Router (`router-service`) handles subdomain-based routing to individual per-sandbox pods created dynamically by Kubernetes

---



## 3. The Two Tokens

### 3.1 Access Token

**File:** `Auth/src/utils/generateTokens.js` → `signAccessToken()`

```js
export const signAccessToken = (user) => jwt.sign(
    {
        sub:   String(user._id || user.id),
        id:    String(user._id || user.id),
        email: user.email,
        name:  user.name,
        role:  user.role || 'user',
    },
    PRIVATE_KEY,   // RSA-2048 — ONLY Auth has this
    {
        algorithm: 'RS256',
        issuer:    'auth.takshacodespace.in',
        audience:  'takshacodespace-services',
        keyid:     'auth-rsa-v1',   // ← kid — identifies which key signed this token
        expiresIn: '15m',
    }
);
```

**Decoded JWT header:**
```json
{ "alg": "RS256", "typ": "JWT", "kid": "auth-rsa-v1" }
```

**Where it lives:** JS module memory only. Never `localStorage`, never any cookie. Wiped on page refresh. Why 15 min? Stolen token = useless within 15 minutes.

---

### 3.2 Refresh Token

**File:** `Auth/src/utils/generateTokens.js` → `issueTokenPair()` + `setRefreshCookie()`

```js
const rawRefreshToken = crypto.randomBytes(64).toString('hex'); // 128 hex chars
const tokenHash       = hashToken(rawRefreshToken);             // SHA256 — stored in DB

await RefreshToken.create({ userId, tokenHash, familyId, expiresAt, used: false });

res.cookie('refreshToken', rawRefreshToken, {
    httpOnly: true,
    secure:   NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/api/auth/refresh', // Only ever sent to this endpoint
    maxAge:   30 * 24 * 60 * 60 * 1000,
});
```

---

## 4. Key Rotation — Why & How

### 4.1 Why Key Rotation Exists

RSA key pairs should be rotated periodically (e.g., annually) or immediately after a suspected compromise. The problem: you can't swap the key instantly because users have valid access tokens signed with the *old* key that are still within their 15-minute lifetime.

**The naive approach (instant swap) breaks things:**
```
Old key retired at T=0
User has token signed with old key, expires at T=0+8min
At T=3min: user makes an API call
Service fetches new key from JWKS → jwt.verify() fails → user gets logged out mid-session
```

**The rotation overlap window solves this:**
```
T=0:  Auth starts serving BOTH keys in JWKS array:
      { "keys": [ { "kid": "auth-rsa-v1", ... }, { "kid": "auth-rsa-v2", ... } ] }
      New tokens are signed with "auth-rsa-v2"
      Old tokens still have "kid": "auth-rsa-v1" in their header

T=3min: User calls API with old token (kid=auth-rsa-v1)
      Service extracts kid from token header
      Finds matching JWK in cached array → verifies successfully ✓

T=15min: All old tokens have expired (15-minute lifetime)
      Auth removes "auth-rsa-v1" from the JWKS array
      Only "auth-rsa-v2" remains
```

### 4.2 Why keys[0] Was Wrong

The old implementation always grabbed the first key:
```js
// BROKEN during rotation
const jwk = data.keys[0]; // Which one is "first"? Undefined behaviour.
```

If Auth serves `[new-key, old-key]`, all services grab `new-key`. Requests with tokens signed by `old-key` fail. The kid field in the JWT header is *precisely* the mechanism designed to prevent this.

### 4.3 The Fixed Implementation

**File:** All 4 service middlewares (AI Orch, Payments, Notification, Sandbox)

```js
// Cache the full JWK array — not a single derived PEM
let cachedJwks      = null;
let lastFetchedTime = 0;

async function fetchJwks(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cachedJwks && (now - lastFetchedTime < 24h)) return cachedJwks;

    const data = await fetch(AUTH_JWKS_URI).then(r => r.json());
    cachedJwks      = data.keys;  // ← store the array, not a single key
    lastFetchedTime = now;
    return cachedJwks;
}

async function resolvePublicKey(token) {
    // Step 1: extract kid from token header WITHOUT verifying the signature
    // (decode ≠ verify — we need the kid to *select* the key before we can verify)
    const header = jwt.decode(token, { complete: true })?.header;
    if (!header?.kid) throw new Error('Token is missing the kid header claim');

    // Step 2: find the matching JWK in the cached array
    let keys = await fetchJwks();
    let jwk  = keys.find(k => k.kid === header.kid);

    // Step 3: kid not in cache → maybe a new key rotated in since last 24h fetch
    // Refetch once immediately before giving up
    if (!jwk) {
        keys = await fetchJwks(true);           // forceRefresh = true
        jwk  = keys.find(k => k.kid === header.kid);
    }

    if (!jwk) throw new Error(`No JWKS entry for kid="${header.kid}"`);

    // Step 4: derive PEM and return — jwt.verify() then uses this key
    return createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'pem' });
}
```

**The stale-refetch pattern** (step 3) handles the case where a new key was added to JWKS *after* the service's last 24-hour fetch. Rather than failing the request, the service fetches the latest JWKS immediately. This is exactly what the `jwks-rsa` npm library does internally via its rate-limited refetch mechanism.

### 4.4 The kid Field in the JWT Header

```
JWT = base64(header) + "." + base64(payload) + "." + base64(signature)

header = { "alg": "RS256", "typ": "JWT", "kid": "auth-rsa-v1" }
                                                  ^^^^^^^^^^^^^
                                     This tells verifiers which key to use
```

`jwt.decode(token, { complete: true })` returns the decoded header+payload WITHOUT verifying the signature. This is safe here because we only read the `kid` value — we don't trust anything from the decoded payload yet. The actual payload is only trusted after `jwt.verify()` succeeds with the correct key.

---

## 5. Backend — Auth Service

```
Auth/src/
├── controllers/auth.controller.js   ← Login, logout, refresh, getMe
├── middleware/auth.middleware.js     ← Local public.pem + Redis blacklist check
├── models/refreshToken.model.js     ← MongoDB schema
├── utils/generateTokens.js          ← signAccessToken, issueTokenPair, setRefreshCookie
├── routes/jwks.route.js             ← GET /.well-known/jwks.json
└── certs/
    ├── private.pem                  ← NEVER committed (gitignored). Signs all JWTs.
    ├── public.pem                   ← Used by auth.middleware.js + jwks.route.js
    └── generate-keys.js             ← One-time key generation utility
```

Auth is the **only** service with `private.pem` or `public.pem` on disk. All other services get the public key from JWKS at runtime.

### Google OAuth Login

```js
// auth.controller.js
const { accessToken, refreshToken } = await issueTokenPair(user);
setRefreshCookie(res, refreshToken);   // httpOnly, path: /api/auth/refresh
res.redirect('http://localhost:5173'); // accessToken NOT in redirect
```

The access token is not delivered in the redirect. On page load the frontend calls `/getMe` → interceptor catches 401 → fires `/refresh` (cookie auto-sent) → gets access token → stores in memory → retries `/getMe`.

### Refresh Endpoint — Token Rotation + Replay Detection

```js
const rawRefreshToken = req.cookies.refreshToken; // httpOnly cookie sent by browser
const stored          = await RefreshToken.findOne({ tokenHash: hashToken(raw) });

if (!stored || stored.expiresAt < new Date()) → 401  // Expired
if (stored.used) {
    // REPLAY ATTACK — revoke entire family
    await RefreshToken.deleteMany({ familyId: stored.familyId });
    → 401
}

stored.used = true; await stored.save();             // Rotate
const { accessToken, refreshToken: newRaw } = await issueTokenPair(user, stored.familyId);
setRefreshCookie(res, newRaw);
res.json({ status: 'success', accessToken });
```

### Auth Service Own Middleware

**File:** `Auth/src/middleware/auth.middleware.js`

Unique to Auth: reads local `public.pem` (not JWKS) + checks Redis blacklist.

```js
const blacklisted = await isTokenBlacklisted(token);
if (blacklisted) return res.status(401).json({ message: 'Token has been revoked' });
```

---

## 6. Frontend — Main App

```
Frontend/src/
├── services/apiClient.js              ← _accessToken memory, interceptors
└── features/auth/
    ├── Hooks/auth.hooks.js            ← verifySession, authLogout
    ├── service/auth.api.js            ← fetchMeAPI, logoutAPI
    └── slice/auth.slice.js            ← Redux auth state
```

### Axios Instance + Interceptors (`apiClient.js`)

```js
let _accessToken = null; // module memory — XSS cannot reach this

// REQUEST INTERCEPTOR
apiClient.interceptors.request.use((config) => {
    if (_accessToken)
        config.headers.Authorization = `Bearer ${_accessToken}`;
    return config;
});

// RESPONSE INTERCEPTOR — silent token refresh on 401
apiClient.interceptors.response.use(response => response, async (error) => {
    const url = error?.config?.url || '';
    const isAuthEndpoint = url.includes('/api/auth/refresh') ||
                           url.includes('/api/auth/google')  ||
                           url.includes('/api/auth/logout');
    // /getMe IS retried — 401 on /getMe triggers silent refresh

    if (error?.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
        const { data } = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        setAccessToken(data.accessToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return apiClient(originalRequest);
    }
    return Promise.reject(error);
});
```

### Session Verification Hook (`auth.hooks.js`)

```js
const verifySession = useCallback(async () => {
    // Fresh load: no token in memory → GET /getMe → 401
    // Interceptor: POST /refresh (cookie auto-sent) → new token → retry /getMe → success
    const response = await fetchMeAPI();
    if (response.status === 'success' && response.user)
        dispatch(loginSuccess({ user: response.user }));
}, [dispatch]);
```

---

## 7. Frontend — Payments App

**Dev:** `localhost:5174/payments/` | **Prod:** `takshacodespace.in/payments/`

`api.js` is identical in pattern to `apiClient.js`. Same `_accessToken` memory, same interceptor pair, same 401 → refresh → retry cycle.

### App Boot (`App.jsx`)

```js
useEffect(() => {
    const verifySession = async () => {
        try {
            // Uses configured api instance (api.get) so 401 triggers silent refresh via /refresh
            const res = await api.get('/api/auth/getMe', { baseURL: '' });
            if (res.data?.user) setUser(res.data.user);
        } catch (err) {
            window.location.href = import.meta.env.VITE_MAIN_APP_URL || 'http://localhost:5173';
        } finally {
            setAuthChecked(true);
        }
    };
    verifySession();
}, []);

if (!authChecked) return <LoadingScreen />; // No unauthenticated flash
```

---

## 8. Backend — Microservice Token Verification

### 8.1 The Shared Middleware Pattern

All four services (AI Orch, Payments, Notification, Sandbox) implement this same structure:

```js
// Step 1 — Extract Bearer token from header
const authHeader = req.headers.authorization;
if (!authHeader || !authHeader.startsWith('Bearer '))
    return res.status(401).json({ message: 'Missing Authorization header' });
const token = authHeader.split(' ')[1];

// Step 2 — Resolve correct key by kid (rotation-safe)
const publicKeyPem = await resolvePublicKey(token);
// resolvePublicKey():
//   decode header → read kid → find in cached JWK array
//   if not found → refetch JWKS once immediately → find again
//   derive PEM from matching JWK

// Step 3 — Verify signature, expiry, issuer, audience
const decoded = jwt.verify(token, publicKeyPem, JWT_VERIFY_OPTIONS);

// Step 4 — Validate identity claims exist
const userId = decoded?.sub || decoded?.id;
if (!decoded || !userId)
    return res.status(401).json({ message: 'Missing identity claims' });

req.user = { id: userId, email, name, role };
next();
```

### 8.2 Service-Specific Files

| Service | File | Protected Routes | Blacklist Check |
|:---|:---|:---|:---|
| AI Orchestration | `Ai_orchestration/src/middleware/verifyToken.middleware.js` | All `/api/ai/*` | ❌ No (15-min window accepted) |
| Payments | `Payments/middleware/identifyUser.middleware.js` | All `/api/payments/*` | ✅ Yes (financial ops) |
| Notification | `Notification/src/middleware/verifyToken.middleware.js` | All `/api/notification/*` | ❌ No (15-min window accepted) |
| Sandbox Server | `Sandbox/server/src/middleware/auth.middleware.js` | All `/api/sandbox/*` | ❌ No (15-min window accepted) |

### 8.3 Sandbox — Protected Routes

All routes in the Sandbox Server are behind `identifyUser`:
```js
sandboxRouter.post('/create-project',               identifyUser, createProjectController);
sandboxRouter.get('/projects',                      identifyUser, listAllProjectsController);
sandboxRouter.get('/projects/trash',                identifyUser, listTrashProjectsController);
sandboxRouter.get('/project/:projectId',            identifyUser, getProjectStatusController);
sandboxRouter.delete('/project/:projectId',         identifyUser, deleteProjectController);
sandboxRouter.patch('/project/:projectId/restore',  identifyUser, restoreProjectController);
sandboxRouter.delete('/project/:projectId/permanent', identifyUser, permanentlyDeleteProjectController);
sandboxRouter.post('/start/:projectId',             identifyUser, startSandboxController);
sandboxRouter.post('/stop/:projectId',              identifyUser, stopSandboxController);

// app.js — legacy /start also protected
app.post('/api/sandbox/start', identifyUser, async (req, res, next) => { ... });
```

The Sandbox Router (`Sandbox/router/`) is a cluster-internal reverse proxy — not exposed to the internet, no JWT auth needed.

---

## 9. Blacklist Coverage — Security Tradeoff

This is an explicit architectural decision, not an oversight.

### What the blacklist does

When a user logs out, the Auth service stores their still-valid access token in Redis with a TTL equal to its remaining lifetime. The token is then rejected on any subsequent request.

### The coverage gap

Only **Auth** and **Payments** check the Redis blacklist. The other three services (AI Orchestration, Notification, Sandbox) do not.

**Why not check everywhere?**

A Redis `GET` call on every protected request adds:
- ~1-5ms network round-trip per request to Redis
- A Redis dependency on every service's startup path
- One more failure mode (if Redis is down, every request fails)

For most services, the access token's 15-minute lifetime IS the revocation mechanism — JWTs are inherently short-lived for this reason.

### The per-service decision

| Service | Blacklist | Rationale |
|:---|:---|:---|
| **Auth** | ✅ Yes | Guards `/getMe` and `/logout` itself — must enforce revocation at the source |
| **Payments** | ✅ Yes | Financial operations. A logged-out user initiating a payment on a shared device is unacceptable. |
| **AI Orchestration** | ❌ No | AI sessions are per-user, mid-session completion is benign. 15-min window accepted. |
| **Notification** | ❌ No | Read/preference operations. Low risk within 15-min window. |
| **Sandbox** | ❌ No | Pod lifecycle is per-user and ownership is enforced by MongoDB user matching in controllers. 15-min window accepted. |

### The 15-minute exposure explained

```
User logs out at T=0
Access token expires at T=12min (was issued 3 minutes before logout)

T=0  to T=12min: Token is still cryptographically valid
                  Auth service: ❌ rejected (blacklist)
                  Payments:     ❌ rejected (blacklist)
                  AI Orch:      ✅ accepted ← deliberate tradeoff
                  Notification: ✅ accepted ← deliberate tradeoff
                  Sandbox:      ✅ accepted ← deliberate tradeoff

T=12min: Token expires — rejected by jwt.verify() everywhere
```

---

## 10. Complete Flow Diagrams

### 10.1 First Login (Google OAuth)

```
User clicks "Sign in with Google"
    → GET /api/auth/google  → Passport.js  → Google OAuth page
    → GET /api/auth/google/callback
    → authGoogleCallbackController:
        issueTokenPair(user)  → RS256 JWT (kid=auth-rsa-v1) + 128-hex opaque token
        RefreshToken.create({ userId, SHA256(raw), familyId, expiresAt })
        setRefreshCookie(res, raw)  → httpOnly, path: /api/auth/refresh
        res.redirect('http://localhost:5173')

Browser state:
  Cookie jar: refreshToken (httpOnly) ✓
  JS memory:  _accessToken = null (not set yet)
```

### 10.2 App Boot — Session Verification

```
React app loads → verifySession()
    → GET /api/auth/getMe (no Authorization header)
    → Backend: 401

[Response Interceptor]
    → POST /api/auth/refresh (browser auto-sends httpOnly cookie)
    → authGenerateAccessToken:
        hash → findOne → used:false ✓
        stored.used = true → save()
        issueTokenPair → new access token (JWT, kid=auth-rsa-v1) + new refresh token
        setRefreshCookie(new httpOnly cookie)
        res.json({ accessToken })

[Interceptor]
    setAccessToken(newToken) → _accessToken = "eyJ..."
    Retry: GET /api/auth/getMe (Authorization: Bearer eyJ...)

[identifyUser / verifyToken middleware]
    Extract Bearer token
    jwt.decode(token, {complete:true}).header.kid → "auth-rsa-v1"
    fetchJwks() → find JWK where kid="auth-rsa-v1"
    resolvePublicKey → PEM
    jwt.verify() ✓  →  userId claim ✓
    [Payments only: isTokenBlacklisted() → false ✓]
    req.user = { id, email, name, role } → next()

    → User data returned → loginSuccess dispatched → App renders ✓
```

### 10.3 Key Rotation (Zero-Downtime)

```
Auth rotates to new RSA key pair:

Auth JWKS endpoint now returns:
  { "keys": [
      { "kid": "auth-rsa-v1", ... },   ← old key (still served during overlap)
      { "kid": "auth-rsa-v2", ... }    ← new key (new tokens signed with this)
  ]}

New tokens:      kid = "auth-rsa-v2" → services find v2 in cache → verify ✓
Old tokens:      kid = "auth-rsa-v1" → services find v1 in cache → verify ✓
New kid in cache miss:
  → fetchJwks(forceRefresh=true) → refetch JWKS → find new key → verify ✓

After 15 min (all old tokens expired):
  Auth removes "auth-rsa-v1" from JWKS
  Services' 24h caches will drop v1 on next refresh
  Zero downtime, zero rejected valid requests
```

### 10.4 Logout

```
authLogout()
    → POST /api/auth/logout (Authorization: Bearer <JWT>)
    → authLogoutController:
        blacklistToken(token, ttl)              → Redis: blacklist:<token> = "1", EX=ttl
        RefreshToken.deleteMany({ familyId })   → entire family revoked in MongoDB
        res.clearCookie('refreshToken')
    → clearAccessToken() → _accessToken = null
    → Redux cleared → App shows login screen ✓
```

### 10.5 Replay Attack Detection

```
Attacker sends POST /api/auth/refresh with OLD (already-rotated) cookie
    → hashToken(stolen) → findOne → stored.used === true
    → REPLAY DETECTED:
        RefreshToken.deleteMany({ familyId })
        res.status(401) "Token reuse detected — all sessions revoked"
    → All devices in this session must re-login ✓
```

---

## 11. Security Properties

| Property | Implementation | File |
|:---|:---|:---|
| Access token XSS safety | JS module memory only — not `localStorage` or cookie | `apiClient.js`, `api.js` |
| Refresh token XSS safety | `httpOnly: true` — JS cannot read it | `generateTokens.js` |
| Refresh token CSRF safety | `sameSite: lax` + `path: /api/auth/refresh` | `generateTokens.js` |
| Short exposure window | 15-minute access token | `generateTokens.js` |
| DB breach protection | SHA256 hash stored — raw token not derivable | `generateTokens.js` |
| Replay attack detection | `used` flag + family-wide revocation | `auth.controller.js` |
| Logout revocation | Redis blacklist (Auth + Payments) + MongoDB delete (refresh family) | `auth.controller.js`, `Payments/middleware` |
| Key rotation safety | kid-aware JWKS lookup + stale-refetch pattern | All service middlewares |
| Stateless microservice verification | JWK array cached 24h — zero DB calls per request | All service middlewares |
| Key isolation | Only Auth has `private.pem`. Others use JWKS. | `generateTokens.js` |
| Forging prevention | RS256 asymmetric — compromised microservice cannot issue tokens | JWT options |
| Missing claim guard | Explicit `!userId` check after `jwt.verify()` | All service middlewares |
| Header-only token extraction | No cookie fallback — access tokens never in cookies | All service middlewares |

---

## 12. Cookie Scoping — Dev vs Production

### Development

Both apps share the same `localhost` cookie jar (ports ignored by cookie spec). Safe because `httpOnly` blocks JS and `path: /api/auth/refresh` limits scope.

### Production

Both apps at `takshacodespace.in` share the cookie → both can silently refresh via `/api/auth/refresh` → correct behavior. Access token never in a cookie → each app manages its own `_accessToken` independently.

---

## 13. Key & Certificate Architecture

```
Capstone/
├── Auth/certs/
│   ├── private.pem        ← RSA-2048 private key. Signs all JWTs. NEVER committed.
│   ├── public.pem         ← Auth's own middleware + JWKS endpoint reads this.
│   └── generate-keys.js   ← One-time key generation utility.
│
├── Ai_orchestration/certs/
│   └── .gitkeep           ← Empty. No local keys. Public key from JWKS.
│
├── Notification/certs/
│   └── .gitkeep           ← Empty. No local keys. Public key from JWKS.
│
└── Sandbox/certs/ and Sandbox/server/certs/
    └── .gitkeep           ← Empty. No local keys. Public key from JWKS.
```

**Why no `public.pem` in other services?**

With JWKS, rotating keys means updating Auth once. All services pick up the new key on the next cache miss (max 24h delay, or immediately via stale-refetch). With distributed `public.pem` files, rotation requires redeploying every service simultaneously — operationally fragile and error-prone.

---

## 14. Changelog — Issues Fixed

| # | Issue | Location | Fix |
|:---|:---|:---|:---|
| 1 | Proactive `/refresh` on every boot | `auth.hooks.js` | Calls `/getMe` directly; interceptor handles 401→refresh→retry. |
| 2 | `/getMe` excluded from auto-refresh | `apiClient.js` | Removed from exclusion list. |
| 3 | Hardcoded `Developer User` in payments | `payments_frontend/App.jsx` | Real session verification. Redirects to main login if session dead. |
| 4 | No `authChecked` guard in payments | `payments_frontend/App.jsx` | Added — loading screen until verified. |
| 5 | `POST /api/sandbox/start` unprotected | `Sandbox/server/src/app/app.js` | Added `identifyUser`. |
| 6 | `next(err)` on JWT errors | `Sandbox/server/src/middleware/auth.middleware.js` | Returns explicit 401 with `expired` flag. |
| 7 | `decodedToken` claims not validated | All 4 service middlewares | Added `!userId` guard after `jwt.verify()`. |
| 8 | Dead cookie fallback in middlewares | Sandbox + Payments `identifyUser` | Removed `req.cookies` branch. Header-only. |
| 9 | `cookieParser` loaded without need | `Sandbox/server/src/app/app.js` | Removed. |
| 10 | Stale comment in AI Orch middleware | `Ai_orchestration/src/middleware/verifyToken.middleware.js` | Updated to describe JWKS correctly. |
| 11 | `public.pem` files in non-Auth services | `Ai_orchestration/`, `Notification/`, `Sandbox/` | Deleted. `.gitignore` + `.gitkeep` added. |
| 12 | Payments sub-path routing broken | `payments_frontend/vite.config.js` + `main.jsx` | `base: '/payments/'` + `basename="/payments"`. |
| 13 | **JWKS always takes keys[0]** | All 4 service middlewares | **kid-aware lookup: cache JWK array, match by kid, stale-refetch on miss.** |
| 14 | **Blacklist coverage undocumented** | AI Orch, Notification, Sandbox middlewares | **Payments: Redis blacklist added. Others: deliberate tradeoff documented in code + doc.** |
| 15 | Payments App boot used raw `axios` | `payments_frontend/App.jsx` | Updated to `api.get('/api/auth/getMe', { baseURL: '' })` so 401 triggers silent token refresh. |

---

*Last updated: 2026-07-29 | Architecture version: v3.1 — Payments silent refresh fix*
