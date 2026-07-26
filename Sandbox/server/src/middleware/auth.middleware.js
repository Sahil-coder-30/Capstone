import jwt from 'jsonwebtoken';

export const identifyUser = async (req , res , next) => {
    try{
        let token = req.cookies?.accessToken || req.cookies?.token;
        if (!token && req.headers.authorization) {
            const [scheme, value] = req.headers.authorization.split(' ');
            if (scheme?.toLowerCase() === 'bearer' && value) token = value;
        }
        if(!token){
            return res.status(401).json({
                status : "error",
                message : "Unauthorized"
            })
        }

        const decodedToken = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        req.user = decodedToken;
        next();
    }catch(err){
        next(err);
    }
}
