import { sendAuthNotification } from "../config/mq.js";
import User from "../models/user.model.js";
import jwt from 'jsonwebtoken';
import { blacklistToken } from "../config/redis.js";
import { generateAccessToken, generateRefreshToken } from "../utils/generateTokens.js";


const setAccessToken = async (accessToken , res) =>{
    res.cookie('accessToken', accessToken, {
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 1
    });
}


const setRefreshToken = async (refreshToken , res) =>{
    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24
    });
}

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

        const accessToken = await generateAccessToken(user);
        const refreshToken = await generateRefreshToken(user);

        user.refreshToken = refreshToken;
        await user.save();

        setAccessToken(accessToken, res);
        setRefreshToken(refreshToken, res);
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
        const token = req.cookies.accessToken || req.cookies.token;

        if (token) {
            const decoded = jwt.decode(token);
            if (decoded?.exp) {
                const ttlSeconds = decoded.exp - Math.floor(Date.now() / 1000);
                if (ttlSeconds > 0) {
                    await blacklistToken(token, ttlSeconds);
                }
            }
        }

        if (req.user?.id) {
            await User.findByIdAndUpdate(req.user.id, { $unset: { refreshToken: 1 } });
        }

        res.clearCookie('accessToken', { httpOnly: true });
        res.clearCookie('refreshToken', { httpOnly: true });
        res.clearCookie('token', { httpOnly: true });

        res.status(200).json({
            status: 'success',
            message: 'Logged out successfully'
        });
    } catch (err) {
        next(err);
    }
};

export const authGenerateAccessToken = async (req , res , next) =>{
    try{
        const refreshToken = req.cookies.refreshToken;

        if (!refreshToken) throw Error("Refresh token not found");

        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        if (!decoded) throw Error("Invalid refresh token");

        const user = await User.findById(decoded.id);
        if (!user) throw Error("User not found");

        if (user.refreshToken !== refreshToken) throw Error("Invalid refresh token");

        const accessToken = await generateAccessToken(user);
        const newRefreshToken = await generateRefreshToken(user);

        user.refreshToken = newRefreshToken;
        await user.save();

        setAccessToken(accessToken, res);
        setRefreshToken(newRefreshToken, res);

        res.status(200).json({
            status: "success",
            message: "Access token generated successfully",
            accessToken
        });
    }catch(err){
        next(err);
    }
}
