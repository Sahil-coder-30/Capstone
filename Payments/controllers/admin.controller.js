import mongoose from 'mongoose';
import Credit from '../models/credit.model.js';
import Transaction from '../models/transaction.model.js';
import { adminGrantCredits, adminResetCredits } from '../services/credit.service.js';
import { getAdminPackages } from '../config/packages.config.js';
import { SUBSCRIPTION_TIERS } from '../config/subscription.config.js';

/**
 * POST /api/payments/admin/grant
 *
 * Manually grant credits to a user.
 * Writes an immutable ADMIN_GRANT ledger entry.
 *
 * Body: { userId, company, creditsToGrant, note? }
 * company can be a specific provider name or "all" to grant to all providers.
 */
export const grantCreditsController = async (req, res, next) => {
    try {
        const { userId, company = 'all', creditsToGrant, note } = req.body;
        const adminId = req.user?.id;

        if (!userId || !creditsToGrant) {
            return res.status(400).json({
                status: 'error',
                message: 'userId and creditsToGrant are required',
            });
        }

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                status: 'error',
                message: 'userId must be a valid ObjectId',
            });
        }

        const credits = Number(creditsToGrant);
        if (!Number.isFinite(credits) || credits <= 0) {
            return res.status(400).json({
                status: 'error',
                message: 'creditsToGrant must be a positive number',
            });
        }

        const result = await adminGrantCredits({
            userId,
            company,
            creditsToGrant: credits,
            adminId,
            note,
        });

        const updatedCredit = await Credit.findOne({ userId });

        res.status(200).json({
            status: 'success',
            message: `${credits} credits granted to user ${userId} for ${company}`,
            grantedTo: result.grantedTo,
            creditsGranted: result.creditsGranted,
            credit: updatedCredit,
        });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/payments/admin/reset
 *
 * Reset a user's provider credit buckets to default values (20 per provider).
 * Writes an immutable RESET ledger entry.
 *
 * Body: { userId, note? }
 */
export const resetCreditsController = async (req, res, next) => {
    try {
        const { userId, note } = req.body;
        const adminId = req.user?.id;

        if (!userId) {
            return res.status(400).json({
                status: 'error',
                message: 'userId is required',
            });
        }

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                status: 'error',
                message: 'userId must be a valid ObjectId',
            });
        }

        const result = await adminResetCredits({ userId, adminId, note });
        const updatedCredit = await Credit.findOne({ userId });

        res.status(200).json({
            status: 'success',
            message: result.message,
            credit: updatedCredit,
        });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/payments/admin/users
 *
 * Returns a paginated snapshot of all users' credit documents.
 * Includes subscription tier, token totals, and billing data.
 *
 * Query params:
 *   page (default: 1)
 *   limit (default: 20, max: 100)
 *   tier (filter by subscription tier: free | pro | max)
 */
export const listUsersController = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const tierFilter = req.query.tier;

        const query = {};
        if (tierFilter && ['free', 'pro', 'max'].includes(tierFilter)) {
            query.subscription = tierFilter;
        }

        const [credits, total] = await Promise.all([
            Credit.find(query)
                .sort({ updatedAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Credit.countDocuments(query),
        ]);

        // Tier distribution summary
        const tierCounts = await Credit.aggregate([
            { $group: { _id: '$subscription', count: { $sum: 1 } } },
        ]);

        const distribution = { free: 0, pro: 0, max: 0 };
        tierCounts.forEach(t => { if (t._id) distribution[t._id] = t.count; });

        res.status(200).json({
            status: 'success',
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
            distribution,
            users: credits,
        });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/payments/admin/transactions
 *
 * Returns a paginated list of all transactions across all users.
 * Useful for financial auditing and reconciliation.
 *
 * Query params:
 *   page, limit, type, status, userId
 */
export const listAllTransactionsController = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

        const query = {};
        if (req.query.type) query.type = req.query.type;
        if (req.query.status) query.status = req.query.status;
        if (req.query.userId && mongoose.Types.ObjectId.isValid(req.query.userId)) {
            query.userId = req.query.userId;
        }

        const [transactions, total] = await Promise.all([
            Transaction.find(query)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Transaction.countDocuments(query),
        ]);

        // Aggregate revenue summary
        const revenueSummary = await Transaction.aggregate([
            { $match: { type: 'CREDIT_PURCHASE', status: 'SUCCESS' } },
            {
                $group: {
                    _id: null,
                    totalRevenuePaise: { $sum: '$amountPaise' },
                    totalTransactions: { $sum: 1 },
                },
            },
        ]);

        const revenueData = revenueSummary[0] || { totalRevenuePaise: 0, totalTransactions: 0 };

        res.status(200).json({
            status: 'success',
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
            revenue: {
                totalRevenueINR: revenueData.totalRevenuePaise / 100,
                totalTransactions: revenueData.totalTransactions,
            },
            transactions,
        });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/payments/admin/packages
 *
 * Returns all subscription packages including internal cost breakdown and margins.
 * Admin-only view (public view strips this data).
 */
export const listPackagesAdminController = async (req, res, next) => {
    try {
        const packages = getAdminPackages();
        const tiers = Object.values(SUBSCRIPTION_TIERS);

        res.status(200).json({
            status: 'success',
            packages,
            tiers,
        });
    } catch (err) {
        next(err);
    }
};
