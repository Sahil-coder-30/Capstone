/**
 * Rate-Limit Middleware — Token Bucket Credit Gate
 *
 * Place this middleware on any route that calls Gemini or Mistral.
 * It runs BEFORE the request reaches the AI orchestration layer.
 *
 * Behaviour:
 *  - Calls `checkAndConsumeCredit()` to deduct 1 credit from the user's bucket.
 *  - If allowed: attaches `req.creditInfo` and calls `next()`.
 *  - If rate-limited: returns HTTP 429 with a JSON body containing:
 *      - `error`:          human-readable message
 *      - `refillAt`:       ISO timestamp when the bucket will auto-refill (or null)
 *      - `msUntilRefill`:  milliseconds until refill (convenience field for front-end timers)
 *      - `retryAfter`:     seconds until refill (also sent as the Retry-After HTTP header)
 *
 * Usage:
 *   import { creditRateLimit } from '../middleware/rate-limit.middleware.js';
 *
 *   // Protect a single route:
 *   router.post('/chat', creditRateLimit('gemini'), chatController);
 *
 *   // Protect a group of routes:
 *   router.use('/ai', creditRateLimit('mistral'));
 *
 * Prerequisites:
 *  - `req.account` must be populated by identifyUser.middleware.js (it sets req.account._id).
 *  - The `company` param must be 'gemini' or 'mistral'.
 *
 * After the AI call completes, the controller MUST call `settleAIRequest()` from
 * credit.service.js to deduct actual token usage and handle any overdraft.
 * The authorized source is available on `req.creditInfo.authorizedSource`.
 */

import { authorizeAIRequest } from '../services/credit.service.js';

/**
 * Factory that returns an Express middleware bound to a specific AI provider.
 *
 * @param {'gemini'|'mistral'} company - The AI provider for this route group.
 * @returns {Function} Express middleware (req, res, next) => void
 */
export function creditRateLimit(company) {
    if (!company) {
        throw new Error('[rate-limit.middleware] company is required (e.g. "gemini" or "mistral")');
    }

    return async function rateLimitMiddleware(req, res, next) {
        try {
            // ── Resolve account identity ──────────────────────────────────────
            // identifyUser.middleware.js sets req.accountId = Account._id.toString()
            const accountId = req.accountId;

            if (!accountId) {
                return res.status(401).json({
                    error: 'Unauthorised — no account context found. Ensure identifyUser middleware runs first.',
                });
            }

            // ── Phase 1: Authorize (pre-call, no deduction) ───────────────────
            const result = await authorizeAIRequest({ accountId, company });

            if (result.allowed) {
                // Attach credit info for the controller to use in Phase 2 (settle)
                req.creditInfo = {
                    company,
                    authorizedSource: result.source,     // 'main' | 'referral'
                    creditsRemaining: result.creditsRemaining,
                    creditStatus:     result.creditStatus, // 'healthy' | 'low'
                    refillAt:         result.refillAt,
                };
                return next();
            }

            // ── Rate-limited (creditsRemaining < 10) ──────────────────────────
            const retryAfterSeconds = result.msUntilRefill
                ? Math.ceil(result.msUntilRefill / 1000)
                : null;

            const refillMessage = result.refillAt
                ? `Your ${company} credit bucket will auto-refill at ${result.refillAt.toISOString()}.`
                : 'Both your main and referral credit buckets are empty.';

            if (retryAfterSeconds !== null) {
                res.set('Retry-After', retryAfterSeconds);
            }

            return res.status(429).json({
                error:         `Rate limit exceeded for ${company}. ${refillMessage}`,
                company,
                creditStatus:  'critical',
                threshold:     10,
                refillAt:      result.refillAt?.toISOString() ?? null,
                msUntilRefill: result.msUntilRefill ?? null,
                retryAfter:    retryAfterSeconds,
            });

        } catch (err) {
            console.error(`[rate-limit.middleware] Unexpected error for company=${company}:`, err.message);
            // Fail-open: let the request through rather than silently blocking users
            // on infrastructure errors. Remove `next()` below to fail-closed instead.
            return next();
        }
    };
}

/**
 * Convenience — pre-bound middleware instances for the two supported providers.
 *
 * Usage:
 *   import { geminiRateLimit, mistralRateLimit } from '../middleware/rate-limit.middleware.js';
 *   router.post('/gemini/chat', geminiRateLimit, chatController);
 */
export const geminiRateLimit  = creditRateLimit('gemini');
export const mistralRateLimit = creditRateLimit('mistral');
