/**
 * identifyAdmin Middleware — Payments Service
 *
 * Validates that the incoming request:
 *  1. Has a valid RS256-signed JWT (delegates to verifyToken).
 *  2. Has role === 'admin' embedded in the JWT payload (set by Auth Service on login).
 *
 * UPGRADE from previous implementation:
 *  - OLD: Checked ADMIN_EMAILS env var (fragile — changing ENV = instant admin bypass).
 *  - NEW: Role is cryptographically signed into the JWT by Auth Service.
 *         Cannot be altered without invalidating the RS256 signature.
 *
 * Usage:
 *   import { identifyAdmin } from '../middleware/identifyAdmin.middleware.js';
 *   router.delete('/refund/:id', identifyAdmin, adminController.refund);
 */
import { verifyToken } from './verifyToken.middleware.js';
import { ForbiddenError } from 'faultkit';

export const identifyAdmin = (req, res, next) => {
    // Step 1: Verify JWT signature and claims (same as verifyToken)
    verifyToken(req, res, (err) => {
        if (err) return next(err);

        // Step 2: Check that the signed role claim is 'admin'
        if (!req.user || req.user.role !== 'admin') {
            return next(new ForbiddenError('Forbidden: Admin access required.'));
        }

        req.isAdmin = true;
        next();
    });
};
