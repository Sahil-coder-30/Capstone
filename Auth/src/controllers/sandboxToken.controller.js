import redis from '../config/redis.js';
import { SANDBOX_TOKEN_TTL_SECONDS, signSandboxToken } from '../utils/generateTokens.js';

// Same rule as everywhere else a sandbox id is used: one plain DNS label.
const SANDBOX_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
const MAX_PER_MINUTE = 30;

/** Fixed-window counter per user. Fails open if Redis is down. */
const overLimit = async (userId) => {
    try {
        const key = `sandbox-token:rate:${userId}:${Math.floor(Date.now() / 60_000)}`;
        const count = await redis.incr(key);
        if (count === 1) await redis.expire(key, 60);
        return count > MAX_PER_MINUTE;
    } catch {
        return false;
    }
};

/**
 * POST /api/auth/sandbox-token  { sandboxId }
 * Issues a 2-hour token for one sandbox to the signed-in user.
 * Ownership is not checked here: the sandbox sidecar only accepts the token
 * when `sub` is the sandbox owner, so a token for someone else's sandbox is useless.
 */
export const sandboxTokenController = async (req, res, next) => {
    try {
        const { sandboxId } = req.body || {};
        if (typeof sandboxId !== 'string' || !SANDBOX_ID_PATTERN.test(sandboxId)) {
            return res.status(400).json({ status: 'error', message: 'A valid sandboxId is required' });
        }
        if (await overLimit(req.user.id)) {
            return res.status(429).json({ status: 'error', message: 'Too many sandbox token requests. Try again in a minute.' });
        }

        res.status(200).json({
            status: 'success',
            token: signSandboxToken({ userId: req.user.id, sandboxId }),
            expiresIn: SANDBOX_TOKEN_TTL_SECONDS,
        });
    } catch (err) {
        next(err);
    }
};
