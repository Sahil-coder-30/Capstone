import 'dotenv/config';
import app from './app/app.js';
import { connectToDb } from './config/db.js';
import { initCronJobs } from './services/cron.service.js';

const PORT = process.env.PORT || 5002;

app.listen(PORT, async () => {
    try {
        await connectToDb();
        console.log(`[Payments Service] Server is listening on port ${PORT}`);
        initCronJobs();
    } catch (err) {
        console.error('[Payments Service] Failed during startup:', err.message);
    }
});