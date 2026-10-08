/**
 * UsageEvent Model — Payments Service
 *
 * One document per AI request.
 * The granular per-request audit log — replaces the old embedded `usageEvents`
 * array that caused the Credit document to grow unboundedly.
 *
 * Why a separate collection?
 *   - An active user can accumulate thousands of events. Keeping them embedded
 *     in the Credit document made every credit query fetch the entire history.
 *   - As a separate collection, analytics queries can run independently without
 *     touching the hot-path Credit/ProviderBucket documents.
 *   - Documents here are append-only. They are never mutated after creation.
 *
 * Indexes:
 *   - (accountId, createdAt desc) — paginated per-user history queries.
 *   - (accountId, company, createdAt desc) — per-provider analytics.
 *   - (chatId) sparse — agent-session usage lookup.
 *
 * Source of truth: accountId = Account._id
 */

import mongoose from 'mongoose';
import { CREDIT_COMPANIES, AGENT_TYPES } from './credit.model.js';

const UsageEventSchema = new mongoose.Schema(
    {
        accountId: {
            type:     mongoose.Schema.Types.ObjectId,
            required: true,
            index:    true,
            ref:      'Account',
        },

        /** AI provider that served this request. */
        company: {
            type:     String,
            enum:     CREDIT_COMPANIES,
            required: true,
        },

        /** Specific model used (e.g. 'gemini-1.5-pro', 'mistral-large'). */
        modelId: {
            type:    String,
            default: '',
        },

        /** Which agent type triggered this request. */
        agentType: {
            type:    String,
            enum:    AGENT_TYPES,
            default: 'unknown',
        },

        /** Project context — empty string if not applicable. */
        projectId: {
            type:    String,
            default: '',
        },

        /**
         * Idempotency key from the AI orchestration layer.
         * Used to detect duplicate settle calls and prevent double-counting.
         */
        requestId: {
            type:  String,
            index: true,
        },

        /**
         * Chat/session ID — required for codingAgent and appAgent requests
         * so usage can be traced back to a specific conversation.
         */
        chatId: {
            type:     mongoose.Schema.Types.ObjectId,
            required: function () {
                return this.agentType === 'codingAgent' || this.agentType === 'appAgent';
            },
        },


        // ── Token usage ────────────────────────────────────────────────────────
        promptTokens: {
            type:    Number,
            default: 0,
            min:     0,
        },
        completionTokens: {
            type:    Number,
            default: 0,
            min:     0,
        },
        totalTokens: {
            type:    Number,
            default: 0,
            min:     0,
        },

        // ── Credit & billing ───────────────────────────────────────────────────
        /** Credits deducted from the provider bucket (or referral pool) for this request. */
        creditsDeducted: {
            type:    Number,
            default: 0,
            min:     0,
        },

        /** Which bucket the credits were drawn from. */
        creditSource: {
            type: String,
            enum: ['main', 'referral'],
        },

        /** Billable amount in cents (for metered tiers). 0 for credit-based tiers. */
        billableCents: {
            type:    Number,
            default: 0,
            min:     0,
        },

        /** Whether this event incurred an overdraft on the main bucket. */
        overdraftIncurred: {
            type:    Number,
            default: 0,
            min:     0,
        },
    },
    {
        timestamps: true,
        // Documents are append-only. No updates should ever be made.
    }
);

// ── Indexes ────────────────────────────────────────────────────────────────────
UsageEventSchema.index({ accountId: 1, createdAt: -1 });
UsageEventSchema.index({ accountId: 1, company: 1, createdAt: -1 });
UsageEventSchema.index({ chatId: 1 }, { sparse: true });

const UsageEvent = mongoose.model('usage_event', UsageEventSchema);
export default UsageEvent;
