import api from '../../../services/api.js';

/**
 * Fetch consolidated dashboard overview (Plan, Credit, Analytics, Recent Txs, Recent Logs).
 * Backend: GET /api/payments/dashboard/overview
 */
export const fetchDashboardOverviewAPI = async () => {
  try {
    const res = await api.get('/dashboard/overview');
    return res.data;
  } catch (error) {
    console.warn('[Payments API] Could not fetch dashboard overview:', error?.response?.data || error.message);
    return null;
  }
};

/**
 * Fetch current subscription status and plan queue details.
 * Backend: GET /api/payments/subscription (authenticated)
 */
export const fetchSubscriptionAPI = async () => {
  try {
    const res = await api.get('/subscription');
    return res.data;
  } catch (error) {
    console.warn('[Payments API] Could not fetch subscription details:', error?.response?.data || error.message);
    return {
      status: 'success',
      data: {
        activeTier: 'free',
        activePlanId: '',
        status: 'FREE',
        activeSlot: null,
        reservedSlots: [],
      },
    };
  }
};

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
        windowCreditsTotal: 20,
        windowCreditsRemaining: 20,
        subscription: 'free',
        providerCredits: [
          { company: 'mistral', creditsRemaining: 20, creditsGranted: 20, totalTokens: 0 },
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
  const res = await api.patch('/credit/subscription', { subscription });
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
 * Fetch transaction audit history with full filtering and summary statistics.
 * Backend: GET /api/payments/transactions (authenticated)
 */
export const fetchTransactionsAPI = async ({
  page = 1,
  limit = 20,
  type = '',
  status = '',
  startDate = '',
  endDate = '',
} = {}) => {
  try {
    const params = new URLSearchParams();
    if (page) params.append('page', page);
    if (limit) params.append('limit', limit);
    if (type) params.append('type', type);
    if (status) params.append('status', status);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    const res = await api.get(`/transactions?${params.toString()}`);
    return res.data;
  } catch (error) {
    console.warn('[Payments API] Could not fetch transactions:', error?.response?.data || error.message);
    return {
      status: 'success',
      data: {
        transactions: [],
        total: 0,
        page: 1,
        totalPages: 1,
        summary: { totalSpentINR: 0, totalTransactions: 0, successCount: 0 },
      },
    };
  }
};

/**
 * Fetch single transaction by ID for invoice drawer / receipt download.
 */
export const fetchTransactionByIdAPI = async (transactionId) => {
  try {
    const res = await api.get(`/transactions/${transactionId}`);
    return res.data;
  } catch (error) {
    console.warn('[Payments API] Could not fetch transaction details:', error?.response?.data || error.message);
    return null;
  }
};

/**
 * Fetch granular AI Usage Events (requests and interactions).
 * Backend: GET /api/payments/usage-events
 */
export const fetchUsageEventsAPI = async ({
  page = 1,
  limit = 20,
  company = '',
  agentType = '',
  search = '',
  startDate = '',
  endDate = '',
} = {}) => {
  try {
    const params = new URLSearchParams();
    if (page) params.append('page', page);
    if (limit) params.append('limit', limit);
    if (company && company !== 'all') params.append('company', company);
    if (agentType && agentType !== 'all') params.append('agentType', agentType);
    if (search) params.append('search', search);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    const res = await api.get(`/usage-events?${params.toString()}`);
    return res.data;
  } catch (error) {
    console.warn('[Payments API] Could not fetch usage events:', error?.response?.data || error.message);
    return {
      status: 'success',
      data: {
        events: [],
        total: 0,
        page: 1,
        totalPages: 1,
      },
    };
  }
};

/**
 * Fetch AI usage analytics for chart visualizations.
 * Backend: GET /api/payments/usage-events/analytics?days=30
 */
export const fetchUsageAnalyticsAPI = async (days = 30) => {
  try {
    const res = await api.get(`/usage-events/analytics?days=${days}`);
    return res.data;
  } catch (error) {
    console.warn('[Payments API] Could not fetch usage analytics:', error?.response?.data || error.message);
    return {
      status: 'success',
      data: {
        timeframeDays: days,
        totals: { totalTokens: 0, promptTokens: 0, completionTokens: 0, totalRequests: 0, totalCreditsDeducted: 0 },
        timeline: [],
        byProvider: [],
        byAgent: [],
      },
    };
  }
};

export const fetchAnalyticsAPI = fetchUsageAnalyticsAPI;



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
 * Create a Razorpay order via the payments backend.
 */
export const createCheckoutSessionAPI = async (packageId) => {
  try {
    const res = await api.post('/create/order', { packageId });
    return res.data?.data || res.data;
  } catch (error) {
    console.warn('[Payments API] Backend order creation returned error, using direct client checkout config:', error?.response?.data || error.message);
    
    const tierPaise = {
      pro_regular: 49900,
      pro_early_access: 29900,
      max_regular: 99900,
      max_early_access: 99900,
    };

    return {
      orderId: null,
      amount: tierPaise[packageId] || 49900,
      currency: 'INR',
      keyId: import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_TQWMeVZgOXKG3C',
      package: { id: packageId },
    };
  }
};

/**
 * Verify Razorpay payment and activate subscription plan + record transaction receipt.
 * Backend: POST /api/payments/verify
 */
export const verifyPaymentAPI = async ({ paymentId, orderId, signature, packageId }) => {
  const res = await api.post('/verify', {
    paymentId,
    orderId,
    signature,
    packageId,
  });
  return res.data;
};

/**
 * Pre-flight credit availability check.
 * Backend: GET /api/payments/credit/check
 *
 * Returns:
 *   { canQuery, creditsRemaining, windowCreditsTotal, creditLowerLimit,
 *     nextRefillAt, windowExhaustedAt, timeUntilRefillMs, subscription }
 *
 * Usage:
 *   - Call before showing the AI chat Send button.
 *   - If canQuery === false, disable the button and display nextRefillAt countdown.
 */
export const checkCreditAvailabilityAPI = async () => {
  try {
    const res = await api.get('/credit/check');
    return res.data;
  } catch (error) {
    console.warn('[Payments API] Could not check credit availability:', error?.response?.data || error.message);
    // Fail open — don't block the user if the check endpoint is unreachable
    return {
      status: 'success',
      canQuery: true,
      creditsRemaining: null,
      windowCreditsTotal: null,
      nextRefillAt: null,
      timeUntilRefillMs: null,
      subscription: 'free',
    };
  }
};
