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
} , {timestamps : true});

const User = mongoose.model('user' , UserShema);

export default User;