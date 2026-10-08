import React, { useEffect, useRef, useState, useCallback } from 'react';
import gsap from 'gsap';
import styles from './PaymentsIntroLoader.module.scss';

const SESSION_KEY = 'taksha_payments_intro_v10_clip';

export default function PaymentsIntroLoader({ onComplete, onExitStart, forcePlay = false }) {
  const [destroyed, setDestroyed] = useState(false);
  const containerRef = useRef(null);
  const titleRef = useRef(null);
  const dividerRef = useRef(null);
  const razorpayRef = useRef(null);

  const hasStartedRef = useRef(false);
  const hasExitedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const onExitStartRef = useRef(onExitStart);
  onCompleteRef.current = onComplete;
  onExitStartRef.current = onExitStart;

  // Check if previously seen in session (only if not forced)
  const isAlreadySeen = !forcePlay && (() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) === 'true';
    } catch {
      return false;
    }
  })();

  // Bulletproof single-execution Exit Handler
  const executeExit = useCallback(() => {
    if (hasExitedRef.current) return;
    hasExitedRef.current = true;

    try {
      sessionStorage.setItem(SESSION_KEY, 'true');
    } catch {}

    if (onExitStartRef.current) {
      onExitStartRef.current();
    }

    const el = containerRef.current;
    if (el) {
      gsap.to(el, {
        opacity: 0,
        scale: 1.015,
        duration: 0.65,
        ease: 'power2.inOut',
        onComplete: () => {
          setDestroyed(true);
          window.scrollTo(0, 0);
          if (onCompleteRef.current) onCompleteRef.current();
        },
      });
    } else {
      setDestroyed(true);
      window.scrollTo(0, 0);
      if (onCompleteRef.current) onCompleteRef.current();
    }
  }, []);

  // Strict scroll lock on mount to prevent any page scroll bleed or overflow
  useEffect(() => {
    if (isAlreadySeen || destroyed) return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    window.scrollTo(0, 0);

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      window.scrollTo(0, 0);
    };
  }, [isAlreadySeen, destroyed]);

  // Fallback safety timer so the intro is guaranteed to auto-fade
  useEffect(() => {
    if (isAlreadySeen || destroyed) return;
    const fallbackTimer = setTimeout(() => {
      executeExit();
    }, 4200);
    return () => clearTimeout(fallbackTimer);
  }, [isAlreadySeen, destroyed, executeExit]);

  // Keyboard shortcut listener (ESC / Enter / Space)
  useEffect(() => {
    if (isAlreadySeen || destroyed) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        executeExit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAlreadySeen, destroyed, executeExit]);

  // If already seen, bypass immediately
  useEffect(() => {
    if (isAlreadySeen) {
      if (onExitStartRef.current) onExitStartRef.current();
      if (onCompleteRef.current) onCompleteRef.current();
    }
  }, [isAlreadySeen]);

  // Master GSAP Timeline — Specular light sweep animated STRICTLY inside text background-clip
  useEffect(() => {
    if (isAlreadySeen || destroyed || hasStartedRef.current) return;
    hasStartedRef.current = true;

    const titleEl = titleRef.current;
    const divEl = dividerRef.current;
    const rzpEl = razorpayRef.current;

    if (!titleEl) return;

    // Initial states
    gsap.set(titleEl, {
      opacity: 0,
      y: 24,
      backgroundPosition: '190% 0',
    });
    if (divEl) gsap.set(divEl, { scaleX: 0, opacity: 0, transformOrigin: 'center' });
    if (rzpEl) gsap.set(rzpEl, { opacity: 0, y: 10 });

    const tl = gsap.timeline({
      onComplete: () => {
        setTimeout(executeExit, 600);
      },
    });

    // ── Step 1: "Taksha Payments" lifts into place smoothly (0.15s → 0.9s) ──
    tl.to(
      titleEl,
      {
        opacity: 1,
        y: 0,
        duration: 0.75,
        ease: 'power3.out',
      },
      0.15
    );

    // ── Step 2: Specular Chrome & Iris Sweep travels EXCLUSIVELY INSIDE the letterforms (0.8s → 2.1s) ──
    tl.to(
      titleEl,
      {
        backgroundPosition: '-60% 0',
        duration: 1.3,
        ease: 'power2.inOut',
      },
      0.8
    );

    // ── Step 3: Hairline Laser Alignment Divider Draws Open (1.65s → 2.15s) ──
    if (divEl) {
      tl.to(
        divEl,
        {
          scaleX: 1,
          opacity: 1,
          duration: 0.5,
          ease: 'power3.out',
        },
        1.65
      );
    }

    // ── Step 4: "Powered by razorpay" Appears (1.9s → 2.35s) ─────────
    if (rzpEl) {
      tl.to(
        rzpEl,
        {
          opacity: 1,
          y: 0,
          duration: 0.45,
          ease: 'power2.out',
        },
        1.9
      );
    }
  }, [isAlreadySeen, destroyed, executeExit]);

  if (isAlreadySeen || destroyed) return null;

  return (
    <div
      ref={containerRef}
      className={styles.entryLoader}
      onClick={executeExit}
      role="dialog"
      aria-label="Taksha Payments Portal Entry"
    >
      {/* Deep Center Specular Atmospheric Halo */}
      <div className={styles.ambientCenterGlow} />

      {/* Main Visual Stage */}
      <div className={styles.stage}>
        {/* Single-Line Monumental Typography with Specular Sweep ONLY inside letters */}
        <h1 ref={titleRef} className={styles.titleText}>
          Taksha Payments
        </h1>

        {/* High-Precision Laser Alignment Beam */}
        <div ref={dividerRef} className={styles.divider}>
          <div className={styles.dividerLineLeft} />
          <div className={styles.dividerCoreDot} />
          <div className={styles.dividerLineRight} />
        </div>

        {/* Minimalist Powered by Razorpay Branding */}
        <div ref={razorpayRef} className={styles.razorpayRow}>
          <span className={styles.poweredText}>Powered by</span>
          <div className={styles.razorpayBrand}>
            <svg
              className={styles.razorpayBolt}
              width="13"
              height="16"
              viewBox="0 0 14 18"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M8.5 0L0 10.5H6L5.5 18L14 7.5H8L8.5 0Z"
                fill="url(#rzpBoltGrad)"
              />
              <defs>
                <linearGradient id="rzpBoltGrad" x1="0" y1="0" x2="14" y2="18" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#5591F7" />
                  <stop offset="1" stopColor="#1B6EF3" />
                </linearGradient>
              </defs>
            </svg>
            <span className={styles.razorpayName}>razorpay</span>
          </div>
        </div>
      </div>
    </div>
  );
}
