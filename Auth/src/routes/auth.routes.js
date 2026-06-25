import { Router } from 'express';
import passport from 'passport';
import User from '../models/user.model.js';
import jwt from 'jsonwebtoken';
import { authGoogleCallbackController } from '../controllers/auth.controller.js';
const authRouter = Router();


authRouter.get('/google' , passport.authenticate('google' , {scope : ['profile' , 'email'], session: false}));


authRouter.get('/google/callback' , passport.authenticate('google' , {
    failureRedirect : '/failed' ,
    session: false
}) , authGoogleCallbackController);




export default authRouter;
