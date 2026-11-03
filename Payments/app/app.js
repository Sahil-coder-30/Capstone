import express from 'express';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { createExpressErrorHandler } from 'faultkit/express';
import { logger, NotFoundError, ServiceUnavailableError } from 'faultkit';
import creditRouter from '../routes/credit.routes.js';
import paymentsRouter from '../routes/payments.routes.js';
import { checkDbConnection } from '../db/client.js';

const app = express();

// The webhook HMAC is computed over the exact request bytes, so keep them.
// Do not add another body parser before this one.
app.use(express.json({
    limit: '256kb',
    verify: (req, _res, buf) => {
        req.rawBody = buf;
    },
}));
app.use(cookieParser());
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', service: 'payments' });
});

app.get('/readyz', async (_req, res) => {
    try {
        await checkDbConnection();
        res.json({ status: 'ok', service: 'payments', db: 'up' });
    } catch {
        res.status(503).json({ status: 'error', service: 'payments', db: 'down' });
    }
});

app.use('/api/payments/credit', creditRouter);
app.use('/api/payments', paymentsRouter);

app.use((req, _res, next) => {
    next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
});

// FaultKit error contract: { success: false, error: { code, message, details, requestId } }
app.use(createExpressErrorHandler({
    logger,
    genericServerErrorMessage: 'An unexpected error occurred in Payments service.',
    includeStackInLog: process.env.NODE_ENV !== 'production',
    includeRequestId: true,
    errorCoercer: (err) => {
        const status = err?.statusCode || err?.status;
        if (status === 502 || status === 503 || status === 504) {
            return new ServiceUnavailableError(err.error?.description || err.message || 'Payment gateway temporarily unavailable');
        }
    },
}));

export default app;
