// verifyToken.js
// Decides whether a bearer token may use THIS sandbox.
//
// Accepted:
//   - a normal access token (audience takshacodespace-services), sent by the
//     frontend editor, logs panel and terminal
//   - a sandbox token (audience taksha-sandbox) whose `sbx` claim is this
//     sandbox, sent by the AI service for an agent run
// In both cases `sub` must be the sandbox owner. Only RS256 is accepted, so a
// token signed with a shared secret can never pass.
//
// Keys come from the Auth service's JWKS, cached by `kid`.

import { createPublicKey } from "crypto";
import jwt from "jsonwebtoken";

const ISSUER = "auth.takshacodespace.in";
const ACCESS_AUDIENCE = "takshacodespace-services";
const SANDBOX_AUDIENCE = "taksha-sandbox";
const JWKS_CACHE_MS = 24 * 60 * 60 * 1000;
const MIN_REFETCH_MS = 30 * 1000;

export class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * @param {object} opts
 * @param {string} opts.ownerId    user id of the sandbox owner
 * @param {string} opts.sandboxId  this sandbox's id
 * @param {string} opts.jwksUri    Auth JWKS URL
 * @param {Function} [opts.fetchJwks] test hook: () => Promise<{ keys }>
 */
export function createTokenVerifier({ ownerId, sandboxId, jwksUri, fetchJwks }) {
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
    const unknownKid = !keys.has(kid) && Date.now() - fetchedAt > MIN_REFETCH_MS;
    if (stale || unknownKid) {
      try {
        await loadKeys();
      } catch (err) {
        if (!keys.size) throw new AuthError(503, `Could not load signing keys: ${err.message}`);
      }
    }
    return keys.get(kid) || null;
  };

  /** Returns the token claims, or throws AuthError(401 | 403 | 503). */
  return async function verify(token) {
    if (!ownerId || !sandboxId) throw new AuthError(503, "This sandbox has no owner configured.");
    if (!token) throw new AuthError(401, "Missing bearer token.");

    const decoded = jwt.decode(token, { complete: true });
    if (decoded?.header?.alg !== "RS256" || !decoded.header.kid) throw new AuthError(401, "Invalid token.");

    const key = await keyFor(decoded.header.kid);
    if (!key) throw new AuthError(401, "Invalid token.");

    let claims;
    try {
      claims = jwt.verify(token, key, {
        algorithms: ["RS256"],
        issuer: ISSUER,
        audience: [ACCESS_AUDIENCE, SANDBOX_AUDIENCE],
        clockTolerance: 30,
      });
    } catch {
      throw new AuthError(401, "Invalid or expired token.");
    }

    const audiences = [].concat(claims.aud);
    if (audiences.includes(SANDBOX_AUDIENCE) && claims.sbx !== sandboxId) {
      throw new AuthError(403, "This token is for a different sandbox.");
    }
    if (String(claims.sub || claims.id) !== String(ownerId)) {
      throw new AuthError(403, "This sandbox belongs to another user.");
    }
    return claims;
  };
}

/** Reads `Authorization: Bearer <token>`. */
export const bearerFrom = (header) => {
  const [scheme, value] = String(header || "").split(" ");
  return scheme?.toLowerCase() === "bearer" && value ? value : null;
};
