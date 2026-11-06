import { useEffect, useState } from 'react';

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

/**
 * Keeps the last non-null value. While a new filter or range loads, the page
 * keeps showing the previous data instead of falling back to skeletons.
 */
export function useLastValue(value) {
  const [last, setLast] = useState(value);
  if (value != null && value !== last) setLast(value);
  return value ?? last;
}
