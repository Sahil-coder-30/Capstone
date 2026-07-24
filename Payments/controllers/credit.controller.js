import mongoose from 'mongoose';
import Credit, { AGENT_TYPES, CREDIT_COMPANIES, SUBSCRIPTION_TIERS } from '../models/credit.model.js';
import Transaction from '../models/transaction.model.js';
import { getPublicPackages } from '../config/packages.config.js';
import { getTierConfig } from '../config/subscription.config.js';

// ── Constants ────────────────────────────────────────────────────────────────
const FREE_CREDITS_PER_COMPANY = 20;
const TOKENS_PER_CREDIT = Number(process.env.TOKENS_PER_AI_CREDIT || 1000);
const BILLING_CENTS_PER_1K_TOKENS = Number(process.env.AI_BILLING_CENTS_PER_1K_TOKENS || 2);

// ── Helpers ──────────────────────────────────────────────────────────────────
const normalizeCompany = (company) => {
    const normalized = String(company || '').trim().toLowerCase();
    if (normalized === 'mistralai') return 'mistral';
    if (normalized === 'googleai' || normalized === 'gemini') return 'google';
    if (CREDIT_COMPANIES.includes(normalized)) return normalized;
    return 'unknown';
};

const toNonNegativeInteger = (value, fieldName) => {
    const numberValue = Number(value || 0);
    if (!Number.isFinite(numberValue) || numberValue < 0) {
        throw new Error(`${fieldName} must be a non-negative number`);
    }
    return Math.floor(numberValue);
};

const validateObjectId = (userId) => {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new Error('userId must be a valid ObjectId');
    }
};

const validateAgentType = (agentType) => {
    const normalized = String(agentType || 'unknown').trim();
    return AGENT_TYPES.includes(normalized) ? normalized : 'unknown';
};

const calculateCredits = (totalTokens) => {
    if (!totalTokens) return 0;
    return totalTokens / TOKENS_PER_CREDIT;
};

const calculateBillableCents = (totalTokens) => {
    if (!totalTokens) return 0;
    return Math.ceil((totalTokens / 1000) * BILLING_CENTS_PER_1K_TOKENS);
};

const normalizeSubscription = (subscription) => {
    const normalized = String(subscription || '').trim().toLowerCase();
    return SUBSCRIPTION_TIERS.includes(normalized) ? normalized : null;
};

const ensureCreditDocument = async (userId, tokenSubscription) => {
    validateObjectId(userId);
    let credit = await Credit.findOne({ userId });

    if (!credit) {
        const initialSubscription = normalizeSubscription(tokenSubscription) || 'free';
        credit = await Credit.create({ userId, subscription: initialSubscription });
    }

    // Hydrate billing defaults
    if (!credit.billing) credit.billing = {};
    if (!credit.billing.currency) credit.billing.currency = 'INR';
    if (!credit.billing.currentPeriodStart) credit.billing.currentPeriodStart = new Date();
    if (!credit.billing.currentPeriodEnd) {
        const periodEnd = new Date();
        periodEnd.setMonth(periodEnd.getMonth() + 1);
        credit.billing.currentPeriodEnd = periodEnd;
    }
    if (credit.billing.unbilledCents === undefined) credit.billing.unbilledCents = 0;
    if (credit.billing.lifetimeCents === undefined) credit.billing.lifetimeCents = 0;

    // Hydrate all provider buckets
    CREDIT_COMPANIES
        .filter(company => company !== 'unknown')
        .forEach(company => {
            const bucket = credit.ensureProviderBucket(company);
            if (bucket.creditsGranted === undefined) bucket.creditsGranted = FREE_CREDITS_PER_COMPANY;
            if (bucket.creditsRemaining === undefined) bucket.creditsRemaining = FREE_CREDITS_PER_COMPANY;
            if (bucket.promptTokens === undefined) bucket.promptTokens = 0;
            if (bucket.completionTokens === undefined) bucket.completionTokens = 0;
            if (bucket.totalTokens === undefined) bucket.totalTokens = 0;
            if (bucket.billableTokens === undefined) bucket.billableTokens = 0;
            if (bucket.billableCents === undefined) bucket.billableCents = 0;
            if (bucket.requestCount === undefined) bucket.requestCount = 0;
        });

    await credit.save();
    return credit;
};

const serializeCredit = (credit) => {
    const legacyCredits = credit.providerCredits.reduce((sum, bucket) => {
        if (bucket.company === 'unknown') return sum;
        return sum + Number(bucket.creditsRemaining || 0);
    }, 0);

    const tierConfig = getTierConfig(credit.subscription);

    return {
        ...credit.toObject(),
        credits: legacyCredits,
        freeCreditsPerCompany: FREE_CREDITS_PER_COMPANY,
        tokensPerCredit: TOKENS_PER_CREDIT,
        tierConfig: {
            id: tierConfig.id,
            label: tierConfig.label,
            billing: tierConfig.billing,
            dailyTokenCap: tierConfig.dailyTokenCap,
            monthlyTokenCap: tierConfig.monthlyTokenCap,
            requestsPerMinute: tierConfig.requestsPerMinute,
            features: tierConfig.features,
        },
        billingRate: {
            centsPer1kTokens: BILLING_CENTS_PER_1K_TOKENS,
            currency: credit.billing?.currency || 'INR',
        },
    };
};

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * GET /api/payments/credit
 * Returns the full credit document for the logged-in user,
 * including provider buckets, token totals, billing, and tier config.
 */
export const getCreditController = async (req, res, next) => {
    try {
        const userId = req.user?.id || req.user?._id;
        if (!userId) {
            return res.status(400).json({ status: 'error', message: 'User ID is missing from session' });
        }

        const credit = await ensureCreditDocument(userId);

        res.status(200).json({
            status: 'success',
            credit: serializeCredit(credit),
        });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/payments/credit/check?company=google
 * Checks if the user has sufficient credit for the given AI provider.
 * Used by Ai_orchestration before forwarding a prompt.
 */
export const checkCreditController = async (req, res, next) => {
    try {
        const userId = req.user?.id || req.user?._id;
        if (!userId) {
            return res.status(400).json({ status: 'error', message: 'User ID is missing from session' });
        }

        const company = normalizeCompany(req.query.company || req.query.provider);
        const credit = await ensureCreditDocument(userId);
        const subscription = credit.subscription || 'free';
        const bucket = credit.ensureProviderBucket(company);
        const isMeteredPlan = subscription === 'pro' || subscription === 'max';

        // Metered plan users always have access (billed per usage)
        // Free plan users need remaining credits
        const hasCredit = isMeteredPlan || bucket.creditsRemaining > 0;

        await credit.save();

        res.status(200).json({
            status: 'success',
            hasCredit,
            subscription,
            company,
            credits: bucket.creditsRemaining,
            providerCredits: credit.providerCredits,
            billable: isMeteredPlan,
        });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/payments/credit/update
 * Records AI token usage and deducts credits (free tier) or billable cents (pro/max).
 * Called by Ai_orchestration after each successful AI response.
 *
 * Body: { userId?, company, promptTokens, completionTokens, totalTokens?,
 *          modelId?, agentType?, projectId?, requestId? }
 */
export const updateCreditController = async (req, res, next) => {
    try {
        const {
            userId: bodyUserId,
            company,
            provider,
            modelId = '',
            agentType = 'unknown',
            projectId = '',
            requestId = '',
            promptTokens = 0,
            completionTokens = 0,
            totalTokens: totalTokensInput,
        } = req.body;

        const userId = bodyUserId || req.user?.id || req.user?._id;

        if (!userId) {
            return res.status(400).json({ status: 'error', message: 'User ID is required for credit updates' });
        }

        validateObjectId(userId);

        // Prevent one user from updating another's credits
        if (req.user?.id && String(req.user.id) !== String(userId)) {
            return res.status(403).json({ status: 'error', message: 'Cannot update credit usage for another user' });
        }

        const normalizedCompany = normalizeCompany(company || provider);
        const normalizedAgentType = validateAgentType(agentType);
        const promptTokenCount = toNonNegativeInteger(promptTokens, 'promptTokens');
        const completionTokenCount = toNonNegativeInteger(completionTokens, 'completionTokens');
        const totalTokenCount = totalTokensInput === undefined
            ? promptTokenCount + completionTokenCount
            : toNonNegativeInteger(totalTokensInput, 'totalTokens');

        if (totalTokenCount < promptTokenCount + completionTokenCount) {
            return res.status(400).json({
                status: 'error',
                message: 'totalTokens cannot be less than promptTokens + completionTokens',
            });
        }

        const credit = await ensureCreditDocument(userId);
        const subscription = credit.subscription || 'free';
        const bucket = credit.ensureProviderBucket(normalizedCompany);

        const creditsDeducted = subscription === 'free' ? calculateCredits(totalTokenCount) : 0;
        const billableCents = subscription === 'free' ? 0 : calculateBillableCents(totalTokenCount);

        if (subscription === 'free') {
            bucket.creditsRemaining = Math.max(0, Number(bucket.creditsRemaining || 0) - creditsDeducted);
        } else {
            bucket.billableTokens += totalTokenCount;
            bucket.billableCents += billableCents;
            credit.billing.unbilledCents += billableCents;
            credit.billing.lifetimeCents += billableCents;
        }

        bucket.promptTokens += promptTokenCount;
        bucket.completionTokens += completionTokenCount;
        bucket.totalTokens += totalTokenCount;
        bucket.requestCount += 1;
        bucket.lastUsedAt = new Date();

        credit.promptTokens += promptTokenCount;
        credit.completionTokens += completionTokenCount;
        credit.totalTokens += totalTokenCount;

        credit.usageEvents.push({
            company: normalizedCompany,
            modelId,
            agentType: normalizedAgentType,
            projectId,
            requestId,
            subscription,
            promptTokens: promptTokenCount,
            completionTokens: completionTokenCount,
            totalTokens: totalTokenCount,
            creditsDeducted,
            billableCents,
        });

        credit.trimUsageEvents();
        await credit.save();

        // Write lightweight usage ledger entry (skip if 0 tokens — no-op calls)
        if (totalTokenCount > 0) {
            await Transaction.create({
                userId,
                type: 'USAGE_DEDUCTION',
                amountPaise: Math.round(billableCents),
                creditsDelta: -creditsDeducted,
                tokensConsumed: totalTokenCount,
                status: 'SUCCESS',
                aggregator: 'INTERNAL',
                description: `AI usage: ${totalTokenCount} tokens via ${normalizedCompany} (${normalizedAgentType})`,
                metadata: {
                    company: normalizedCompany,
                    modelId,
                    agentType: normalizedAgentType,
                    projectId,
                    requestId,
                    subscription,
                    promptTokens: promptTokenCount,
                    completionTokens: completionTokenCount,
                },
            });
        }

        res.status(200).json({
            status: 'success',
            message: subscription === 'free'
                ? 'Credits and token usage updated successfully'
                : 'Billable token usage recorded successfully',
            credit: serializeCredit(credit),
            usage: {
                company: normalizedCompany,
                subscription,
                creditsDeducted,
                billableCents,
                totalTokens: totalTokenCount,
            },
        });
    } catch (err) {
        next(err);
    }
};

/**
 * PATCH /api/payments/subscription
 * Upgrades or downgrades the user's subscription tier.
 * Writes an immutable SUBSCRIPTION_CHANGE ledger entry.
 *
 * Body: { subscription: 'free' | 'pro' | 'max' }
 */
export const updateSubscriptionController = async (req, res, next) => {
    try {
        const userId = req.user?.id || req.user?._id;
        const { subscription } = req.body;

        if (!userId) {
            return res.status(400).json({ status: 'error', message: 'User ID is missing from session' });
        }

        const normalizedSub = normalizeSubscription(subscription);
        if (!normalizedSub) {
            return res.status(400).json({
                status: 'error',
                message: 'subscription must be one of: free, pro, max',
            });
        }

        const existingCredit = await Credit.findOne({ userId });
        const previousTier = existingCredit?.subscription || 'free';

        const credit = await Credit.findOneAndUpdate(
            { userId },
            { subscription: normalizedSub },
            { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, runValidators: true }
        );

        // Write ledger entry for tier change
        if (previousTier !== normalizedSub) {
            await Transaction.create({
                userId,
                type: 'SUBSCRIPTION_CHANGE',
                amountPaise: 0,
                creditsDelta: 0,
                status: 'SUCCESS',
                aggregator: 'INTERNAL',
                description: `Subscription changed: ${previousTier} → ${normalizedSub}`,
                metadata: { from: previousTier, to: normalizedSub },
            });
        }

        res.status(200).json({
            status: 'success',
            message: 'Subscription updated successfully',
            subscription: credit.subscription,
            previousTier,
            credit: serializeCredit(credit),
        });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/payments/transactions
 * Returns paginated transaction history for the logged-in user.
 *
 * Query params: page (default:1), limit (default:20, max:50), type
 */
export const getTransactionsController = async (req, res, next) => {
    try {
        const userId = req.user?.id || req.user?._id;
        if (!userId) {
            return res.status(400).json({ status: 'error', message: 'User ID is missing from session' });
        }

        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const query = { userId };
        if (req.query.type) query.type = req.query.type;

        const [transactions, total] = await Promise.all([
            Transaction.find(query)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Transaction.countDocuments(query),
        ]);

        res.status(200).json({
            status: 'success',
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
            transactions,
        });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/payments/transactions/summary
 * Returns aggregated spending stats for the logged-in user.
 */
export const getTransactionSummaryController = async (req, res, next) => {
    try {
        const userId = req.user?.id || req.user?._id;
        if (!userId) {
            return res.status(400).json({ status: 'error', message: 'User ID is missing from session' });
        }

        const [purchaseSummary, usageSummary, credit] = await Promise.all([
            Transaction.aggregate([
                { $match: { userId: new mongoose.Types.ObjectId(userId), type: 'CREDIT_PURCHASE', status: 'SUCCESS' } },
                {
                    $group: {
                        _id: null,
                        totalSpentINR: { $sum: { $divide: ['$amountPaise', 100] } },
                        totalTransactions: { $sum: 1 },
                    },
                },
            ]),
            Transaction.aggregate([
                { $match: { userId: new mongoose.Types.ObjectId(userId), type: 'USAGE_DEDUCTION' } },
                {
                    $group: {
                        _id: null,
                        totalTokensConsumed: { $sum: '$tokensConsumed' },
                        totalBillablePaise: { $sum: '$amountPaise' },
                        totalRequests: { $sum: 1 },
                    },
                },
            ]),
            Credit.findOne({ userId }).lean(),
        ]);

        const purchase = purchaseSummary[0] || { totalSpentINR: 0, totalTransactions: 0 };
        const usage = usageSummary[0] || { totalTokensConsumed: 0, totalBillablePaise: 0, totalRequests: 0 };

        res.status(200).json({
            status: 'success',
            summary: {
                totalSpentINR: purchase.totalSpentINR,
                totalPurchases: purchase.totalTransactions,
                totalTokensConsumed: usage.totalTokensConsumed,
                totalAIRequests: usage.totalRequests,
                totalBillableINR: usage.totalBillablePaise / 100,
                currentSubscription: credit?.subscription || 'free',
                currentPeriodStart: credit?.billing?.currentPeriodStart,
                currentPeriodEnd: credit?.billing?.currentPeriodEnd,
            },
        });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/payments/analytics
 * Returns aggregated token usage broken down by provider and time window.
 * Data is sourced from usageEvents in the Credit document.
 */
export const getAnalyticsController = async (req, res, next) => {
    try {
        const userId = req.user?.id || req.user?._id;
        if (!userId) {
            return res.status(400).json({ status: 'error', message: 'User ID is missing from session' });
        }

        const credit = await Credit.findOne({ userId });
        if (!credit) {
            return res.status(200).json({
                status: 'success',
                analytics: { byProvider: [], recentEvents: [] },
            });
        }

        // Aggregate by provider
        const byProvider = credit.providerCredits
            .filter(b => b.company !== 'unknown')
            .map(b => ({
                company: b.company,
                totalTokens: b.totalTokens,
                promptTokens: b.promptTokens,
                completionTokens: b.completionTokens,
                requestCount: b.requestCount,
                creditsRemaining: b.creditsRemaining,
                creditsGranted: b.creditsGranted,
                billableCents: b.billableCents,
                lastUsedAt: b.lastUsedAt,
            }));

        // Last 30 usage events (most recent first)
        const recentEvents = [...credit.usageEvents]
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 30);

        // Agent type breakdown
        const byAgent = {};
        credit.usageEvents.forEach(e => {
            if (!byAgent[e.agentType]) byAgent[e.agentType] = { totalTokens: 0, requestCount: 0 };
            byAgent[e.agentType].totalTokens += e.totalTokens;
            byAgent[e.agentType].requestCount += 1;
        });

        res.status(200).json({
            status: 'success',
            analytics: {
                totals: {
                    promptTokens: credit.promptTokens,
                    completionTokens: credit.completionTokens,
                    totalTokens: credit.totalTokens,
                },
                byProvider,
                byAgent,
                recentEvents,
            },
        });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/payments/packages
 * Returns all available subscription packages (public — no auth required).
 */
export const getPackagesController = async (req, res, next) => {
    try {
        const packages = getPublicPackages();
        res.status(200).json({
            status: 'success',
            packages,
        });
    } catch (err) {
        next(err);
    }
};
