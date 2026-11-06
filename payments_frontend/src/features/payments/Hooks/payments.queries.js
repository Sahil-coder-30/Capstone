import { useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchCreditAPI,
  fetchDashboardOverviewAPI,
  fetchSpendSummaryAPI,
  fetchSubscriptionAPI,
  fetchTransactionsAPI,
  fetchUsageAnalyticsAPI,
  fetchUsageEventsAPI,
} from '../service/payments.api';
import { fetchFailed, fetchStarted, fetchSucceeded, resetData } from '../slice/payments.slice';
import { clearCache } from '../utils/cache';

const MIN = 60 * 1000;

const PERIOD_MS = { '1d': 864e5, '7d': 7 * 864e5, '30d': 30 * 864e5 };

/**
 * Every server resource the app reads. `ttl` is how long a fetched copy counts
 * as fresh: inside it nothing is fetched, after it the cached copy is shown and
 * a new one is fetched in the background.
 *
 * Credits change while the user works in the IDE, so they go stale fastest.
 * Payments only change through checkout, which refreshes them itself.
 */
const RESOURCES = {
  overview: {
    ttl: MIN,
    covers: ['credit', 'subscription', 'analytics:30'],
    fetch: async () => (await fetchDashboardOverviewAPI())?.data,
  },
  credit: { ttl: MIN, fetch: async () => (await fetchCreditAPI())?.credit },
  subscription: { ttl: 5 * MIN, fetch: async () => (await fetchSubscriptionAPI())?.data },
  summary: { ttl: 5 * MIN, fetch: async () => (await fetchSpendSummaryAPI())?.summary },
  // Last 100 payments (backend max page size): invoices, spend history, stats.
  history: { ttl: 10 * MIN, fetch: async () => (await fetchTransactionsAPI({ page: 1, limit: 100 }))?.data },
  // Last 100 AI requests: model, project and hour breakdowns.
  sample: { ttl: 2 * MIN, fetch: async () => (await fetchUsageEventsAPI({ page: 1, limit: 100 }))?.data },
  analytics: { ttl: 2 * MIN, fetch: async (days) => (await fetchUsageAnalyticsAPI(Number(days)))?.data },
  events: {
    ttl: MIN,
    fetch: async (query) => {
      const p = Object.fromEntries(new URLSearchParams(query));
      const ms = PERIOD_MS[p.period];
      return (await fetchUsageEventsAPI({
        page: Number(p.page) || 1,
        limit: Number(p.limit) || 20,
        agentType: p.agent,
        search: p.q,
        startDate: ms ? new Date(Date.now() - ms).toISOString() : undefined,
      }))?.data;
    },
  },
};

const resolve = (key) => {
  const i = key.indexOf(':');
  const kind = i < 0 ? key : key.slice(0, i);
  return { def: RESOURCES[kind], arg: i < 0 ? undefined : key.slice(i + 1) };
};

/** Key for one page of the requests table. The period stays relative, so the key is stable. */
export const eventsKey = ({ page = 1, limit = 20, agent = 'all', period = 'all', q = '' }) => {
  const p = new URLSearchParams({ page, limit });
  if (agent !== 'all') p.set('agent', agent);
  if (period !== 'all') p.set('period', period);
  if (q) p.set('q', q);
  return `events:${p}`;
};

// Requests in flight by key, so two components asking at once share one call.
const inflight = new Map();
// Bumped on reset, so answers for a previous user are thrown away.
let generation = 0;

/**
 * Makes sure `key` is fresh. Returns its data. Fetches only when the cached
 * copy is missing or older than the resource ttl, or when `force` is set.
 */
export const ensure = (key, { force = false } = {}) => (dispatch, getState) => {
  if (inflight.has(key)) return inflight.get(key);

  const { def, arg } = resolve(key);
  if (!def) return Promise.resolve(null);
  const entry = getState().payments.entries[key];
  if (!force && entry && Date.now() - entry.at < def.ttl) return Promise.resolve(entry.data);

  const keys = [key, ...(def.covers || []).filter((k) => !inflight.has(k))];
  const gen = generation;
  dispatch(fetchStarted(keys));

  const request = Promise.resolve()
    .then(() => def.fetch(arg))
    .then((data) => {
      if (data == null) throw new Error('Empty response');
      if (gen === generation) dispatch(fetchSucceeded({ keys, data, at: Date.now() }));
    })
    .catch((err) => {
      console.warn('[payments]', key, err?.response?.data?.message || err.message);
      if (gen === generation) dispatch(fetchFailed(keys));
    });

  keys.forEach((k) => {
    const p = request
      .then(() => getState().payments.entries[k]?.data ?? null)
      .finally(() => { if (inflight.get(k) === p) inflight.delete(k); });
    inflight.set(k, p);
  });
  return inflight.get(key);
};

/** Wipes cached data. Used on sign-out and when another user signs in. */
export const resetCache = (owner = null) => (dispatch) => {
  generation += 1;
  inflight.clear();
  clearCache();
  dispatch(resetData(owner));
};

/** Keeps the cache only if it belongs to the user who is signed in now. */
export const syncOwner = (userId) => (dispatch, getState) => {
  if (getState().payments.owner !== (userId ?? null)) dispatch(resetCache(userId));
};

const EMPTY = {};

/**
 * Loads the given resource keys for a component and reports their state.
 *
 *   loading     no data yet for some key -> show skeletons
 *   refreshing  data is shown, a newer copy is being fetched
 *   error       the latest fetch for some key failed
 *   updatedAt   when the oldest of the keys was fetched
 *
 * Stale keys are checked again when the tab becomes visible or the network
 * comes back, so credits used in the IDE show up without a manual refresh.
 */
export function useQueries(keys, { enabled = true } = {}) {
  const dispatch = useDispatch();
  const sig = keys.join('|');
  const entries = useSelector((s) => s.payments.entries);
  const status = useSelector((s) => s.payments.status);

  useEffect(() => {
    if (!enabled) return undefined;
    const run = () => sig.split('|').forEach((k) => dispatch(ensure(k)));
    const onVisible = () => { if (document.visibilityState === 'visible') run(); };
    run();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', run);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', run);
    };
  }, [sig, enabled, dispatch]);

  const reload = useCallback(
    () => Promise.all(sig.split('|').map((k) => dispatch(ensure(k, { force: true })))),
    [sig, dispatch],
  );

  const list = sig.split('|');
  const error = list.some((k) => (status[k] || EMPTY).error);
  const hasAll = list.every((k) => entries[k]);
  const pending = list.some((k) => (status[k] || EMPTY).pending);
  const times = list.map((k) => entries[k]?.at).filter(Boolean);

  return {
    loading: enabled && !hasAll && !error,
    refreshing: pending && hasAll,
    pending,
    error,
    updatedAt: times.length ? Math.min(...times) : null,
    reload,
  };
}
