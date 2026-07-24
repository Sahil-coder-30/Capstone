import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchSettingsAPI,
  updateProfileSettingsAPI,
  updatePreferencesAPI,
  fetchCreditAPI,
  updateSubscriptionAPI,
  fetchPackagesAPI,
  fetchTransactionsAPI,
  fetchTransactionSummaryAPI,
  fetchAnalyticsAPI,
  generateApiKeyAPI,
  deleteApiKeyAPI
} from '../service/settings.api';
import {
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
} from '../slice/settings.slice';
import { getCachedPreferences, setCachedPreferences } from '../../editor/service/dbService';

export const useSettings = () => {
  const dispatch = useDispatch();
  const state = useSelector((reduxState) => reduxState.settings);

  const loadSettings = useCallback(async () => {
    try {
      dispatch(setSettingsLoading(true));
      const data = await fetchSettingsAPI();
      if (data.settings?.preferences) {
        await setCachedPreferences(data.settings.preferences);
      }
      dispatch(setSettings(data.settings));
      return data.settings;
    } catch (err) {
      const cachedPrefs = await getCachedPreferences();
      if (cachedPrefs) {
        dispatch(setSettings({ profile: {}, preferences: cachedPrefs }));
      } else {
        dispatch(setSettingsError(err.message || 'Failed to load settings'));
      }
    }
  }, [dispatch]);

  const loadCredit = useCallback(async () => {
    try {
      const data = await fetchCreditAPI();
      dispatch(setCredit(data.credit));
      return data.credit;
    } catch (err) {
      dispatch(setSettingsError(err.message));
    }
  }, [dispatch]);

  const loadPackages = useCallback(async () => {
    try {
      const data = await fetchPackagesAPI();
      dispatch(setPackages(data.packages));
      return data.packages;
    } catch (err) {
      dispatch(setSettingsError(err.message));
    }
  }, [dispatch]);

  const loadTransactions = useCallback(async (page = 1, limit = 20) => {
    try {
      const data = await fetchTransactionsAPI(page, limit);
      dispatch(setTransactions(data));
      return data;
    } catch (err) {
      dispatch(setSettingsError(err.message));
    }
  }, [dispatch]);

  const loadTransactionSummary = useCallback(async () => {
    try {
      const data = await fetchTransactionSummaryAPI();
      dispatch(setTransactionSummary(data.summary));
      return data.summary;
    } catch (err) {
      dispatch(setSettingsError(err.message));
    }
  }, [dispatch]);

  const loadAnalytics = useCallback(async () => {
    try {
      const data = await fetchAnalyticsAPI();
      dispatch(setAnalytics(data.analytics));
      return data.analytics;
    } catch (err) {
      dispatch(setSettingsError(err.message));
    }
  }, [dispatch]);

  const updateProfile = useCallback(async (profileData) => {
    try {
      dispatch(setSettingsLoading(true));
      const data = await updateProfileSettingsAPI(profileData);
      dispatch(setProfile(data.profile || profileData));
      return data.profile || profileData;
    } catch (err) {
      dispatch(setSettingsError(err.message));
      throw err;
    } finally {
      dispatch(setSettingsLoading(false));
    }
  }, [dispatch]);

  const updatePreferences = useCallback(async (preferencesData) => {
    try {
      dispatch(setSettingsLoading(true));
      const data = await updatePreferencesAPI(preferencesData);
      const updated = data.preferences ?? preferencesData;
      await setCachedPreferences(updated);
      dispatch(setPreferences(updated));
      return updated;
    } catch (err) {
      dispatch(setSettingsError(err.message));
      throw err;
    } finally {
      dispatch(setSettingsLoading(false));
    }
  }, [dispatch]);

  const updateSubscription = useCallback(async (subscription) => {
    try {
      dispatch(setSettingsLoading(true));
      const data = await updateSubscriptionAPI(subscription);
      dispatch(setSubscription(data.subscription || subscription));
      await Promise.all([loadCredit(), loadTransactions(), loadTransactionSummary()]);
      return data;
    } catch (err) {
      dispatch(setSettingsError(err.message));
      throw err;
    } finally {
      dispatch(setSettingsLoading(false));
    }
  }, [dispatch, loadCredit, loadTransactions, loadTransactionSummary]);

  const generateApiKey = useCallback(async (keyName) => {
    try {
      dispatch(setSettingsLoading(true));
      const data = await generateApiKeyAPI(keyName);
      if (data.key) {
        dispatch(addApiKey(data.key));
      }
      return data.key;
    } catch (err) {
      dispatch(setSettingsError(err.message));
      throw err;
    } finally {
      dispatch(setSettingsLoading(false));
    }
  }, [dispatch]);

  const deleteApiKey = useCallback(async (keyId) => {
    try {
      dispatch(setSettingsLoading(true));
      const data = await deleteApiKeyAPI(keyId);
      const targetId = data.deletedId || keyId;
      dispatch(removeApiKey(targetId));
      return targetId;
    } catch (err) {
      dispatch(setSettingsError(err.message));
      throw err;
    } finally {
      dispatch(setSettingsLoading(false));
    }
  }, [dispatch]);

  const clearError = useCallback(() => {
    dispatch(clearSettingsError());
  }, [dispatch]);

  return {
    ...state,
    loadSettings,
    loadCredit,
    loadPackages,
    loadTransactions,
    loadTransactionSummary,
    loadAnalytics,
    updateProfile,
    updatePreferences,
    updateSubscription,
    generateApiKey,
    deleteApiKey,
    clearError
  };
};
