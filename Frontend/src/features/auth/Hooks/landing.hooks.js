import { useEffect, useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { buildFooter } from './landing.footer';

gsap.registerPlugin(ScrollTrigger);

const STAGE_COUNT = 4;
const FILM_IN = 0.05;
const FILM_OUT = 0.86;
const FILM_WATCH_POINT = 0.2;

function bindPointerEffects(root, cleanups) {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  root.querySelectorAll('.tilt').forEach((el) => {
    const rotateX = gsap.quickTo(el, 'rotationX', { duration: 0.5, ease: 'power3' });
    const rotateY = gsap.quickTo(el, 'rotationY', { duration: 0.5, ease: 'power3' });
    gsap.set(el, { transformPerspective: 900 });

    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      rotateY((x - 0.5) * 9);
      rotateX((0.5 - y) * 9);
      el.style.setProperty('--mx', `${x * 100}%`);
      el.style.setProperty('--my', `${y * 100}%`);
    };
    const onLeave = () => { rotateX(0); rotateY(0); };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    cleanups.push(() => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    });
  });

  root.querySelectorAll('.magnetic').forEach((el) => {
    const moveX = gsap.quickTo(el, 'x', { duration: 0.45, ease: 'power3' });
    const moveY = gsap.quickTo(el, 'y', { duration: 0.45, ease: 'power3' });

    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      moveX((e.clientX - rect.left - rect.width / 2) * 0.22);
      moveY((e.clientY - rect.top - rect.height / 2) * 0.32);
    };
    const onLeave = () => { moveX(0); moveY(0); };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    cleanups.push(() => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    });
  });
}

function buildIntro(root) {
  const chars = root.querySelectorAll('.lp-hero__title .split-char');
  const rest = root.querySelectorAll('[data-intro]');
  const header = root.querySelector('.lp__header');

  gsap.set(chars, { yPercent: 115, rotationX: -70, opacity: 0, transformOrigin: '50% 100%' });
  gsap.set(rest, { y: 26, opacity: 0 });
  gsap.set(header, { y: -32, opacity: 0 });

  return gsap.timeline({ paused: true })
    .to(header, { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out' }, 0)
    .to(chars, { yPercent: 0, rotationX: 0, opacity: 1, duration: 1, stagger: 0.016, ease: 'power4.out' }, 0.1)
    .to(rest, { y: 0, opacity: 1, duration: 0.8, stagger: 0.09, ease: 'power3.out' }, 0.75);
}

// Hero flow: headline only, a small scroll swaps it for the film, which plays
// until the product curtain arrives. Rewinds once the headline is back.
function buildHeroScroll(root, onFilmReset) {
  const film = root.querySelector('.lp-hero__media video');
  let playing = false;

  gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: '.lp-hero-track',
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.3,
      onUpdate: (self) => {
        const inFilm = self.progress > FILM_IN && self.progress < FILM_OUT;
        if (inFilm !== playing) {
          playing = inFilm;
          if (inFilm) film.play().catch(() => {});
          else film.pause();
        }
        if (self.progress <= FILM_IN && film.currentTime > 0) {
          film.currentTime = 0;
          film.muted = true;
          onFilmReset();
        }
      },
    },
  })
    .to('.lp-hero__copy', { yPercent: -10, opacity: 0, duration: 0.1 }, 0)
    .to('.lp-hero__cue', { opacity: 0, duration: 0.05 }, 0)
    .to('.lp-hero__bg', { opacity: 0, duration: 0.1 }, 0.04)
    .fromTo('.lp-hero__media', { opacity: 0 }, { opacity: 1, duration: 0.1 }, 0.04)
    .to('.lp-hero__watch', { opacity: 1, y: 0, duration: 0.04 }, 0.14)
    .to('.lp-hero__watch', { opacity: 0, duration: 0.04 }, 0.72)
    .to('.lp-hero__media', { opacity: 0, scale: 1.04, duration: 0.28 }, 0.72);

  gsap.fromTo('.lp-product__stage',
    { rotationX: 30, scale: 0.86, y: 90, transformPerspective: 1500, transformOrigin: '50% 0%' },
    {
      rotationX: 0, scale: 1, y: 0, ease: 'none',
      scrollTrigger: { trigger: '.lp-product', start: 'top 92%', end: 'top 8%', scrub: 0.4 },
    });
}

function buildStatement(root) {
  gsap.fromTo(root.querySelectorAll('.lp-statement .split-word-plain'),
    { opacity: 0.14 },
    {
      opacity: 1, stagger: 0.05, ease: 'none',
      scrollTrigger: { trigger: '.lp-statement', start: 'top 78%', end: 'bottom 52%', scrub: 0.4 },
    });
}

function buildRises(root) {
  gsap.utils.toArray(root.querySelectorAll('[data-rise]')).forEach((el) => {
    gsap.from(el, {
      y: 54,
      opacity: 0,
      duration: 0.95,
      delay: Number(el.dataset.rise || 0) * 0.08,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
    });
  });

}

function buildChrome(root) {
  gsap.to('.lp__progress', {
    scaleX: 1,
    ease: 'none',
    scrollTrigger: { trigger: root.querySelector('.lp__content'), start: 'top top', end: 'bottom bottom', scrub: 0.2 },
  });

  const header = root.querySelector('.lp__header');
  const hide = gsap.quickTo(header, 'yPercent', { duration: 0.35, ease: 'power2.out' });
  ScrollTrigger.create({
    trigger: root.querySelector('.lp__content'),
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => hide(self.direction === 1 && self.scroll() > window.innerHeight * 0.2 ? -170 : 0),
  });

  const track = root.querySelector('.lp-marquee__track');
  const skew = gsap.quickTo(track, 'skewX', { duration: 0.4, ease: 'power3' });
  ScrollTrigger.create({
    trigger: '.lp-marquee',
    start: 'top bottom',
    end: 'bottom top',
    onUpdate: (self) => skew(gsap.utils.clamp(-7, 7, self.getVelocity() / -260)),
    onLeave: () => skew(0),
    onLeaveBack: () => skew(0),
  });
}

export function useLandingMotion({ rootRef, contentRef, ready, stageIds, onStage, onFilmReset, forgeProgressRef }) {
  const apiRef = useRef({ scrollTo: null, scrollToFilm: null });
  const introRef = useRef(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const content = contentRef.current;
    if (!root || !content) return undefined;

    const native = (target, offset = 0) => {
      const el = typeof target === 'string' ? root.querySelector(target) : target;
      if (el) root.scrollTo({ top: el.getBoundingClientRect().top + root.scrollTop + offset, behavior: 'smooth' });
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.classList.add('lp--still');
      const film = root.querySelector('.lp-hero__media video');
      film.controls = true;
      apiRef.current = { scrollTo: native, scrollToFilm: () => native(film, -88) };
      return () => {
        film.controls = false;
        root.classList.remove('lp--still');
      };
    }

    const lenis = new Lenis({ wrapper: root, content, duration: 1.15, smoothWheel: true });
    const tick = (time) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    lenis.on('scroll', ScrollTrigger.update);
    ScrollTrigger.defaults({ scroller: root });

    const cleanups = [];
    apiRef.current = {
      scrollTo: (target, offset = 0) => {
        const el = typeof target === 'string' ? root.querySelector(target) : target;
        if (el) lenis.scrollTo(el, { offset, duration: 1.4 });
      },
      scrollToFilm: () => {
        const track = root.querySelector('.lp-hero-track');
        lenis.scrollTo((track.offsetHeight - window.innerHeight) * FILM_WATCH_POINT, { duration: 1.2 });
      },
    };

    const ctx = gsap.context(() => {
      introRef.current = buildIntro(root);
      buildHeroScroll(root, onFilmReset);
      buildStatement(root);
      buildRises(root);
      buildChrome(root);
      buildFooter(root, cleanups);
      bindPointerEffects(root, cleanups);

      // The forge only scrubs on desktop. Small screens list every stage instead.
      gsap.matchMedia(root).add('(min-width: 901px)', () => {
        const track = root.querySelector('.lp-forge-track');
        let last = -1;
        ScrollTrigger.create({
          trigger: track,
          start: 'top top',
          end: 'bottom bottom',
          onUpdate: (self) => {
            forgeProgressRef.current = self.progress;
            const index = Math.min(STAGE_COUNT - 1, Math.floor(self.progress * STAGE_COUNT));
            if (index !== last) {
              last = index;
              onStage(stageIds[index]);
            }
          },
        });

      });
    }, root);

    document.fonts?.ready.then(() => ScrollTrigger.refresh());

    return () => {
      cleanups.forEach((fn) => fn());
      ctx.revert();
      lenis.destroy();
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
      ScrollTrigger.defaults({ scroller: window });
      introRef.current = null;
    };
  }, [rootRef, contentRef, stageIds, onStage, onFilmReset, forgeProgressRef]);

  useEffect(() => {
    if (ready) introRef.current?.play();
  }, [ready]);

  return apiRef;
}
