import mongoose from 'mongoose';
import Credit, { AGENT_TYPES, CREDIT_COMPANIES, SUBSCRIPTION_TIERS } from '../models/credit.model.js';
import Transaction from '../models/transaction.model.js';
import UsageEvent from '../models/usage-event.model.js';
import Account from '../models/account.model.js';
import { Subscription } from '../models/subscription.model.js';
import { getPublicPackages } from '../config/packages.config.js';
import { getTierConfig, getWindowConfig } from '../config/subscription.config.js';

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
    const accountObjId = new mongoose.Types.ObjectId(userId);

    // ── Guarantee Account exists in MongoDB for this user ─────────────────
    await Account.findOneAndUpdate(
        { $or: [{ user_id: accountObjId }, { _id: accountObjId }] },
        {
            $setOnInsert: {
                _id: accountObjId,
                user_id: accountObjId,
                subscription_status: tokenSubscription || 'free',
                is_active: true,
            }
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    ).catch(() => {});

    let credit = await Credit.findOne({
        $or: [{ userId: accountObjId }, { accountId: accountObjId }],
    });

    // ── Resolve true active tier across Subscription, Account, and claims ───
    const [activeSub, activeAccount] = await Promise.all([
        Subscription.findOne({ $or: [{ accountId: accountObjId }, { userId: accountObjId }] }).lean().catch(() => null),
        Account.findOne({ $or: [{ user_id: accountObjId }, { _id: accountObjId }] }).lean().catch(() => null),
    ]);

    const trueActiveTier = activeSub?.activeTier || activeAccount?.subscription_status || normalizeSubscription(tokenSubscription) || 'free';

    if (!credit) {
        credit = await Credit.create({
            userId: accountObjId,
            accountId: accountObjId,
            subscription: trueActiveTier,
        });
    } else {
        let changed = false;
        if (!credit.accountId) {
            credit.accountId = accountObjId;
            changed = true;
        }
        if (credit.subscription !== trueActiveTier) {
            credit.subscription = trueActiveTier;
            changed = true;
        }
        if (changed) {
            await credit.save().catch(() => {});
        }
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

const serializeCredit = (credit, account) => {
    const legacyCredits = credit.providerCredits.reduce((sum, bucket) => {
        if (bucket.company === 'unknown') return sum;
        return sum + Number(bucket.creditsRemaining || 0);
    }, 0);

    const tierConfig    = getTierConfig(credit.subscription);
    const windowCfg     = getWindowConfig(credit.subscription);

    // Use live Account window balance if available, otherwise fall back to config total
    const windowCreditsTotal     = account?.windowCreditsTotal     ?? windowCfg.windowCredits;
    const windowCreditsRemaining = account?.windowCreditsRemaining ?? windowCfg.windowCredits;
    const windowRefillAt         = account?.windowRefillAt         ?? null;
    const windowExhaustedAt      = account?.windowExhaustedAt      ?? null;

    return {
        ...credit.toObject(),
        credits: legacyCredits,
        windowCreditsTotal,
        windowCreditsRemaining,
        windowRefillAt,
        windowExhaustedAt,
        canQuery: windowCreditsRemaining >= windowCfg.creditLowerLimit,
        tokensPerCredit: TOKENS_PER_CREDIT,
        tierConfig: {
            id: tierConfig.id,
            label: tierConfig.label,
            billing: tierConfig.billing,
            dailyTokenCap: tierConfig.dailyTokenCap,
            monthlyTokenCap: tierConfig.monthlyTokenCap,
            requestsPerMinute: tierConfig.requestsPerMinute,
            features: tierConfig.features,
            windowCredits: windowCfg.windowCredits,
            windowHours: windowCfg.windowHours,
            creditLowerLimit: windowCfg.creditLowerLimit,
        },
        billingRate: {
            centsPer1kTokens: BILLING_CENTS_PER_1K_TOKENS,
            currency: credit.billing?.currency || 'INR',
        },
    };
};

// ── Controllers ──────────────────────────────────────────────────────────────

/**
 * GET /api/payments/credit
 * Returns the current credit balance, usage stats, and billing config for the user.
 */
export const getCreditController = async (req, res, next) => {
    try {
        const accountId = req.accountId || req.user?.id || req.user?._id;
        if (!accountId) {
            return res.status(400).json({ status: 'error', message: 'Account ID is missing from session' });
        }

        const [credit, account] = await Promise.all([
            ensureCreditDocument(accountId, req.user?.subscription),
            Account.findOne({
                $or: [{ _id: new mongoose.Types.ObjectId(accountId) }, { user_id: new mongoose.Types.ObjectId(accountId) }],
            }).lean(),
        ]);

        res.status(200).json({
            status: 'success',
            credit: serializeCredit(credit, account),
        });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/payments/credit/check
 * Pre-flight check: can this user make an AI query right now?
 * Returns { canQuery, creditsRemaining, windowCreditsTotal, nextRefillAt, timeUntilRefillMs }.
 * Called by AI Orchestration before forwarding a prompt, and by the frontend to gate the Send button.
 */
export const checkCreditController = async (req, res, next) => {
    try {
        const accountId = req.accountId || req.user?.id || req.user?._id;
        if (!accountId) {
            return res.status(400).json({ status: 'error', message: 'Account ID is missing from session' });
        }

        const accountObjId = new mongoose.Types.ObjectId(accountId);

        // Fetch Account (window gate) and Credit (tier + analytics) in parallel
        const [account, credit] = await Promise.all([
            Account.findOne({ $or: [{ _id: accountObjId }, { user_id: accountObjId }] }).lean(),
            ensureCreditDocument(accountId),
        ]);

        const subscription = credit?.subscription || 'free';
        const windowCfg    = getWindowConfig(subscription);

        // Hydrate window fields if missing (account existed before this feature)
        let windowCreditsRemaining = account?.windowCreditsRemaining ?? windowCfg.windowCredits;
        let windowCreditsTotal     = account?.windowCreditsTotal     ?? windowCfg.windowCredits;
        let windowRefillAt         = account?.windowRefillAt         ?? null;
        let windowExhaustedAt      = account?.windowExhaustedAt      ?? null;

        const canQuery = windowCreditsRemaining >= windowCfg.creditLowerLimit;

        const now               = Date.now();
        const timeUntilRefillMs = windowRefillAt
            ? Math.max(0, new Date(windowRefillAt).getTime() - now)
            : null;

        return res.status(200).json({
            status: 'success',
            canQuery,
            hasCredit: canQuery,
            subscription,
            creditsRemaining:    windowCreditsRemaining,
            windowCreditsTotal,
            creditLowerLimit:    windowCfg.creditLowerLimit,
            nextRefillAt:        windowRefillAt,
            windowExhaustedAt,
            timeUntilRefillMs,
        });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/payments/credit/update
 * Records AI token usage, deducts credits, and creates standalone UsageEvent & Transaction records.
 * Called by Ai_orchestration after each successful AI response.
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
            chatId,
            promptTokens = 0,
            completionTokens = 0,
            totalTokens: totalTokensInput,
        } = req.body;

        const accountId = bodyUserId || req.accountId || req.user?.id || req.user?._id;

        if (!accountId) {
            return res.status(400).json({ status: 'error', message: 'Account ID is required for credit updates' });
        }

        validateObjectId(accountId);
        const accountObjId = new mongoose.Types.ObjectId(accountId);

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

        const credit = await ensureCreditDocument(accountObjId);
        const subscription = credit.subscription || 'free';
        const bucket = credit.ensureProviderBucket(normalizedCompany);

        const creditsDeducted = calculateCredits(totalTokenCount);
        const billableCents   = subscription === 'free' ? 0 : calculateBillableCents(totalTokenCount);

        // ── Deduct from per-provider bucket (analytics + legacy free metering) ──
        if (subscription === 'free') {
            bucket.creditsRemaining = Math.max(0, Number(bucket.creditsRemaining || 0) - creditsDeducted);
        } else {
            bucket.billableTokens += totalTokenCount;
            bucket.billableCents  += billableCents;
            credit.billing.unbilledCents += billableCents;
            credit.billing.lifetimeCents += billableCents;
        }

        bucket.promptTokens     += promptTokenCount;
        bucket.completionTokens += completionTokenCount;
        bucket.totalTokens      += totalTokenCount;
        bucket.requestCount     += 1;
        bucket.lastUsedAt        = new Date();

        credit.promptTokens     += promptTokenCount;
        credit.completionTokens += completionTokenCount;
        credit.totalTokens      += totalTokenCount;

        credit.usageEvents.push({
            company: normalizedCompany,
            modelId,
            agentType: normalizedAgentType,
            projectId,
            requestId,
            subscription,
            promptTokens:     promptTokenCount,
            completionTokens: completionTokenCount,
            totalTokens:      totalTokenCount,
            creditsDeducted,
            billableCents,
        });

        credit.trimUsageEvents();
        await credit.save();

        // ── Decrement window balance on Account (atomic, non-blocking) ────────
        const windowCfg   = getWindowConfig(subscription);
        const LOWER_LIMIT = windowCfg.creditLowerLimit;
        const WINDOW_MS   = windowCfg.windowHours * 60 * 60 * 1000;
        const now         = new Date();

        // Fetch current window state
        const account = await Account.findOne({ $or: [{ _id: accountObjId }, { user_id: accountObjId }] });
        if (account) {
            // Hydrate missing window fields (accounts created before this feature)
            if (account.windowCreditsRemaining === undefined || account.windowCreditsRemaining === null) {
                account.windowCreditsRemaining = windowCfg.windowCredits;
                account.windowCreditsTotal     = windowCfg.windowCredits;
            }
            const prevRemaining = account.windowCreditsRemaining;
            account.windowCreditsRemaining = Math.max(0, prevRemaining - creditsDeducted);

            // Stamp exhaustion timestamps the moment we cross the lower limit
            if (prevRemaining >= LOWER_LIMIT && account.windowCreditsRemaining < LOWER_LIMIT) {
                account.windowExhaustedAt = now;
                account.windowRefillAt    = new Date(now.getTime() + WINDOW_MS);
                console.log(
                    `[credit.controller] Window exhausted for account=${accountObjId}, ` +
                    `refillAt=${account.windowRefillAt.toISOString()}`
                );
            }
            await account.save();
        }

        // ── Create document in standalone UsageEvent collection for AI request explorer ──
        const validChatId = chatId && mongoose.Types.ObjectId.isValid(chatId)
            ? new mongoose.Types.ObjectId(chatId)
            : (normalizedAgentType === 'codingAgent' || normalizedAgentType === 'appAgent' ? new mongoose.Types.ObjectId() : undefined);

        await UsageEvent.create({
            accountId: accountObjId,
            company: normalizedCompany,
            modelId,
            agentType: normalizedAgentType,
            projectId,
            requestId: requestId || `req_${Date.now().toString(36)}`,
            chatId: validChatId,
            promptTokens: promptTokenCount,
            completionTokens: completionTokenCount,
            totalTokens: totalTokenCount,
            creditsDeducted,
            creditSource: 'main',
            billableCents,
        });

        // ── Write lightweight usage ledger entry (skip if 0 tokens — no-op calls) ──
        if (totalTokenCount > 0) {
            await Transaction.create({
                accountId: accountObjId,
                userId: accountObjId,
                type: 'USAGE_DEDUCTION',
                amountPaise: Math.round(billableCents),
                creditsDelta: -creditsDeducted,
                tokensConsumed: totalTokenCount,
                status: 'SUCCESS',
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
            credit: serializeCredit(credit, account?.toObject ? account.toObject() : account),
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
 */
export const updateSubscriptionController = async (req, res, next) => {
    try {
        const accountId = req.accountId || req.user?.id || req.user?._id;
        const { subscription } = req.body;

        if (!accountId) {
            return res.status(400).json({ status: 'error', message: 'Account ID is missing from session' });
        }

        const normalizedSub = normalizeSubscription(subscription);
        if (!normalizedSub) {
            return res.status(400).json({
                status: 'error',
                message: 'subscription must be one of: free, pro, max',
            });
        }

        const accountObjId = new mongoose.Types.ObjectId(accountId);
        const existingCredit = await Credit.findOne({ $or: [{ userId: accountObjId }, { accountId: accountObjId }] });
        const previousTier = existingCredit?.subscription || 'free';

        const credit = await Credit.findOneAndUpdate(
            { $or: [{ userId: accountObjId }, { accountId: accountObjId }] },
            { subscription: normalizedSub, accountId: accountObjId },
            { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, runValidators: true }
        );

        if (previousTier !== normalizedSub) {
            await Transaction.create({
                accountId: accountObjId,
                userId: accountObjId,
                type: 'SUBSCRIPTION_CHANGE',
                amountPaise: 0,
                creditsDelta: 0,
                status: 'SUCCESS',
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
 * GET /api/payments/credit/transactions
 * Returns paginated transaction history matching accountId.
 */
export const getTransactionsController = async (req, res, next) => {
    try {
        const accountId = req.accountId || req.user?.id || req.user?._id;
        if (!accountId) {
            return res.status(400).json({ status: 'error', message: 'Account ID is missing from session' });
        }

        const accountObjId = new mongoose.Types.ObjectId(accountId);
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        
        const query = {
            $or: [{ accountId: accountObjId }, { userId: accountObjId }],
        };
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
            pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
            transactions,
        });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/payments/credit/transactions/summary
 * Returns aggregated spending totals & real financial metrics.
 */
export const getTransactionSummaryController = async (req, res, next) => {
    try {
        const accountId = req.accountId || req.user?.id || req.user?._id;
        if (!accountId) {
            return res.status(400).json({ status: 'error', message: 'Account ID is missing from session' });
        }

        const accountObjId = new mongoose.Types.ObjectId(accountId);

        const [purchaseSummary, usageSummary, credit] = await Promise.all([
            Transaction.aggregate([
                {
                    $match: {
                        $or: [{ accountId: accountObjId }, { userId: accountObjId }],
                        status: 'SUCCESS',
                        amountPaise: { $gt: 0 },
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalSpentINR: { $sum: { $divide: ['$amountPaise', 100] } },
                        totalTransactions: { $sum: 1 },
                    },
                },
            ]),
            Transaction.aggregate([
                {
                    $match: {
                        $or: [{ accountId: accountObjId }, { userId: accountObjId }],
                        type: 'USAGE_DEDUCTION',
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalTokensConsumed: { $sum: '$tokensConsumed' },
                        totalBillablePaise: { $sum: '$amountPaise' },
                        totalRequests: { $sum: 1 },
                    },
                },
            ]),
            Credit.findOne({ $or: [{ userId: accountObjId }, { accountId: accountObjId }] }).lean(),
        ]);

        const purchase = purchaseSummary[0] || { totalSpentINR: 0, totalTransactions: 0 };
        const usage = usageSummary[0] || { totalTokensConsumed: 0, totalBillablePaise: 0, totalRequests: 0 };

        res.status(200).json({
            status: 'success',
            summary: {
                totalSpentINR: purchase.totalSpentINR,
                totalPurchases: purchase.totalTransactions,
                totalTokensConsumed: usage.totalTokensConsumed || credit?.totalTokens || 0,
                totalAIRequests: usage.totalRequests,
                totalBillableINR: (usage.totalBillablePaise || 0) / 100,
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
 * GET /api/payments/credit/analytics
 * Returns aggregated token usage broken down by provider and time window.
 */
export const getAnalyticsController = async (req, res, next) => {
    try {
        const accountId = req.accountId || req.user?.id || req.user?._id;
        if (!accountId) {
            return res.status(400).json({ status: 'error', message: 'Account ID is missing from session' });
        }

        const accountObjId = new mongoose.Types.ObjectId(accountId);
        const credit = await Credit.findOne({ $or: [{ userId: accountObjId }, { accountId: accountObjId }] });
        if (!credit) {
            return res.status(200).json({
                status: 'success',
                analytics: { byProvider: [], recentEvents: [], totals: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } },
            });
        }

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

        const recentEvents = [...credit.usageEvents]
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 30);

        const byAgent = {};
        credit.usageEvents.forEach(e => {
            const agentKey = e.agentType || 'unknown';
            if (!byAgent[agentKey]) byAgent[agentKey] = { totalTokens: 0, requestCount: 0 };
            byAgent[agentKey].totalTokens += e.totalTokens;
            byAgent[agentKey].requestCount += 1;
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
 * GET /api/payments/credit/packages
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
