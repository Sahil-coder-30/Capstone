import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  subscription: {
    activeTier: 'free',
    activePlanId: '',
    status: 'FREE',
    activeSlot: null,
    reservedSlots: [],
  },
  credit: {
    credits: 20,
    subscription: 'free',
    providerCredits: [],
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  },
  dashboardOverview: null,
  usageEvents: {
    events: [],
    total: 0,
    page: 1,
    totalPages: 1,
  },
  usageAnalytics: {
    timeframeDays: 30,
    totals: { totalTokens: 0, promptTokens: 0, completionTokens: 0, totalRequests: 0, totalCreditsDeducted: 0 },
    timeline: [],
    byProvider: [],
    byAgent: [],
  },
  packages: [],
  transactions: [],
  transactionsPagination: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  },
  transactionsSummary: {
    totalSpentINR: 0,
    totalTransactions: 0,
    successCount: 0,
  },
  selectedTransaction: null,
  summary: {
    totalSpentINR: 0,
    totalPurchases: 0,
    totalTokensConsumed: 0,
    totalAIRequests: 0,
    totalBillableINR: 0,
    currentSubscription: 'free',
  },
  analytics: {
    totals: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    byProvider: [],
    byAgent: {},
    recentEvents: [],
  },
  isLoading: false,
  error: null,
  selectedPlanId: 'pro_regular',
  billingCycle: 'monthly', // 'monthly' | 'yearly'
  activeView: 'landing',
  detailPlanId: null,
  theme: localStorage.getItem('theme') || 'light',
  // ── 5-hour credit window pre-flight check ─────────────────────────────────
  creditAvailability: {
    canQuery:            true,
    creditsRemaining:    null,
    windowCreditsTotal:  null,
    creditLowerLimit:    5,
    nextRefillAt:        null,
    windowExhaustedAt:   null,
    timeUntilRefillMs:   null,
    subscription:        'free',
    isLoading:           false,
  },
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
      state.dashboardOverview = action.payload;
      if (action.payload?.subscription) state.subscription = action.payload.subscription;
      if (action.payload?.credit) state.credit = action.payload.credit;
      if (action.payload?.analytics) state.usageAnalytics = action.payload.analytics;
    },
    setUsageEvents(state, action) {
      if (action.payload?.events) {
        state.usageEvents = action.payload;
      } else if (Array.isArray(action.payload)) {
        state.usageEvents.events = action.payload;
      }
    },
    setUsageAnalytics(state, action) {
      state.usageAnalytics = action.payload;
    },
    setPackages(state, action) {
      state.packages = action.payload;
    },
    setTransactions(state, action) {
      if (Array.isArray(action.payload)) {
        state.transactions = action.payload;
      } else if (action.payload?.transactions) {
        state.transactions = action.payload.transactions;
        state.transactionsPagination = {
          page: action.payload.page || 1,
          limit: action.payload.limit || 20,
          total: action.payload.total || action.payload.transactions.length,
          totalPages: action.payload.totalPages || 1,
        };
        if (action.payload.summary) {
          state.transactionsSummary = action.payload.summary;
        }
      } else {
        state.transactions = [];
      }
    },
    setSelectedTransaction(state, action) {
      state.selectedTransaction = action.payload;
    },
    setSummary(state, action) {
      state.summary = action.payload;
    },
    setAnalytics(state, action) {
      state.analytics = action.payload;
    },
    setLoading(state, action) {
      state.isLoading = action.payload;
    },
    setError(state, action) {
      state.error = action.payload;
    },
    setSelectedPlanId(state, action) {
      state.selectedPlanId = action.payload;
    },
    setBillingCycle(state, action) {
      state.billingCycle = action.payload;
    },
    setActiveView(state, action) {
      state.activeView = action.payload;
    },
    setDetailPlanId(state, action) {
      state.detailPlanId = action.payload;
    },
    setTheme(state, action) {
      state.theme = action.payload;
      localStorage.setItem('theme', action.payload);
      if (action.payload === 'light') {
        document.documentElement.classList.add('light-theme');
      } else {
        document.documentElement.classList.remove('light-theme');
      }
    },
    setCreditAvailability(state, action) {
      state.creditAvailability = { ...state.creditAvailability, ...action.payload };
    },
  },
});

export const {
  setSubscription,
  setCredit,
  setDashboardOverview,
  setUsageEvents,
  setUsageAnalytics,
  setPackages,
  setTransactions,
  setSelectedTransaction,
  setSummary,
  setAnalytics,
  setLoading,
  setError,
  setSelectedPlanId,
  setBillingCycle,
  setActiveView,
  setDetailPlanId,
  setTheme,
  setCreditAvailability,
} = paymentsSlice.actions;

export default paymentsSlice.reducer;
