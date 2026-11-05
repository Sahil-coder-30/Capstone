import { usePayments } from './payments.hooks';
import { planByTier } from '../utils/plans';

/**
 * Plan, limits and credit window for the signed-in user, from the store.
 * Backend tier config wins; the local plan catalogue fills gaps.
 */
export default function useAccount() {
  const { subscription, credit } = usePayments();
  const tier = subscription?.activeTier || credit?.subscription || 'free';
  const plan = planByTier(tier);
  const caps = { ...plan.caps, ...(credit?.tierConfig || {}) };

  const windowTotal = credit?.windowCreditsTotal ?? caps.windowCredits ?? 0;
  const windowLeft = credit?.windowCreditsRemaining ?? credit?.credits ?? windowTotal;

  return {
    tier,
    plan,
    caps,
    windowTotal,
    windowLeft,
    windowUsed: Math.max(0, windowTotal - windowLeft),
    refillAt: credit?.windowRefillAt ? new Date(credit.windowRefillAt).getTime() : null,
    lowerLimit: caps.creditLowerLimit ?? 5,
    tokensPerCredit: credit?.tokensPerCredit || 1000,
    activeSlot: subscription?.activeSlot || null,
    queued: subscription?.reservedSlots || [],
  };
}
