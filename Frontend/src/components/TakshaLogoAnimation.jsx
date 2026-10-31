import React, { useRef, useState, useCallback, useEffect, useId } from 'react';
import gsap from 'gsap';
import './TakshaLogoAnimation.scss';

const TAKSHA_CHARS = ['T', 'A', 'K', 'S', 'H', 'A'];
const STUDIO_CHARS = ['S', 't', 'u', 'd', 'i', 'o'];
const SCRAMBLE_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*?+=';

const SWEEP_LEFT = 62;
const SWEEP_RIGHT = 162;
const SWEEP_DIST = SWEEP_RIGHT - SWEEP_LEFT;
const SWEEP_DUR = 0.9;
const SCRAMBLE_MS = 520;

export default function TakshaLogoAnimation({ 
  className = '', 
  style = {},
  maxWidth = '380px',
  autoPlay = true,
  interactive = true,
  onComplete = null
}) {
  const containerRef = useRef(null);
  const activeRAFsRef = useRef([]);
  const triggeredRef = useRef(Array(6).fill(false));
  const masterTLRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);

  // Generate unique prefix for SVG defs to avoid collisions across multiple logo instances
  const rawUid = useId();
  const uid = rawUid.replace(/[^a-zA-Z0-9_-]/g, '_');

  const ids = {
    lgFace: `lgFace_${uid}`,
    lgShade: `lgShade_${uid}`,
    lgMetalText: `lgMetalText_${uid}`,
    lgSheen: `lgSheen_${uid}`,
    fScan: `fScan_${uid}`,
    cpText: `cpText_${uid}`
  };

  // Scramble single letter function with rAF and cubic ease-in lock
  const scrambleLetter = useCallback((el, targetChar) => {
    if (!el) return;
    const t0 = performance.now();
    const settle0 = SCRAMBLE_MS * 0.68;
    let locked = false;
    let frame = 0;
    let rafId;

    function tick(now) {
      if (locked) return;
      const elapsed = now - t0;
      const tNorm = Math.min(elapsed / SCRAMBLE_MS, 1);

      if (tNorm >= 1) {
        el.textContent = targetChar;
        el.setAttribute('fill', `url(#${ids.lgMetalText})`);
        activeRAFsRef.current = activeRAFsRef.current.filter((id) => id !== rafId);
        return;
      }

      if (elapsed < settle0) {
        el.textContent = SCRAMBLE_POOL[Math.floor(Math.random() * SCRAMBLE_POOL.length)];
        el.setAttribute('fill', '#3DC5A1');
      } else {
        const st = (elapsed - settle0) / (SCRAMBLE_MS - settle0);
        const lockP = st * st * st; // cubic ease-in lock

        if (Math.random() < lockP) {
          locked = true;
          el.textContent = targetChar;
          el.setAttribute('fill', `url(#${ids.lgMetalText})`);
          activeRAFsRef.current = activeRAFsRef.current.filter((id) => id !== rafId);
          return;
        }

        const skip = Math.round(1 + st * 9);
        if (frame % skip === 0) {
          el.textContent = SCRAMBLE_POOL[Math.floor(Math.random() * SCRAMBLE_POOL.length)];
          el.setAttribute('fill', '#3DC5A1');
        }
      }

      frame++;
      rafId = requestAnimationFrame(tick);
      activeRAFsRef.current = activeRAFsRef.current.filter((id) => id !== rafId);
      activeRAFsRef.current.push(rafId);
    }

    rafId = requestAnimationFrame(tick);
    activeRAFsRef.current.push(rafId);
  }, [ids.lgMetalText]);

  const cancelAllScrambles = useCallback(() => {
    activeRAFsRef.current.forEach(cancelAnimationFrame);
    activeRAFsRef.current = [];
  }, []);

  const resetSVG = useCallback(() => {
    const scope = containerRef.current;
    if (!scope) return;

    const letterElements = scope.querySelectorAll('.letter-slot');
    letterElements.forEach((el, i) => {
      if (el) {
        el.textContent = STUDIO_CHARS[i];
        el.setAttribute('fill', '#E2E8F0');
      }
    });

    gsap.set(scope.querySelectorAll('.ch'), { opacity: 0, y: -14 });
    gsap.set(scope.querySelector('.g-wordmark'), { opacity: 0 });
    gsap.set(scope.querySelector('.g-sweep'), { opacity: 0, x: 0 });
    gsap.set(scope.querySelector('.g-sheen'), { opacity: 0 });
    gsap.set(scope.querySelector('.g-sheen-move'), { x: 0 });
    gsap.set(scope.querySelector('.codespace-submark'), { opacity: 0 });
  }, []);

  const playAnimation = useCallback(() => {
    const scope = containerRef.current;
    if (!scope) return;

    cancelAllScrambles();

    const gSweep = scope.querySelector('.g-sweep');
    const gSheenMove = scope.querySelector('.g-sheen-move');

    if (gSweep && gSheenMove) {
      gsap.killTweensOf([gSweep, gSheenMove]);
    }

    if (masterTLRef.current) {
      masterTLRef.current.kill();
    }

    triggeredRef.current = Array(6).fill(false);
    resetSVG();

    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      const letterElements = scope.querySelectorAll('.letter-slot');
      letterElements.forEach((el, i) => {
        if (el) {
          el.textContent = TAKSHA_CHARS[i];
          el.setAttribute('fill', `url(#${ids.lgMetalText})`);
        }
      });
      gsap.set(scope.querySelectorAll('.ch'), { opacity: 1, y: 0 });
      gsap.set(scope.querySelector('.g-wordmark'), { opacity: 1 });
      gsap.set(scope.querySelector('.codespace-submark'), { opacity: 1 });
      if (onComplete) onComplete();
      return;
    }

    const tl = gsap.timeline();

    const chisel = scope.querySelectorAll('.ch');
    const gWordmark = scope.querySelector('.g-wordmark');
    const gSheen = scope.querySelector('.g-sheen');
    const codespace = scope.querySelector('.codespace-submark');
    const letterElements = scope.querySelectorAll('.letter-slot');
    const letterX = [75, 89, 103, 117, 131, 145];

    // Phase 1 — The chisel strikes in, beam first
    tl.to(chisel, { opacity: 1, y: 0, duration: 0.5, stagger: 0.16, ease: 'back.out(2)' }, 0.1);

    // Phase 2 — "Studio" Wordmark Fade In (1.5s)
    tl.to(gWordmark, { opacity: 1, duration: 0.42, ease: 'power2.out' }, 1.5);

    // Phase 3 — Metallic Scan Sweep + Cipher Scramble (2.0s → 2.9s)
    tl.set(gSweep, { opacity: 1, x: 0 }, 2.0);
    tl.to(gSweep, {
      x: SWEEP_DIST,
      duration: SWEEP_DUR,
      ease: 'power1.inOut',
      onUpdate() {
        const prog = this.progress();
        const sweepX = SWEEP_LEFT + prog * SWEEP_DIST;

        letterX.forEach((lx, i) => {
          if (sweepX > lx && !triggeredRef.current[i]) {
            triggeredRef.current[i] = true;
            const el = letterElements[i];
            if (el) scrambleLetter(el, TAKSHA_CHARS[i]);
          }
        });
      }
    }, 2.0);
    tl.set(gSweep, { opacity: 0 }, 2.0 + SWEEP_DUR + 0.02);

    // Phase 4 — Metallic Text Sheen Sweep (2.95s)
    tl.set(gSheen, { opacity: 1 }, 2.95);
    tl.to(gSheenMove, { x: 172, duration: 0.65, ease: 'power2.inOut' }, 2.95);
    tl.to(gSheen, { opacity: 0, duration: 0.12 }, 3.55);

    // Phase 5 — CODESPACE Submark Fade In (3.05s)
    tl.to(codespace, { opacity: 1, duration: 0.45, ease: 'power2.out' }, 3.05);

    // Phase 6 — Notify Completion when fully resolved at 3.5s
    tl.call(() => {
      if (onComplete) onComplete();
    }, [], 3.5);

    masterTLRef.current = tl;
  }, [cancelAllScrambles, resetSVG, scrambleLetter, ids.lgMetalText, onComplete]);

  useEffect(() => {
    let timer;
    if (autoPlay) {
      timer = setTimeout(() => {
        playAnimation();
      }, 50);
    }
    return () => {
      if (timer) clearTimeout(timer);
      cancelAllScrambles();
      if (masterTLRef.current) masterTLRef.current.kill();
    };
  }, [autoPlay, playAnimation, cancelAllScrambles]);

  const handleClick = () => {
    if (interactive) {
      playAnimation();
    }
  };

  return (
    <div 
      ref={containerRef}
      className={`taksha-logo-wrapper ${interactive ? 'taksha-logo-wrapper--interactive' : ''} ${isHovered ? 'is-hovered' : ''} ${className}`}
      style={{ maxWidth, width: '100%', display: 'inline-block', cursor: interactive ? 'pointer' : 'default', ...style }}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={interactive ? 'Click to replay Taksha animation' : 'Taksha Codespace'}
      role="img"
      aria-label="Taksha Codespace logo — Studio transforms into TAKSHA"
    >
      <svg
        className="taksha-logo-svg"
        viewBox="0 0 170 64"
        overflow="hidden"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Chisel faces */}
          <linearGradient id={ids.lgFace} gradientUnits="userSpaceOnUse" x1="7" y1="10" x2="48" y2="58">
            <stop offset="0%" stopColor="#FFC14D"/>
            <stop offset="100%" stopColor="#FF6A2B"/>
          </linearGradient>
          <linearGradient id={ids.lgShade} gradientUnits="userSpaceOnUse" x1="32" y1="28" x2="32" y2="58">
            <stop offset="0%" stopColor="#F0561A"/>
            <stop offset="100%" stopColor="#B83A0A"/>
          </linearGradient>

          {/* Wordmark settled gradient */}
          <linearGradient id={ids.lgMetalText} gradientUnits="userSpaceOnUse" x1="64" y1="0" x2="162" y2="0">
            <stop offset="0%" stopColor="#FFFFFF"/>
            <stop offset="25%" stopColor="#E2E8F0"/>
            <stop offset="52%" stopColor="#3DC5A1">
              <animate attributeName="stop-color" values="#3DC5A1;#FFFFFF;#5591F7;#3DC5A1" dur="5s" repeatCount="indefinite"/>
            </stop>
            <stop offset="78%" stopColor="#E2E8F0"/>
            <stop offset="100%" stopColor="#FFFFFF"/>
          </linearGradient>

          {/* Sheen gradient */}
          <linearGradient id={ids.lgSheen} gradientUnits="userSpaceOnUse" x1="30" y1="0" x2="82" y2="0">
            <stop offset="0%" stopColor="white" stopOpacity="0"/>
            <stop offset="30%" stopColor="white" stopOpacity="0.38"/>
            <stop offset="50%" stopColor="white" stopOpacity="0.72"/>
            <stop offset="70%" stopColor="white" stopOpacity="0.38"/>
            <stop offset="100%" stopColor="white" stopOpacity="0"/>
          </linearGradient>

          {/* Sweep line specular bloom */}
          <filter id={ids.fScan} x="-400%" y="-30%" width="900%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="b"/>
            <feMerge>
              <feMergeNode in="b"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>

          {/* Clip path — restricts sheen rect to wordmark area */}
          <clipPath id={ids.cpText}>
            <rect x="64" y="13" width="100" height="24"/>
          </clipPath>
        </defs>

        {/* ═══════════ CHISEL MARK ═══════════ */}
        <path className="ch" d="M7 10H57L47 25H17Z" fill={`url(#${ids.lgFace})`} opacity="0"/>
        <path className="ch" d="M23 28.5H32V58L23 47Z" fill={`url(#${ids.lgFace})`} opacity="0"/>
        <path className="ch" d="M32 28.5H41V47L32 58Z" fill={`url(#${ids.lgShade})`} opacity="0"/>

        {/* ═══════════ WORDMARK (Letter slots — Studio → TAKSHA) ═══════════ */}
        <g className="g-wordmark" opacity="0">
          <text className="letter-slot" x="75"  y="33" fontFamily="Inter, -apple-system, sans-serif" fontSize="22" fontWeight="700" textAnchor="middle" fill="#E2E8F0">S</text>
          <text className="letter-slot" x="89"  y="33" fontFamily="Inter, -apple-system, sans-serif" fontSize="22" fontWeight="700" textAnchor="middle" fill="#E2E8F0">t</text>
          <text className="letter-slot" x="103" y="33" fontFamily="Inter, -apple-system, sans-serif" fontSize="22" fontWeight="700" textAnchor="middle" fill="#E2E8F0">u</text>
          <text className="letter-slot" x="117" y="33" fontFamily="Inter, -apple-system, sans-serif" fontSize="22" fontWeight="700" textAnchor="middle" fill="#E2E8F0">d</text>
          <text className="letter-slot" x="131" y="33" fontFamily="Inter, -apple-system, sans-serif" fontSize="22" fontWeight="700" textAnchor="middle" fill="#E2E8F0">i</text>
          <text className="letter-slot" x="145" y="33" fontFamily="Inter, -apple-system, sans-serif" fontSize="22" fontWeight="700" textAnchor="middle" fill="#E2E8F0">o</text>
        </g>

        {/* ═══════════ METALLIC TEXT SHEEN ═══════════ */}
        <g className="g-sheen" clipPath={`url(#${ids.cpText})`} opacity="0">
          <g className="g-sheen-move">
            <rect x="12" y="13" width="52" height="24" fill={`url(#${ids.lgSheen})`}/>
          </g>
        </g>

        {/* ═══════════ SWEEP LINE ═══════════ */}
        <g className="g-sweep" opacity="0">
          <line x1="64" y1="11" x2="64" y2="43" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="64" y1="11" x2="64" y2="43" stroke="#3DC5A1" strokeWidth="5"  strokeLinecap="round" opacity="0.65" filter={`url(#${ids.fScan})`}/>
          <line x1="64" y1="11" x2="64" y2="43" stroke="#5591F7" strokeWidth="13" strokeLinecap="round" opacity="0.12"/>
        </g>

        {/* ═══════════ CODESPACE SUBMARK ═══════════ */}
        <text className="codespace-submark" x="68" y="48"
              fontFamily="Inter, -apple-system, sans-serif"
              fontSize="10" fontWeight="400" fill="#94A3B8" letterSpacing="2.5"
              opacity="0">CODESPACE</text>
      </svg>
    </div>
  );
}
