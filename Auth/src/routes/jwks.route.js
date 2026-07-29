/**
 * JWKS Route — GET /.well-known/jwks.json
 *
 * Public endpoint (no authentication required).
 * Publishes the Auth Service's RSA Public Key in JWKS format so that
 * all other microservices (Payments, AI, Notification, Sandbox) can:
 *   1. Fetch this public key once at startup.
 *   2. Cache it locally (jwks-rsa handles 24h caching automatically).
 *   3. Verify incoming JWT Bearer tokens locally in <1ms with zero DB calls.
 *
 * Standard: RFC 7517 (JSON Web Key)
 * Endpoint: /.well-known/jwks.json  (industry-standard path)
 */

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createPublicKey } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jwksRouter = Router();

// Smart Public Key Loader (ENV, Private Key derivation, or File)
const getPublicKeyPem = () => {
    if (process.env.RSA_PUBLIC_KEY) {
        return process.env.RSA_PUBLIC_KEY.replace(/\\n/g, '\n');
    }
    if (process.env.RSA_PRIVATE_KEY) {
        const privKey = createPublicKey(process.env.RSA_PRIVATE_KEY.replace(/\\n/g, '\n'));
        return privKey.export({ type: 'spki', format: 'pem' });
    }
    const keyPath = path.join(__dirname, '../../certs/public.pem');
    if (fs.existsSync(keyPath)) {
        return fs.readFileSync(keyPath, 'utf8');
    }
    throw new Error('RSA_PRIVATE_KEY or certs/public.pem is required to serve JWKS.');
};

const PUBLIC_KEY_PEM = getPublicKeyPem();

// Convert PEM to JWK format using Node.js built-in crypto
const publicKeyObject = createPublicKey(PUBLIC_KEY_PEM);
const jwkKey = publicKeyObject.export({ format: 'jwk' });


// Build the JWKS response object (cached in memory — no disk reads per request)
const JWKS_RESPONSE = {
    keys: [
        {
            kty: jwkKey.kty,          // Key Type: "RSA"
            use: 'sig',               // Usage: signature verification only
            alg: 'RS256',             // Algorithm
            kid: 'auth-rsa-v1',       // Key ID — must match what's in JWT header
            n: jwkKey.n,              // RSA Public Modulus (Base64URL)
            e: jwkKey.e,              // RSA Public Exponent (Base64URL)
        },
    ],
};

/**
 * GET /.well-known/jwks.json
 * Returns the JSON Web Key Set containing the public verification key.
 * Cache-Control set to 24h so microservices don't hit this on every request.
 */
jwksRouter.get('/', (req, res) => {
    res
        .setHeader('Cache-Control', 'public, max-age=86400') // 24 hours
        .setHeader('Content-Type', 'application/json')
        .json(JWKS_RESPONSE);
});

export default jwksRouter;
