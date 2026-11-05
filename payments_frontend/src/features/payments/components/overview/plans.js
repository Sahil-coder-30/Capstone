// Plan catalogue shown on the billing overview.
// Mirrors Payments/config/plans.config.js (TIER_LIMITS + PACKAGES). Keep in sync.

export const PLANS = [
  {
    id: 'free',
    tier: 'free',
    name: 'Free',
    priceINR: 0,
    caps: { windowCredits: 20, dailyTokenCap: 50000, monthlyTokenCap: null, requestsPerMinute: 10 },
    summary: 'For trying the coding agent.',
    limits: [
      ['AI credits', '20 every 5 hours'],
      ['Token limit', '50,000 per day'],
      ['Requests', '10 per minute'],
      ['Sandbox', '0.5 vCPU, 512 MB'],
    ],
    features: ['Coding agent and Copilot', 'Community support'],
  },
  {
    id: 'pro_regular',
    tier: 'pro',
    name: 'Pro',
    priceINR: 499,
    caps: { windowCredits: 150, dailyTokenCap: null, monthlyTokenCap: 5000000, requestsPerMinute: 60 },
    summary: 'For developers who build every day.',
    limits: [
      ['AI credits', '150 every 5 hours'],
      ['Token limit', '5M per month'],
      ['Requests', '60 per minute'],
      ['Sandbox', '2 vCPU, 2 GB'],
    ],
    features: ['All coding and app agents', 'Advanced models', 'Priority email support'],
    recommended: true,
  },
  {
    id: 'max_regular',
    tier: 'max',
    name: 'Max',
    priceINR: 999,
    caps: { windowCredits: 200, dailyTokenCap: null, monthlyTokenCap: null, requestsPerMinute: 120 },
    summary: 'For heavy use with no token cap.',
    limits: [
      ['AI credits', '200 every 5 hours'],
      ['Token limit', 'No cap'],
      ['Requests', '120 per minute'],
      ['Sandbox', '4 vCPU, 4 GB'],
    ],
    features: ['Everything in Pro', 'Priority queue', 'Dedicated support'],
  },
];

export const TIER_RANK = { free: 0, pro: 1, max: 2 };

export const planByTier = (tier) => PLANS.find((p) => p.tier === tier) || PLANS[0];
