import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  credit: {
    credits: 20,
    subscription: 'free',
    providerCredits: [],
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0
  },
  packages: [],
  transactions: [],
  summary: {
    totalSpentINR: 0,
    totalPurchases: 0,
    totalTokensConsumed: 0,
    totalAIRequests: 0,
    totalBillableINR: 0,
    currentSubscription: 'free'
  },
  analytics: {
    totals: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    byProvider: [],
    byAgent: {},
    recentEvents: []
  },
  isLoading: false,
  error: null,
  selectedPlanId: 'pro_early_access',
  billingCycle: 'monthly', // 'monthly' | 'yearly'
  activeView: 'landing', // 'landing' | 'invoices' | 'detail' | 'checkout'
  detailPlanId: null
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
    }
  }
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
  setDetailPlanId
} = paymentsSlice.actions;

export default paymentsSlice.reducer;
