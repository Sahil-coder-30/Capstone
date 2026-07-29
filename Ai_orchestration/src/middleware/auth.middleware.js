/**
 * identifyUser Middleware — AI Orchestration Service
 *
 * Architecture: Dynamic JWKS Key Discovery from Auth Service
 */

import jwt from "jsonwebtoken";
import { createPublicKey } from "crypto";
import { isBlacklisted } from "../config/redis.js";

const AUTH_JWKS_URI = process.env.AUTH_JWKS_URI || "http://localhost:5000/.well-known/jwks.json";

const JWT_VERIFY_OPTIONS = {
  algorithms: ["RS256"],
  issuer: "auth.takshacodespace.in",
  audience: "takshacodespace-services",
};

let cachedPublicKeyPem = null;
let lastFetchedTime = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function getPublicKeyFromJWKS() {
  const now = Date.now();
  if (cachedPublicKeyPem && (now - lastFetchedTime < CACHE_TTL_MS)) {
    return cachedPublicKeyPem;
  }

  try {
    const response = await fetch(AUTH_JWKS_URI);
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.keys || data.keys.length === 0) {
      throw new Error("No keys found in JWKS response");
    }

    const jwk = data.keys[0];
    const keyObject = createPublicKey({ key: jwk, format: "jwk" });
    cachedPublicKeyPem = keyObject.export({ type: "spki", format: "pem" });
    lastFetchedTime = now;

    return cachedPublicKeyPem;
  } catch (err) {
    if (cachedPublicKeyPem) return cachedPublicKeyPem;
    throw new Error(`Failed to fetch JWKS public key from Auth Service (${AUTH_JWKS_URI}): ${err.message}`);
  }
}

export const identifyUser = async (req, res, next) => {
  try {
    let token = req.cookies?.accessToken || req.cookies?.token;

    if (!token && req.headers.authorization) {
      const [scheme, value] = req.headers.authorization.split(" ");
      if (scheme?.toLowerCase() === "bearer" && value) token = value;
    }

    if (!token) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized - No token provided",
      });
    }

    if (await isBlacklisted(token)) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized - Token has been revoked",
      });
    }

    const publicKeyPem = await getPublicKeyFromJWKS();
    const decodedToken = jwt.verify(token, publicKeyPem, JWT_VERIFY_OPTIONS);

    req.user = decodedToken;
    req.user.id = decodedToken.sub || decodedToken.id;
    req.authToken = token;
    next();
  } catch (err) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized - Invalid or expired token",
    });
  }
};