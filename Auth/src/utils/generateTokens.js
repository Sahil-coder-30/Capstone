
import jwt from 'jsonwebtoken';

const signUserToken = (user) => jwt.sign({
    id: user._id,
    email: user.email,
    name: user.name
}, process.env.JWT_ACCESS_SECRET, { expiresIn: '1h' });

const signRefreshToken = (user) => jwt.sign({
    id: user._id,
    email: user.email,
    name: user.name
}, process.env.JWT_REFRESH_SECRET, { expiresIn: '1d' });

export const generateAccessToken = async (user) =>{
    return signUserToken(user);
}


export const generateRefreshToken = async (user) =>{
    return signRefreshToken(user);
}