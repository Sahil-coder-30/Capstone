import { useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setTheme } from '../slice/payments.slice';
import { ensure } from './payments.queries';

const FREE_SUBSCRIPTION = { activeTier: 'free', status: 'FREE', activeSlot: null, reservedSlots: [] };

export const applyTheme = (theme) => {
  document.documentElement.classList.toggle('light-theme', theme === 'light');
  try {
    localStorage.setItem('theme', theme);
  } catch {
    // Private mode: the theme still applies for this visit.
  }
};

/**
 * Billing data from the store, in the shape the pages use. Loading is done by
 * useQueries (payments.queries.js); this hook only reads.
 */
export const usePayments = () => {
  const dispatch = useDispatch();
  const entries = useSelector((s) => s.payments.entries);
  const theme = useSelector((s) => s.payments.theme);

  const data = useMemo(() => {
    const get = (key) => entries[key]?.data;
    const history = get('history');
    const sample = get('sample');
    return {
      subscription: get('subscription') || FREE_SUBSCRIPTION,
      credit: get('credit') || null,
      dashboardOverview: get('overview') || null,
      summary: get('summary') || null,
      paymentHistory: {
        transactions: history?.transactions || [],
        total: history?.total || 0,
        summary: history?.summary || null,
      },
      usageSample: { events: sample?.events || [], total: sample?.total || 0 },
      analyticsFor: (days) => get(`analytics:${days}`) || null,
      eventsFor: (key) => get(key) || null,
    };
  }, [entries]);

  /** Re-reads everything a purchase changes. */
  const refreshAfterPayment = useCallback(
    () => Promise.all(['overview', 'history', 'summary'].map((k) => dispatch(ensure(k, { force: true })))),
    [dispatch],
  );

  const toggleTheme = useCallback(() => {
    const next = theme === 'light' ? 'dark' : 'light';
    applyTheme(next);
    dispatch(setTheme(next));
  }, [dispatch, theme]);

  return { ...data, theme, refreshAfterPayment, toggleTheme };
};
