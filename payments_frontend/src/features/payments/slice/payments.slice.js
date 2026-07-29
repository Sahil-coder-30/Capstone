import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  credit: {
    credits: 20,
    subscription: 'free',
    providerCredits: [],
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  },
  packages: [],
  transactions: [],
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
  activeView: 'landing', // 'landing' | 'status' | 'invoices' | 'checkout' | 'analytics'
  detailPlanId: null,
  theme: localStorage.getItem('theme') || 'dark',
};

const paymentsSlice = createSlice({
  name: 'payments',
  initialState,
  reducers: {
    setCredit(state, action) {
      state.credit = action.payload;
    },
    setPackages(state, action) {
      state.packages = action.payload;
    },
    setTransactions(state, action) {
      state.transactions = action.payload;
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
  },
});

export const {
  setCredit,
  setPackages,
  setTransactions,
  setSummary,
  setAnalytics,
  setLoading,
  setError,
  setSelectedPlanId,
  setBillingCycle,
  setActiveView,
  setDetailPlanId,
  setTheme,
} = paymentsSlice.actions;

export default paymentsSlice.reducer;
