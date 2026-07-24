import { sendAuthNotification } from "../config/mq.js";
import User from "../models/user.model.js";
import jwt from 'jsonwebtoken';
import { blacklistToken } from "../config/redis.js";

const signUserToken = (user) => jwt.sign({
    id: user._id,
    email: user.email,
    name: user.name
}, process.env.JWT_SECRET, { expiresIn: '24h' });

const setAuthCookie = (res, token) => {
    res.cookie('token', token, {
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24
    });
};

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

        const token = signUserToken(user);
        setAuthCookie(res, token);
        res.redirect('http://localhost:5173');

    } catch (err) {
        next(err);
    }
};

export const authGetMeController = async (req, res, next) => {
    try {
        const userId = req.user.id;
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

export const authLogoutController = async (req, res, next) => {
    try {
        const token = req.cookies.token;

        if (token) {
            const decoded = jwt.decode(token);
            if (decoded?.exp) {
                const ttlSeconds = decoded.exp - Math.floor(Date.now() / 1000);
                if (ttlSeconds > 0) {
                    await blacklistToken(token, ttlSeconds);
                }
            }
        }

        res.clearCookie('token', { httpOnly: true });

        res.status(200).json({
            status: 'success',
            message: 'Logged out successfully'
        });
    } catch (err) {
        next(err);
    }
};
