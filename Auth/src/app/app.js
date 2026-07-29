import express from 'express'
import morgan from 'morgan'
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import cookieParser from 'cookie-parser';
import authRouter from '../routes/auth.routes.js';
import profileRouter from '../routes/profile.routes.js';
import preferencesRouter from '../routes/preferences.routes.js';
import jwksRouter from '../routes/jwks.route.js';
import { identifyUser } from '../middleware/auth.middleware.js';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
app.set('trust proxy', true);
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(passport.initialize());

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/api/auth/google/callback",
    proxy: true
} , (accessToken , refreshToken , profile , done) => {
    return done(null , profile);
}))

app.use("/api/auth" , authRouter);
app.use("/api/auth/profile", identifyUser, profileRouter);
app.use("/api/auth/preferences", identifyUser, preferencesRouter);

// ── JWKS Public Key Discovery (no auth required) ───────────────────────────
// All microservices call this once at startup to get the RSA Public Key
// for local JWT verification (zero DB calls on their end).
app.use("/.well-known/jwks.json", jwksRouter);

app.get("/healthz" , (req , res) =>{
    res.status(200).json({
        message : "Server is healthy"
    })
})

app.get("/readyz" , (req , res) =>{
    res.status(200).json({
        message : "Server is ready to use"
    })
})

export default app;