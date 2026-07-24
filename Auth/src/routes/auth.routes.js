import { Router } from 'express';
import passport from 'passport';
import {
    authGoogleCallbackController,
    authGetMeController,
    authLogoutController,
} from '../controllers/auth.controller.js';
import { identifyUser } from '../middleware/auth.middleware.js';

const authRouter = Router();

// ── Google OAuth ──────────────────────────────────────────────────────────────
authRouter.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));

authRouter.get('/google/callback', passport.authenticate('google', {
    failureRedirect: '/failed',
    session: false,
}), authGoogleCallbackController);

// ── Session ───────────────────────────────────────────────────────────────────
authRouter.get('/getMe', identifyUser, authGetMeController);

// ── Logout ──
authRouter.post('/logout', identifyUser, authLogoutController);

export default authRouter;
