import gsap from 'gsap';

const SPARK_LIMIT = 180;
const HEAT_HALF_LIFE_MS = 520;
const COLD = 0.004;
const WAVE_GAP_SECONDS = 4.5;
const FINE_POINTER = '(hover: hover) and (pointer: fine)';

// Canvas sparks. The ticker only runs while a spark is alive.
function createSparks(canvas, cleanups) {
  const ctx = canvas.getContext('2d');
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const sparks = [];
  let running = false;

  const resize = () => {
    canvas.width = canvas.clientWidth * scale;
    canvas.height = canvas.clientHeight * scale;
  };

  const draw = (time, delta) => {
    const step = Math.min(delta, 34) / 16.67;
    const isLight = document.documentElement.classList.contains('light-theme');

    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    ctx.globalCompositeOperation = isLight ? 'source-over' : 'lighter';
    ctx.lineCap = 'round';

    for (let i = sparks.length - 1; i >= 0; i -= 1) {
      const spark = sparks[i];
      spark.life -= spark.decay * step;
      if (spark.life <= 0) {
        sparks.splice(i, 1);
        continue;
      }

      spark.vy += 0.1 * step;
      spark.vx *= 0.99;
      spark.x += spark.vx * step;
      spark.y += spark.vy * step;

      const green = isLight ? 60 + spark.life * 70 : 96 + spark.life * 150;
      const blue = isLight ? 12 : 24 + spark.life * 150;
      ctx.strokeStyle = `rgba(${isLight ? 214 : 255}, ${Math.round(green)}, ${Math.round(blue)}, ${spark.life})`;
      ctx.lineWidth = spark.size;
      ctx.beginPath();
      ctx.moveTo(spark.x, spark.y);
      ctx.lineTo(spark.x - spark.vx * 2.4, spark.y - spark.vy * 2.4);
      ctx.stroke();
    }

    if (!sparks.length) {
      running = false;
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      gsap.ticker.remove(draw);
    }
  };

  const emit = (x, y, count, force) => {
    const reach = gsap.utils.clamp(0.45, 1, canvas.clientWidth / 1200);
    for (let i = 0; i < count && sparks.length < SPARK_LIMIT; i += 1) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.5;
      const speed = reach * force * (0.35 + Math.random() * 0.65);
      sparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.011 + Math.random() * 0.016,
        size: 0.7 + Math.random() * 1.4,
      });
    }
    if (!running && sparks.length) {
      running = true;
      gsap.ticker.add(draw);
    }
  };

  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  cleanups.push(() => {
    observer.disconnect();
    gsap.ticker.remove(draw);
  });

  return emit;
}

// Each TAKSHA letter rises from the forge light one by one, white hot, then cools.
function buildArrival(word, letters, ember, emit, toCanvas) {
  const landAt = [];
  const landed = letters.map(() => false);

  const timeline = gsap.timeline({
    scrollTrigger: { trigger: word, start: 'top bottom', end: 'max', scrub: 0.5 },
    onUpdate() {
      const progress = this.progress();
      letters.forEach((letter, i) => {
        if (progress < landAt[i]) {
          landed[i] = false;
        } else if (!landed[i]) {
          landed[i] = true;
          const rect = letter.getBoundingClientRect();
          const { x, y } = toCanvas(rect.left + rect.width / 2, rect.bottom);
          emit(x, y, 16, 7);
        }
      });
    },
  });

  timeline.fromTo(ember, { scaleX: 0.3, opacity: 0 }, { scaleX: 1, opacity: 1, duration: 1.4, ease: 'power2.inOut' }, 0);

  letters.forEach((letter, i) => {
    const at = 0.5 + i * 0.62;
    timeline.fromTo(letter,
      { yPercent: 104, rotationX: -62, opacity: 0, '--arrive': 1 },
      { yPercent: 0, rotationX: 0, opacity: 1, duration: 1, ease: 'power3.out' },
      at);
    timeline.to(letter, { '--arrive': 0, duration: 1.3, ease: 'power1.in' }, at + 0.75);
  });

  const total = timeline.duration();
  letters.forEach((letter, i) => { landAt[i] = (0.5 + i * 0.62 + 0.72) / total; });
}

// A slow heat wave crosses the word while it is on screen, on every device.
function buildHeatWave(word, letters) {
  const wave = gsap.timeline({ repeat: -1, repeatDelay: WAVE_GAP_SECONDS, paused: true });
  letters.forEach((letter, i) => {
    wave.fromTo(letter, { '--wave': 0 }, { '--wave': 0.7, duration: 0.55, ease: 'sine.out' }, i * 0.16);
    wave.to(letter, { '--wave': 0, duration: 1.1, ease: 'sine.in' }, 0.55 + i * 0.16);
  });

  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) wave.play();
    else wave.pause();
  }, { threshold: 0.6 });
  observer.observe(word);
  return () => observer.disconnect();
}

function bindHeadlinePull(footer, cleanups) {
  const chars = gsap.utils.toArray(footer.querySelectorAll('.lp-footer__cta .split-char'));
  let frame = 0;
  let pointer = null;

  const paint = () => {
    frame = 0;
    chars.forEach((char) => {
      const rect = char.getBoundingClientRect();
      const reach = Math.max(170, rect.height * 1.5);
      const distance = pointer
        ? Math.hypot(pointer.x - (rect.left + rect.width / 2), pointer.y - (rect.top + rect.height / 2))
        : Infinity;
      const pull = Math.max(0, 1 - distance / reach) ** 2;
      gsap.to(char, { y: -pull * rect.height * 0.16, scaleY: 1 + pull * 0.14, '--pull': pull, duration: 0.45, ease: 'power3.out', overwrite: 'auto' });
    });
  };
  const request = () => { if (!frame) frame = requestAnimationFrame(paint); };
  const onMove = (e) => { pointer = { x: e.clientX, y: e.clientY }; request(); };
  const onLeave = () => { pointer = null; request(); };

  footer.addEventListener('pointermove', onMove);
  footer.addEventListener('pointerleave', onLeave);
  cleanups.push(() => {
    cancelAnimationFrame(frame);
    footer.removeEventListener('pointermove', onMove);
    footer.removeEventListener('pointerleave', onLeave);
  });
}

// The cursor is the torch: letters lean toward it, heat up and keep that heat
// for a moment after it leaves. A click strikes the word like a hammer.
function bindWordForge(word, letters, emit, toCanvas, cleanups) {
  const bodies = letters.map((letter) => letter.querySelector('.lp-letter__body'));
  const faces = letters.map((letter) => letter.querySelector('.lp-letter__face'));
  const heat = letters.map(() => 0);
  const moves = bodies.map((body) => {
    gsap.set(body, { transformPerspective: 1100 });
    return {
      y: gsap.quickTo(body, 'y', { duration: 0.5, ease: 'power3' }),
      rotationX: gsap.quickTo(body, 'rotationX', { duration: 0.6, ease: 'power3' }),
      rotationY: gsap.quickTo(body, 'rotationY', { duration: 0.6, ease: 'power3' }),
    };
  });

  const finePointer = window.matchMedia(FINE_POINTER).matches;
  let pointer = null;
  let last = null;
  let frame = 0;
  let cooling = false;

  const cool = (time, delta) => {
    const keep = 0.5 ** (delta / HEAT_HALF_LIFE_MS);
    let warm = false;
    heat.forEach((value, i) => {
      const next = value * keep;
      heat[i] = next < COLD ? 0 : next;
      if (heat[i]) warm = true;
      letters[i].style.setProperty('--heat', heat[i].toFixed(3));
    });
    if (!warm) {
      cooling = false;
      gsap.ticker.remove(cool);
    }
  };
  const startCooling = () => {
    if (cooling) return;
    cooling = true;
    gsap.ticker.add(cool);
  };

  const paint = () => {
    frame = 0;
    const rects = faces.map((face) => face.getBoundingClientRect());

    rects.forEach((rect, i) => {
      if (!pointer) {
        moves[i].y(0);
        moves[i].rotationX(0);
        moves[i].rotationY(0);
        return;
      }

      const reach = rect.height * 0.95;
      const dx = pointer.x - (rect.left + rect.width / 2);
      const dy = pointer.y - (rect.top + rect.height / 2);
      const pull = Math.max(0, 1 - Math.hypot(dx, dy) / reach) ** 1.5;

      heat[i] = Math.max(heat[i], pull);
      moves[i].y(-pull * rect.height * 0.08);
      moves[i].rotationY((dx / reach) * pull * 26);
      moves[i].rotationX((-dy / reach) * pull * 20);
      letters[i].style.setProperty('--mx', `${Math.round(pointer.x - rect.left)}px`);
      letters[i].style.setProperty('--my', `${Math.round(pointer.y - rect.top)}px`);
    });
  };
  const request = () => { if (!frame) frame = requestAnimationFrame(paint); };

  const onMove = (e) => {
    pointer = { x: e.clientX, y: e.clientY };
    request();
    startCooling();

    const speed = last ? Math.hypot(pointer.x - last.x, pointer.y - last.y) : 0;
    last = pointer;
    if (speed > 6 && e.target.closest('.lp-letter')) {
      const { x, y } = toCanvas(pointer.x, pointer.y);
      emit(x, y, Math.min(4, Math.ceil(speed / 22)), 3 + Math.min(speed / 14, 4));
    }
  };
  const onEnter = () => gsap.to(word, { '--spot': word.offsetHeight * 0.62, duration: 0.5, ease: 'power3.out' });
  const onLeave = () => {
    pointer = null;
    last = null;
    request();
    gsap.to(word, { '--spot': 0, duration: 0.7, ease: 'power2.out' });
  };

  const onStrike = (e) => {
    const rects = letters.map((letter) => letter.getBoundingClientRect());
    const gaps = rects.map((rect) => Math.abs(e.clientX - (rect.left + rect.width / 2)));
    const hit = gaps.indexOf(Math.min(...gaps));
    const { x, y } = toCanvas(e.clientX, e.clientY);

    emit(x, y, 54, 11);
    letters.forEach((letter, i) => {
      const gap = Math.abs(i - hit);
      heat[i] = Math.max(heat[i], 1 - gap * 0.26);
      letters[i].style.setProperty('--heat', heat[i].toFixed(3));
      gsap.fromTo(letter,
        { y: gap === 0 ? rects[i].height * 0.05 : -rects[i].height * (0.05 / gap) },
        { y: 0, duration: 0.95, delay: gap * 0.05, ease: 'elastic.out(1, 0.34)', overwrite: 'auto' });
    });
    gsap.fromTo(bodies[hit],
      { scaleX: 1.05, scaleY: 0.9 },
      { scaleX: 1, scaleY: 1, duration: 0.85, ease: 'elastic.out(1, 0.34)', overwrite: 'auto' });
    startCooling();
  };

  word.addEventListener('pointerdown', onStrike);
  if (finePointer) {
    word.addEventListener('pointerenter', onEnter);
    word.addEventListener('pointermove', onMove);
    word.addEventListener('pointerleave', onLeave);
  }

  cleanups.push(() => {
    cancelAnimationFrame(frame);
    gsap.ticker.remove(cool);
    word.removeEventListener('pointerdown', onStrike);
    word.removeEventListener('pointerenter', onEnter);
    word.removeEventListener('pointermove', onMove);
    word.removeEventListener('pointerleave', onLeave);
  });
}

export function buildFooter(root, cleanups) {
  const footer = root.querySelector('.lp-footer');
  const word = footer.querySelector('.lp-footer__word');
  const ember = footer.querySelector('.lp-footer__ember');
  const canvas = footer.querySelector('.lp-footer__sparks');
  const headline = footer.querySelector('.lp-footer__cta h2');
  const caret = headline.querySelector('.lp-footer__caret');
  const letters = gsap.utils.toArray(word.querySelectorAll('.lp-letter'));

  const emit = createSparks(canvas, cleanups);
  const toCanvas = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  gsap.timeline({ scrollTrigger: { trigger: headline, start: 'top 94%', end: 'bottom 72%', scrub: 0.5 } })
    .fromTo(headline.querySelectorAll('.split-char'),
      { yPercent: 105, rotationX: -75, opacity: 0, transformOrigin: '50% 100%' },
      { yPercent: 0, rotationX: 0, opacity: 1, stagger: 0.08, ease: 'none' })
    .fromTo(caret, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'none' });

  buildArrival(word, letters, ember, emit, toCanvas);
  cleanups.push(buildHeatWave(word, letters));
  bindWordForge(word, letters, emit, toCanvas, cleanups);

  if (window.matchMedia(FINE_POINTER).matches) bindHeadlinePull(footer, cleanups);
}
