import app from "./src/app/app.js";
import dotenv from 'dotenv';
import connectToDb from "./src/config/db.js";
dotenv.config();

const PORT = process.env.PORT || 3000;

app.listen(PORT , async () =>{
    await connectToDb();
    console.log(`Server is running on port ${PORT}`);
});

