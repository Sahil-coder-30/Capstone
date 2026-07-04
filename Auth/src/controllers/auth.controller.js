import { sendAuthNotification } from "../config/mq.js";
import User from "../models/user.model.js";
import Credit from "../models/credit.model.js";
import jwt from 'jsonwebtoken';
import { blacklistToken } from "../config/redis.js";

const signUserToken = (user) => jwt.sign({
    id: user._id,
    subscription: user.subscription || 'free'
}, process.env.JWT_SECRET, { expiresIn: '24h' });

const setAuthCookie = (res, token) => {
    res.cookie('token', token, {
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24
    });
};


export const authGoogleCallbackController = async (req , res , next) =>{
    try{
        const { id , displayName , emails , photos } = req.user;
        let user = await User.findOne({googleId : id});

        if(!user){
            user = await User.create({
                googleId : id,
                name : displayName,
                email: emails[0].value,
                photo : photos[0].value
            });
            await user.save();
        } else if (!user.subscription) {
            user.subscription = 'free';
            await user.save();
        }

        await sendAuthNotification({
            username: displayName,
            userId: user._id,
            action: 'login',
            timestamps : new Date(),
            email: emails[0].value
        })

        const token = signUserToken(user);
        setAuthCookie(res, token);
        res.redirect('http://localhost:5173');

    }catch(err){
        next(err);
    }
}


export const authGetMeController = async (req ,res , next)=>{
    try{
        const userId = req.user.id;
        if(!userId) throw Error("User not found");

        const user = await User.findById(userId).select('-__v');
        if(!user) throw Error("User not found");

        if (req.user.subscription !== user.subscription) {
            const token = signUserToken(user);
            setAuthCookie(res, token);
        }

        res.status(200).json({
            status : "success",
            message : "User found successfully",
            user
        })
    }catch(err){
        next(err);
    }
}

export const updateSubscriptionController = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { subscription } = req.body;

        if (!['free', 'pro', 'max'].includes(subscription)) {
            return res.status(400).json({
                status: 'error',
                message: 'subscription must be one of: free, pro, max'
            });
        }

        const user = await User.findByIdAndUpdate(
            userId,
            { subscription },
            { new: true, runValidators: true }
        ).select('-__v');

        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        await Credit.findOneAndUpdate(
            { userId },
            { subscription },
            { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
        );

        if (req.authToken) {
            const decoded = jwt.decode(req.authToken);
            if (decoded?.exp) {
                const ttlSeconds = decoded.exp - Math.floor(Date.now() / 1000);
                if (ttlSeconds > 0) {
                    await blacklistToken(req.authToken, ttlSeconds);
                }
            }
        }

        const token = signUserToken(user);
        setAuthCookie(res, token);

        res.status(200).json({
            status: 'success',
            message: 'Subscription updated successfully',
            user
        });
    } catch (err) {
        next(err);
    }
};

// ─── Logout ────────────────────────────────────────────────────────────────────
// 1. Reads the JWT from the httpOnly cookie
// 2. Decodes it to find the remaining TTL
// 3. Blacklists the token in Redis for exactly that TTL so it auto-expires
// 4. Clears the cookie from the browser
export const authLogoutController = async (req, res, next) => {
    try {
        const token = req.cookies.token;

        if (token) {
            // Decode without re-verifying (identifyUser already did that)
            const decoded = jwt.decode(token);
            if (decoded?.exp) {
                const ttlSeconds = decoded.exp - Math.floor(Date.now() / 1000);
                if (ttlSeconds > 0) {
                    await blacklistToken(token, ttlSeconds);
                }
            }
        }

        // Clear the auth cookie regardless
        res.clearCookie('token', { httpOnly: true });

        res.status(200).json({
            status: 'success',
            message: 'Logged out successfully'
        });
    } catch (err) {
        next(err);
    }
};
