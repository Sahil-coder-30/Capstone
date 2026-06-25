import { sendAuthNotification } from "../config/mq.js";
import User from "../models/user.model.js";
import jwt from 'jsonwebtoken';



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
        }

        await sendAuthNotification({
            username: displayName,
            userId: user._id,
            action: 'login',
            timestamps : new Date(),
            email: emails[0].value
        })

        const token = jwt.sign({id : user._id} , process.env.JWT_SECRET , {expiresIn : '24h'});

        res.cookie('token' , token , {httpOnly : true , maxAge : 1000 * 60 * 60 * 24});

        res.redirect('/home');

    }catch(err){
        next(err);
    }
}

