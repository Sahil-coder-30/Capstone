import express from 'express';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
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
app.use((_req, res) => {
    res.status(404).json({ status: 'error', message: 'Route not found' });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
// Must have 4 parameters — Express identifies this as an error-handling middleware
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
    const statusCode = err.statusCode || err.status || 500;
    const message = err.message || 'Internal server error';

    console.error(`[Payments Error] ${statusCode} — ${message}`, err.stack || '');

    res.status(statusCode).json({
        status: 'error',
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
});

export default app;