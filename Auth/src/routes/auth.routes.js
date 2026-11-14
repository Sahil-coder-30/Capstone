import { Router } from 'express';
import passport from 'passport';
import {
    authGoogleCallbackController,
    authGetMeController,
    authLogoutController,
    authGenerateAccessToken,
} from '../controllers/auth.controller.js';
import { identifyUser } from '../middleware/auth.middleware.js';
import { sandboxTokenController } from '../controllers/sandboxToken.controller.js';

const authRouter = Router();

// ── Google OAuth ──────────────────────────────────────────────────────────────
authRouter.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));

// On a failed Google login, send the user back to the app, not to a route that does not exist.
// Built per request so CLIENT_URL is read after the environment is loaded.
const googleCallback = (req, res, next) => passport.authenticate('google', {
    failureRedirect: `${process.env.CLIENT_URL || 'http://localhost:5173'}/?auth=failed`,
    session: false,
})(req, res, next);

authRouter.get('/google/callback', googleCallback, authGoogleCallbackController);

// ── Session ───────────────────────────────────────────────────────────────────
authRouter.get('/getMe', identifyUser, authGetMeController);

// ── Token Refresh ──
authRouter.post('/refresh', authGenerateAccessToken);

// ── Sandbox token (AI service, for one agent run) ──
authRouter.post('/sandbox-token', identifyUser, sandboxTokenController);

// ── Logout ──
authRouter.post('/logout', identifyUser, authLogoutController);

export default authRouter;
