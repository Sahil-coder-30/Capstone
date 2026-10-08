import express from 'express';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { createExpressErrorHandler } from 'faultkit/express';
import { logger, NotFoundError } from 'faultkit';
import creditRouter from '../routes/credit.routes.js';
import adminRouter from '../routes/admin.routes.js';
import paymentRouter from '../routes/payments.routes.js';

const app = express();

// ── Core Middleware ───────────────────────────────────────────────────────────
app.use(express.json({
    verify: (req, _res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(cookieParser());
app.use(morgan('dev'));

// ── Routes ────────────────────────────────────────────────────────────────────

// Credit, token tracking, subscription, analytics, packages
// /api/payments/credit/*
app.use('/api/payments/credit', creditRouter);

// Admin-only: user management, grant/reset credits, full transaction audit
// /api/payments/admin/*
app.use('/api/payments/admin', adminRouter);

app.use('/api/payments', paymentRouter);

// ── Health Probes ─────────────────────────────────────────────────────────────
app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'payments', message: 'Payment service is healthy' });
});

app.get('/readyz', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'payments', message: 'Payment service is ready' });
});

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((req, _res, next) => {
    next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
});

// ── Global Error Handler (FaultKit) ──────────────────────────────────────────
// Framework-agnostic, OpenAPI-compliant error response contract:
// { success: false, error: { code, message, details, requestId } }
app.use(createExpressErrorHandler({
    logger,
    genericServerErrorMessage: 'An unexpected error occurred in Payments service.',
    includeStackInLog: process.env.NODE_ENV !== 'production',
    includeRequestId: true,
}));

export default app;