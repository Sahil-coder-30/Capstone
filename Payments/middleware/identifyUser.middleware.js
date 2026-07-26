import jwt from 'jsonwebtoken';

export const identifyUser = async (req, res, next) => {
    let token = req.cookies?.accessToken || req.cookies?.token;
    
    if (!token && req.headers.authorization) {
        const [scheme, value] = req.headers.authorization.split(' ');
        if (scheme?.toLowerCase() === 'bearer' && value) {
            token = value;
        }
    }

    if (!token) {
        return res.status(401).json({
            status: 'error',
            message: 'Unauthorized: No token provided'
        });
    }

    try {
        const decodedToken = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        req.user = decodedToken;
        req.user.id = decodedToken.id || decodedToken._id;
        req.authToken = token;
        next();
    } catch (error) {
        return res.status(401).json({
            status: 'error',
            message: 'Unauthorized: Invalid or expired token'
        });
    }
};