/**
 * Credit Ledger Middleware — AI Orchestration Service
 *
 * Pre-flight quota gate that calls the Payments microservice to verify the user's
 * live credit balance and window quota before initiating costly model orchestration.
 *
 * Positioned in pipeline:
 * identifyUser -> aiRateLimiter -> creditLedger -> Controller
 *
 * Uses FaultKit:
 * Throws InsufficientCreditsError (HTTP 402) if quota is depleted, halting
 * request execution before SSE streaming begins.
 */

import axios from "axios";
import { InsufficientCreditsError, UnauthorizedError, logger } from "faultkit";

const PAYMENTS_SERVICE_URL =
  process.env.PAYMENTS_SERVICE_URL ||
  process.env.PAYMENT_SERVICE_URL ||
  "http://localhost:5001";

/**
 * Express middleware: creditLedger
 * Continuously validates and hydrates credit balance from Payments service
 */
export const creditLedger = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.sub;
    const authToken = req.authToken;

    if (!userId || !authToken) {
      throw new UnauthorizedError("Unauthorized: Missing user authentication context for credit ledger");
    }

    // Pro / Max subscriptions with active status may bypass fixed free limits
    const subscription = (req.user?.subscription || "free").toLowerCase();

    // Query Payments service /api/payments/credit/check
    let creditData = null;
    try {
      const response = await axios.get(`${PAYMENTS_SERVICE_URL}/api/payments/credit/check`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Cookie: `token=${authToken}; accessToken=${authToken}`,
          ...(req.headers["x-request-id"] ? { "x-request-id": req.headers["x-request-id"] } : {}),
        },
        timeout: 5000,
      });

      creditData = response.data;
    } catch (apiErr) {
      // If Payments returned an explicit 402 or 403, respect the refusal
      if (apiErr.response?.status === 402) {
        throw new InsufficientCreditsError(
          apiErr.response.data?.error?.message || apiErr.response.data?.message || "Insufficient credits. Please upgrade to continue.",
          apiErr.response.data?.error?.details || { creditsRemaining: 0 }
        );
      }

      // If Payments service is temporarily down, log warning and fail-open with fallback flag
      logger.warn(
        { err: apiErr, userId },
        `[creditLedger] Payments service unreachable (${apiErr.message}). Failing open with fallback credit allowance.`
      );

      creditData = {
        canQuery: true,
        hasCredit: true,
        fallback: true,
        subscription,
      };
    }

    const hasCredit = creditData.canQuery ?? creditData.hasCredit ?? true;

    if (!hasCredit) {
      throw new InsufficientCreditsError(
        `Insufficient AI credits. Your quota has been exhausted. Please upgrade to Pro to continue.`,
        {
          creditsRemaining: creditData.creditsRemaining ?? 0,
          windowCreditsTotal: creditData.windowCreditsTotal,
          timeUntilRefillMs: creditData.timeUntilRefillMs,
          subscription: creditData.subscription || subscription,
        }
      );
    }

    // Attach live credit ledger details to the request for downstream controller usage
    req.creditLedger = {
      canQuery: true,
      hasCredit: true,
      creditsRemaining: creditData.creditsRemaining,
      windowCreditsTotal: creditData.windowCreditsTotal,
      subscription: creditData.subscription || subscription,
      timeUntilRefillMs: creditData.timeUntilRefillMs,
      fallback: Boolean(creditData.fallback),
    };

    next();
  } catch (err) {
    next(err);
  }
};

export default creditLedger;
