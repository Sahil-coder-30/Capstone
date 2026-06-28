import mongoose from "mongoose";
import dotenv from 'dotenv';
dotenv.config();

const connectToDb = async ()=>{
    try{
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to Db");
    }catch(err){
        console.log("Error occured in connecting to the Sandbox database:- ", err.message);
        throw err;
    }

}

export default connectToDb;