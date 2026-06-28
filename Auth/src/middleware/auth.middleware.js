import jwt from 'jsonwebtoken';
import { isTokenBlacklisted } from '../config/redis.js';

export const identifyUser = async (req, res, next) => {
    try {
        const token = req.cookies.token;
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

        const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decodedToken;
        next();
    } catch (err) {
        return res.status(401).json({
            status: 'error',
            message: 'Unauthorized: Invalid or expired token'
        });
    }
};