import { createSlice } from '@reduxjs/toolkit';
import { readCache } from '../utils/cache';

const readTheme = () => {
  try {
    return localStorage.getItem('theme') || 'light';
  } catch {
    return 'light';
  }
};

// Request pages kept per filter combination; older ones are dropped.
const MAX_EVENT_PAGES = 8;

/**
 * entries  server data by resource key, e.g. `credit`, `analytics:30`,
 *          `events:page=2`. Each is { data, at }. Saved to localStorage.
 * status   per key { pending, error } for the request in flight. Memory only.
 * owner    user id the entries belong to.
 */
const initialState = {
  ...readCache(),
  status: {},
  theme: readTheme(),
};

const put = (state, key, data, at) => {
  if (data !== undefined) state.entries[key] = { data, at };
};

const paymentsSlice = createSlice({
  name: 'payments',
  initialState,
  reducers: {
    fetchStarted(state, { payload: keys }) {
      keys.forEach((k) => { state.status[k] = { pending: true, error: state.status[k]?.error || false }; });
    },
    fetchFailed(state, { payload: keys }) {
      keys.forEach((k) => { state.status[k] = { pending: false, error: true }; });
    },
    fetchSucceeded(state, { payload: { keys, data, at } }) {
      const [key] = keys;
      put(state, key, data, at);

      // The overview also carries the plan, the credit window and 30 days of analytics.
      if (key === 'overview') {
        put(state, 'credit', data.credit, at);
        put(state, 'subscription', data.subscription, at);
        put(state, 'analytics:30', data.analytics, at);
      }

      if (key.startsWith('events:')) {
        const pages = Object.keys(state.entries)
          .filter((k) => k.startsWith('events:'))
          .sort((a, b) => state.entries[b].at - state.entries[a].at);
        pages.slice(MAX_EVENT_PAGES).forEach((k) => { delete state.entries[k]; });
      }

      keys.forEach((k) => { state.status[k] = { pending: false, error: false }; });
    },
    /** Takes entries from another tab when they are newer than ours. */
    mergeEntries(state, { payload: { owner, entries } }) {
      if (!owner || owner !== state.owner) return;
      Object.entries(entries).forEach(([key, entry]) => {
        if (!state.entries[key] || state.entries[key].at < entry.at) state.entries[key] = entry;
      });
    },
    /** Drops every entry, for sign-out or a different user. */
    resetData(state, { payload: owner }) {
      state.owner = owner ?? null;
      state.entries = {};
      state.status = {};
    },
    setTheme(state, action) {
      state.theme = action.payload;
    },
  },
});

export const {
  fetchStarted, fetchFailed, fetchSucceeded, mergeEntries, resetData, setTheme,
} = paymentsSlice.actions;

export default paymentsSlice.reducer;
