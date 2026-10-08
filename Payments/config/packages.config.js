/**
 * Subscription Packages Configuration — Payments Service
 *
 * Streamlined to the 2 primary plans:
 *   1. Pro Plan  (₹499 / month)
 *   2. Max Plan  (₹999 / month)
 *   + Default Free Plan (₹0)
 */

export const PACKAGES = [
    {
        id: 'free',
        label: 'Taksha AI Free',
        tier: 'free',
        tierPriority: 0,
        planIdEnvKey: 'PLAN_ID_FREE',
        pricingModel: 'free',
        priceINR: 0,
        priceINRPaise: 0,
        description: 'Start building with AI. No credit card required.',
        highlights: [
            '20 AI credits per provider',
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
        tierPriority: 1,
        planIdEnvKey: 'PLAN_ID_PRO',
        pricingModel: 'regular',
        priceINR: 499,
        priceINRPaise: 49900,
        description: 'Full AI power for active developers.',
        highlights: [
            '4x higher AI usage limits',
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
        tierPriority: 2,
        planIdEnvKey: 'PLAN_ID_MAX',
        pricingModel: 'regular',
        priceINR: 999,
        priceINRPaise: 99900,
        description: 'Maximum AI power, zero limits, flagship models.',
        highlights: [
            'Unlimited AI tokens',
            'Priority queue processing',
            '4.0 vCPU + 4GB Sandbox',
            'All flagship AI models',
            'Dedicated 24/7 support',
        ],
        badge: 'Best Value',
        popular: false,
    },
];

/**
 * Returns clean packages for public pricing view.
 */
export const getPublicPackages = () => PACKAGES.map(pkg => ({
    id: pkg.id,
    label: pkg.label,
    tier: pkg.tier,
    pricingModel: pkg.pricingModel,
    priceINR: pkg.priceINR,
    description: pkg.description,
    highlights: pkg.highlights,
    badge: pkg.badge,
    popular: pkg.popular,
}));

export const getAdminPackages = () => PACKAGES;

/**
 * Find a package by ID or tier (supports 'pro', 'pro_regular', 'max', 'max_regular', 'free').
 */
export const getPackageById = (packageId) => {
    if (!packageId) return null;
    const normalized = String(packageId).trim().toLowerCase();
    
    // Direct match by ID
    let match = PACKAGES.find(pkg => pkg.id === normalized);
    if (match) return match;

    // Match by tier
    match = PACKAGES.find(pkg => pkg.tier === normalized);
    if (match) return match;

    // Legacy aliases
    if (normalized.startsWith('pro')) return PACKAGES.find(pkg => pkg.tier === 'pro');
    if (normalized.startsWith('max')) return PACKAGES.find(pkg => pkg.tier === 'max');

    return null;
};

export default PACKAGES;
