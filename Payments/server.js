import dotenv from 'dotenv'
import app from "./app/app.js";
import { connectToDb } from "./config/db.js";

dotenv.config();

const PORT= process.env.PORT || 5051;




app.listen(PORT ,async ()=>{
    await connectToDb();
    console.log(`Server is running on port ${PORT}`);
})