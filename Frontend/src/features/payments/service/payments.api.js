import apiClient from '../../../services/apiClient';

/**
 * Fetch credit and token usage details from Payments service.
 */
export const fetchCreditAPI = async () => {
  try {
    const res = await apiClient.get('/api/payments/credit', { timeout: 3_000 });
    return res.data;
  } catch (error) {
    return {
      status: 'success',
      credit: {
        credits: 20,
        subscription: 'free',
        providerCredits: [],
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      }
    };
  }
};

/**
 * Update user subscription tier in Payments service.
 */
export const updateSubscriptionAPI = async (subscription) => {
  const res = await apiClient.patch('/api/payments/subscription', { subscription }, { timeout: 3_000 });
  return res.data;
};

/**
 * Fetch public subscription packages/plans from Payments service.
 */
export const fetchPackagesAPI = async () => {
  try {
    const res = await apiClient.get('/api/payments/credit/packages', { timeout: 3_000 });
    return res.data;
  } catch (error) {
    return {
      status: 'success',
      packages: []
    };
  }
};

/**
 * Fetch transaction audit history.
 */
export const fetchTransactionsAPI = async (page = 1, limit = 20) => {
  try {
    const res = await apiClient.get(`/api/payments/credit/transactions?page=${page}&limit=${limit}`, { timeout: 3_000 });
    return res.data;
  } catch (error) {
    return {
      status: 'success',
      pagination: { page: 1, limit: 20, total: 0, pages: 1 },
      transactions: []
    };
  }
};

/**
 * Fetch spending and transaction summary.
 */
export const fetchTransactionSummaryAPI = async () => {
  try {
    const res = await apiClient.get('/api/payments/credit/transactions/summary', { timeout: 3_000 });
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
        currentSubscription: 'free'
      }
    };
  }
};

/**
 * Fetch usage analytics.
 */
export const fetchAnalyticsAPI = async () => {
  try {
    const res = await apiClient.get('/api/payments/credit/analytics', { timeout: 3_000 });
    return res.data;
  } catch (error) {
    return {
      status: 'success',
      analytics: {
        totals: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        byProvider: [],
        byAgent: {},
        recentEvents: []
      }
    };
  }
};
