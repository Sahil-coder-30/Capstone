/**
 * Plans: the single source of truth for what Payments sells and what each
 * tier is allowed to do. Replaces packages.config.js + subscription.config.js.
 *
 * Money is always integer paise. 1 AI credit = TOKENS_PER_CREDIT tokens.
 */

export const TIERS = ['free', 'pro', 'max'];

export const TIER_PRIORITY = { free: 0, pro: 1, max: 2 };

export const DAYS_PER_PERIOD = 30;

export const TOKENS_PER_CREDIT = Number(process.env.TOKENS_PER_AI_CREDIT || 1000);

export const TIER_LIMITS = {
    free: {
        id: 'free',
        label: 'Free',
        windowCredits: 20,
        windowHours: 5,
        creditLowerLimit: 5,
        dailyTokenCap: 50_000,
        monthlyTokenCap: null,
        requestsPerMinute: 10,
        features: { codingAgent: true, copilot: true, appAgent: false, priorityQueue: false, advancedModels: false },
    },
    pro: {
        id: 'pro',
        label: 'Pro',
        windowCredits: 150,
        windowHours: 5,
        creditLowerLimit: 5,
        dailyTokenCap: null,
        monthlyTokenCap: 5_000_000,
        requestsPerMinute: 60,
        features: { codingAgent: true, copilot: true, appAgent: true, priorityQueue: false, advancedModels: true },
    },
    max: {
        id: 'max',
        label: 'Max',
        windowCredits: 200,
        windowHours: 5,
        creditLowerLimit: 5,
        dailyTokenCap: null,
        monthlyTokenCap: null,
        requestsPerMinute: 120,
        features: { codingAgent: true, copilot: true, appAgent: true, priorityQueue: true, advancedModels: true },
    },
};

export const PACKAGES = [
    {
        id: 'free',
        label: 'Taksha AI Free',
        tier: 'free',
        pricingModel: 'free',
        priceINR: 0,
        pricePaise: 0,
        planIdEnvKey: 'PLAN_ID_FREE',
        description: 'Start building with AI. No credit card required.',
        highlights: [
            '20 AI credits every 5 hours',
            'Coding agent + Copilot',
            '50,000 tokens/day limit',
            '0.5 vCPU + 512MB Sandbox',
            'Community support',
        ],
        badge: null,
        popular: false,
    },
    {
        id: 'pro_regular',
        label: 'Taksha AI Pro',
        tier: 'pro',
        pricingModel: 'regular',
        priceINR: 499,
        pricePaise: 49_900,
        planIdEnvKey: 'PLAN_ID_PRO',
        description: 'Full AI power for active developers.',
        highlights: [
            '150 AI credits every 5 hours',
            '5,000,000 tokens monthly cap',
            '2.0 vCPU + 2GB Sandbox',
            'All coding & app agents',
            'Priority email support',
        ],
        badge: 'Popular',
        popular: true,
    },
    {
        id: 'max_regular',
        label: 'Taksha AI Max',
        tier: 'max',
        pricingModel: 'regular',
        priceINR: 999,
        pricePaise: 99_900,
        planIdEnvKey: 'PLAN_ID_MAX',
        description: 'Maximum AI power, zero limits, flagship models.',
        highlights: [
            '200 AI credits every 5 hours',
            'Priority queue processing',
            '4.0 vCPU + 4GB Sandbox',
            'All flagship AI models',
            'Dedicated 24/7 support',
        ],
        badge: 'Best Value',
        popular: false,
    },
];

export function getTierLimits(tier) {
    return TIER_LIMITS[tier] || TIER_LIMITS.free;
}

/** Accepts a package id ('pro_regular') or a bare tier ('pro'). */
export function getPackageById(packageId) {
    if (!packageId) return null;
    const key = String(packageId).trim().toLowerCase();
    return PACKAGES.find((p) => p.id === key) || PACKAGES.find((p) => p.tier === key) || null;
}

/** Plan id shown to clients. Falls back to the package id when the env var is unset. */
export function getPlanId(pkg) {
    if (!pkg) return null;
    return (process.env[pkg.planIdEnvKey] || '').trim() || pkg.id;
}

export function getPublicPackages() {
    return PACKAGES.map(({ id, label, tier, pricingModel, priceINR, description, highlights, badge, popular }) => ({
        id, label, tier, pricingModel, priceINR, description, highlights, badge, popular,
    }));
}
