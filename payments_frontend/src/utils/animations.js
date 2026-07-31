/**
 * animations.js — Taksha Payments GSAP animation utilities
 * Each helper returns cleanup functions (kill/revert) so callers can
 * clean up inside useGSAP() context without leaking ScrollTriggers.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// ── prefers-reduced-motion guard ─────────────────────────────────────────────
export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── Lenis smooth scroll setup ─────────────────────────────────────────────────
export async function initLenis() {
  if (prefersReducedMotion()) return null;
  try {
    const { default: Lenis } = await import('lenis');
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    function raf(time) {
      lenis.raf(time);
      ScrollTrigger.update();
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
    return lenis;
  } catch (e) {
    console.warn('[animations] Lenis not available, falling back to native scroll');
    return null;
  }
}

// ── Batch scroll-reveal (many elements at once, better perf) ─────────────────
export function revealBatch(selector, container, config = {}) {
  if (prefersReducedMotion()) {
    gsap.set(selector, { opacity: 1, y: 0, x: 0 });
    return;
  }
  const defaults = {
    interval: 0.08,
    batchMax: 5,
    start: 'top 88%',
    from: { opacity: 0, y: 36, duration: 0.7, ease: 'power3.out' },
    to:   { opacity: 1, y: 0 },
  };
  const cfg = { ...defaults, ...config };

  ScrollTrigger.batch(selector, {
    scroller: container || undefined,
    start: cfg.start,
    interval: cfg.interval,
    batchMax: cfg.batchMax,
    onEnter: (batch) => {
      gsap.fromTo(batch, cfg.from, {
        ...cfg.to,
        stagger: { each: cfg.interval, from: 'start' },
      });
    },
  });
}

// ── Price counter tween ───────────────────────────────────────────────────────
export function priceCounter(element, targetValue, prefix = '₹', duration = 1.2) {
  if (prefersReducedMotion()) {
    if (element) element.textContent = prefix + targetValue;
    return;
  }
  const obj = { value: 0 };
  const tween = gsap.to(obj, {
    value: targetValue,
    duration,
    ease: 'power2.out',
    scrollTrigger: {
      trigger: element,
      start: 'top 85%',
      once: true,
    },
    onUpdate: () => {
      if (element) element.textContent = prefix + Math.round(obj.value).toLocaleString('en-IN');
    },
    onComplete: () => {
      if (element) element.textContent = prefix + targetValue.toLocaleString('en-IN');
    },
  });
  return tween;
}

// ── Magnetic button hover (quickTo cursor-follow) ─────────────────────────────
export function magneticHover(btn) {
  if (prefersReducedMotion() || !btn) return () => {};

  const quickX = gsap.quickTo(btn, 'x', { duration: 0.4, ease: 'power3.out' });
  const quickY = gsap.quickTo(btn, 'y', { duration: 0.4, ease: 'power3.out' });

  function onMove(e) {
    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    quickX((e.clientX - cx) * 0.35);
    quickY((e.clientY - cy) * 0.35);
  }
  function onLeave() {
    quickX(0);
    quickY(0);
  }

  btn.addEventListener('mousemove', onMove);
  btn.addEventListener('mouseleave', onLeave);

  return () => {
    btn.removeEventListener('mousemove', onMove);
    btn.removeEventListener('mouseleave', onLeave);
    gsap.set(btn, { x: 0, y: 0 });
  };
}

// ── SVG draw-in (stroke-dashoffset) ──────────────────────────────────────────
export function svgDrawIn(elements, trigger, delay = 0) {
  if (prefersReducedMotion()) {
    gsap.set(elements, { strokeDashoffset: 0 });
    return;
  }
  elements.forEach((el) => {
    const length = el.getTotalLength ? el.getTotalLength() : 300;
    gsap.set(el, { strokeDasharray: length, strokeDashoffset: length });
    gsap.to(el, {
      strokeDashoffset: 0,
      duration: 1.4,
      ease: 'power2.inOut',
      delay,
      scrollTrigger: {
        trigger: trigger || el,
        start: 'top 80%',
        once: true,
      },
    });
  });
}

// ── FAQ height-auto accordion ─────────────────────────────────────────────────
export function toggleAccordion(panel, isOpen) {
  if (prefersReducedMotion()) {
    panel.style.height = isOpen ? 'auto' : '0';
    return;
  }
  if (isOpen) {
    // measure then animate
    gsap.set(panel, { height: 'auto' });
    const h = panel.offsetHeight;
    gsap.fromTo(
      panel,
      { height: 0 },
      { height: h, duration: 0.4, ease: 'power3.out', onComplete: () => gsap.set(panel, { height: 'auto' }) }
    );
  } else {
    gsap.to(panel, { height: 0, duration: 0.3, ease: 'power2.in' });
  }
}

// ── Pinned hero fan-out ───────────────────────────────────────────────────────
export function pinnedHeroFanOut(cards, section) {
  if (prefersReducedMotion() || !section) return;

  const isMobile = window.innerWidth < 768;
  if (isMobile) return;

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: section,
      pin: true,
      scrub: 1.2,
      start: 'top top',
      end: '+=80%',
    },
  });

  cards.forEach((card, i) => {
    const xOffset = (i - 1) * 80; // -80, 0, 80
    const rot = (i - 1) * 6;
    tl.to(card, { x: xOffset, rotateY: rot, rotateZ: rot * 0.3, scale: i === 1 ? 1.05 : 0.95, duration: 1 }, 0);
  });

  return () => tl.kill();
}

// ── Horizontal scroll strip ───────────────────────────────────────────────────
export function horizontalScrollStrip(track, wrapper) {
  if (prefersReducedMotion() || !track || !wrapper) return;
  const isMobile = window.innerWidth < 768;
  if (isMobile) return;

  const tween = gsap.to(track, {
    x: () => -(track.scrollWidth - wrapper.clientWidth),
    ease: 'none',
    scrollTrigger: {
      trigger: wrapper,
      pin: true,
      scrub: 1,
      end: () => '+=' + track.scrollWidth,
      invalidateOnRefresh: true,
    },
  });

  return () => tween.kill();
}

// ── Sticky bottom CTA reveal ──────────────────────────────────────────────────
export function stickyCtaReveal(bar, heroSection) {
  if (prefersReducedMotion() || !bar || !heroSection) return;

  ScrollTrigger.create({
    trigger: heroSection,
    start: 'bottom top',
    onEnter:      () => bar.classList.add('is-visible'),
    onLeaveBack:  () => bar.classList.remove('is-visible'),
  });
}
