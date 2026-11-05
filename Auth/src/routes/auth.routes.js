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

authRouter.get('/google/callback', passport.authenticate('google', {
    failureRedirect: '/failed',
    session: false,
}), authGoogleCallbackController);

// ── Session ───────────────────────────────────────────────────────────────────
authRouter.get('/getMe', identifyUser, authGetMeController);

// ── Token Refresh ──
authRouter.post('/refresh', authGenerateAccessToken);

// ── Sandbox token (AI service, for one agent run) ──
authRouter.post('/sandbox-token', identifyUser, sandboxTokenController);

// ── Logout ──
authRouter.post('/logout', identifyUser, authLogoutController);

export default authRouter;
