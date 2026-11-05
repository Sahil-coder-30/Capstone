import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchDashboardOverviewAPI,
  fetchSubscriptionAPI,
  fetchCreditAPI,
  fetchSpendSummaryAPI,
  fetchTransactionsAPI,
  fetchUsageEventsAPI,
  fetchUsageAnalyticsAPI,
} from '../service/payments.api';
import {
  setSubscription,
  setCredit,
  setDashboardOverview,
  setUsageAnalytics,
  setUsageEvents,
  setUsageSample,
  setPaymentHistory,
  setSummary,
  setTheme,
} from '../slice/payments.slice';

/** Runs an API call, stores `pick(body)` with `action`, and returns it (null on failure). */
async function run(dispatch, call, pick, action) {
  try {
    const body = await call();
    const data = pick(body);
    if (data == null) return null;
    dispatch(action(data));
    return data;
  } catch (err) {
    console.warn('[payments]', err?.response?.data?.message || err.message);
    return null;
  }
}

export const applyTheme = (theme) => {
  document.documentElement.classList.toggle('light-theme', theme === 'light');
  try {
    localStorage.setItem('theme', theme);
  } catch {
    // Private mode: the theme still applies for this visit.
  }
};

export const usePayments = () => {
  const dispatch = useDispatch();
  const state = useSelector((s) => s.payments);

  const loadDashboardOverview = useCallback(
    () => run(dispatch, fetchDashboardOverviewAPI, (b) => b?.data, setDashboardOverview), [dispatch]);
  const loadSubscription = useCallback(
    () => run(dispatch, fetchSubscriptionAPI, (b) => b?.data, setSubscription), [dispatch]);
  const loadCredit = useCallback(
    () => run(dispatch, fetchCreditAPI, (b) => b?.credit, setCredit), [dispatch]);
  const loadSummary = useCallback(
    () => run(dispatch, fetchSpendSummaryAPI, (b) => b?.summary, setSummary), [dispatch]);
  const loadUsageAnalytics = useCallback(
    (days = 30) => run(dispatch, () => fetchUsageAnalyticsAPI(days), (b) => b?.data, setUsageAnalytics), [dispatch]);
  const loadUsageEvents = useCallback(
    (filters) => run(dispatch, () => fetchUsageEventsAPI(filters), (b) => b?.data, setUsageEvents), [dispatch]);
  const loadUsageSample = useCallback(
    () => run(dispatch, () => fetchUsageEventsAPI({ page: 1, limit: 100 }), (b) => b?.data, setUsageSample), [dispatch]);
  const loadPaymentHistory = useCallback(
    () => run(dispatch, () => fetchTransactionsAPI({ page: 1, limit: 100 }), (b) => b?.data, setPaymentHistory), [dispatch]);

  /** Re-read everything a purchase changes. */
  const refreshAfterPayment = useCallback(
    () => Promise.all([loadDashboardOverview(), loadPaymentHistory(), loadSummary()]),
    [loadDashboardOverview, loadPaymentHistory, loadSummary],
  );

  const toggleTheme = useCallback(() => {
    const next = state.theme === 'light' ? 'dark' : 'light';
    applyTheme(next);
    dispatch(setTheme(next));
  }, [dispatch, state.theme]);

  return {
    ...state,
    loadDashboardOverview,
    loadSubscription,
    loadCredit,
    loadSummary,
    loadUsageAnalytics,
    loadUsageEvents,
    loadUsageSample,
    loadPaymentHistory,
    refreshAfterPayment,
    toggleTheme,
  };
};
