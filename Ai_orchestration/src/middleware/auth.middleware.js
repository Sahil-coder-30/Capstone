/**
 * Auth Middleware — AI Orchestration Service
 *
 * Dynamic JWKS Key Discovery from Auth Service
 * - Resolves RSA public keys by `kid` claim with in-memory caching and rotation reload.
 * - Extracts token from Bearer Authorization header or cookies.
 * - Enforces blacklist check against Redis.
 * - Injects `req.user` ({ id, email, name, role, subscription }) and `req.authToken`.
 * - End-to-end FaultKit integration: throws UnauthorizedError, TokenExpiredError, TokenInvalidError.
 */

import jwt from "jsonwebtoken";
import { createPublicKey } from "crypto";
import {
  UnauthorizedError,
  TokenExpiredError,
  TokenInvalidError,
  ForbiddenError,
  AppError,
} from "faultkit";
import { isBlacklisted } from "../config/redis.js";

const AUTH_JWKS_URI = process.env.AUTH_JWKS_URI || "http://localhost:5000/.well-known/jwks.json";

const JWT_VERIFY_OPTIONS = {
  algorithms: ["RS256"],
  issuer: "auth.takshacodespace.in",
  audience: "takshacodespace-services",
};

// ── JWKS key cache ─────────────────────────────────────────────────────────
let cachedJwks = null;
let lastFetchedTime = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function fetchJwks(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedJwks && (now - lastFetchedTime < CACHE_TTL_MS)) {
    return cachedJwks;
  }

  try {
    const response = await fetch(AUTH_JWKS_URI);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    if (!data.keys || data.keys.length === 0) {
      throw new Error("JWKS response contained no keys");
    }
    cachedJwks = data.keys;
    lastFetchedTime = now;
    return cachedJwks;
  } catch (err) {
    if (cachedJwks) return cachedJwks; // serve stale on transient Auth failure
    throw new Error(`Failed to fetch JWKS from Auth Service (${AUTH_JWKS_URI}): ${err.message}`);
  }
}

async function resolvePublicKey(token) {
  const header = jwt.decode(token, { complete: true })?.header;
  if (!header?.kid) {
    throw new TokenInvalidError("Token is missing the required kid (key ID) header claim");
  }

  let keys = await fetchJwks();
  let jwk = keys.find((k) => k.kid === header.kid);

  if (!jwk) {
    // kid not in cache → new key may have rotated in; force refresh once
    keys = await fetchJwks(true);
    jwk = keys.find((k) => k.kid === header.kid);
  }

  if (!jwk) {
    throw new TokenInvalidError(`No JWKS entry found for kid="${header.kid}"`);
  }

  return createPublicKey({ key: jwk, format: "jwk" }).export({ type: "spki", format: "pem" });
}

/**
 * Validate and decode a raw JWT string
 */
export const decodeAndVerifyToken = async (token) => {
  if (await isBlacklisted(token)) {
    throw new UnauthorizedError("Token has been revoked");
  }

  try {
    const publicKeyPem = await resolvePublicKey(token);
    const decoded = jwt.verify(token, publicKeyPem, JWT_VERIFY_OPTIONS);
    const userId = decoded.sub || decoded.id;
    return {
      ...decoded,
      id: userId,
      role: decoded.role || "user",
      subscription: decoded.subscription || "free",
    };
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }

    // Fallback to shared secret if configured (e.g. during local tests)
    if (process.env.JWT_ACCESS_SECRET) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        const userId = decoded.sub || decoded.id;
        return {
          ...decoded,
          id: userId,
          role: decoded.role || "user",
          subscription: decoded.subscription || "free",
        };
      } catch (_) {}
    }

    if (err.name === "TokenExpiredError") {
      throw new TokenExpiredError("Unauthorized: Access token expired. Please refresh.");
    }
    if (err.name === "JsonWebTokenError") {
      throw new TokenInvalidError(`Unauthorized: Invalid token signature or claims (${err.message})`);
    }
    throw new UnauthorizedError(`Unauthorized: ${err.message}`);
  }
};

/**
 * Identify User Express Middleware
 * Populates req.user and req.authToken, or passes FaultKit error to next()
 */
export const identifyUser = async (req, res, next) => {
  try {
    let token = null;

    if (req.headers.authorization) {
      const [scheme, value] = req.headers.authorization.split(" ");
      if (scheme?.toLowerCase() === "bearer" && value) {
        token = value;
      }
    }

    if (!token && req.cookies) {
      token = req.cookies.accessToken || req.cookies.token;
    }

    if (!token) {
      throw new UnauthorizedError("Unauthorized: Missing authentication token. Expected: Bearer <JWT> or cookie.");
    }

    const decoded = await decodeAndVerifyToken(token);

    if (!decoded || !decoded.id) {
      throw new UnauthorizedError("Unauthorized: Token payload is missing required identity claims (sub / id).");
    }

    req.user = decoded;
    req.authToken = token;
    next();
  } catch (err) {
    next(err);
  }
};

export const verifyToken = identifyUser;

export const verifyAdmin = (req, res, next) => {
  identifyUser(req, res, (err) => {
    if (err) return next(err);
    if (req.user?.role !== "admin") {
      return next(new ForbiddenError("Forbidden: Admin access required"));
    }
    next();
  });
};

export default identifyUser;