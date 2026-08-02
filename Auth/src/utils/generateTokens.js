import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import RefreshToken from '../models/refreshToken.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Smart Private Key Loader (Supports ENV string and File Mount) ─────────────
const getPrivateKey = () => {
    if (process.env.RSA_PRIVATE_KEY) {
        return process.env.RSA_PRIVATE_KEY.replace(/\\n/g, '\n');
    }
    const keyPath = path.join(__dirname, '../../certs/private.pem');
    if (fs.existsSync(keyPath)) {
        return fs.readFileSync(keyPath, 'utf8');
    }
    throw new Error('RSA_PRIVATE_KEY is missing from environment and certs/private.pem does not exist.');
};

const PRIVATE_KEY = getPrivateKey();

// ── JWT Configuration ─────────────────────────────────────────────────────────
const JWT_OPTIONS = {
    algorithm: 'RS256',
    issuer: 'auth.takshacodespace.in',
    audience: 'takshacodespace-services',
    keyid: 'auth-rsa-v1', // Key ID used by JWKS to match the public key
};

/**
 * Computes SHA256 hash of a raw refresh token string for database storage.
 */
export const hashToken = (rawToken) => {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
};

/**
 * Signs a short-lived Access Token (15 minutes).
 * Sent in Authorization: Bearer <JWT> header on every API request.
 */
export const signAccessToken = (user) => jwt.sign(
    {
        sub: String(user._id || user.id),  // subject: user's MongoDB ID
        id: String(user._id || user.id),   // alias kept for backward compatibility
        email: user.email,
        name: user.name,
        role: user.role || 'user',
    },
    PRIVATE_KEY,
    { ...JWT_OPTIONS, expiresIn: '15m' }
);

/**
 * Issues a new Access Token + Rotating Refresh Token pair.
 * Stores the SHA256 hash of the refresh token and its rotation familyId in MongoDB.
 *
 * @param {Object} user - User document
 * @param {string|null} [familyId] - Existing familyId for rotation, or null to generate a new family
 */
export const issueTokenPair = async (user, familyId = null) => {
    const accessToken = signAccessToken(user);

    // Opaque 64-byte random hex refresh token
    const rawRefreshToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = hashToken(rawRefreshToken);
    const activeFamilyId = familyId || crypto.randomUUID();

    // Store hash in DB with 30 day expiration
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await RefreshToken.create({
        userId: user._id || user.id,
        tokenHash,
        familyId: activeFamilyId,
        expiresAt,
    });

    return {
        accessToken,
        refreshToken: rawRefreshToken,
        familyId: activeFamilyId,
    };
};  

/**
 * Attaches the refresh token cookie scoped strictly to /api/auth/refresh.
 */
export const setRefreshCookie = (res, rawRefreshToken) => {
    res.cookie('refreshToken', rawRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api/auth/refresh',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
};


// Backward compatibility wrappers
export const generateAccessToken = async (user) => signAccessToken(user);
export const generateRefreshToken = async (user) => {
    const pair = await issueTokenPair(user);
    return pair.refreshToken;
};