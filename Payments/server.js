import 'dotenv/config';
import app from './app/app.js';
import { checkDbConnection, closeDb } from './db/client.js';
import redis from './config/redis.js';
import { initCronJobs } from './services/cron.service.js';

const PORT = process.env.PORT || 5002;

async function start() {
    await checkDbConnection();
    console.log('[Payments] Postgres connected');

    // Connect now so the token blacklist works from the first request.
    await redis.connect().catch((err) => {
        console.error('[Payments] Redis connect failed, blacklist checks will be skipped:', err.message);
    });

    const server = app.listen(PORT, () => {
        console.log(`[Payments] Listening on port ${PORT}`);
        initCronJobs();
    });

    const shutdown = async (signal) => {
        console.log(`[Payments] ${signal} received, shutting down`);
        server.close();
        await closeDb().catch(() => {});
        redis.disconnect();
        process.exit(0);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
    console.error('[Payments] Startup failed:', err.message);
    process.exit(1);
});
