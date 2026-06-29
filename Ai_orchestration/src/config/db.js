import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const connectToDb = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error("MONGO_URI environment variable is not defined");
    }
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB for AI service");
  } catch (err) {
    console.error("Error occurred in connecting to the AI database:- ", err.message);
    throw err;
  }
};

export default connectToDb;
