import { createSlice } from '@reduxjs/toolkit';

const readTheme = () => {
  try {
    return localStorage.getItem('theme') || 'light';
  } catch {
    return 'light';
  }
};

const initialState = {
  subscription: { activeTier: 'free', status: 'FREE', activeSlot: null, reservedSlots: [] },
  credit: null,
  dashboardOverview: null,
  usageAnalytics: {
    timeframeDays: 30,
    totals: { totalTokens: 0, promptTokens: 0, completionTokens: 0, totalRequests: 0, totalCreditsDeducted: 0 },
    timeline: [],
    byProvider: [],
    byAgent: [],
  },
  // One page of AI requests for the requests table.
  usageEvents: { events: [], total: 0, page: 1, totalPages: 1 },
  // Last 100 usage events (backend max page size), for model / project / hour stats.
  usageSample: { events: [], total: 0 },
  // Last 100 transactions, for invoices, spend history and payment stats.
  paymentHistory: { transactions: [], total: 0, summary: null },
  // Lifetime totals from /credit/transactions/summary.
  summary: null,
  theme: readTheme(),
};

const paymentsSlice = createSlice({
  name: 'payments',
  initialState,
  reducers: {
    setSubscription(state, action) {
      state.subscription = action.payload;
    },
    setCredit(state, action) {
      state.credit = action.payload;
    },
    setDashboardOverview(state, action) {
      const d = action.payload;
      state.dashboardOverview = d;
      if (d?.subscription) state.subscription = d.subscription;
      if (d?.credit) state.credit = d.credit;
      if (d?.analytics) state.usageAnalytics = d.analytics;
    },
    setUsageAnalytics(state, action) {
      state.usageAnalytics = action.payload;
    },
    setUsageEvents(state, action) {
      state.usageEvents = action.payload;
    },
    setUsageSample(state, action) {
      state.usageSample = { events: action.payload?.events || [], total: action.payload?.total || 0 };
    },
    setPaymentHistory(state, action) {
      state.paymentHistory = {
        transactions: action.payload?.transactions || [],
        total: action.payload?.total || 0,
        summary: action.payload?.summary || null,
      };
    },
    setSummary(state, action) {
      state.summary = action.payload;
    },
    setTheme(state, action) {
      state.theme = action.payload;
    },
  },
});

export const {
  setSubscription,
  setCredit,
  setDashboardOverview,
  setUsageAnalytics,
  setUsageEvents,
  setUsageSample,
  setPaymentHistory,
  setSummary,
  setTheme,
} = paymentsSlice.actions;

export default paymentsSlice.reducer;
