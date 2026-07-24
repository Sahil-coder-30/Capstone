import jwt from 'jsonwebtoken';

/**
 * identifyAdmin Middleware
 *
 * Validates that the request comes from:
 *  1. A valid JWT token (same as identifyUser)
 *  2. A user whose email is in the ADMIN_EMAILS environment variable
 *
 * Configure ADMIN_EMAILS as a comma-separated list in .env:
 *   ADMIN_EMAILS=sahilsharma3043@gmail.com,admin2@example.com
 *
 * This middleware chains after JWT verification and must be applied AFTER
 * identifyUser (or can be used standalone as it does its own JWT decode).
 */
export const identifyAdmin = async (req, res, next) => {
    // ── Step 1: Extract Token ─────────────────────────────────────────────────
    let token = req.cookies?.token;
    if (!token && req.headers.authorization) {
        const [scheme, value] = req.headers.authorization.split(' ');
        if (scheme?.toLowerCase() === 'bearer' && value) {
            token = value;
        }
    }

    if (!token) {
        return res.status(401).json({
            status: 'error',
            message: 'Unauthorized: No token provided',
        });
    }

    // ── Step 2: Verify JWT ────────────────────────────────────────────────────
    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return res.status(401).json({
            status: 'error',
            message: 'Unauthorized: Invalid or expired token',
        });
    }

    req.user = decoded;
    req.user.id = decoded.id || decoded._id;

    // ── Step 3: Check Admin Email List ────────────────────────────────────────
    const adminEmails = (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(Boolean);

    const userEmail = (decoded.email || '').trim().toLowerCase();

    if (!userEmail || !adminEmails.includes(userEmail)) {
        return res.status(403).json({
            status: 'error',
            message: 'Forbidden: Admin access required',
        });
    }

    req.isAdmin = true;
    next();
};
