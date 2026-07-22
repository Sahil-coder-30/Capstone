# TAKSHA CODESPACE — Core Logo Animation Specification & Implementation Guide

This guide details the complete specification, SVG markup, CSS styles, and GSAP JavaScript timeline for the **TAKSHA CODESPACE Main Logo Animation**.

---

## 🎨 1. Animation Overview & Design Specifications

- **Canvas Dimensions**: `viewBox="0 0 170 64"` (Perfectly Centered, 8px padding on left and right).
- **Typography**:
  - Wordmark: `Inter Bold` 22px, `text-anchor="middle"`, fill `url(#lgMetalText)`.
  - Submark: `Inter Regular` 10px, letter-spacing `2.5px`, fill `#94A3B8`.
- **Color Palette Tokens**:
  - Primary Teal: `#3DC5A1`
  - Dark Teal: `#0D8A6A`
  - Vibrant Blue: `#5591F7` / `#1B6EF3`
  - Metal Text / Borders: `#FFFFFF` → `#E2E8F0` → `#3DC5A1` → `#5591F7`
  - Box Background: `#141520` (Onyx)
  - Grid Lines: `#1C1E2E`

---

## 📄 2. Complete SVG Markup (HTML)

Place this SVG inside your application DOM or component canvas:

```html
<svg id="logoSvg" class="logo-svg"
     viewBox="0 0 170 64"
     overflow="hidden"
     xmlns="http://www.w3.org/2000/svg"
     role="img"
     aria-label="Taksha Codespace logo — Studio transforms into TAKSHA">

  <defs>
    <!-- Box border — animated metallic SMIL gradient -->
    <linearGradient id="lgMetalBox" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3DC5A1">
        <animate attributeName="stop-color" values="#3DC5A1;#E2E8F0;#5591F7;#FFFFFF;#3DC5A1" dur="5s" repeatCount="indefinite"/>
      </stop>
      <stop offset="45%" stop-color="#FFFFFF">
        <animate attributeName="stop-color" values="#FFFFFF;#3DC5A1;#1B6EF3;#E2E8F0;#FFFFFF" dur="5s" repeatCount="indefinite"/>
      </stop>
      <stop offset="100%" stop-color="#0D8A6A">
        <animate attributeName="stop-color" values="#0D8A6A;#1B6EF3;#3DC5A1;#E2E8F0;#0D8A6A" dur="5s" repeatCount="indefinite"/>
      </stop>
    </linearGradient>

    <!-- Wordmark settled gradient (userSpaceOnUse, spans text area) -->
    <linearGradient id="lgMetalText" gradientUnits="userSpaceOnUse" x1="64" y1="0" x2="162" y2="0">
      <stop offset="0%"   stop-color="#FFFFFF"/>
      <stop offset="25%"  stop-color="#E2E8F0"/>
      <stop offset="52%"  stop-color="#3DC5A1">
        <animate attributeName="stop-color" values="#3DC5A1;#FFFFFF;#5591F7;#3DC5A1" dur="5s" repeatCount="indefinite"/>
      </stop>
      <stop offset="78%"  stop-color="#E2E8F0"/>
      <stop offset="100%" stop-color="#FFFFFF"/>
    </linearGradient>

    <!-- Blue gradient for active nodes -->
    <linearGradient id="lgBlue" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#5591F7"/>
      <stop offset="100%" stop-color="#1B6EF3"/>
    </linearGradient>

    <!-- Sheen gradient (used by sliding sheen rect) -->
    <linearGradient id="lgSheen" gradientUnits="userSpaceOnUse" x1="30" y1="0" x2="82" y2="0">
      <stop offset="0%"   stop-color="white" stop-opacity="0"/>
      <stop offset="30%"  stop-color="white" stop-opacity="0.38"/>
      <stop offset="50%"  stop-color="white" stop-opacity="0.72"/>
      <stop offset="70%"  stop-color="white" stop-opacity="0.38"/>
      <stop offset="100%" stop-color="white" stop-opacity="0"/>
    </linearGradient>

    <!-- Node soft glow -->
    <filter id="fGlow" x="-70%" y="-70%" width="240%" height="240%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="1.4" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>

    <!-- Sweep line specular bloom -->
    <filter id="fScan" x="-400%" y="-30%" width="900%" height="160%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>

    <!-- Clip path — restricts sheen rect to wordmark area -->
    <clipPath id="cpText">
      <rect x="64" y="13" width="100" height="24"/>
    </clipPath>
  </defs>

  <!-- ═══════════ ICON BOX ═══════════ -->

  <!-- Blueprint perimeter trace -->
  <rect id="boxTrace"
        x="7.5" y="7.5" width="49" height="49" rx="10.5"
        fill="none" stroke="url(#lgMetalBox)" stroke-width="1.2"
        stroke-dasharray="200" stroke-dashoffset="200"/>

  <!-- Onyx filled box -->
  <rect id="boxFill"
        x="8" y="8" width="48" height="48" rx="10"
        fill="#141520" stroke="url(#lgMetalBox)" stroke-width="1.2"
        opacity="0"/>

  <!-- Grid lines -->
  <line class="gl" x1="20" y1="20" x2="44" y2="20" stroke="#1C1E2E" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="26" stroke-dashoffset="26"/>
  <line class="gl" x1="20" y1="32" x2="44" y2="32" stroke="#1C1E2E" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="26" stroke-dashoffset="26"/>
  <line class="gl" x1="20" y1="44" x2="44" y2="44" stroke="#1C1E2E" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="26" stroke-dashoffset="26"/>
  <line class="gl" x1="20" y1="20" x2="20" y2="44" stroke="#1C1E2E" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="26" stroke-dashoffset="26"/>
  <line class="gl" x1="44" y1="20" x2="44" y2="44" stroke="#1C1E2E" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="26" stroke-dashoffset="26"/>

  <!-- Signal path Z/V -->
  <path id="sigPath"
        d="M20 44 L32 20 L44 32"
        fill="none" stroke="url(#lgMetalBox)" stroke-width="2.5"
        stroke-linecap="round" stroke-linejoin="round"
        stroke-dasharray="44" stroke-dashoffset="44"/>

  <!-- Glow/Shine overlay path on the V line -->
  <path id="sigPathShine"
        d="M20 44 L32 20 L44 32"
        fill="none" stroke="#FFFFFF" stroke-width="3"
        stroke-linecap="round" stroke-linejoin="round"
        stroke-dasharray="14 44" stroke-dashoffset="14"
        opacity="0" filter="url(#fGlow)"/>

  <!-- Inactive muted nodes -->
  <circle class="nd" cx="20" cy="20" r="3.5" fill="#3D3F52" opacity="0"/>
  <circle class="nd" cx="44" cy="20" r="2.5" fill="#3D3F52" opacity="0"/>
  <circle class="nd" cx="20" cy="44" r="2.5" fill="#3D3F52" opacity="0"/>
  <circle class="nd" cx="44" cy="44" r="2.5" fill="#3D3F52" opacity="0"/>
  <circle class="nd" cx="32" cy="44" r="3"   fill="#0D8A6A" opacity="0"/>

  <!-- Active static nodes -->
  <circle id="nodeA" cx="32" cy="20" r="2.5" fill="#3DC5A1" filter="url(#fGlow)" opacity="0"/>
  <circle id="nodeB" cx="44" cy="32" r="3.5" fill="url(#lgBlue)" filter="url(#fGlow)" opacity="0"/>

  <!-- ═══════════ WORDMARK (Letter slots — Studio → TAKSHA) ═══════════ -->
  <g id="gWordmark" opacity="0">
    <text id="w0" x="75"  y="33" font-family="Inter,-apple-system,sans-serif" font-size="22" font-weight="700" text-anchor="middle" fill="#E2E8F0">S</text>
    <text id="w1" x="89"  y="33" font-family="Inter,-apple-system,sans-serif" font-size="22" font-weight="700" text-anchor="middle" fill="#E2E8F0">t</text>
    <text id="w2" x="103" y="33" font-family="Inter,-apple-system,sans-serif" font-size="22" font-weight="700" text-anchor="middle" fill="#E2E8F0">u</text>
    <text id="w3" x="117" y="33" font-family="Inter,-apple-system,sans-serif" font-size="22" font-weight="700" text-anchor="middle" fill="#E2E8F0">d</text>
    <text id="w4" x="131" y="33" font-family="Inter,-apple-system,sans-serif" font-size="22" font-weight="700" text-anchor="middle" fill="#E2E8F0">i</text>
    <text id="w5" x="145" y="33" font-family="Inter,-apple-system,sans-serif" font-size="22" font-weight="700" text-anchor="middle" fill="#E2E8F0">o</text>
  </g>

  <!-- ═══════════ METALLIC TEXT SHEEN ═══════════ -->
  <g id="gSheen" clip-path="url(#cpText)" opacity="0">
    <g id="gSheenMove">
      <rect x="12" y="13" width="52" height="24" fill="url(#lgSheen)"/>
    </g>
  </g>

  <!-- ═══════════ SWEEP LINE ═══════════ -->
  <g id="gSweep" opacity="0">
    <line x1="64" y1="11" x2="64" y2="43" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="64" y1="11" x2="64" y2="43" stroke="#3DC5A1" stroke-width="5"  stroke-linecap="round" opacity="0.65" filter="url(#fScan)"/>
    <line x1="64" y1="11" x2="64" y2="43" stroke="#5591F7" stroke-width="13" stroke-linecap="round" opacity="0.12"/>
  </g>

  <!-- ═══════════ CODESPACE SUBMARK ═══════════ -->
  <text id="codespace" x="68" y="48"
        font-family="Inter,-apple-system,sans-serif"
        font-size="10" font-weight="400" fill="#94A3B8" letter-spacing="2.5"
        opacity="0">CODESPACE</text>

</svg>
```

---

## 🎨 3. Complete CSS Styles

Include these CSS rules in your stylesheet:

```css
.logo-svg {
  width: 100%;
  max-width: 380px;
  height: auto;
  overflow: hidden;
  filter: drop-shadow(0 10px 32px rgba(0, 0, 0, 0.72));
}

/* Ensure SVG text scales crisp */
.logo-svg text {
  user-select: none;
  font-feature-settings: "cv02", "cv03", "cv04", "cv11";
}
```

---

## ⚡ 4. Complete GSAP Animation Code (JavaScript)

Include `GSAP 3.x` in your project (`npm install gsap` or CDN script tag):

```javascript
import { gsap } from 'gsap';

// ── Configuration ────────────────────────────────────────────────────────
const TAKSHA_CHARS  = ['T', 'A', 'K', 'S', 'H', 'A'];
const STUDIO_CHARS  = ['S', 't', 'u', 'd', 'i', 'o'];
const SCRAMBLE_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*?+=';
const LETTER_IDS    = ['w0', 'w1', 'w2', 'w3', 'w4', 'w5'];

// X-Coordinates of letter centers (text-anchor="middle")
const LETTER_X = [75, 89, 103, 117, 131, 145];

// Sweep geometry bounds
const SWEEP_LEFT  = 62;   // Start x position
const SWEEP_RIGHT = 162;  // End x position
const SWEEP_DIST  = SWEEP_RIGHT - SWEEP_LEFT; // 100px travel distance

// Scramble & Sweep timing configuration
const SWEEP_DUR   = 1.15; // Scan sweep travel duration in seconds
const SCRAMBLE_MS = 700;  // Character scramble duration per slot (ms)

let masterTL   = null;
let triggered  = Array(6).fill(false);
let activeRAFs = [];

// ── Cipher Scramble Function (60fps rAF with Cubic Ease-In Lock) ─────────
function scrambleLetter(el, targetChar) {
  const t0      = performance.now();
  const settle0 = SCRAMBLE_MS * 0.68; // 68% scramble, 32% settle
  let locked    = false;
  let frame     = 0;
  let rafId;

  function tick(now) {
    if (locked) return;
    const elapsed = now - t0;
    const tNorm   = Math.min(elapsed / SCRAMBLE_MS, 1);

    if (tNorm >= 1) {
      el.textContent = targetChar;
      el.setAttribute('fill', 'url(#lgMetalText)');
      activeRAFs = activeRAFs.filter(id => id !== rafId);
      return;
    }

    if (elapsed < settle0) {
      // Scramble phase: rapid random character selection
      el.textContent = SCRAMBLE_POOL[Math.floor(Math.random() * SCRAMBLE_POOL.length)];
      el.setAttribute('fill', '#3DC5A1');
    } else {
      // Settle phase: slow down with increasing lock probability
      const st    = (elapsed - settle0) / (SCRAMBLE_MS - settle0);
      const lockP = st * st * st; // cubic ease-in

      if (Math.random() < lockP) {
        locked = true;
        el.textContent = targetChar;
        el.setAttribute('fill', 'url(#lgMetalText)');
        activeRAFs = activeRAFs.filter(id => id !== rafId);
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
    activeRAFs = activeRAFs.filter(id => id !== rafId);
    activeRAFs.push(rafId);
  }

  rafId = requestAnimationFrame(tick);
  activeRAFs.push(rafId);
}

function cancelAllScrambles() {
  activeRAFs.forEach(cancelAnimationFrame);
  activeRAFs = [];
}

// ── Reset SVG state ──────────────────────────────────────────────────────
function resetSVG() {
  LETTER_IDS.forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = STUDIO_CHARS[i];
    el.setAttribute('fill', '#E2E8F0');
  });

  gsap.set('#boxTrace',      { strokeDashoffset: 200 });
  gsap.set('#boxFill',       { opacity: 0 });
  gsap.set('.gl',            { strokeDashoffset: 26 });
  gsap.set('#sigPath',       { strokeDashoffset: 44 });
  gsap.set('#sigPathShine',  { strokeDashoffset: 14, opacity: 0 });
  gsap.set('.nd',            { scale: 0, opacity: 0, transformOrigin: 'center', transformBox: 'fill-box' });
  gsap.set('#nodeA',         { scale: 0, opacity: 0, transformOrigin: 'center', transformBox: 'fill-box' });
  gsap.set('#nodeB',         { scale: 0, opacity: 0, transformOrigin: 'center', transformBox: 'fill-box' });
  gsap.set('#gWordmark',     { opacity: 0 });
  gsap.set('#gSweep',        { opacity: 0, x: 0 });
  gsap.set('#gSheen',        { opacity: 0 });
  gsap.set('#gSheenMove',    { x: 0 });
  gsap.set('#codespace',     { opacity: 0 });
}

// ── Master Timeline Construction ─────────────────────────────────────────
export function initTakshaLogoAnimation() {
  cancelAllScrambles();
  gsap.killTweensOf(['#nodeA', '#nodeB', '#sigPathShine']);
  if (masterTL) masterTL.kill();

  triggered = Array(6).fill(false);
  resetSVG();

  const tl = gsap.timeline();

  // Phase 1 — Icon Blueprint Trace & Construct (0s → 2.0s)
  tl.to('#boxTrace', { strokeDashoffset: 0, duration: 1.12, ease: 'power2.inOut' }, 0);
  tl.to('#boxFill',  { opacity: 1, duration: 0.44, ease: 'power2.out' }, 0.72);
  tl.to('.gl',       { strokeDashoffset: 0, duration: 0.26, stagger: 0.09, ease: 'power1.out' }, 0.88);
  tl.to('#sigPath',  { strokeDashoffset: 0, duration: 0.74, ease: 'power2.inOut' }, 1.26);

  // Nodes pop in
  tl.to('.nd', {
    scale: 1, opacity: 1, duration: 0.35, stagger: 0.065,
    ease: 'back.out(2.5)', transformOrigin: 'center', transformBox: 'fill-box'
  }, 1.65);

  tl.to(['#nodeA', '#nodeB'], {
    scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(2)',
    transformOrigin: 'center', transformBox: 'fill-box'
  }, 1.88);

  // Phase 1.5 — Initial V Line Shine Sweep (2.0s)
  tl.set('#sigPathShine', { opacity: 1 }, 2.0);
  tl.to('#sigPathShine',  { strokeDashoffset: -44, duration: 0.85, ease: 'power2.inOut' }, 2.0);
  tl.set('#sigPathShine', { opacity: 0 }, 2.85);

  // Phase 2 — "Studio" Wordmark Fade In (2.28s)
  tl.to('#gWordmark', { opacity: 1, duration: 0.52, ease: 'power2.out' }, 2.28);

  // Phase 3 — Metallic Scan Sweep + Cipher Scramble (3.28s → 4.43s)
  tl.set('#gSweep', { opacity: 1, x: 0 }, 3.28);
  tl.to('#gSweep', {
    x: SWEEP_DIST,
    duration: SWEEP_DUR,
    ease: 'power1.inOut',
    onUpdate() {
      const prog   = this.progress();
      const sweepX = SWEEP_LEFT + prog * SWEEP_DIST;

      LETTER_X.forEach((lx, i) => {
        if (sweepX > lx && !triggered[i]) {
          triggered[i] = true;
          const el = document.getElementById(LETTER_IDS[i]);
          if (el) scrambleLetter(el, TAKSHA_CHARS[i]);
        }
      });
    }
  }, 3.28);
  tl.set('#gSweep', { opacity: 0 }, 3.28 + SWEEP_DUR + 0.02);

  // Phase 4 — Metallic Text Sheen Sweep (5.1s)
  tl.set('#gSheen',    { opacity: 1 }, 5.1);
  tl.to('#gSheenMove', { x: 172, duration: 0.88, ease: 'power2.inOut' }, 5.1);
  tl.to('#gSheen',     { opacity: 0, duration: 0.14 }, 5.98);

  // Phase 5 — CODESPACE Submark Fade In (5.35s)
  tl.to('#codespace', { opacity: 1, duration: 0.52, ease: 'power2.out' }, 5.35);

  // Phase 6 — Periodic V Line Shine Loop (Starts at 6.0s, repeats every 4s)
  tl.add(() => {
    gsap.to('#sigPathShine', {
      strokeDashoffset: -44,
      duration: 0.9,
      ease: 'power1.inOut',
      repeat: -1,
      repeatDelay: 3.1,
      onStart: () => gsap.set('#sigPathShine', { opacity: 1 }),
      onRepeat: () => gsap.set('#sigPathShine', { opacity: 1, strokeDashoffset: 14 })
    });
  }, 6.0);

  masterTL = tl;
  return masterTL;
}
```

---

## ⚛️ 5. React Integration Component

If using React, wrap the logic inside a clean component:

```jsx
import React, { useEffect } from 'react';
import { initTakshaLogoAnimation } from './logoAnimation';

export default function TakshaLogo() {
  useEffect(() => {
    const tl = initTakshaLogoAnimation();
    return () => {
      if (tl) tl.kill();
    };
  }, []);

  return (
    <div className="logo-container">
      {/* SVG Markup from Section 2 goes here */}
    </div>
  );
}
```
