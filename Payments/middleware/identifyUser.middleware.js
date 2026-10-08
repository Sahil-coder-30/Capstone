/**
 * identifyUser Middleware — Payments Service
 *
 * Architecture: Dynamic JWKS Key Discovery from Auth Service
 * - NO local keys or certs. Public key fetched from /.well-known/jwks.json.
 * - Key cache: stores the raw JWK array (not a single PEM) so keys are looked
 *   up by kid on every request. Supports key rotation overlap windows.
 * - Blacklist check: Payments is the ONLY non-Auth service that hits Redis on
 *   every request. Reason: financial operations cannot tolerate a logged-out
 *   token remaining valid for up to 15 minutes.
 * - Auto-provision Account: Ensures an Account document is immediately created/hydrated
 *   in MongoDB for any existing or new user on their first authenticated request.
 */

import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { createPublicKey } from 'crypto';
import { isTokenBlacklisted } from '../config/redis.js';
import Account from '../models/account.model.js';

const AUTH_JWKS_URI = process.env.AUTH_JWKS_URI || 'http://localhost:5000/.well-known/jwks.json';

const JWT_VERIFY_OPTIONS = {
    algorithms: ['RS256'],
    issuer:    'auth.takshacodespace.in',
    audience:  'takshacodespace-services',
};

// ── JWKS key cache ────────────────────────────────────────────────────────────
let cachedJwks     = null;
let lastFetchedTime = 0;
const CACHE_TTL_MS  = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch (or return cached) JWK array.
 * @param {boolean} forceRefresh - bypass cache and refetch immediately
 */
async function fetchJwks(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cachedJwks && (now - lastFetchedTime < CACHE_TTL_MS)) {
        return cachedJwks;
    }

    try {
        const response = await fetch(AUTH_JWKS_URI);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

        const data = await response.json();
        if (!data.keys || data.keys.length === 0) throw new Error('JWKS response contained no keys');

        cachedJwks      = data.keys;
        lastFetchedTime = now;
        return cachedJwks;
    } catch (err) {
        if (cachedJwks) return cachedJwks;
        throw new Error(`Failed to fetch JWKS from Auth Service (${AUTH_JWKS_URI}): ${err.message}`);
    }
}

/**
 * Resolve the correct public key PEM for the given token's kid.
 */
async function resolvePublicKey(token) {
    const header = jwt.decode(token, { complete: true })?.header;
    if (!header?.kid) throw new Error('Token is missing the kid (key ID) header claim');

    let keys = await fetchJwks();
    let jwk = keys.find(k => k.kid === header.kid);

    if (!jwk) {
        keys = await fetchJwks(true); // forceRefresh
        jwk  = keys.find(k => k.kid === header.kid);
    }

    if (!jwk) throw new Error(`No JWKS entry found for kid="${header.kid}"`);

    return createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'pem' });
}

/**
 * Ensure an Account document exists for the user in MongoDB.
 * Auto-creates the Account document if this is the user's first time interacting with Payments.
 * Sets Account._id = user_id to maintain 1:1 identity consistency across all collections.
 */
export async function ensureAccount(userId, initialStatus = 'free') {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        return null;
    }
    const userObjId = new mongoose.Types.ObjectId(userId);

    try {
        let account = await Account.findOne({
            $or: [{ user_id: userObjId }, { _id: userObjId }],
        });

        if (!account) {
            account = await Account.create({
                _id: userObjId,
                user_id: userObjId,
                subscription_status: initialStatus,
                is_active: true,
            });
            console.log(`[Payments Account] Auto-provisioned new Account document for user_id=${userObjId}`);
        }

        return account;
    } catch (err) {
        if (err.code === 11000) {
            return await Account.findOne({
                $or: [{ user_id: userObjId }, { _id: userObjId }],
            });
        }
        console.warn(`[Payments Account] ensureAccount error for ${userId}: ${err.message}`);
        return null;
    }
}

// ── Middleware ────────────────────────────────────────────────────────────────

export const identifyUser = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            status:  'error',
            message: 'Unauthorized: Missing Authorization header. Expected: Bearer <JWT>',
        });
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({
            status:  'error',
            message: 'Unauthorized: Bearer token value is empty.',
        });
    }

    try {
        // ── 1. Blacklist check (Payments-only) ────────────────────────────────
        const blacklisted = await isTokenBlacklisted(token);
        if (blacklisted) {
            return res.status(401).json({
                status:  'error',
                message: 'Unauthorized: Token has been revoked. Please log in again.',
            });
        }

        // ── 2. Signature verification (kid-aware) ─────────────────────────────
        const publicKeyPem = await resolvePublicKey(token);
        const decodedToken = jwt.verify(token, publicKeyPem, JWT_VERIFY_OPTIONS);

        // ── 3. Identity claim validation ──────────────────────────────────────
        const userId = decodedToken?.sub || decodedToken?.id || decodedToken?._id;
        if (!decodedToken || !userId) {
            return res.status(401).json({
                status:  'error',
                message: 'Unauthorized: Token payload is missing required identity claims (sub / id).',
            });
        }

        // ── 4. Auto-Provision / Hydrate Account Document in MongoDB ───────────
        const account = await ensureAccount(userId, decodedToken?.subscription || 'free');

        req.user      = decodedToken;
        req.user.id   = userId;
        req.account   = account;
        req.accountId = account ? account._id.toString() : userId;
        req.authToken = token;
        next();

    } catch (error) {
        const isExpired = error.name === 'TokenExpiredError';
        return res.status(401).json({
            status:  'error',
            message: isExpired
                ? 'Unauthorized: Access token expired. Please refresh.'
                : `Unauthorized: ${error.message}`,
            expired: isExpired,
        });
    }
};