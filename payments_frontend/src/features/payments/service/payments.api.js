import api from '../../../services/api.js';

// Thin wrappers over the Payments service (/api/payments). They throw on
// failure; the hooks turn errors into null so pages can show an error state.

const qs = (params) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '' && v !== 'all') p.append(k, v);
  });
  return p.toString();
};

/** Plan, credit window, 30-day analytics, recent payments and events. */
export const fetchDashboardOverviewAPI = async () => (await api.get('/dashboard/overview')).data;

export const fetchSubscriptionAPI = async () => (await api.get('/subscription')).data;

export const fetchCreditAPI = async () => (await api.get('/credit')).data;

/** Lifetime spend, tokens and request counts. */
export const fetchSpendSummaryAPI = async () => (await api.get('/credit/transactions/summary')).data;

export const fetchTransactionsAPI = async ({ page = 1, limit = 20, status, type, startDate, endDate } = {}) =>
  (await api.get(`/transactions?${qs({ page, limit, status, type, startDate, endDate })}`)).data;

export const fetchUsageEventsAPI = async ({ page = 1, limit = 20, company, agentType, search, startDate, endDate } = {}) =>
  (await api.get(`/usage-events?${qs({ page, limit, company, agentType, search, startDate, endDate })}`)).data;

export const fetchUsageAnalyticsAPI = async (days = 30) =>
  (await api.get(`/usage-events/analytics?days=${days}`)).data;

/** Creates a Razorpay order. Returns { orderId, amount, currency, keyId, package }. */
export const createOrderAPI = async (packageId) => (await api.post('/create/order', { packageId })).data?.data;

/** Confirms a Razorpay payment on the server and applies the plan. */
export const verifyPaymentAPI = async ({ paymentId, orderId, signature }) =>
  (await api.post('/verify', { paymentId, orderId, signature })).data;

/** Readable message from an axios / FaultKit error. */
export const apiErrorMessage = (err, fallback = 'Something went wrong. Please try again.') => {
  const body = err?.response?.data;
  const msg = body?.message || body?.error?.message || err?.message;
  const ref = body?.requestId || body?.error?.requestId;
  return `${msg || fallback}${ref ? ` (ref ${ref})` : ''}`;
};
