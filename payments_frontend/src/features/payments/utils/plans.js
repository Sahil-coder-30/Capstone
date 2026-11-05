// Plan catalogue for the billing app.
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
      ['AI credit balance', '20 credits'],
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
      ['AI credit balance', '150 credits'],
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
      ['AI credit balance', '200 credits'],
      ['Token limit', 'No cap'],
      ['Requests', '120 per minute'],
      ['Sandbox', '4 vCPU, 4 GB'],
    ],
    features: ['Everything in Pro', 'Priority queue', 'Dedicated support'],
  },
];

export const PAID_PLANS = PLANS.filter((p) => p.priceINR > 0);

export const TIER_RANK = { free: 0, pro: 1, max: 2 };

export const planByTier = (tier) => PLANS.find((p) => p.tier === tier) || PLANS[0];
export const planById = (id) => PLANS.find((p) => p.id === id || p.tier === id) || null;

/** Feature matrix for the compare table. true / false / text. */
export const FEATURE_MATRIX = [
  { group: 'AI usage', rows: [
    ['AI credit balance', '20', '150', '200'],
    ['Token limit', '50,000 / day', '5M / month', 'No cap'],
    ['Requests per minute', '10', '60', '120'],
    ['Priority queue', false, false, true],
  ] },
  { group: 'Agents and models', rows: [
    ['Coding agent (Orion)', true, true, true],
    ['Copilot (Clio)', true, true, true],
    ['App agent', false, true, true],
    ['Advanced models', false, true, true],
  ] },
  { group: 'Sandbox', rows: [
    ['CPU', '0.5 vCPU', '2 vCPU', '4 vCPU'],
    ['Memory', '512 MB', '2 GB', '4 GB'],
  ] },
  { group: 'Support', rows: [
    ['Community support', true, true, true],
    ['Priority email support', false, true, true],
    ['Dedicated support', false, false, true],
  ] },
];

/**
 * What a purchase does, following Payments/services/subscription.service.js:
 * nothing active -> starts now; same tier -> +30 days; higher tier -> starts
 * now and the old plan's days wait in the queue; lower tier -> queued.
 */
export function previewPurchase(plan, subscription, now = Date.now()) {
  const DAY = 86400000;
  const PERIOD = 30 * DAY;
  const active = subscription?.activeSlot || null;
  const queued = subscription?.reservedSlots || [];

  if (!active) {
    return { kind: 'start', startsAt: now, endsAt: now + PERIOD };
  }
  const activeRank = TIER_RANK[active.tier] ?? 0;
  const newRank = TIER_RANK[plan.tier] ?? 0;
  const activeEnd = new Date(active.validUntil).getTime();

  if (newRank === activeRank) {
    const base = Math.max(activeEnd, now);
    return { kind: 'extend', startsAt: base, endsAt: base + PERIOD };
  }
  if (newRank > activeRank) {
    const leftDays = Math.max(0, Math.ceil((activeEnd - now) / DAY));
    return { kind: 'upgrade', startsAt: now, endsAt: now + PERIOD, carriedTier: active.tier, carriedDays: leftDays };
  }
  const lastEnd = queued.reduce((t, q) => Math.max(t, new Date(q.validUntil).getTime() || 0), activeEnd);
  return { kind: 'queue', startsAt: lastEnd, endsAt: lastEnd + PERIOD };
}
