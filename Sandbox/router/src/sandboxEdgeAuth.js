// sandboxEdgeAuth.js
// Owner-only access to the public sandbox hosts:
//
//   <sandboxId>.agent.<domain>    -> sidecar :3000 (editor tools, terminal socket)
//   <sandboxId>.preview.<domain>  -> Vite :5173 (the user's app, HMR socket)
//
// The router checks every request and WebSocket upgrade BEFORE it proxies or
// refreshes the sandbox idle TTL. The sidecar keeps its own token check
// (defence in depth); Vite has none, so for the preview host this is the only
// guard.
//
// A request passes when it carries either
//   - `Authorization: Bearer <access token>` of the sandbox owner (editor REST
//     and MCP calls, the preview readiness ping), or
//   - the sandbox session cookie `tks_sbx_<sandboxId>` (iframes, new tabs and
//     sockets, which can not send an Authorization header).
//
// The cookie is host-only, HttpOnly, Secure, SameSite=None (the editor and the
// sandbox hosts are different sites; Chrome treats *.localhost as secure),
// 12 hours, HMAC-signed with SANDBOX_SESSION_SECRET and bound to sandbox and
// owner. It is minted two ways (both checked in Chromium, 2026-11-25):
//   - POST /__taksha/session with the owner's bearer token, called by the
//     editor with fetch(credentials: "include"). The cookie is `Partitioned`
//     (CHIPS), so it lives in the editor's partition and works for the preview
//     iframe and sockets even where third-party cookies are blocked.
//   - Opening the preview in a new tab: the same POST with `{ ticket: true }`
//     returns a 60-second, single-use ticket; the tab opens
//     GET /__taksha/session?ticket=...&next=/ which sets a first-party cookie
//     and redirects. A cross-site cookie set by fetch is not visible to a
//     top-level tab, hence the ticket.
//
// On the PREVIEW host only, a request may instead carry a share-link cookie
// `tks_shr_<sandboxId>`. A share link lets somebody without a Taksha login
// open the live preview (the WhatsApp bot hands one out), and nothing else:
//   - it is minted only by the owner's editor (POST /__taksha/share) or by a
//     Taksha service through the router's internal path, never guessable
//     (HMAC over sandbox id + share id + expiry);
//   - it expires (1 hour by default, 24 hours at most) and can be revoked at
//     any time by share id, checked on every request;
//   - it is view-only (GET and HEAD, plus the HMR socket) and refused on the
//     agent host, so it can never send data to the app or run a command;
//   - it does NOT refresh the sandbox idle TTL: only the owner's own editor or
//     agent activity keeps a sandbox alive, so a shared link can not be used
//     to hold somebody's sandbox (and compute) open.
// It is multi-use on purpose: WhatsApp and other chat apps fetch a link to
// build their preview card before anybody taps it, which would spend a
// single-use token.
//
// A share viewer reaches the Vite dev server, so they can read the project's
// source, like anyone running `vite --host`. Serving a built app without the
// source is V2.5 Taksha Hosting.
//
// Missing secret, unknown owner or unreachable keys fail closed.

import crypto, { createPublicKey } from "crypto";
import jwt from "jsonwebtoken";

export const SESSION_PATH = "/__taksha/session";
export const SHARE_PATH = "/__taksha/share";
const ISSUER = "auth.takshacodespace.in";
const ACCESS_AUDIENCE = "takshacodespace-services";
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const TICKET_TTL_SECONDS = 60;
export const SHARE_TTL_SECONDS = 60 * 60;
export const SHARE_MAX_TTL_SECONDS = 24 * 60 * 60;
/** A share link is view-only (product decision 2026-11-25). */
export const SHARE_METHODS = new Set(["GET", "HEAD"]);
const JWKS_CACHE_MS = 24 * 60 * 60 * 1000;
const JWKS_MIN_REFETCH_MS = 30 * 1000;
const OWNER_CACHE_MAX = 10_000;
const OWNER_MISS_TTL_MS = 30 * 1000;

export class EdgeAuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const b64url = (buf) => Buffer.from(buf).toString("base64url");

export const sessionCookieName = (sandboxId) => `tks_sbx_${sandboxId}`;
export const shareCookieName = (sandboxId) => `tks_shr_${sandboxId}`;

/** Reads one cookie value from a Cookie header. */
export const readCookie = (header, name) => {
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
};

export const bearerFrom = (header) => {
  const [scheme, value] = String(header || "").split(" ");
  return scheme?.toLowerCase() === "bearer" && value ? value : null;
};

/**
 * Verifies an Auth access token (RS256, JWKS by kid). Sandbox tokens
 * (aud taksha-sandbox) are not accepted at the public edge: the AI service
 * uses the internal path and external agents use the MCP gateway.
 */
export function createAccessTokenVerifier({ jwksUri, fetchJwks }) {
  const keys = new Map();
  let fetchedAt = 0;

  const loadKeys = async () => {
    const body = fetchJwks
      ? await fetchJwks()
      : await fetch(jwksUri, { signal: AbortSignal.timeout(5_000) }).then((r) => {
        if (!r.ok) throw new Error(`JWKS HTTP ${r.status}`);
        return r.json();
      });
    keys.clear();
    for (const jwk of body.keys || []) {
      if (jwk.kid && jwk.kty === "RSA") keys.set(jwk.kid, createPublicKey({ key: jwk, format: "jwk" }));
    }
    fetchedAt = Date.now();
  };

  const keyFor = async (kid) => {
    const stale = Date.now() - fetchedAt > JWKS_CACHE_MS;
    const unknownKid = !keys.has(kid) && Date.now() - fetchedAt > JWKS_MIN_REFETCH_MS;
    if (stale || unknownKid) {
      try {
        await loadKeys();
      } catch (err) {
        if (!keys.size) throw new EdgeAuthError(503, `Could not load signing keys: ${err.message}`);
      }
    }
    return keys.get(kid) || null;
  };

  return async function verifyAccessToken(token) {
    const decoded = jwt.decode(token, { complete: true });
    if (decoded?.header?.alg !== "RS256" || !decoded.header.kid) throw new EdgeAuthError(401, "Invalid token.");
    const key = await keyFor(decoded.header.kid);
    if (!key) throw new EdgeAuthError(401, "Invalid token.");
    try {
      return jwt.verify(token, key, { algorithms: ["RS256"], issuer: ISSUER, audience: ACCESS_AUDIENCE, clockTolerance: 30 });
    } catch {
      throw new EdgeAuthError(401, "Invalid or expired token.");
    }
  };
}

/**
 * Owner of a sandbox, from the Sandbox server (the source of truth), cached.
 * An owner never changes for a sandbox id, so hits are cached until evicted;
 * unknown ids are cached for 30 s.
 */
export function createOwnerLookup({ sandboxApiUrl, internalToken, fetch: fetchImpl = fetch }) {
  const owners = new Map(); // sandboxId -> ownerId
  const misses = new Map(); // sandboxId -> expiresAt

  return async function ownerOf(sandboxId) {
    if (owners.has(sandboxId)) return owners.get(sandboxId);
    if ((misses.get(sandboxId) || 0) > Date.now()) return null;
    if (!internalToken) throw new EdgeAuthError(503, "Internal calls are not configured.");

    let res;
    try {
      res = await fetchImpl(`${sandboxApiUrl.replace(/\/+$/, "")}/internal/sandboxes/${sandboxId}/owner`, {
        headers: { "X-Internal-Token": internalToken },
        signal: AbortSignal.timeout(5_000),
      });
    } catch (err) {
      throw new EdgeAuthError(503, `Could not reach the Sandbox service: ${err.message}`);
    }
    if (res.status === 404) {
      misses.set(sandboxId, Date.now() + OWNER_MISS_TTL_MS);
      return null;
    }
    if (!res.ok) throw new EdgeAuthError(503, `Sandbox service answered ${res.status}.`);
    const { ownerId } = await res.json();
    if (!ownerId) return null;
    if (owners.size >= OWNER_CACHE_MAX) owners.delete(owners.keys().next().value);
    owners.set(sandboxId, String(ownerId));
    return String(ownerId);
  };
}

/**
 * @param {object} deps
 * @param {Function} deps.verifyAccessToken  (token) => claims, throws EdgeAuthError
 * @param {Function} deps.ownerOf            (sandboxId) => ownerId | null
 * @param {string}   deps.secret             SANDBOX_SESSION_SECRET
 * @param {string[]} deps.allowedOrigins     editor origins (CLIENT_URL list)
 * @param {Function} deps.claimTicket        (jti) => true the first time only (Redis SET NX)
 * @param {Function} [deps.shareRevoked]     (sid) => true when that share link was turned off
 * @param {Function} [deps.revokeShare]      (sid) => void, turns one share link off for good
 * @param {Function} [deps.now]              () => ms, for tests
 */
export function createSandboxEdgeAuth({ verifyAccessToken, ownerOf, secret, allowedOrigins, claimTicket, shareRevoked = async () => false, revokeShare = null, now = Date.now }) {
  const sign = (payload) => crypto.createHmac("sha256", secret).update(payload).digest("base64url");

  const seal = (claims) => {
    const payload = b64url(JSON.stringify(claims));
    return `${payload}.${sign(payload)}`;
  };

  const mintCookie = (sandboxId, sub) =>
    seal({ typ: "session", sbx: sandboxId, sub, exp: Math.floor(now() / 1000) + SESSION_TTL_SECONDS });

  const mintTicket = (sandboxId, sub) =>
    seal({ typ: "ticket", sbx: sandboxId, sub, jti: crypto.randomUUID(), exp: Math.floor(now() / 1000) + TICKET_TTL_SECONDS });

  /**
   * A share link token: no user, a share id so it can be revoked, and its own
   * expiry (clamped to SHARE_MAX_TTL_SECONDS).
   */
  const mintShare = (sandboxId, { ttlSeconds = SHARE_TTL_SECONDS } = {}) => {
    if (!secret) throw new EdgeAuthError(503, "Sandbox sessions are not configured.");
    const ttl = Math.min(Math.max(Math.floor(ttlSeconds) || 0, 60), SHARE_MAX_TTL_SECONDS);
    const sid = crypto.randomUUID();
    const expiresAt = Math.floor(now() / 1000) + ttl;
    return { token: seal({ typ: "share", sbx: sandboxId, sid, exp: expiresAt }), sid, expiresAt, expiresIn: ttl };
  };

  /** Claims of a valid sealed value of this type for this sandbox, or null. */
  const unseal = (value, sandboxId, typ) => {
    if (!value || !secret) return null;
    const [payload, mac] = value.split(".");
    if (!payload || !mac) return null;
    const expected = Buffer.from(sign(payload));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
    let claims;
    try {
      claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    } catch {
      return null;
    }
    if (claims.typ !== typ || claims.sbx !== sandboxId || !(claims.exp > now() / 1000)) return null;
    if (typ !== "share" && !claims.sub) return null;
    if (typ === "share" && !claims.sid) return null;
    return claims;
  };

  const readSession = (value, sandboxId) => unseal(value, sandboxId, "session");
  const readShare = (value, sandboxId) => unseal(value, sandboxId, "share");

  const ownerOrFail = async (sandboxId) => {
    const owner = await ownerOf(sandboxId);
    if (!owner) throw new EdgeAuthError(404, "Unknown sandbox.");
    return owner;
  };

  /**
   * Throws EdgeAuthError unless the request comes from the sandbox owner, or
   * (preview host only, `allowShare`) carries a live share-link cookie.
   * `via: "share"` tells the caller not to refresh the sandbox idle TTL.
   */
  async function authenticate(req, sandboxId, { allowShare = false } = {}) {
    if (!secret) throw new EdgeAuthError(503, "Sandbox sessions are not configured.");
    const session = readSession(readCookie(req.headers.cookie, sessionCookieName(sandboxId)), sandboxId);
    const bearer = bearerFrom(req.headers.authorization);
    const share = allowShare ? readShare(readCookie(req.headers.cookie, shareCookieName(sandboxId)), sandboxId) : null;
    if (!session && !bearer && !share) throw new EdgeAuthError(401, "Sign in to Taksha to open this sandbox.");

    const asShare = async () => {
      if (await shareRevoked(share.sid)) throw new EdgeAuthError(401, "This share link has been turned off.");
      // View-only: a viewer can load pages and assets (and the HMR socket,
      // which is a GET upgrade) but can not send anything to the app.
      if (!SHARE_METHODS.has(String(req.method || "GET").toUpperCase())) {
        throw new EdgeAuthError(405, "A shared preview is view-only.");
      }
      return { sub: null, via: "share", sid: share.sid };
    };

    if (!session && !bearer) return asShare();

    try {
      const owner = await ownerOrFail(sandboxId);
      if (session && session.sub === owner) return { sub: owner, via: "cookie" };
      if (bearer) {
        const claims = await verifyAccessToken(bearer);
        if (String(claims.sub || claims.id) === owner) return { sub: owner, via: "bearer" };
      }
      throw new EdgeAuthError(403, "This sandbox belongs to another user.");
    } catch (err) {
      // A viewer holding a share link may also have a stale or foreign owner
      // cookie; the share link still opens the preview.
      if (share) return asShare();
      throw err;
    }
  }

  const corsFor = (req, res) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, x-sandbox-id");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader("Vary", "Origin");
    }
  };

  const cookieAttrs = "Path=/; HttpOnly; Secure; SameSite=None";
  const setSessionCookie = (res, sandboxId, sub, { partitioned }) =>
    res.setHeader(
      "Set-Cookie",
      `${sessionCookieName(sandboxId)}=${mintCookie(sandboxId, sub)}; ${cookieAttrs}${partitioned ? "; Partitioned" : ""}; Max-Age=${SESSION_TTL_SECONDS}`,
    );

  /** Only a same-host path: "/x" yes, "//evil.com" or "https://..." no. */
  const safeNext = (value) => (typeof value === "string" && /^\/(?![\/\\])/.test(value) ? value : "/");

  /**
   * POST   (owner's bearer token): sets the partitioned session cookie, or with
   *        body/query `ticket` returns a single-use ticket for a new tab.
   * GET    ?ticket=...&next=/ : spends the ticket, sets a first-party cookie, redirects.
   * DELETE clears the cookie.
   */
  async function sessionRoute(req, res, sandboxId) {
    corsFor(req, res);
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") return res.status(204).end();
    try {
      if (!secret) throw new EdgeAuthError(503, "Sandbox sessions are not configured.");

      if (req.method === "DELETE") {
        res.setHeader("Set-Cookie", [
          `${sessionCookieName(sandboxId)}=; ${cookieAttrs}; Max-Age=0`,
          `${sessionCookieName(sandboxId)}=; ${cookieAttrs}; Partitioned; Max-Age=0`,
        ]);
        return res.status(204).end();
      }

      if (req.method === "GET") {
        const ticket = unseal(String(req.query?.ticket || ""), sandboxId, "ticket");
        if (!ticket || !(await claimTicket(ticket.jti))) throw new EdgeAuthError(401, "This link has expired. Open the preview again from Taksha.");
        const owner = await ownerOrFail(sandboxId);
        if (ticket.sub !== owner) throw new EdgeAuthError(403, "This sandbox belongs to another user.");
        setSessionCookie(res, sandboxId, owner, { partitioned: false });
        return res.redirect(302, safeNext(req.query?.next));
      }

      if (req.method !== "POST") return res.status(405).set("Allow", "GET, POST, DELETE, OPTIONS").end();
      const bearer = bearerFrom(req.headers.authorization);
      if (!bearer) throw new EdgeAuthError(401, "Missing bearer token.");
      const claims = await verifyAccessToken(bearer);
      const owner = await ownerOrFail(sandboxId);
      if (String(claims.sub || claims.id) !== owner) throw new EdgeAuthError(403, "This sandbox belongs to another user.");

      if (req.query?.ticket !== undefined) {
        return res.status(200).json({ status: "ok", ticket: mintTicket(sandboxId, owner), expiresIn: TICKET_TTL_SECONDS });
      }
      setSessionCookie(res, sandboxId, owner, { partitioned: true });
      return res.status(200).json({ status: "ok", expiresIn: SESSION_TTL_SECONDS });
    } catch (err) {
      return deny(res, err);
    }
  }

  /**
   * The share-link door on the preview host.
   *
   * POST /__taksha/share  (owner's bearer token) -> { token, sid, expiresAt }
   * POST /__taksha/share?revoke=<sid>  (owner's bearer token) -> 204, that link is dead
   * GET  /__taksha/share?t=<token>&next=/        -> sets the share cookie, redirects
   * DELETE /__taksha/share                       (owner's bearer token) -> clears the cookie
   *
   * A revoked share id is remembered outside this router process (Redis, for
   * the whole maximum lifetime of a link) and `shareRevoked` is asked on every
   * request, so turning a link off takes effect at once on every router pod.
   */
  async function shareRoute(req, res, sandboxId) {
    corsFor(req, res);
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") return res.status(204).end();
    try {
      if (!secret) throw new EdgeAuthError(503, "Sandbox sessions are not configured.");

      if (req.method === "GET" || req.method === "HEAD") {
        const share = readShare(String(req.query?.t || ""), sandboxId);
        if (!share) throw new EdgeAuthError(401, "This preview link has expired. Ask for a new one.");
        if (await shareRevoked(share.sid)) throw new EdgeAuthError(401, "This preview link has been turned off.");
        const maxAge = Math.max(share.exp - Math.floor(now() / 1000), 1);
        res.setHeader(
          "Set-Cookie",
          `${shareCookieName(sandboxId)}=${String(req.query.t)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`,
        );
        return res.redirect(302, safeNext(req.query?.next));
      }

      if (req.method === "DELETE") {
        res.setHeader("Set-Cookie", `${shareCookieName(sandboxId)}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
        return res.status(204).end();
      }

      if (req.method !== "POST") return res.status(405).set("Allow", "GET, POST, DELETE, OPTIONS").end();
      const bearer = bearerFrom(req.headers.authorization);
      if (!bearer) throw new EdgeAuthError(401, "Missing bearer token.");
      const claims = await verifyAccessToken(bearer);
      const owner = await ownerOrFail(sandboxId);
      if (String(claims.sub || claims.id) !== owner) throw new EdgeAuthError(403, "This sandbox belongs to another user.");

      // The owner turning one of their links off, by share id.
      const revoke = req.body?.revoke ?? req.query?.revoke;
      if (revoke !== undefined) {
        if (!revokeShare) throw new EdgeAuthError(503, "Share links can not be turned off right now.");
        if (!/^[0-9a-f-]{36}$/i.test(String(revoke))) throw new EdgeAuthError(400, "Not a share id.");
        await revokeShare(String(revoke));
        return res.status(204).end();
      }

      const ttlSeconds = Number(req.body?.ttlSeconds ?? req.query?.ttlSeconds ?? SHARE_TTL_SECONDS);
      const { token, sid, expiresAt, expiresIn } = mintShare(sandboxId, { ttlSeconds });
      return res.status(200).json({ status: "ok", token, sid, expiresAt, expiresIn, path: `${SHARE_PATH}?t=${encodeURIComponent(token)}` });
    } catch (err) {
      return deny(res, err);
    }
  }

  /** JSON error for an HTTP request. */
  function deny(res, err) {
    const status = err instanceof EdgeAuthError ? err.status : 503;
    if (status === 401) res.setHeader("WWW-Authenticate", "Bearer");
    if (status === 405) res.setHeader("Allow", [...SHARE_METHODS].join(", "));
    return res.status(status).json({ status: "error", message: err.message });
  }

  /** Rejects a WebSocket upgrade on the raw socket. */
  function denyUpgrade(socket, err) {
    const status = err instanceof EdgeAuthError ? err.status : 503;
    const text = { 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed" }[status] || "Service Unavailable";
    try {
      socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    } finally {
      socket.destroy();
    }
  }

  return { authenticate, sessionRoute, shareRoute, deny, denyUpgrade, mintCookie, mintTicket, mintShare, readSession, readShare };
}
