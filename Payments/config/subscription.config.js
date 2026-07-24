/**
 * Subscription Tier Configuration
 *
 * Source of truth for what each subscription tier means:
 * - AI access limits
 * - Billing model
 * - Rate limits
 * - Feature flags
 *
 * Unit economics are sourced from the pricing table (Jul 2026):
 * Pod Compute + AI Tokens + Razorpay 2.36% fee = Total Cost Per User/Month
 */

export const SUBSCRIPTION_TIERS = {
    free: {
        id: 'free',
        label: 'Free',
        description: 'Get started with AI-powered coding, no credit card required.',

        // Pricing
        priceINR: 0,
        pricingModel: 'free',

        // Real unit economics (INR)
        costBreakdown: {
            podComputeINR: 17.47,
            aiTokensINR:   14.02,
            razorpayFeeINR: 0.00,
            totalCostINR:  34.99,   // This is your CAC / loss-leader cost per free user
        },

        // AI Access
        billing: 'credits',         // Deducted from per-provider credit buckets
        creditsPerProvider: 20,     // Initial grant per AI provider (mistral, google, etc.)
        dailyTokenCap: 50_000,      // Hard token cap per day
        monthlyTokenCap: null,      // null = governed by creditsPerProvider

        // Rate limits
        requestsPerMinute: 10,
        requestsPerDay: 100,

        // Features
        features: {
            codingAgent: true,
            copilot: true,
            appAgent: false,
            priorityQueue: false,
            advancedModels: false,
        },
    },

    pro: {
        id: 'pro',
        label: 'Pro',
        description: 'Full AI access with unlimited coding agents and copilot.',

        // Pricing — two price points (early access vs regular)
        priceINR: 499,              // Regular price
        pricingModel: 'monthly',

        // Real unit economics (INR) — using regular pricing
        costBreakdown: {
            podComputeINR:  128.13,
            aiTokensINR:     81.34,
            razorpayFeeINR:  11.78,  // 2.36% of ₹499
            totalCostINR:   233.24,
            chargedINR:     499.00,
            marginINR:      265.76,  // ₹499 - ₹233.24
        },

        earlyAccess: {
            priceINR: 299,
            razorpayFeeINR: 7.06,   // 2.36% of ₹299
            totalCostINR: 228.52,
            chargedINR: 299.00,
            marginINR: 70.48,
        },

        // AI Access
        billing: 'metered',         // Billed per token usage (tracked in billing.unbilledCents)
        creditsPerProvider: null,   // Unlimited — metered billing
        dailyTokenCap: null,        // No hard cap
        monthlyTokenCap: 5_000_000, // 5M tokens/month soft ceiling

        // Rate limits
        requestsPerMinute: 60,
        requestsPerDay: 1_000,

        // Features
        features: {
            codingAgent: true,
            copilot: true,
            appAgent: true,
            priorityQueue: false,
            advancedModels: true,
        },
    },

    max: {
        id: 'max',
        label: 'Max',
        description: 'Maximum AI power. Highest limits, priority queue, all models.',

        // Pricing — two price points (early access vs regular)
        priceINR: 1499,             // Regular price
        pricingModel: 'monthly',

        // Real unit economics (INR) — using regular pricing
        costBreakdown: {
            podComputeINR:  349.44,
            aiTokensINR:    298.74,
            razorpayFeeINR:  35.38,  // 2.36% of ₹1499
            totalCostINR:   711.56,
            chargedINR:    1499.00,
            marginINR:      787.44,  // ₹1499 - ₹711.56
        },

        earlyAccess: {
            priceINR: 999,
            razorpayFeeINR: 23.58,   // 2.36% of ₹999
            totalCostINR: 699.76,
            chargedINR: 999.00,
            marginINR: 299.24,
        },

        // AI Access
        billing: 'metered',
        creditsPerProvider: null,   // Unlimited
        dailyTokenCap: null,        // No cap
        monthlyTokenCap: null,      // Truly unlimited

        // Rate limits
        requestsPerMinute: 120,
        requestsPerDay: 10_000,

        // Features
        features: {
            codingAgent: true,
            copilot: true,
            appAgent: true,
            priorityQueue: true,
            advancedModels: true,
        },
    },
};

/**
 * Get tier config by tier id string
 * @param {'free'|'pro'|'max'} tierId
 */
export const getTierConfig = (tierId) => {
    return SUBSCRIPTION_TIERS[tierId] || SUBSCRIPTION_TIERS.free;
};

/**
 * Returns true if the tier uses metered (per-token) billing
 * @param {'free'|'pro'|'max'} tierId
 */
export const isMeteredTier = (tierId) => {
    return getTierConfig(tierId).billing === 'metered';
};

/**
 * Returns true if the tier has a hard daily token cap
 * @param {'free'|'pro'|'max'} tierId
 */
export const hasDailyTokenCap = (tierId) => {
    return getTierConfig(tierId).dailyTokenCap !== null;
};

export default SUBSCRIPTION_TIERS;
