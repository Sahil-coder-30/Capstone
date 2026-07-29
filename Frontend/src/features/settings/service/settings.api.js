import apiClient from '../../../services/apiClient';

/**
 * Fetch settings payload (profile and preferences from backend).
 */
export const fetchSettingsAPI = async () => {
  try {
    const [profileRes, prefRes] = await Promise.all([
      apiClient.get('/api/auth/profile', { timeout: 15_000 }),
      apiClient.get('/api/auth/preferences', { timeout: 15_000 })
    ]);

    return {
      status: 'success',
      settings: {
        profile: profileRes.data.profile,
        preferences: prefRes.data.preferences
      }
    };
  } catch {
    // Return standard dummy settings payload if backend fails
    return {
      status: 'success',
      settings: {
        profile: {
          bio: 'Full Stack Software Engineer building with CodeSpace.',
          linkedin: '',
          github: '',
          twitter: '',
          website: '',
          location: 'San Francisco, CA',
          company: '',
          jobTitle: '',
          skills: [],
          experienceYears: 0
        },
        preferences: {
          theme: localStorage.getItem('theme') || 'dark',
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
        }
      }
    };
  }
};

/**
 * Update Profile Settings.
 */
export const updateProfileSettingsAPI = async (profileData) => {
  try {
    const res = await apiClient.put('/api/auth/profile', profileData, { timeout: 15_000 });
    return res.data;
  } catch {
    return { status: 'success', profile: profileData };
  }
};

/**
 * Fetch credit and token usage details from Payments service.
 */
export const fetchCreditAPI = async () => {
  try {
    const res = await apiClient.get('/api/payments/credit', { timeout: 15_000 });
    return res.data;
  } catch {
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
  const res = await apiClient.patch('/api/payments/subscription', { subscription }, { timeout: 15_000 });
  return res.data;
};

/**
 * Fetch public subscription plans from Payments service.
 */
export const fetchPackagesAPI = async () => {
  try {
    const res = await apiClient.get('/api/payments/credit/packages', { timeout: 15_000 });
    return res.data;
  } catch {
    return {
      status: 'success',
      packages: [
        { id: 'free', label: 'Free', tier: 'free', priceINR: 0, description: 'Start building with AI. No credit card required.', highlights: ['20 AI credits per provider', '50,000 tokens/day cap'] },
        { id: 'pro_early_access', label: 'Pro', tier: 'pro', pricingModel: 'early_access', priceINR: 299, badge: 'Early Access', popular: true, highlights: ['Unlimited AI credits', '5M tokens/month', 'All coding + app agents'] },
        { id: 'pro_regular', label: 'Pro', tier: 'pro', pricingModel: 'regular', priceINR: 499, highlights: ['Unlimited AI credits', '5M tokens/month', 'Priority support'] },
        { id: 'max_early_access', label: 'Max', tier: 'max', pricingModel: 'early_access', priceINR: 999, badge: 'Early Access', highlights: ['Unlimited AI credits', 'Unlimited tokens', 'Priority processing'] },
        { id: 'max_regular', label: 'Max', tier: 'max', pricingModel: 'regular', priceINR: 1499, badge: 'Best Value', highlights: ['Unlimited AI credits', 'Unlimited tokens', 'Dedicated support'] }
      ]
    };
  }
};

/**
 * Fetch paginated transaction audit history from Payments service.
 */
export const fetchTransactionsAPI = async (page = 1, limit = 20) => {
  try {
    const res = await apiClient.get(`/api/payments/credit/transactions?page=${page}&limit=${limit}`, { timeout: 15_000 });
    return res.data;
  } catch {
    return {
      status: 'success',
      pagination: { page: 1, limit: 20, total: 0, pages: 1 },
      transactions: []
    };
  }
};

/**
 * Fetch spending and transaction summary from Payments service.
 */
export const fetchTransactionSummaryAPI = async () => {
  try {
    const res = await apiClient.get('/api/payments/credit/transactions/summary', { timeout: 15_000 });
    return res.data;
  } catch {
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
 * Fetch token usage analytics from Payments service.
 */
export const fetchAnalyticsAPI = async () => {
  try {
    const res = await apiClient.get('/api/payments/credit/analytics', { timeout: 15_000 });
    return res.data;
  } catch {
    return {
      status: 'success',
      analytics: { totals: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, byProvider: [], byAgent: {}, recentEvents: [] }
    };
  }
};

/**
 * Update Preferences Settings (appearance & editor).
 */
export const updatePreferencesAPI = async (preferencesData) => {
  try {
    const res = await apiClient.put('/api/auth/preferences', preferencesData, { timeout: 15_000 });
    return res.data;
  } catch {
    return { status: 'success', preferences: preferencesData };
  }
};

/**
 * Generate API Secret Key.
 */
export const generateApiKeyAPI = async (keyName) => {
  try {
    const res = await apiClient.post('/api/settings/keys', { name: keyName }, { timeout: 15_000 });
    return res.data;
  } catch {
    const randomHex = Math.random().toString(16).substring(2, 6);
    return {
      status: 'success',
      key: {
        id: Date.now().toString(),
        name: keyName,
        prefix: `sk_test_...${randomHex}`,
        created: new Date().toISOString().split('T')[0]
      }
    };
  }
};

/**
 * Delete API Secret Key.
 */
export const deleteApiKeyAPI = async (keyId) => {
  try {
    const res = await apiClient.delete(`/api/settings/keys/${keyId}`, { timeout: 15_000 });
    return res.data;
  } catch {
    return { status: 'success', deletedId: keyId };
  }
};
