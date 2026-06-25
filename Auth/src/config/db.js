import mongoose from 'mongoose';

async function connectToDb (){
    try {
        await mongoose.connect(process.env.MONGO_URI)
        console.log("Connected to MongoDB");
    } catch (error) {
        console.log("Error connection : " , error);
    }
}


export default connectToDb;
