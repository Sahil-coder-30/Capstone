import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchCreditAPI,
  fetchPackagesAPI,
  fetchTransactionsAPI,
  fetchTransactionSummaryAPI,
  fetchAnalyticsAPI
} from '../service/payments.api';
import {
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
} from '../slice/payments.slice';

export const usePayments = () => {
  const dispatch = useDispatch();
  const state = useSelector((reduxState) => reduxState.payments);

  const loadCredit = useCallback(async () => {
    try {
      dispatch(setLoading(true));
      const data = await fetchCreditAPI();
      if (data && data.credit) {
        dispatch(setCredit(data.credit));
      }
      return data;
    } catch (err) {
      dispatch(setError(err.message));
    } finally {
      dispatch(setLoading(false));
    }
  }, [dispatch]);

  const loadPackages = useCallback(async () => {
    try {
      dispatch(setLoading(true));
      const data = await fetchPackagesAPI();
      if (data && data.packages) {
        dispatch(setPackages(data.packages));
      }
      return data;
    } catch (err) {
      dispatch(setError(err.message));
    } finally {
      dispatch(setLoading(false));
    }
  }, [dispatch]);

  const loadTransactions = useCallback(async (page = 1, limit = 20) => {
    try {
      dispatch(setLoading(true));
      const data = await fetchTransactionsAPI(page, limit);
      if (data && data.transactions) {
        dispatch(setTransactions(data.transactions));
      }
      return data;
    } catch (err) {
      dispatch(setError(err.message));
    } finally {
      dispatch(setLoading(false));
    }
  }, [dispatch]);

  const loadSummary = useCallback(async () => {
    try {
      const data = await fetchTransactionSummaryAPI();
      if (data && data.summary) {
        dispatch(setSummary(data.summary));
      }
      return data;
    } catch (err) {
      dispatch(setError(err.message));
    }
  }, [dispatch]);

  const loadAnalytics = useCallback(async () => {
    try {
      const data = await fetchAnalyticsAPI();
      if (data && data.analytics) {
        dispatch(setAnalytics(data.analytics));
      }
      return data;
    } catch (err) {
      dispatch(setError(err.message));
    }
  }, [dispatch]);

  const selectPlan = useCallback((planId) => {
    dispatch(setSelectedPlanId(planId));
  }, [dispatch]);

  const selectBillingCycle = useCallback((cycle) => {
    dispatch(setBillingCycle(cycle));
  }, [dispatch]);

  const switchView = useCallback((viewName) => {
    dispatch(setActiveView(viewName));
  }, [dispatch]);

  const openPlanDetail = useCallback((planId) => {
    dispatch(setDetailPlanId(planId));
    dispatch(setActiveView('detail'));
  }, [dispatch]);

  return {
    ...state,
    loadCredit,
    loadPackages,
    loadTransactions,
    loadSummary,
    loadAnalytics,
    selectPlan,
    selectBillingCycle,
    switchView,
    openPlanDetail
  };
};
