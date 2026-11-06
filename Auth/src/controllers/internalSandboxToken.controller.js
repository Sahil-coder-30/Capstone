import mongoose from 'mongoose';
import User from '../models/user.model.js';
import { signSandboxToken } from '../utils/generateTokens.js';

const SANDBOX_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
const SCOPES = new Set(['read', 'write', 'exec']);
const DEFAULT_TTL_SECONDS = 10 * 60;
const MAX_TTL_SECONDS = 15 * 60;

/**
 * POST /internal/sandbox-token  { userId, sandboxId, scopes, ttlSeconds? }
 * For the sandbox router only: it has already checked the user's MCP token
 * and needs a short-lived, scoped sandbox token to forward to the sidecar.
 * The token never reaches the external agent.
 */
export const internalSandboxTokenController = async (req, res, next) => {
    try {
        const { userId, sandboxId, scopes, ttlSeconds = DEFAULT_TTL_SECONDS } = req.body || {};

        if (typeof userId !== 'string' || !mongoose.isValidObjectId(userId)) {
            return res.status(400).json({ status: 'error', message: 'A valid userId is required' });
        }
        if (typeof sandboxId !== 'string' || !SANDBOX_ID_PATTERN.test(sandboxId)) {
            return res.status(400).json({ status: 'error', message: 'A valid sandboxId is required' });
        }
        if (!Array.isArray(scopes) || scopes.length === 0 || !scopes.every((s) => SCOPES.has(s))) {
            return res.status(400).json({ status: 'error', message: 'scopes must be a non-empty list of read, write, exec' });
        }
        const ttl = Number(ttlSeconds);
        if (!Number.isInteger(ttl) || ttl < 60 || ttl > MAX_TTL_SECONDS) {
            return res.status(400).json({ status: 'error', message: `ttlSeconds must be 60..${MAX_TTL_SECONDS}` });
        }
        if (!(await User.exists({ _id: userId }))) {
            return res.status(404).json({ status: 'error', message: 'User not found' });
        }

        res.status(200).json({
            status: 'success',
            token: signSandboxToken({ userId, sandboxId, scopes: [...new Set(scopes)], ttlSeconds: ttl }),
            expiresIn: ttl,
        });
    } catch (err) {
        next(err);
    }
};
