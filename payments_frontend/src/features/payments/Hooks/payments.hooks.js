import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchDashboardOverviewAPI,
  fetchSubscriptionAPI,
  fetchCreditAPI,
  updateSubscriptionAPI,
  fetchPackagesAPI,
  fetchTransactionsAPI,
  fetchTransactionByIdAPI,
  fetchUsageEventsAPI,
  fetchUsageAnalyticsAPI,
  fetchTransactionSummaryAPI,
  fetchAnalyticsAPI,
  createCheckoutSessionAPI,
  verifyPaymentAPI,
  checkCreditAvailabilityAPI,
} from '../service/payments.api';
import {
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
} from '../slice/payments.slice';

export const usePayments = () => {
  const dispatch = useDispatch();
  const state = useSelector((reduxState) => reduxState.payments);

  const loadDashboardOverview = useCallback(async () => {
    try {
      dispatch(setLoading(true));
      const res = await fetchDashboardOverviewAPI();
      if (res && res.data) {
        dispatch(setDashboardOverview(res.data));
        return res.data;
      }
      return null;
    } catch (err) {
      dispatch(setError(err.message));
    } finally {
      dispatch(setLoading(false));
    }
  }, [dispatch]);

  const loadSubscription = useCallback(async () => {
    try {
      dispatch(setLoading(true));
      const res = await fetchSubscriptionAPI();
      if (res && res.data) {
        dispatch(setSubscription(res.data));
        return res.data;
      }
      return null;
    } catch (err) {
      dispatch(setError(err.message));
    } finally {
      dispatch(setLoading(false));
    }
  }, [dispatch]);

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

  const loadTransactions = useCallback(async (filters = {}) => {
    try {
      dispatch(setLoading(true));
      const res = await fetchTransactionsAPI(typeof filters === 'number' ? { page: filters } : filters);
      if (res && res.data) {
        dispatch(setTransactions(res.data));
      }
      return res?.data;
    } catch (err) {
      dispatch(setError(err.message));
    } finally {
      dispatch(setLoading(false));
    }
  }, [dispatch]);

  const loadTransactionDetail = useCallback(async (transactionId) => {
    try {
      dispatch(setLoading(true));
      const res = await fetchTransactionByIdAPI(transactionId);
      if (res && res.data) {
        dispatch(setSelectedTransaction(res.data));
        return res.data;
      }
      return null;
    } catch (err) {
      dispatch(setError(err.message));
    } finally {
      dispatch(setLoading(false));
    }
  }, [dispatch]);

  const loadUsageEvents = useCallback(async (filters = {}) => {
    try {
      dispatch(setLoading(true));
      const res = await fetchUsageEventsAPI(filters);
      if (res && res.data) {
        dispatch(setUsageEvents(res.data));
        return res.data;
      }
      return null;
    } catch (err) {
      dispatch(setError(err.message));
    } finally {
      dispatch(setLoading(false));
    }
  }, [dispatch]);

  const loadUsageAnalytics = useCallback(async (days = 30) => {
    try {
      dispatch(setLoading(true));
      const res = await fetchUsageAnalyticsAPI(days);
      if (res && res.data) {
        dispatch(setUsageAnalytics(res.data));
        return res.data;
      }
      return null;
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

  const changeSubscription = useCallback(async (tier) => {
    try {
      dispatch(setLoading(true));
      const data = await updateSubscriptionAPI(tier);
      await Promise.all([
        loadSubscription(),
        loadCredit(),
        loadTransactions(),
        loadSummary(),
        loadDashboardOverview(),
      ]);
      return data;
    } catch (err) {
      dispatch(setError(err.message));
      throw err;
    } finally {
      dispatch(setLoading(false));
    }
  }, [dispatch, loadSubscription, loadCredit, loadTransactions, loadSummary, loadDashboardOverview]);

  const verifyPayment = useCallback(async ({ paymentId, orderId, signature, packageId }) => {
    try {
      dispatch(setLoading(true));
      const data = await verifyPaymentAPI({ paymentId, orderId, signature, packageId });
      await Promise.all([
        loadSubscription(),
        loadCredit(),
        loadTransactions(),
        loadSummary(),
        loadDashboardOverview(),
      ]);
      return data;
    } catch (err) {
      dispatch(setError(err.message));
      throw err;
    } finally {
      dispatch(setLoading(false));
    }
  }, [dispatch, loadSubscription, loadCredit, loadTransactions, loadSummary, loadDashboardOverview]);

  const initiateCheckout = useCallback(async (planId, billingCycle = 'monthly') => {

    try {
      dispatch(setLoading(true));
      const orderData = await createCheckoutSessionAPI(planId);
      dispatch(setSelectedPlanId(planId));
      dispatch(setBillingCycle(billingCycle));
      return orderData;
    } catch (err) {
      dispatch(setError(err.message));
      throw err;
    } finally {
      dispatch(setLoading(false));
    }
  }, [dispatch]);

  /**
   * checkCreditAvailability
   * Pre-flight hook for the AI chat Send button.
   *
   * Usage in a component:
   *   const { checkCreditAvailability, creditAvailability } = usePayments();
   *   useEffect(() => { checkCreditAvailability(); }, []);
   *   // or poll every 30s: setInterval(checkCreditAvailability, 30_000)
   *
   *   if (!creditAvailability.canQuery) {
   *     // Disable Send button, show countdown using creditAvailability.nextRefillAt
   *   }
   */
  const checkCreditAvailability = useCallback(async () => {
    dispatch(setCreditAvailability({ isLoading: true }));
    try {
      const data = await checkCreditAvailabilityAPI();
      if (data) {
        dispatch(setCreditAvailability({
          canQuery:           data.canQuery           ?? true,
          creditsRemaining:   data.creditsRemaining   ?? null,
          windowCreditsTotal: data.windowCreditsTotal ?? null,
          creditLowerLimit:   data.creditLowerLimit   ?? 5,
          nextRefillAt:       data.nextRefillAt       ?? null,
          windowExhaustedAt:  data.windowExhaustedAt  ?? null,
          timeUntilRefillMs:  data.timeUntilRefillMs  ?? null,
          subscription:       data.subscription       ?? 'free',
          isLoading: false,
        }));
        return data;
      }
    } catch (err) {
      dispatch(setCreditAvailability({ isLoading: false }));
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
  }, [dispatch]);

  const closePlanDetail = useCallback(() => {
    dispatch(setDetailPlanId(null));
  }, [dispatch]);

  const toggleTheme = useCallback(() => {
    const nextTheme = state.theme === 'light' ? 'dark' : 'light';
    dispatch(setTheme(nextTheme));
  }, [dispatch, state.theme]);

  return {
    ...state,
    loadDashboardOverview,
    loadSubscription,
    loadCredit,
    loadPackages,
    loadTransactions,
    loadTransactionDetail,
    loadUsageEvents,
    loadUsageAnalytics,
    loadSummary,
    loadAnalytics,
    changeSubscription,
    verifyPayment,
    initiateCheckout,
    checkCreditAvailability,
    selectPlan,
    selectBillingCycle,
    switchView,
    openPlanDetail,
    closePlanDetail,
    toggleTheme,
  };
};
