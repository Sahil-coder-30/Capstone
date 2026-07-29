/**
 * identifyUser Middleware — Sandbox Service
 *
 * Architecture: Dynamic JWKS Key Discovery from Auth Service
 * - No local keys or certs. Public key fetched from /.well-known/jwks.json.
 * - Key cache: stores the raw JWK array (not a single PEM) so keys are looked
 *   up by kid on every request. Supports key rotation overlap windows.
 *
 * Blacklist: This service does NOT check the Redis blacklist on every request.
 *   Deliberate tradeoff — pod lifecycle operations (start/stop/create) are
 *   idempotent enough that a 15-minute exposure window is acceptable. The
 *   accepted risk: a user who logs out can still manage their sandbox containers
 *   for up to 15 minutes. Since sandboxes are per-user anyway and ownership is
 *   enforced by MongoDB user matching in controllers, this is considered low risk.
 *   (Payments IS an exception — it checks the blacklist; see its middleware.)
 */
import jwt from 'jsonwebtoken';
import { createPublicKey } from 'crypto';

const AUTH_JWKS_URI = process.env.AUTH_JWKS_URI || 'http://localhost:5000/.well-known/jwks.json';

const JWT_VERIFY_OPTIONS = {
    algorithms: ['RS256'],
    issuer:    'auth.takshacodespace.in',
    audience:  'takshacodespace-services',
};

// ── JWKS key cache ─────────────────────────────────────────────────────────
// Caches the full JWK *array* so keys are resolved by kid each request.
// During key rotation Auth serves both old and new keys simultaneously —
// caching only keys[0] would grab the wrong key after a rotation.
let cachedJwks      = null;
let lastFetchedTime = 0;
const CACHE_TTL_MS  = 24 * 60 * 60 * 1000;

async function fetchJwks(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cachedJwks && (now - lastFetchedTime < CACHE_TTL_MS)) return cachedJwks;
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

async function resolvePublicKey(token) {
    const header = jwt.decode(token, { complete: true })?.header;
    if (!header?.kid) throw new Error('Token is missing the kid (key ID) header claim');
    let keys = await fetchJwks();
    let jwk  = keys.find(k => k.kid === header.kid);
    if (!jwk) {
        keys = await fetchJwks(true);
        jwk  = keys.find(k => k.kid === header.kid);
    }
    if (!jwk) throw new Error(`No JWKS entry found for kid="${header.kid}"`);
    return createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'pem' });
}

// ── Middleware ──────────────────────────────────────────────────────────────

export const identifyUser = async (req, res, next) => {
    try {
        // Access tokens are never in cookies — they live in JS module memory
        // and are always sent via Authorization: Bearer <JWT>.
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                status:  'error',
                message: 'Unauthorized: Missing Authorization header. Expected: Bearer <JWT>',
            });
        }
        const token = authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({ status: 'error', message: 'Unauthorized: Bearer token value is empty.' });
        }

        const publicKeyPem = await resolvePublicKey(token);
        const decodedToken = jwt.verify(token, publicKeyPem, JWT_VERIFY_OPTIONS);

        const userId = decodedToken?.sub || decodedToken?.id;
        if (!decodedToken || !userId) {
            return res.status(401).json({
                status:  'error',
                message: 'Unauthorized: Token payload is missing required identity claims (sub / id).',
            });
        }

        req.user    = decodedToken;
        req.user.id = userId;
        next();
    } catch (err) {
        const isExpired = err.name === 'TokenExpiredError';
        return res.status(401).json({
            status:  'error',
            message: isExpired ? 'Unauthorized: Access token expired. Please refresh.' : `Unauthorized: ${err.message}`,
            expired: isExpired,
        });
    }
};
