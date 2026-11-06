import crypto from 'crypto';

/**
 * Guards service-to-service routes under /internal (used by the sandbox
 * router). The ingress only routes /api/*, so these are cluster-internal;
 * the shared INTERNAL_SERVICE_TOKEN is the second lock. Fails closed when unset.
 */
export const requireInternalCaller = (req, res, next) => {
    const expected = process.env.INTERNAL_SERVICE_TOKEN || '';
    const given = String(req.headers['x-internal-token'] || '');
    if (!expected) {
        return res.status(503).json({ status: 'error', message: 'Internal calls are not configured' });
    }
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized internal call' });
    }
    next();
};
