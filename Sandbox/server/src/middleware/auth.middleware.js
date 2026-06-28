import jwt from 'jsonwebtoken';

export const identifyUser = async (req , res , next) => {
    try{
        const token = req.cookies.token;
        if(!token){
            return res.status(401).json({
                status : "error",
                message : "Unauthorized"
            })
        }

        const decodedToken = jwt.verify(token , process.env.JWT_SECRET);
        req.user = decodedToken;
        next();
    }catch(err){
        next(err);
    }
}
