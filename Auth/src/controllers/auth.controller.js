import { sendAuthNotification } from "../config/mq.js";
import User from "../models/user.model.js";
import RefreshToken from "../models/refreshToken.model.js";
import jwt from 'jsonwebtoken';
import { blacklistToken } from "../config/redis.js";
import { issueTokenPair, setRefreshCookie, hashToken } from "../utils/generateTokens.js";

/**
 * Google OAuth 2.0 Callback Controller
 */
export const authGoogleCallbackController = async (req, res, next) => {
    try {
        const { id, displayName, emails, photos } = req.user;
        let user = await User.findOne({ googleId: id });

        if (!user) {
            user = await User.create({
                googleId: id,
                name: displayName,
                email: emails[0].value,
                photo: photos[0].value
            });
            await user.save();
        }

        await sendAuthNotification({
            username: displayName,
            userId: user._id,
            action: 'login',
            timestamps: new Date(),
            email: emails[0].value
        });

        // Issue new token pair (access JWT + rotating opaque refresh token)
        const { accessToken, refreshToken } = await issueTokenPair(user);

        // Attach refresh token cookie (scoped to /api/auth/refresh)
        setRefreshCookie(res, refreshToken);

        res.redirect('http://localhost:5173');

    } catch (err) {
        next(err);
    }
};

/**
 * Get Logged-in User Profile
 */
export const authGetMeController = async (req, res, next) => {
    try {
        const userId = req.user.id || req.user.sub;
        if (!userId) throw Error("User not found");

        const user = await User.findById(userId).select('-__v');
        if (!user) throw Error("User not found");

        res.status(200).json({
            status: "success",
            message: "User found successfully",
            user
        });
    } catch (err) {
        next(err);
    }
};

/**
 * Logout Controller — Revokes the entire refresh token family & clears cookies
 */
export const authLogoutController = async (req, res, next) => {
    try {
        const token = req.cookies.accessToken || req.cookies.token;
        const rawRefreshToken = req.cookies.refreshToken;

        // 1. Blacklist access token in Redis if active
        if (token) {
            const decoded = jwt.decode(token);
            if (decoded?.exp) {
                const ttlSeconds = decoded.exp - Math.floor(Date.now() / 1000);
                if (ttlSeconds > 0) {
                    await blacklistToken(token, ttlSeconds);
                }
            }
        }

        // 2. Revoke refresh token family in DB
        if (rawRefreshToken) {
            const tokenHash = hashToken(rawRefreshToken);
            const stored = await RefreshToken.findOne({ tokenHash });
            if (stored) {
                await RefreshToken.deleteMany({ familyId: stored.familyId });
            }
        }

        // 3. Clear auth cookies
        res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
        res.clearCookie('accessToken');
        res.clearCookie('token');

        res.status(200).json({
            status: 'success',
            message: 'Logged out successfully'
        });
    } catch (err) {
        next(err);
    }
};

/**
 * Refresh Access Token Controller — Implements Rotation + Reuse Detection Revocation
 */
export const authGenerateAccessToken = async (req, res, next) => {
    try {
        const rawRefreshToken = req.cookies.refreshToken;

        if (!rawRefreshToken) {
            return res.status(401).json({
                status: 'error',
                message: 'No refresh token provided'
            });
        }

        const tokenHash = hashToken(rawRefreshToken);
        const stored = await RefreshToken.findOne({ tokenHash });

        // 1. Invalid or expired token
        if (!stored || stored.expiresAt < new Date()) {
            res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
            return res.status(401).json({
                status: 'error',
                message: 'Invalid or expired refresh token'
            });
        }

        // 2. REUSE DETECTED: This token was already rotated!
        // Someone is attempting a replay attack — revoke the ENTIRE token family.
        if (stored.used) {
            console.warn(`[Security Alert] Refresh token reuse detected for family ${stored.familyId}! Revoking family.`);
            await RefreshToken.deleteMany({ familyId: stored.familyId });
            res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
            return res.status(401).json({
                status: 'error',
                message: 'Token reuse detected — all sessions revoked'
            });
        }

        // 3. Valid first use: Mark old token as used (rotated)
        stored.used = true;
        await stored.save();

        const user = await User.findById(stored.userId);
        if (!user) {
            return res.status(401).json({
                status: 'error',
                message: 'User no longer exists'
            });
        }

        // 4. Issue new token pair in the SAME rotation family
        const { accessToken, refreshToken: newRefreshToken } = await issueTokenPair(user, stored.familyId);

        // 5. Attach new refresh cookie
        setRefreshCookie(res, newRefreshToken);

        res.status(200).json({
            status: "success",
            message: "Access token refreshed successfully",
            accessToken
        });
    } catch (err) {
        next(err);
    }
};
