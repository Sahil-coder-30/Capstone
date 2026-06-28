import dotenv from 'dotenv';
import app from './src/app/app.js';
import connectToDb from './src/config/db.js';
dotenv.config();

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
    await connectToDb();
    console.log(`Sandbox API is running on port ${PORT}`);
});