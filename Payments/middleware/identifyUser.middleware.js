/**
 * identifyUser: verifies the Auth access token and loads the account.
 *
 * - Public key comes from Auth's JWKS, picked by the token's `kid`,
 *   cached 24h, refetched once when an unknown kid shows up.
 * - Logged-out tokens are rejected via the Redis blacklist.
 * - The account row is created on first request (fresh users start Free).
 *
 * Sets: req.user (claims, with req.user.id = user id), req.account, req.authToken.
 */

import jwt from 'jsonwebtoken';
import { createPublicKey } from 'crypto';
import {
    AppError,
    ServiceUnavailableError,
    TokenExpiredError,
    TokenInvalidError,
    UnauthorizedError,
} from 'faultkit';
import { isTokenBlacklisted } from '../config/redis.js';
import { ensureAccount } from '../services/account.service.js';

const JWT_VERIFY_OPTIONS = {
    algorithms: ['RS256'],
    issuer: 'auth.takshacodespace.in',
    audience: 'takshacodespace-services',
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const USER_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

let cachedKeys = null;
let fetchedAt = 0;

const jwksUri = () => process.env.AUTH_JWKS_URI || 'http://auth-service/.well-known/jwks.json';

async function fetchJwks(force = false) {
    if (!force && cachedKeys && Date.now() - fetchedAt < CACHE_TTL_MS) return cachedKeys;
    try {
        const response = await fetch(jwksUri());
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!data.keys?.length) throw new Error('JWKS has no keys');
        cachedKeys = data.keys;
        fetchedAt = Date.now();
        return cachedKeys;
    } catch (err) {
        if (cachedKeys) return cachedKeys;
        throw new ServiceUnavailableError(`Could not fetch JWKS from Auth: ${err.message}`);
    }
}

async function publicKeyFor(token) {
    const kid = jwt.decode(token, { complete: true })?.header?.kid;
    if (!kid) throw new TokenInvalidError('Token has no kid header');

    let jwk = (await fetchJwks()).find((k) => k.kid === kid);
    if (!jwk) jwk = (await fetchJwks(true)).find((k) => k.kid === kid);
    if (!jwk) throw new TokenInvalidError(`Unknown signing key kid="${kid}"`);

    return createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'pem' });
}

export async function identifyUser(req, _res, next) {
    try {
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
        if (!token) throw new UnauthorizedError('Missing Authorization: Bearer <token> header');

        if (await isTokenBlacklisted(token)) {
            throw new UnauthorizedError('Token has been revoked. Please log in again.');
        }

        const claims = jwt.verify(token, await publicKeyFor(token), JWT_VERIFY_OPTIONS);
        const userId = String(claims.sub || claims.id || '');
        if (!USER_ID_RE.test(userId)) throw new UnauthorizedError('Token has no valid user id');

        req.user = { ...claims, id: userId };
        req.authToken = token;
        req.account = await ensureAccount(userId, { email: claims.email });
        next();
    } catch (err) {
        if (err instanceof AppError) return next(err);
        if (err.name === 'TokenExpiredError') return next(new TokenExpiredError('Access token expired. Please refresh.'));
        if (err.name === 'JsonWebTokenError') return next(new TokenInvalidError(`Invalid token: ${err.message}`));
        next(err);
    }
}
