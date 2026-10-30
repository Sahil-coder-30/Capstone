# k8s and deployment: fixes

Cross-cutting fixes for `k8s/`, `skaffold.yml` and the service Dockerfiles. Source: drift report, re-checked 2026-10-26. `k8s/secrets.yml` was **not** opened; only `secrets.yml.example` and the deployments were read.

Legend: ✅ re-verified. 📄 from the report.

---

## P0

### P0-1. Example secrets do not match what deployments read ✅
- `secrets.yml.example` has `REDIS_URL`, deployments read `REDIS_URI`.
- Example secret is named `aws`; sandbox pods read `aws-secret` (`Sandbox/server/src/kubernetes/pod.js`).
- `RSA_PRIVATE_KEY` (Auth) and `GMAIL_APP_PASSWORD`/`EMAIL_PASS` (Notification) are missing from the example. Example has `JWT_SECRET`; Auth reads `RSA_PRIVATE_KEY` and `JWT_REFRESH_SECRET`.
- `TAVILY_API_KEY` is not in the example or the AI deployment.
- Example still lists `GOOGLE_API_KEY`, `COHERE_API_KEY` that nothing reads.
- **Fix:** regenerate `secrets.yml.example` from the `secretKeyRef`s in the manifests (names and keys), with placeholder values only. Add a tiny script or CI check that diffs the two.

### P0-2. `NODE_ENV` and `CLIENT_URL` unset ✅
- No manifest sets `NODE_ENV=production`; Auth has no `CLIENT_URL`. Result: insecure refresh cookie, redirect to `localhost:5173`, stack traces logged.
- **Fix:** add `NODE_ENV: production` to every deployment (via a ConfigMap) and `CLIENT_URL` to Auth.

### P0-3. RBAC too broad 📄 (✅ `k8s/rabc.yml`)
- `sandbox-agent-role` gives every sandbox pod `get/list` on all `pods` and `pods/log` in `default`.
- `resource-manager` lists an invalid `deployment` resource in the core API group and `watch`/`list` it does not need.
- **Fix:** remove `sandbox-agent-role` once the agent stops calling the k8s API (see `Sandbox/Agent/fix.md` P0-4). Trim `resource-manager` to `pods`, `services`: `get, list, create, delete`, and `pods` `watch` only if used. Rename `rabc.yml` → `rbac.yml`.
- Put sandbox pods in their own namespace (`sandboxes`) with a NetworkPolicy and ResourceQuota.

### P0-4. Private key in Auth image ✅
- See `Auth/fix.md` P0-1. Add `certs/`, `*.pem`, `*.key`, `.env*` to every service's `.dockerignore` (all six only list `node_modules` and `.env`).

## P1

- **Dockerfiles run dev mode ✅:** Auth and Notification (and likely others) use `CMD ["npm","run","dev"]` (nodemon). Use `npm ci --omit=dev` and `CMD ["node","server.js"]`; run as the `node` user.
- **Ports 📄:** `PORT` is set only for Payments (5051); Notification hard-codes 4000; Sandbox server example says 4000 but k8s 3000. Set `PORT` everywhere and match container ports.
- **Probes 📄:** add readiness/liveness to every deployment that lacks them, using `/readyz` and `/healthz`.
- **Redis isolation:** give each service its own logical db or prefix (see `Sandbox/server/fix.md` P0-1) via `REDIS_URI` values.
- **Misspelled names 📄:** `notifiction-deployment` → `notification-deployment`.
- **Fresh clone fails ✅:** `skaffold.yml` needs the gitignored `secrets.yml`. Document "copy `secrets.yml.example` to `secrets.yml` and fill in" in the root README quick start.
- **AI replicas ✅:** keep `replicas: 1` and add a comment explaining why (in-memory checkpointer), until AI feature #1 lands.

## P2

- Resource requests/limits on every deployment.
- Common labels (`app.kubernetes.io/name`, `part-of`) so ServiceMonitors can select them later.
- Ingress: document that it is NGINX (docs say ALB).
