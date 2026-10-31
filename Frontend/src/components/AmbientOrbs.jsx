import React, { useEffect, useRef } from 'react';

/**
 * AmbientOrbs Canvas Component
 * Clean Aesthetic Space Background:
 * 1. Giant Slow-Moving Ambient Orbs (Emerald Teal & Electric Blue Radial Gradients)
 * 2. Delicate Twinkling Glowing Stars with Shadow Blur
 * 3. Optional Continuous Shooting Star / Meteor Engine with Head Flares
 * 4. Interactive Mouse Parallax
 * 5. Theme Sensitivity (Dark/Light mode support)
 */
export default function AmbientOrbs({ style = {}, opacity = 1, showMeteors = true }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    let mouseX = width / 2;
    let mouseY = height / 2;
    let targetMouseX = width / 2;
    let targetMouseY = height / 2;

    const handleMouseMove = (e) => {
      targetMouseX = e.clientX;
      targetMouseY = e.clientY;
    };
    window.addEventListener('mousemove', handleMouseMove);

    // Check light mode
    const isLightMode = document.documentElement.classList.contains('light-theme');

    // 1. Giant, Ultra-Soft & Slow-Moving Ambient Orbs
    const orb1 = {
      radius: Math.max(900, Math.min(width, height) * 0.75),
      colorStops: isLightMode
        ? ['rgba(234, 88, 12, 0.14)', 'rgba(234, 88, 12, 0.02)', 'transparent']
        : ['rgba(234, 88, 12, 0.22)', 'rgba(234, 88, 12, 0.035)', 'transparent'],
      speedX: 0.00010,
      speedY: 0.00014,
      rangeX: width * 0.20,
      rangeY: height * 0.18,
      phase: 0,
    };

    const orb2 = {
      radius: Math.max(850, Math.min(width, height) * 0.70),
      colorStops: isLightMode
        ? ['rgba(99, 102, 241, 0.14)', 'rgba(99, 102, 241, 0.02)', 'transparent']
        : ['rgba(27, 110, 243, 0.20)', 'rgba(27, 110, 243, 0.03)', 'transparent'],
      speedX: 0.00012,
      speedY: 0.00009,
      rangeX: width * 0.22,
      rangeY: height * 0.20,
      phase: Math.PI,
    };

    // 2. Small Glowing Stars (42 delicate twinkling stars)
    const NUM_STARS = 42;
    const darkColors = ['#FFFFFF', '#A5F3FC', '#6EE7B7'];
    const lightColors = ['#4F46E5', '#C2410C', '#7C3AED'];
    const starColors = isLightMode ? lightColors : darkColors;

    const stars = Array.from({ length: NUM_STARS }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 1.1 + 0.4,
      baseAlpha: Math.random() * 0.35 + 0.15,
      twinkleSpeed: Math.random() * 0.02 + 0.008,
      phase: Math.random() * Math.PI * 2,
      color: starColors[Math.floor(Math.random() * starColors.length)],
      depth: Math.random() * 0.5 + 0.5,
    }));

    // 3. High-Impact Continuous Shooting Star / Meteor Engine (Optional)
    let meteors = [];
    const spawnMeteor = () => {
      // Prevent spawning when tab is hidden or capped
      if (document.hidden || document.visibilityState !== 'visible') return;
      if (meteors.length >= 3) return;

      const startX = Math.random() * width * 1.2 - width * 0.2;
      const startY = Math.random() * height * 0.35 - height * 0.1;
      const trailColor = isLightMode
        ? (Math.random() > 0.5 ? 'rgba(194, 65, 12,' : 'rgba(79, 70, 229,')
        : (Math.random() > 0.4 ? 'rgba(255, 179, 71,' : Math.random() > 0.5 ? 'rgba(85, 145, 247,' : 'rgba(255, 255, 255,');

      meteors.push({
        x: startX,
        y: startY,
        length: Math.random() * 120 + 80,
        speed: Math.random() * 9 + 7,
        angle: (Math.PI / 180) * (Math.random() * 15 + 35),
        alpha: 1.0,
        decay: Math.random() * 0.018 + 0.012,
        lineWidth: Math.random() * 1.2 + 1.2,
        colorPrefix: trailColor,
      });
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        meteors = [];
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    let meteorTimer = null;
    if (showMeteors) {
      spawnMeteor();
      meteorTimer = setInterval(() => {
        spawnMeteor();
        if (Math.random() > 0.6) {
          setTimeout(spawnMeteor, 320);
        }
      }, 1800);
    }

    let animId;
    let time = 0;
    let lastFrameTime = performance.now();

    const draw = () => {
      const now = performance.now();
      const delta = now - lastFrameTime;
      lastFrameTime = now;

      // Clear any backlog if tab was backgrounded / frame delta > 500ms
      if (delta > 500) {
        meteors = [];
      }

      time += 16;
      ctx.clearRect(0, 0, width, height);

      // Smooth mouse interpolation for parallax
      mouseX += (targetMouseX - mouseX) * 0.03;
      mouseY += (targetMouseY - mouseY) * 0.03;
      const parallaxX = (mouseX - width / 2) * 0.015;
      const parallaxY = (mouseY - height / 2) * 0.015;

      const currentlyLight = document.documentElement.classList.contains('light-theme');

      // Deep space background gradient
      if (!currentlyLight) {
        const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
        bgGrad.addColorStop(0, '#06070B');
        bgGrad.addColorStop(0.5, '#040508');
        bgGrad.addColorStop(1, '#020305');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, width, height);
      }

      // Render Giant Orb 1 (Emerald Teal / Sapphire)
      const o1X = width * 0.22 + Math.sin(time * orb1.speedX + orb1.phase) * orb1.rangeX + parallaxX * 0.5;
      const o1Y = height * 0.32 + Math.cos(time * orb1.speedY + orb1.phase) * orb1.rangeY + parallaxY * 0.5;
      const g1 = ctx.createRadialGradient(o1X, o1Y, 0, o1X, o1Y, orb1.radius);
      g1.addColorStop(0, orb1.colorStops[0]);
      g1.addColorStop(0.5, orb1.colorStops[1]);
      g1.addColorStop(1, orb1.colorStops[2]);
      ctx.beginPath();
      ctx.arc(o1X, o1Y, orb1.radius, 0, Math.PI * 2);
      ctx.fillStyle = g1;
      ctx.globalCompositeOperation = currentlyLight ? 'source-over' : 'screen';
      ctx.fill();

      // Render Giant Orb 2 (Electric Blue / Violet)
      const o2X = width * 0.78 + Math.sin(time * orb2.speedX + orb2.phase) * orb2.rangeX + parallaxX * 0.5;
      const o2Y = height * 0.68 + Math.cos(time * orb2.speedY + orb2.phase) * orb2.rangeY + parallaxY * 0.5;
      const g2 = ctx.createRadialGradient(o2X, o2Y, 0, o2X, o2Y, orb2.radius);
      g2.addColorStop(0, orb2.colorStops[0]);
      g2.addColorStop(0.5, orb2.colorStops[1]);
      g2.addColorStop(1, orb2.colorStops[2]);
      ctx.beginPath();
      ctx.arc(o2X, o2Y, orb2.radius, 0, Math.PI * 2);
      ctx.fillStyle = g2;
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      // Render Small Glowing Twinkling Stars
      stars.forEach((star) => {
        star.phase += star.twinkleSpeed;
        const alpha = Math.max(0.05, star.baseAlpha + Math.sin(star.phase) * 0.25);
        const starX = star.x + parallaxX * star.depth;
        const starY = star.y + parallaxY * star.depth;

        ctx.beginPath();
        ctx.arc(starX, starY, star.size, 0, Math.PI * 2);
        ctx.fillStyle = star.color;
        ctx.globalAlpha = alpha;
        ctx.shadowColor = star.color;
        ctx.shadowBlur = star.size * 3;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      });

      // Render Shooting Stars & Meteor Trails if enabled
      if (showMeteors && meteors.length > 0) {
        for (let i = meteors.length - 1; i >= 0; i--) {
          const m = meteors[i];
          m.x += Math.cos(m.angle) * m.speed;
          m.y += Math.sin(m.angle) * m.speed;
          m.alpha -= m.decay;

          if (m.alpha <= 0 || m.x > width + 200 || m.y > height + 200) {
            meteors.splice(i, 1);
            continue;
          }

          const headX = m.x;
          const headY = m.y;
          const tailX = m.x - Math.cos(m.angle) * m.length;
          const tailY = m.y - Math.sin(m.angle) * m.length;

          // Glowing Gradient Tail
          const meteorGrad = ctx.createLinearGradient(headX, headY, tailX, tailY);
          meteorGrad.addColorStop(0, `rgba(255, 255, 255, ${m.alpha})`);
          meteorGrad.addColorStop(0.25, `${m.colorPrefix} ${m.alpha * 0.85})`);
          meteorGrad.addColorStop(1, 'transparent');

          // Draw Tail
          ctx.beginPath();
          ctx.moveTo(headX, headY);
          ctx.lineTo(tailX, tailY);
          ctx.strokeStyle = meteorGrad;
          ctx.lineWidth = m.lineWidth;
          ctx.lineCap = 'round';
          ctx.stroke();

          // Draw Glowing Star Head Flare
          ctx.beginPath();
          ctx.arc(headX, headY, m.lineWidth * 1.3, 0, Math.PI * 2);
          ctx.fillStyle = currentlyLight ? `rgba(79, 70, 229, ${m.alpha})` : `rgba(255, 255, 255, ${m.alpha})`;
          ctx.shadowColor = currentlyLight ? '#4F46E5' : '#FFB347';
          ctx.shadowBlur = 10;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      animId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (meteorTimer) clearInterval(meteorTimer);
      cancelAnimationFrame(animId);
    };
  }, [showMeteors]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        width: '100vw',
        height: '100vh',
        opacity,
        willChange: 'transform',
        transform: 'translate3d(0, 0, 0)',
        ...style,
      }}
    />
  );
}
