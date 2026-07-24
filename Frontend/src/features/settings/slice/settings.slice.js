import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  profile: {
    bio: 'Full Stack Software Engineer building with CodeSpace.',
    linkedin: '',
    github: '',
    twitter: '',
    website: '',
    location: '',
    company: '',
    jobTitle: '',
    skills: [],
    experienceYears: 0
  },
  preferences: {
    theme: 'dark',
    editor: {
      fontSize: '14px',
      tabSize: '2',
      autoSave: true,
      minimap: true,
      wordWrap: true
    },
    copilot: {
      modelPreference: 'gemini-2.5-flash',
      autoSuggest: true,
      interactiveMode: 'detailed'
    },
    notifications: {
      emailLogins: true,
      securityAlerts: true
    }
  },
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
  transactionsPagination: { page: 1, limit: 20, total: 0, pages: 1 },
  transactionSummary: {},
  analytics: {},
  apiKeys: [],
  loading: false,
  error: null
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setSettings(state, action) {
      if (action.payload?.profile) {
        state.profile = { ...state.profile, ...action.payload.profile };
      }
      if (action.payload?.preferences) {
        state.preferences = { ...state.preferences, ...action.payload.preferences };
      }
      if (action.payload?.apiKeys) {
        state.apiKeys = action.payload.apiKeys;
      }
      state.loading = false;
      state.error = null;
    },
    setProfile(state, action) {
      state.profile = { ...state.profile, ...action.payload };
    },
    setPreferences(state, action) {
      state.preferences = { ...state.preferences, ...action.payload };
    },
    setCredit(state, action) {
      state.credit = action.payload || initialState.credit;
    },
    setPackages(state, action) {
      state.packages = action.payload || [];
    },
    setTransactions(state, action) {
      state.transactions = action.payload.transactions || [];
      state.transactionsPagination = action.payload.pagination || initialState.transactionsPagination;
    },
    setTransactionSummary(state, action) {
      state.transactionSummary = action.payload || {};
    },
    setAnalytics(state, action) {
      state.analytics = action.payload || {};
    },
    addApiKey(state, action) {
      state.apiKeys.push(action.payload);
    },
    removeApiKey(state, action) {
      state.apiKeys = state.apiKeys.filter((k) => k.id !== action.payload);
    },
    setSubscription(state, action) {
      if (action.payload) {
        state.credit.subscription = typeof action.payload === 'string' ? action.payload : action.payload.subscription;
      }
    },
    setSettingsLoading(state, action) {
      state.loading = action.payload;
    },
    setSettingsError(state, action) {
      state.error = action.payload;
      state.loading = false;
    },
    clearSettingsError(state) {
      state.error = null;
    }
  }
});

export const {
  setSettings,
  setProfile,
  setPreferences,
  setCredit,
  setPackages,
  setTransactions,
  setTransactionSummary,
  setAnalytics,
  addApiKey,
  removeApiKey,
  setSubscription,
  setSettingsLoading,
  setSettingsError,
  clearSettingsError
} = settingsSlice.actions;

export default settingsSlice.reducer;
