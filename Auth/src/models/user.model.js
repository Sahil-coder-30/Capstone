import mongoose from 'mongoose';

const UserShema = new mongoose.Schema({
    googleId :{
        type : String,
        required:true
    },
    name:{
        type:String,
        required:true
    },
    email:{
        type:String,
        required:true
    },
    photo:{
        type:String,
    },
    subscription: {
        type: String,
        enum: ['free', 'pro', 'max'],
        default: 'free',
        index: true
    },
} , {timestamps : true});

const User = mongoose.model('user' , UserShema);

export default User;
