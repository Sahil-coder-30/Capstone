/**
 * verifyToken Middleware — Payments Service
 *
 * Architecture:
 *  1. Microservice has NO LOCAL RSA KEYS stored in .env or secrets.
 *  2. On first request, fetches the Public Key dynamically from Auth Service's JWKS endpoint:
 *     AUTH_JWKS_URI (e.g. http://localhost:5000/.well-known/jwks.json)
 *  3. Caches the Public Key in memory for 24 hours.
 *  4. Verifies incoming Bearer JWT signatures statelessly in memory.
 */

import jwt from 'jsonwebtoken';
import { createPublicKey } from 'crypto';

const AUTH_JWKS_URI = process.env.AUTH_JWKS_URI || 'http://localhost:5000/.well-known/jwks.json';

const JWT_VERIFY_OPTIONS = {
    algorithms: ['RS256'],
    issuer: 'auth.takshacodespace.in',
    audience: 'takshacodespace-services',
};

// ── In-Memory Key Cache ───────────────────────────────────────────────────────
let cachedPublicKeyPem = null;
let lastFetchedTime = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // Cache for 24 hours

/**
 * Dynamically fetches the RSA Public Key from Auth Service's JWKS public endpoint
 */
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
            throw new Error('No keys found in JWKS response');
        }

        const jwk = data.keys[0];
        const keyObject = createPublicKey({ key: jwk, format: 'jwk' });
        cachedPublicKeyPem = keyObject.export({ type: 'spki', format: 'pem' });
        lastFetchedTime = now;

        return cachedPublicKeyPem;
    } catch (err) {
        // If fetch fails but we have an old cached key, fall back to it
        if (cachedPublicKeyPem) return cachedPublicKeyPem;
        throw new Error(`Failed to fetch JWKS public key from Auth Service (${AUTH_JWKS_URI}): ${err.message}`);
    }
}

/**
 * Express middleware: verifyToken
 */
export const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            status: 'error',
            message: 'Unauthorized: Missing Authorization header. Expected: Bearer <JWT>',
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const publicKeyPem = await getPublicKeyFromJWKS();
        const decoded = jwt.verify(token, publicKeyPem, JWT_VERIFY_OPTIONS);

        req.user = {
            id: decoded.sub || decoded.id,
            email: decoded.email,
            name: decoded.name,
            role: decoded.role || 'user',
        };

        next();
    } catch (err) {
        const isExpired = err.name === 'TokenExpiredError';
        return res.status(401).json({
            status: 'error',
            message: isExpired
                ? 'Unauthorized: Access token expired. Please refresh.'
                : `Unauthorized: Invalid token signature or claim (${err.message})`,
            expired: isExpired,
        });
    }
};

/**
 * Express middleware: verifyAdmin
 */
export const verifyAdmin = (req, res, next) => {
    verifyToken(req, res, () => {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({
                status: 'error',
                message: 'Forbidden: Admin access required.',
            });
        }
        next();
    });
};
