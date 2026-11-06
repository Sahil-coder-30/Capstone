// Billing data cached in localStorage, so a page refresh paints the last known
// numbers at once and only asks the server again when they are old.
//
// Stored shape: { v, owner, entries: { [key]: { data, at } } }
//   owner    id of the signed-in user the data belongs to
//   entries  one per API resource, `at` is when it was fetched (ms)
//
// No tokens or secrets are stored here. The cache is wiped on sign-out and
// whenever a different user signs in.

export const CACHE_KEY = 'taksha_payments_cache';
const VERSION = 1;
// Anything older than this is dropped on load instead of shown.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const EMPTY = { owner: null, entries: {} };

/** Parses a stored cache value. Bad, old or foreign data gives an empty cache. */
export function parseCache(raw, now = Date.now()) {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.v !== VERSION || !parsed.entries) return EMPTY;
    const entries = {};
    Object.entries(parsed.entries).forEach(([key, entry]) => {
      if (entry && typeof entry.at === 'number' && now - entry.at < MAX_AGE_MS) entries[key] = entry;
    });
    return { owner: parsed.owner ?? null, entries };
  } catch {
    return EMPTY;
  }
}

export function readCache() {
  try {
    return parseCache(localStorage.getItem(CACHE_KEY));
  } catch {
    return EMPTY;
  }
}

export function writeCache({ owner, entries }) {
  if (!owner) return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ v: VERSION, owner, entries }));
  } catch {
    // Quota full or storage blocked: drop the cache, the app still works from the network.
    clearCache();
  }
}

export function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // Storage blocked: nothing was saved either.
  }
}
