import express from 'express'
import morgan from 'morgan'
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import cookieParser from 'cookie-parser';
import authRouter from '../routes/auth.routes.js';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
app.set('trust proxy', true);
app.use(morgan("dev"));
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