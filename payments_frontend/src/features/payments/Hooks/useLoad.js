import { useCallback, useEffect, useState } from 'react';

/**
 * Runs a loader and reports its state for skeletons and refresh buttons.
 * `load` must be stable (useCallback); it re-runs when its identity changes.
 * It should resolve to the main data, or null/false when that failed.
 *
 *   loading     never finished yet -> show skeletons
 *   refreshing  has data, a newer run is in flight -> keep data, spin icon
 *   error       the latest finished run failed
 */
export default function useLoad(load, enabled = true) {
  const [nonce, setNonce] = useState(0);
  const [done, setDone] = useState({ load: null, nonce: -1, ok: true, at: null });

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    Promise.resolve()
      .then(load)
      .then(
        (res) => { if (active) setDone({ load, nonce, ok: res != null && res !== false, at: Date.now() }); },
        () => { if (active) setDone({ load, nonce, ok: false, at: Date.now() }); },
      );
    return () => { active = false; };
  }, [load, nonce, enabled]);

  const settled = done.load === load && done.nonce === nonce;
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return {
    loading: enabled && !done.at,
    refreshing: Boolean(done.at) && !settled,
    error: settled && !done.ok,
    updatedAt: done.at,
    reload,
  };
}

/** Value that only updates after it stops changing for `ms` (search boxes). */
export function useDebounced(value, ms = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** Current time that ticks every `ms`, for countdowns and "x min ago". */
export function useNow(ms = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
