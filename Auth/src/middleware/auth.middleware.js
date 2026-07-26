import jwt from 'jsonwebtoken';
import { isTokenBlacklisted } from '../config/redis.js';

export const identifyUser = async (req, res, next) => {
    try {
        let token = req.cookies?.accessToken || req.cookies?.token;
        
        if (!token && req.headers.authorization) {
            const [scheme, value] = req.headers.authorization.split(' ');
            if (scheme?.toLowerCase() === 'bearer' && value) token = value;
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

        const decodedToken = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        req.user = decodedToken;
        req.authToken = token;
        next();
    } catch (err) {
        return res.status(401).json({
            status: 'error',
            message: 'Unauthorized: Invalid or expired token'
        });
    }
};
