import { configureStore } from '@reduxjs/toolkit';
import paymentsReducer, { mergeEntries } from './features/payments/slice/payments.slice';
import { CACHE_KEY, parseCache, writeCache } from './features/payments/utils/cache';

export const store = configureStore({
  reducer: {
    payments: paymentsReducer,
  },
});

// Save fetched data to localStorage, batched so a burst of responses is one write.
let saved = store.getState().payments.entries;
let timer = null;

const save = () => {
  timer = null;
  const { owner, entries } = store.getState().payments;
  if (entries === saved) return;
  saved = entries;
  writeCache({ owner, entries });
};

store.subscribe(() => {
  if (store.getState().payments.entries !== saved && !timer) timer = setTimeout(save, 250);
});

window.addEventListener('pagehide', () => {
  if (timer) { clearTimeout(timer); save(); }
});

// Another tab fetched newer data (or paid): take it instead of fetching again.
window.addEventListener('storage', (e) => {
  if (e.key !== CACHE_KEY || !e.newValue) return;
  store.dispatch(mergeEntries(parseCache(e.newValue)));
  // Nothing new of our own to save: do not write the merged copy back.
  if (!timer) saved = store.getState().payments.entries;
});
