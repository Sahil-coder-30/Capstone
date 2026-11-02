import { useCallback, useEffect, useRef } from 'react';

/** Keeps the list pinned to the bottom unless the user scrolled up. */
export function useAutoScroll(messages, isStreaming) {
  const scrollRef = useRef(null);
  const lastHeightRef = useRef(0);

  const resetScroll = useCallback(() => {
    lastHeightRef.current = 0;
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return undefined;

    const adjust = () => {
      const prevHeight = lastHeightRef.current;
      const hasShrunk = container.scrollHeight < prevHeight;
      const wasAtBottom = !prevHeight || hasShrunk || prevHeight - container.scrollTop - container.clientHeight <= 100;
      if (wasAtBottom) container.scrollTop = container.scrollHeight;
      lastHeightRef.current = container.scrollHeight;
    };

    adjust();
    const observer = new ResizeObserver(adjust);
    observer.observe(container);
    return () => observer.disconnect();
  }, [messages, isStreaming]);

  return { scrollRef, resetScroll };
}
