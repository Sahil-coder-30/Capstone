import { useCallback, useEffect, useRef, useState } from 'react';

const COPIED_MS = 2000;

/** Copy state for the code blocks of a single turn. */
export function useCopyCode() {
  const [copiedIdx, setCopiedIdx] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const copy = useCallback((text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopiedIdx(null), COPIED_MS);
  }, []);

  return { copiedIdx, copy };
}
