import app from './src/app/app.js';

const PORT = process.env.PORT || 3000;


app.listen(PORT, () => {
    console.log(`Sandbox API is running on port ${PORT}`);
});