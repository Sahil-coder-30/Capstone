import React, { useRef, useState, useCallback, useEffect, useId } from 'react';
import gsap from 'gsap';
import './TakshaLogoAnimation.scss';

const TAKSHA_CHARS = ['T', 'A', 'K', 'S', 'H', 'A'];
const STUDIO_CHARS = ['S', 't', 'u', 'd', 'i', 'o'];
const SCRAMBLE_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*?+=';

const SWEEP_LEFT = 62;
const SWEEP_RIGHT = 162;
const SWEEP_DIST = SWEEP_RIGHT - SWEEP_LEFT;
const SWEEP_DUR = 1.15;
const SCRAMBLE_MS = 700;

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
    lgMetalBox: `lgMetalBox_${uid}`,
    lgMetalText: `lgMetalText_${uid}`,
    lgBlue: `lgBlue_${uid}`,
    lgSheen: `lgSheen_${uid}`,
    fGlow: `fGlow_${uid}`,
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

    gsap.set(scope.querySelector('.box-trace'), { strokeDashoffset: 200 });
    gsap.set(scope.querySelector('.box-fill'), { opacity: 0 });
    gsap.set(scope.querySelectorAll('.gl'), { strokeDashoffset: 26 });
    gsap.set(scope.querySelector('.sig-path'), { strokeDashoffset: 44 });
    gsap.set(scope.querySelector('.sig-path-shine'), { strokeDashoffset: 14, opacity: 0 });
    gsap.set(scope.querySelectorAll('.nd'), { scale: 0, opacity: 0, transformOrigin: 'center', transformBox: 'fill-box' });
    gsap.set(scope.querySelector('.node-a'), { scale: 0, opacity: 0, transformOrigin: 'center', transformBox: 'fill-box' });
    gsap.set(scope.querySelector('.node-b'), { scale: 0, opacity: 0, transformOrigin: 'center', transformBox: 'fill-box' });
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

    const nodeA = scope.querySelector('.node-a');
    const nodeB = scope.querySelector('.node-b');
    const sigPathShine = scope.querySelector('.sig-path-shine');
    const gSweep = scope.querySelector('.g-sweep');
    const gSheenMove = scope.querySelector('.g-sheen-move');

    if (nodeA && nodeB && sigPathShine && gSweep && gSheenMove) {
      gsap.killTweensOf([nodeA, nodeB, sigPathShine, gSweep, gSheenMove]);
    }

    if (masterTLRef.current) {
      masterTLRef.current.kill();
    }

    triggeredRef.current = Array(6).fill(false);
    resetSVG();

    // Check for reduced motion preference
    const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      const letterElements = scope.querySelectorAll('.letter-slot');
      letterElements.forEach((el, i) => {
        if (el) {
          el.textContent = TAKSHA_CHARS[i];
          el.setAttribute('fill', `url(#${ids.lgMetalText})`);
        }
      });
      gsap.set(scope.querySelector('.box-trace'), { strokeDashoffset: 0 });
      gsap.set(scope.querySelector('.box-fill'), { opacity: 1 });
      gsap.set(scope.querySelectorAll('.gl'), { strokeDashoffset: 0 });
      gsap.set(scope.querySelector('.sig-path'), { strokeDashoffset: 0 });
      gsap.set(scope.querySelectorAll('.nd'), { scale: 1, opacity: 1 });
      gsap.set(scope.querySelector('.node-a'), { scale: 1, opacity: 1 });
      gsap.set(scope.querySelector('.node-b'), { scale: 1, opacity: 1 });
      gsap.set(scope.querySelector('.g-wordmark'), { opacity: 1 });
      gsap.set(scope.querySelector('.codespace-submark'), { opacity: 1 });
      if (onComplete) onComplete();
      return;
    }

    const tl = gsap.timeline({
      onComplete: () => {
        if (onComplete) onComplete();
      }
    });

    const boxTrace = scope.querySelector('.box-trace');
    const boxFill = scope.querySelector('.box-fill');
    const gls = scope.querySelectorAll('.gl');
    const sigPath = scope.querySelector('.sig-path');
    const nds = scope.querySelectorAll('.nd');
    const gWordmark = scope.querySelector('.g-wordmark');
    const gSheen = scope.querySelector('.g-sheen');
    const codespace = scope.querySelector('.codespace-submark');
    const letterElements = scope.querySelectorAll('.letter-slot');
    const letterX = [75, 89, 103, 117, 131, 145];

    // Phase 1 — Icon Blueprint Trace & Construct (0s → 2.0s)
    tl.to(boxTrace, { strokeDashoffset: 0, duration: 1.12, ease: 'power2.inOut' }, 0);
    tl.to(boxFill, { opacity: 1, duration: 0.44, ease: 'power2.out' }, 0.72);
    tl.to(gls, { strokeDashoffset: 0, duration: 0.26, stagger: 0.09, ease: 'power1.out' }, 0.88);
    tl.to(sigPath, { strokeDashoffset: 0, duration: 0.74, ease: 'power2.inOut' }, 1.26);

    // Nodes pop in
    tl.to(nds, {
      scale: 1, opacity: 1, duration: 0.35, stagger: 0.065,
      ease: 'back.out(2.5)', transformOrigin: 'center', transformBox: 'fill-box'
    }, 1.65);

    tl.to([nodeA, nodeB], {
      scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(2)',
      transformOrigin: 'center', transformBox: 'fill-box'
    }, 1.88);

    // Phase 1.5 — Initial V Line Shine Sweep (2.0s)
    tl.set(sigPathShine, { opacity: 1 }, 2.0);
    tl.to(sigPathShine, { strokeDashoffset: -44, duration: 0.85, ease: 'power2.inOut' }, 2.0);
    tl.set(sigPathShine, { opacity: 0 }, 2.85);

    // Phase 2 — "Studio" Wordmark Fade In (2.28s)
    tl.to(gWordmark, { opacity: 1, duration: 0.52, ease: 'power2.out' }, 2.28);

    // Phase 3 — Metallic Scan Sweep + Cipher Scramble (3.28s → 4.43s)
    tl.set(gSweep, { opacity: 1, x: 0 }, 3.28);
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
    }, 3.28);
    tl.set(gSweep, { opacity: 0 }, 3.28 + SWEEP_DUR + 0.02);

    // Phase 4 — Metallic Text Sheen Sweep (5.1s)
    tl.set(gSheen, { opacity: 1 }, 5.1);
    tl.to(gSheenMove, { x: 172, duration: 0.88, ease: 'power2.inOut' }, 5.1);
    tl.to(gSheen, { opacity: 0, duration: 0.14 }, 5.98);

    // Phase 5 — CODESPACE Submark Fade In (5.35s)
    tl.to(codespace, { opacity: 1, duration: 0.52, ease: 'power2.out' }, 5.35);

    // Phase 6 — Periodic V Line Shine Loop (Starts at 6.0s, repeats every 4s)
    tl.add(() => {
      gsap.to(sigPathShine, {
        strokeDashoffset: -44,
        duration: 0.9,
        ease: 'power1.inOut',
        repeat: -1,
        repeatDelay: 3.1,
        onStart: () => gsap.set(sigPathShine, { opacity: 1 }),
        onRepeat: () => gsap.set(sigPathShine, { opacity: 1, strokeDashoffset: 14 })
      });
    }, 6.0);

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
          {/* Box border — animated metallic SMIL gradient */}
          <linearGradient id={ids.lgMetalBox} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3DC5A1">
              <animate attributeName="stop-color" values="#3DC5A1;#E2E8F0;#5591F7;#FFFFFF;#3DC5A1" dur="5s" repeatCount="indefinite"/>
            </stop>
            <stop offset="45%" stopColor="#FFFFFF">
              <animate attributeName="stop-color" values="#FFFFFF;#3DC5A1;#1B6EF3;#E2E8F0;#FFFFFF" dur="5s" repeatCount="indefinite"/>
            </stop>
            <stop offset="100%" stopColor="#0D8A6A">
              <animate attributeName="stop-color" values="#0D8A6A;#1B6EF3;#3DC5A1;#E2E8F0;#0D8A6A" dur="5s" repeatCount="indefinite"/>
            </stop>
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

          {/* Blue gradient for active nodes */}
          <linearGradient id={ids.lgBlue} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#5591F7"/>
            <stop offset="100%" stopColor="#1B6EF3"/>
          </linearGradient>

          {/* Sheen gradient */}
          <linearGradient id={ids.lgSheen} gradientUnits="userSpaceOnUse" x1="30" y1="0" x2="82" y2="0">
            <stop offset="0%" stopColor="white" stopOpacity="0"/>
            <stop offset="30%" stopColor="white" stopOpacity="0.38"/>
            <stop offset="50%" stopColor="white" stopOpacity="0.72"/>
            <stop offset="70%" stopColor="white" stopOpacity="0.38"/>
            <stop offset="100%" stopColor="white" stopOpacity="0"/>
          </linearGradient>

          {/* Node soft glow */}
          <filter id={ids.fGlow} x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.4" result="b"/>
            <feMerge>
              <feMergeNode in="b"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>

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

        {/* ═══════════ ICON BOX ═══════════ */}
        {/* Blueprint perimeter trace */}
        <rect className="box-trace"
              x="7.5" y="7.5" width="49" height="49" rx="10.5"
              fill="none" stroke={`url(#${ids.lgMetalBox})`} strokeWidth="1.2"
              strokeDasharray="200" strokeDashoffset="200"/>

        {/* Onyx filled box */}
        <rect className="box-fill"
              x="8" y="8" width="48" height="48" rx="10"
              fill="#141520" stroke={`url(#${ids.lgMetalBox})`} strokeWidth="1.2"
              opacity="0"/>

        {/* Grid lines */}
        <line className="gl" x1="20" y1="20" x2="44" y2="20" stroke="#1C1E2E" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="26" strokeDashoffset="26"/>
        <line className="gl" x1="20" y1="32" x2="44" y2="32" stroke="#1C1E2E" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="26" strokeDashoffset="26"/>
        <line className="gl" x1="20" y1="44" x2="44" y2="44" stroke="#1C1E2E" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="26" strokeDashoffset="26"/>
        <line className="gl" x1="20" y1="20" x2="20" y2="44" stroke="#1C1E2E" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="26" strokeDashoffset="26"/>
        <line className="gl" x1="44" y1="20" x2="44" y2="44" stroke="#1C1E2E" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="26" strokeDashoffset="26"/>

        {/* Signal path Z/V */}
        <path className="sig-path"
              d="M20 44 L32 20 L44 32"
              fill="none" stroke={`url(#${ids.lgMetalBox})`} strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray="44" strokeDashoffset="44"/>

        {/* Glow/Shine overlay path on the V line */}
        <path className="sig-path-shine"
              d="M20 44 L32 20 L44 32"
              fill="none" stroke="#FFFFFF" strokeWidth="3"
              strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray="14 44" strokeDashoffset="14"
              opacity="0" filter={`url(#${ids.fGlow})`}/>

        {/* Inactive muted nodes */}
        <circle className="nd" cx="20" cy="20" r="3.5" fill="#3D3F52" opacity="0"/>
        <circle className="nd" cx="44" cy="20" r="2.5" fill="#3D3F52" opacity="0"/>
        <circle className="nd" cx="20" cy="44" r="2.5" fill="#3D3F52" opacity="0"/>
        <circle className="nd" cx="44" cy="44" r="2.5" fill="#3D3F52" opacity="0"/>
        <circle className="nd" cx="32" cy="44" r="3"   fill="#0D8A6A" opacity="0"/>

        {/* Active static nodes */}
        <circle className="node-a" cx="32" cy="20" r="2.5" fill="#3DC5A1" filter={`url(#${ids.fGlow})`} opacity="0"/>
        <circle className="node-b" cx="44" cy="32" r="3.5" fill={`url(#${ids.lgBlue})`} filter={`url(#${ids.fGlow})`} opacity="0"/>

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
