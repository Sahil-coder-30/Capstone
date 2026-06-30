import Credit from '../models/credit.model.js';

/**
 * Get credits and token usage for the authenticated user.
 * Auto-provisions with 20 credits if not found.
 */
export const getCreditController = async (req, res, next) => {
    try {
        const userId = req.user.id;
        if (!userId) {
            return res.status(400).json({
                status: 'error',
                message: 'User ID is missing from session'
            });
        }

        let credit = await Credit.findOne({ userId });
        if (!credit) {
            credit = await Credit.create({ userId, credits: 20 });
        }

        res.status(200).json({
            status: 'success',
            credit
        });
    } catch (err) {
        next(err);
    }
};

/**
 * Check if the authenticated user has credits left.
 */
export const checkCreditController = async (req, res, next) => {
    try {
        const userId = req.user.id;
        if (!userId) {
            return res.status(400).json({
                status: 'error',
                message: 'User ID is missing from session'
            });
        }

        let credit = await Credit.findOne({ userId });
        if (!credit) {
            credit = await Credit.create({ userId, credits: 20 });
        }

        const hasCredit = credit.credits > 0;

        res.status(200).json({
            status: 'success',
            hasCredit,
            credits: credit.credits
        });
    } catch (err) {
        next(err);
    }
};

/**
 * Update token usage and deduct credits for a user.
 * (Internal service request, typically called by Ai_orchestration)
 */
export const updateCreditController = async (req, res, next) => {
    try {
        const { userId, promptTokens = 0, completionTokens = 0 } = req.body;

        if (!userId) {
            return res.status(400).json({
                status: 'error',
                message: 'User ID is required for credit updates'
            });
        }

        const totalTokens = promptTokens + completionTokens;
        
        // Calculate credit deduction: 1 credit per 1000 tokens
        const creditsDeducted = totalTokens / 1000;

        let credit = await Credit.findOne({ userId });
        if (!credit) {
            credit = await Credit.create({ userId, credits: 20 });
        }

        credit.credits = Math.max(0, credit.credits - creditsDeducted);
        credit.promptTokens += promptTokens;
        credit.completionTokens += completionTokens;
        credit.totalTokens += totalTokens;

        await credit.save();

        res.status(200).json({
            status: 'success',
            message: 'Credits and token usage updated successfully',
            credit
        });
    } catch (err) {
        next(err);
    }
};
