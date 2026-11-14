import express from 'express'
import morgan from 'morgan'
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import cookieParser from 'cookie-parser';
import authRouter from '../routes/auth.routes.js';
import profileRouter from '../routes/profile.routes.js';
import preferencesRouter from '../routes/preferences.routes.js';
import jwksRouter from '../routes/jwks.route.js';
import internalRouter from '../routes/internal.routes.js';
import { identifyUser } from '../middleware/auth.middleware.js';
import dotenv from 'dotenv';
import { register } from '../observability/metrics.js';
import {metricsMiddleware} from '../middleware/metrics.middleware.js';

dotenv.config();
const app = express();
app.set('trust proxy', true);
app.use(morgan("dev"));
app.use(metricsMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(passport.initialize());

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/api/auth/google/callback",
    proxy: true
}, (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
}))

app.use("/api/auth", authRouter);
app.use("/api/auth/profile", identifyUser, profileRouter);
app.use("/api/auth/preferences", identifyUser, preferencesRouter);

// ── JWKS Public Key Discovery (no auth required) ───────────────────────────
// All microservices call this once at startup to get the RSA Public Key
// for local JWT verification (zero DB calls on their end).
app.use("/.well-known/jwks.json", jwksRouter);

// Service-to-service only (not routed by the ingress, shared-token protected).
app.use("/internal", internalRouter);

app.get("/healthz", (req, res) => {
    res.status(200).json({
        message: "Server is healthy"
    })
})

app.get('/metrics', async (req, res) => {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
})

app.get("/readyz", (req, res) => {
    res.status(200).json({
        message: "Server is ready to use"
    })
})

// JSON for every unhandled error, same shape as the other Auth errors.
// Without this, Express answers with an HTML page.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('[Auth] Unhandled error:', err);
    if (res.headersSent) return next(err);
    // Bad input (wrong enum, wrong type) is the caller's mistake, not a server error.
    if (err.name === 'ValidationError' || err.name === 'CastError') {
        return res.status(400).json({ status: 'error', message: err.message });
    }
    res.status(err.status || err.statusCode || 500).json({
        status: 'error',
        message: process.env.NODE_ENV === 'production' ? 'Internal server error' : (err.message || 'Internal server error'),
    });
});

export default app;