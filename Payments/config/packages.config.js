/**
 * Subscription Packages Configuration
 *
 * Defines all purchasable subscription plans available to users.
 * Each package includes:
 *  - Pricing in INR (paise for Razorpay)
 *  - The subscription tier it maps to
 *  - Cost breakdown and margin analysis
 *  - Feature highlights for display on the pricing page
 *
 * Razorpay amounts must be in PAISE (smallest currency unit).
 * 1 INR = 100 paise
 *
 * Pre-calculating fees here avoids floating-point arithmetic at checkout time.
 */

export const PACKAGES = [
    {
        id: 'free',
        label: 'Free',
        tier: 'free',
        pricingModel: 'free',
        priceINR: 0,
        priceINRPaise: 0,           // For Razorpay: amount in paise
        razorpayFeeINR: 0,
        totalCostINR: 34.99,        // Your actual cost per free user/month
        marginINR: -34.99,          // Loss-leader / user acquisition cost
        description: 'Start building with AI. No credit card required.',
        highlights: [
            '20 AI credits per provider',
            'Coding agent + Copilot',
            '50,000 tokens/day limit',
            'Community support',
        ],
        badge: null,
        popular: false,
    },

    {
        id: 'pro_early_access',
        label: 'Pro',
        tier: 'pro',
        pricingModel: 'early_access',
        priceINR: 299,
        priceINRPaise: 29900,
        razorpayFeeINR: 7.06,       // 2.36% of ₹299
        totalCostINR: 228.52,
        marginINR: 70.48,           // ₹299 - ₹228.52
        description: 'Early access pricing. Full AI power for power users.',
        highlights: [
            'Unlimited AI credits',
            'All coding agents + App agent',
            '5M tokens/month',
            'Advanced models',
            'Email support',
        ],
        badge: 'Early Access',
        popular: true,
    },

    {
        id: 'pro_regular',
        label: 'Pro',
        tier: 'pro',
        pricingModel: 'regular',
        priceINR: 499,
        priceINRPaise: 49900,
        razorpayFeeINR: 11.78,      // 2.36% of ₹499
        totalCostINR: 233.24,
        marginINR: 265.76,          // ₹499 - ₹233.24
        description: 'Full AI access. Unlimited credits, all agents.',
        highlights: [
            'Unlimited AI credits',
            'All coding agents + App agent',
            '5M tokens/month',
            'Advanced models',
            'Priority email support',
        ],
        badge: null,
        popular: false,
    },

    {
        id: 'max_early_access',
        label: 'Max',
        tier: 'max',
        pricingModel: 'early_access',
        priceINR: 999,
        priceINRPaise: 99900,
        razorpayFeeINR: 23.58,      // 2.36% of ₹999
        totalCostINR: 699.76,
        marginINR: 299.24,          // ₹999 - ₹699.76
        description: 'Early access pricing. Maximum AI power, zero limits.',
        highlights: [
            'Unlimited AI credits',
            'All agents — full access',
            'Unlimited tokens',
            'Priority queue processing',
            'All models (including flagship)',
            'Dedicated support',
        ],
        badge: 'Early Access',
        popular: false,
    },

    {
        id: 'max_regular',
        label: 'Max',
        tier: 'max',
        pricingModel: 'regular',
        priceINR: 1499,
        priceINRPaise: 149900,
        razorpayFeeINR: 35.38,      // 2.36% of ₹1499
        totalCostINR: 711.56,
        marginINR: 787.44,          // ₹1499 - ₹711.56
        description: 'Maximum AI power. Highest limits, all models, priority queue.',
        highlights: [
            'Unlimited AI credits',
            'All agents — full access',
            'Unlimited tokens',
            'Priority queue processing',
            'All models (including flagship)',
            'Dedicated support',
        ],
        badge: 'Best Value',
        popular: false,
    },
];

/**
 * Returns all packages (for public pricing page)
 * Strips internal cost fields from public response
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

/**
 * Returns all packages including internal cost & margin data (admin only)
 */
export const getAdminPackages = () => PACKAGES;

/**
 * Find a package by ID
 * @param {string} packageId
 */
export const getPackageById = (packageId) => PACKAGES.find(pkg => pkg.id === packageId) || null;

export default PACKAGES;
