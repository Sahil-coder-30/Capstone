// middleware.js
// Express and Socket.IO guards built on verifyToken.js, plus CORS for the
// editor's origin. Every route needs the owner's token except the ones in
// PUBLIC_PATHS:
//   - health / ready: Kubernetes probes
//   - report-error: the user's preview app posts browser errors without a token

import { AuthError, bearerFrom, createTokenVerifier } from "./verifyToken.js";

const PUBLIC_PATHS = new Set(["/api/agent/health", "/api/agent/ready", "/api/agent/report-error"]);

const ALLOWED_HEADERS = "Authorization, Content-Type, x-sandbox-id, x-request-id";
const ALLOWED_METHODS = "GET, POST, PATCH, DELETE, OPTIONS";

export const allowedOrigins = () =>
  (process.env.CLIENT_URL || "http://localhost:5173").split(",").map((o) => o.trim()).filter(Boolean);

let verifier = null;
const getVerifier = () =>
  (verifier ??= createTokenVerifier({
    ownerId: process.env.OWNER_USER_ID,
    sandboxId: process.env.SANDBOX_ID,
    jwksUri: process.env.AUTH_JWKS_URI || "http://auth-service/.well-known/jwks.json",
  }));

/** Test hook: use a custom verifier. */
export const setVerifierForTesting = (custom) => {
  verifier = custom;
};

const statusOf = (err) => (err instanceof AuthError ? err.status : 401);

/** CORS for the editor origin. Must run before requireOwner so preflights pass. */
export function corsForEditor(req, res, next) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins().includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
    res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
}

/** Express guard: the request must carry the sandbox owner's token. */
export async function requireOwner(req, res, next) {
  if (PUBLIC_PATHS.has(req.path)) return next();
  try {
    req.auth = await getVerifier()(bearerFrom(req.headers.authorization));
    next();
  } catch (err) {
    const status = statusOf(err);
    if (status === 401) res.setHeader("WWW-Authenticate", "Bearer");
    res.status(status).json({ status: "error", message: err.message });
  }
}

/** Socket.IO guard: the handshake must carry the owner's token in `auth.token`. */
export async function requireOwnerSocket(socket, next) {
  try {
    socket.data.auth = await getVerifier()(socket.handshake.auth?.token);
    next();
  } catch (err) {
    // The client reads err.message; "unauthorized" tells it to refresh and retry.
    const error = new Error(statusOf(err) === 503 ? "unavailable" : "unauthorized");
    error.data = { status: statusOf(err), message: err.message };
    next(error);
  }
}
