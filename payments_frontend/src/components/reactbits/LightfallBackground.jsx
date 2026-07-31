import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import './Lightfall.css';

const Lightfall = lazy(() => import('./Lightfall'));

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const listener = e => setReduced(e.matches);
    if (mq.addEventListener) {
      mq.addEventListener('change', listener);
    } else {
      mq.addListener(listener);
    }
    return () => {
      if (mq.removeEventListener) {
        mq.removeEventListener('change', listener);
      } else {
        mq.removeListener(listener);
      }
    };
  }, []);
  return reduced;
}

function useInView(ref) {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.01 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  return inView;
}

export default function LightfallBackground({
  colors = ['#A6C8FF', '#5227FF', '#FF9FFC'],
  backgroundColor = '#0A29FF',
  speed = 0.5,
  streakCount = 2,
  streakWidth = 1,
  streakLength = 1,
  glow = 1,
  density = 0.6,
  twinkle = 1,
  zoom = 3,
  backgroundGlow = 0.5,
  opacity = 0.85,
  mouseInteraction = true,
  mouseStrength = 0.5,
  mouseRadius = 1,
  mouseDampening = 0.15,
  mixBlendMode = 'screen',
  paused = false,
  dprCustom,
  className = ''
}) {
  const containerRef = useRef(null);
  const inView = useInView(containerRef);
  const reducedMotion = usePrefersReducedMotion();

  // Cap DPR on mobile screens to prevent WebGL framerate drops
  const dpr = dprCustom ?? (
    typeof window === 'undefined'
      ? 1
      : window.innerWidth < 768
        ? 1
        : Math.min(window.devicePixelRatio || 1, 2)
  );

  const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  if (reducedMotion) {
    return (
      <div className={`lightfall-bg-wrapper ${className}`}>
        <div className="lightfall-fallback" style={{ backgroundColor }} />
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`lightfall-bg-wrapper ${className}`}>
      <Suspense fallback={<div className="lightfall-fallback" style={{ backgroundColor }} />}>
        <Lightfall
          colors={colors}
          backgroundColor={backgroundColor}
          speed={speed}
          streakCount={streakCount}
          streakWidth={streakWidth}
          streakLength={streakLength}
          glow={glow}
          density={density}
          twinkle={twinkle}
          zoom={zoom}
          backgroundGlow={backgroundGlow}
          opacity={opacity}
          mouseInteraction={mouseInteraction && !isTouch}
          mouseStrength={mouseStrength}
          mouseRadius={mouseRadius}
          mouseDampening={mouseDampening}
          mixBlendMode={mixBlendMode}
          paused={paused || !inView}
          dpr={dpr}
        />
      </Suspense>
    </div>
  );
}
