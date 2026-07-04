import mongoose from 'mongoose';
import Credit, { AGENT_TYPES, CREDIT_COMPANIES, SUBSCRIPTION_TIERS } from '../models/credit.model.js';
import User from '../models/user.model.js';

const FREE_CREDITS_PER_COMPANY = 20;
const TOKENS_PER_CREDIT = Number(process.env.TOKENS_PER_AI_CREDIT || 1000);
const BILLING_CENTS_PER_1K_TOKENS = Number(process.env.AI_BILLING_CENTS_PER_1K_TOKENS || 2);

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

const getUserSubscription = async (userId, tokenSubscription) => {
    const subscriptionFromToken = normalizeSubscription(tokenSubscription);
    if (subscriptionFromToken) return subscriptionFromToken;

    const user = await User.findById(userId).select('subscription');
    return user?.subscription || 'free';
};

const ensureCreditDocument = async (userId, tokenSubscription) => {
    validateObjectId(userId);
    const subscription = await getUserSubscription(userId, tokenSubscription);
    let credit = await Credit.findOne({ userId });

    if (!credit) {
        credit = await Credit.create({ userId, subscription });
    } else if (credit.subscription !== subscription) {
        credit.subscription = subscription;
        await credit.save();
    }

    if (!credit.billing) {
        credit.billing = {};
    }
    if (!credit.billing.currency) credit.billing.currency = 'USD';
    if (!credit.billing.currentPeriodStart) credit.billing.currentPeriodStart = new Date();
    if (!credit.billing.currentPeriodEnd) {
        const periodEnd = new Date();
        periodEnd.setMonth(periodEnd.getMonth() + 1);
        credit.billing.currentPeriodEnd = periodEnd;
    }
    if (credit.billing.unbilledCents === undefined) credit.billing.unbilledCents = 0;
    if (credit.billing.lifetimeCents === undefined) credit.billing.lifetimeCents = 0;

    CREDIT_COMPANIES
        .filter((company) => company !== 'unknown')
        .forEach((company) => {
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

    return {
        ...credit.toObject(),
        credits: legacyCredits,
        freeCreditsPerCompany: FREE_CREDITS_PER_COMPANY,
        tokensPerCredit: TOKENS_PER_CREDIT,
        billingRate: {
            centsPer1kTokens: BILLING_CENTS_PER_1K_TOKENS,
            currency: credit.billing?.currency || 'USD'
        }
    };
};

export const getCreditController = async (req, res, next) => {
    try {
        const userId = req.user.id;
        if (!userId) {
            return res.status(400).json({
                status: 'error',
                message: 'User ID is missing from session'
            });
        }

        const credit = await ensureCreditDocument(userId, req.user.subscription);

        res.status(200).json({
            status: 'success',
            credit: serializeCredit(credit)
        });
    } catch (err) {
        next(err);
    }
};

export const checkCreditController = async (req, res, next) => {
    try {
        const userId = req.user.id;
        if (!userId) {
            return res.status(400).json({
                status: 'error',
                message: 'User ID is missing from session'
            });
        }

        const company = normalizeCompany(req.query.company || req.query.provider);
        const credit = await ensureCreditDocument(userId, req.user.subscription);
        const subscription = credit.subscription || 'free';
        const bucket = credit.ensureProviderBucket(company);
        const isMeteredPlan = subscription === 'pro' || subscription === 'max';
        const hasCredit = isMeteredPlan || bucket.creditsRemaining > 0;

        await credit.save();

        res.status(200).json({
            status: 'success',
            hasCredit,
            subscription,
            company,
            credits: bucket.creditsRemaining,
            providerCredits: credit.providerCredits,
            billable: isMeteredPlan
        });
    } catch (err) {
        next(err);
    }
};

export const updateCreditController = async (req, res, next) => {
    try {
        const {
            userId,
            company,
            provider,
            modelId = '',
            agentType = 'unknown',
            projectId = '',
            requestId = '',
            promptTokens = 0,
            completionTokens = 0,
            totalTokens: totalTokensInput
        } = req.body;

        if (!userId) {
            return res.status(400).json({
                status: 'error',
                message: 'User ID is required for credit updates'
            });
        }

        validateObjectId(userId);

        if (req.user?.id && String(req.user.id) !== String(userId)) {
            return res.status(403).json({
                status: 'error',
                message: 'Cannot update credit usage for another user'
            });
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
                message: 'totalTokens cannot be less than promptTokens + completionTokens'
            });
        }

        const credit = await ensureCreditDocument(userId, req.user.subscription);
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
            billableCents
        });
        credit.trimUsageEvents();

        await credit.save();

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
                totalTokens: totalTokenCount
            }
        });
    } catch (err) {
        next(err);
    }
};
