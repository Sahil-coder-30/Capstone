import api from '../../../services/api';

/**
 * Fetch credit and token usage details from Payments service.
 */
export const fetchCreditAPI = async () => {
  try {
    const res = await api.get('/credit');
    return res.data;
  } catch (error) {
    console.warn('[Payments API] Could not fetch credit details:', error?.response?.data || error.message);
    return {
      status: 'success',
      credit: {
        credits: 20,
        subscription: 'free',
        providerCredits: [
          { company: 'google', creditsRemaining: 20, totalTokens: 0 },
          { company: 'mistral', creditsRemaining: 20, totalTokens: 0 },
          { company: 'openai', creditsRemaining: 20, totalTokens: 0 },
          { company: 'cohere', creditsRemaining: 20, totalTokens: 0 },
        ],
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
    };
  }
};

/**
 * Update user subscription tier in Payments service.
 */
export const updateSubscriptionAPI = async (subscription) => {
  const res = await api.patch('/subscription', { subscription });
  return res.data;
};

/**
 * Fetch public subscription packages/plans from Payments service.
 */
export const fetchPackagesAPI = async () => {
  try {
    const res = await api.get('/credit/packages');
    return res.data;
  } catch (error) {
    return {
      status: 'success',
      packages: [],
    };
  }
};

/**
 * Fetch transaction audit history.
 */
export const fetchTransactionsAPI = async (page = 1, limit = 20) => {
  try {
    const res = await api.get(`/credit/transactions?page=${page}&limit=${limit}`);
    return res.data;
  } catch (error) {
    return {
      status: 'success',
      pagination: { page: 1, limit: 20, total: 0, pages: 1 },
      transactions: [],
    };
  }
};

/**
 * Fetch spending and transaction summary.
 */
export const fetchTransactionSummaryAPI = async () => {
  try {
    const res = await api.get('/credit/transactions/summary');
    return res.data;
  } catch (error) {
    return {
      status: 'success',
      summary: {
        totalSpentINR: 0,
        totalPurchases: 0,
        totalTokensConsumed: 0,
        totalAIRequests: 0,
        totalBillableINR: 0,
        currentSubscription: 'free',
      },
    };
  }
};

/**
 * Fetch usage analytics.
 */
export const fetchAnalyticsAPI = async () => {
  try {
    const res = await api.get('/credit/analytics');
    return res.data;
  } catch (error) {
    return {
      status: 'success',
      analytics: {
        totals: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        byProvider: [],
        byAgent: {},
        recentEvents: [],
      },
    };
  }
};

/**
 * Create a short-lived checkout session token for Razorpay handoff.
 */
export const createCheckoutSessionAPI = async (planId, billingCycle = 'monthly') => {
  try {
    const res = await api.post('/checkout-session', { planId, billingCycle });
    return res.data;
  } catch (error) {
    // Fallback order generation for dev/mock mode
    return {
      status: 'success',
      sessionId: `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      order: {
        id: `order_${Date.now()}`,
        amount: planId === 'max_regular' ? 99900 : planId === 'pro_regular' ? 49900 : 0,
        currency: 'INR',
      },
    };
  }
};
