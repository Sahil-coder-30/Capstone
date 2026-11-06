import crypto from 'crypto';

/**
 * Guards service-to-service routes under /internal. The ingress only routes
 * /api/*, so these are reachable inside the cluster only; the shared
 * INTERNAL_SERVICE_TOKEN is the second lock. Fails closed when it is unset.
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
