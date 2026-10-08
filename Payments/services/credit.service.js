/**
 * Credit Service — Admin Credit Management
 *
 * Handles admin-only write operations that affect user credit balances.
 * Each mutation writes an immutable Transaction document (double-entry ledger).
 *
 * NOTE: Subscription payment processing is handled by subscription.service.js,
 * not here. This file only covers admin grants, resets, and manual operations.
 */

import mongoose from 'mongoose';
import Credit, { CREDIT_COMPANIES } from '../models/credit.model.js';
import Transaction from '../models/transaction.model.js';

const FREE_CREDITS_PER_COMPANY = 20;


/**
 * Admin: Manually grant credits to a user
 *
 * @param {Object} params
 * @param {string} params.userId          - Target user ObjectId string
 * @param {string} params.company         - Provider company ('mistral', 'google', etc.) or 'all'
 * @param {number} params.creditsToGrant  - Number of credits to add
 * @param {string} [params.adminId]       - Admin user ID performing the action
 * @param {string} [params.note]          - Reason / support ticket reference
 */
export async function adminGrantCredits({
    userId,
    company,
    creditsToGrant,
    adminId,
    note = '',
}) {
    if (!userId || !company || !creditsToGrant) {
        throw new Error('[credit.service] userId, company, and creditsToGrant are required');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        let credit = await Credit.findOne({ userId }).session(session);
        if (!credit) {
            credit = new Credit({ userId });
        }

        const grantedTo = [];

        if (company === 'all') {
            CREDIT_COMPANIES.filter(c => c !== 'unknown').forEach(c => {
                const bucket = credit.ensureProviderBucket(c);
                bucket.creditsGranted += creditsToGrant;
                bucket.creditsRemaining += creditsToGrant;
                grantedTo.push(c);
            });
        } else {
            const bucket = credit.ensureProviderBucket(company);
            bucket.creditsGranted += creditsToGrant;
            bucket.creditsRemaining += creditsToGrant;
            grantedTo.push(company);
        }

        await credit.save({ session });

        await Transaction.create(
            [{
                userId,
                type: 'ADMIN_GRANT',
                amountPaise: 0,
                creditsDelta: creditsToGrant,
                status: 'SUCCESS',
                aggregator: 'ADMIN',
                description: `Admin granted ${creditsToGrant} credits (${company})`,
                metadata: { adminId, company, grantedTo, note },
            }],
            { session }
        );

        await session.commitTransaction();
        console.log(`[Credit Service] Admin granted ${creditsToGrant} credits to user ${userId} for ${company}`);
        return { status: 'success', grantedTo, creditsGranted: creditsToGrant };
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
}

/**
 * Admin: Reset a user's provider credit buckets to default values
 *
 * @param {Object} params
 * @param {string} params.userId    - Target user ObjectId string
 * @param {string} [params.adminId] - Admin performing the reset
 * @param {string} [params.note]    - Reason for reset
 */
export async function adminResetCredits({ userId, adminId, note = '' }) {
    if (!userId) throw new Error('[credit.service] userId is required');

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        let credit = await Credit.findOne({ userId }).session(session);
        if (!credit) {
            credit = new Credit({ userId });
        }

        // Reset all provider buckets to default (20 credits each)
        credit.providerCredits = CREDIT_COMPANIES
            .filter(c => c !== 'unknown')
            .map(c => ({
                company: c,
                creditsGranted: FREE_CREDITS_PER_COMPANY,
                creditsRemaining: FREE_CREDITS_PER_COMPANY,
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                billableTokens: 0,
                billableCents: 0,
                requestCount: 0,
            }));

        await credit.save({ session });

        await Transaction.create(
            [{
                userId,
                type: 'RESET',
                amountPaise: 0,
                creditsDelta: FREE_CREDITS_PER_COMPANY * CREDIT_COMPANIES.filter(c => c !== 'unknown').length,
                status: 'SUCCESS',
                aggregator: 'ADMIN',
                description: 'Admin reset all provider credit buckets to default',
                metadata: { adminId, note },
            }],
            { session }
        );

        await session.commitTransaction();
        console.log(`[Credit Service] Admin reset credits for user ${userId}`);
        return { status: 'success', message: 'All provider buckets reset to default' };
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
}
