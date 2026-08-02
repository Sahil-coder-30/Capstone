import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isTokenBlacklisted } from '../config/redis.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load Auth's own public key for self-verification
const PUBLIC_KEY = fs.readFileSync(
    path.join(__dirname, '../../certs/public.pem')
);

const JWT_VERIFY_OPTIONS = {
    algorithms: ['RS256'],
    issuer: 'auth.takshacodespace.in',
    audience: 'takshacodespace-services',
};

export const identifyUser = async (req, res, next) => {
    try {
        let token = null;
        if (req.headers.authorization) {
            const [scheme, value] = req.headers.authorization.split(' ');
            if (scheme?.toLowerCase() === 'bearer' && value) token = value;
        }
        if (!token) {
            token = req.cookies?.accessToken || req.cookies?.token;
        }
        if (!token) {
            return res.status(401).json({
                status: 'error',
                message: 'Unauthorized: No token provided'
            });
        }

        // ── Security: reject tokens that have been blacklisted (logged out) ──
        const blacklisted = await isTokenBlacklisted(token);
        if (blacklisted) {
            return res.status(401).json({
                status: 'error',
                message: 'Unauthorized: Token has been revoked'
            });
        }

        // Verify RS256 signature using public key (no shared secret needed)
        const decodedToken = jwt.verify(token, PUBLIC_KEY, JWT_VERIFY_OPTIONS);
        req.user = decodedToken;
        req.user.id = decodedToken.sub || decodedToken.id;
        req.authToken = token;
        next();
    } catch (err) {
        return res.status(401).json({
            status: 'error',
            message: 'Unauthorized: Invalid or expired token'
        });
    }
};
