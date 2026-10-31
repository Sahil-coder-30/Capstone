import React, { useEffect, useRef, useState, useCallback } from 'react';
import gsap from 'gsap';
import { FastForward } from 'lucide-react';
import { TakshaAnimatedLogo } from './BrandLogo';
import './EntryLoader.scss';

const SESSION_KEY = 'taksha_session_loader_v1';

export default function EntryLoader({ onComplete, onExitStart, forcePlay = false }) {
  const [destroyed, setDestroyed] = useState(false);
  const [alreadySeen] = useState(() => {
    if (forcePlay) return false;
    try {
      return sessionStorage.getItem(SESSION_KEY) === 'true';
    } catch (e) {
      return false;
    }
  });

  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [showSkip, setShowSkip] = useState(false);
  const [exiting, setExiting] = useState(false);

  const markSessionSeen = useCallback(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, 'true');
      sessionStorage.setItem('taksha_entry_loader_seen', 'true');
      sessionStorage.setItem('taksha_intro_seen', 'true');
    } catch (e) {}
  }, []);

  const handleExit = useCallback(() => {
    if (exiting) return;
    setExiting(true);
    markSessionSeen();
    if (onExitStart) onExitStart();

    if (containerRef.current) {
      gsap.to(containerRef.current, {
        opacity: 0,
        scale: 1.02,
        filter: 'blur(12px)',
        duration: 0.65,
        ease: 'power2.inOut',
        onComplete: () => {
          setDestroyed(true);
          if (onComplete) onComplete();
        }
      });
    } else {
      setDestroyed(true);
      if (onComplete) onComplete();
    }
  }, [exiting, markSessionSeen, onComplete, onExitStart]);

  // Keyboard shortcut listener for fast skipping
  useEffect(() => {
    if (alreadySeen || destroyed) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') handleExit();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [alreadySeen, destroyed, handleExit]);

  // If already seen in this session, immediately notify onComplete
  useEffect(() => {
    if (alreadySeen || destroyed) {
      if (onComplete) onComplete();
    }
  }, [alreadySeen, destroyed, onComplete]);

  // Show skip button after a short delay
  useEffect(() => {
    if (alreadySeen || destroyed) return;
    const skipTimer = setTimeout(() => setShowSkip(true), 300);
    return () => clearTimeout(skipTimer);
  }, [alreadySeen, destroyed]);

  // Fallback auto-exit timer (3.5s animation + 1.0s rest pause + 0.3s buffer)
  useEffect(() => {
    if (alreadySeen || destroyed) return;
    const autoExitTimer = setTimeout(() => {
      handleExit();
    }, 4800);
    return () => clearTimeout(autoExitTimer);
  }, [alreadySeen, destroyed, handleExit]);

  // Ambient digital background canvas
  useEffect(() => {
    if (alreadySeen || destroyed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W = (canvas.width = window.innerWidth);
    let H = (canvas.height = window.innerHeight);

    const onResize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    const cols = Math.floor(W / 48);
    const bitStreams = Array.from({ length: cols }, (_, i) => ({
      x: i * 48 + 24,
      y: Math.random() * -H,
      speed: Math.random() * 1.8 + 0.8,
      char: Math.random() > 0.5 ? '1' : '0',
      opacity: Math.random() * 0.2 + 0.05,
    }));

    let frameId;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(28, 30, 46, 0.14)';
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 0; y < H; y += 48) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      ctx.font = '10px "JetBrains Mono", monospace';
      bitStreams.forEach((stream) => {
        ctx.fillStyle = `rgba(255, 179, 71, ${stream.opacity})`;
        ctx.fillText(stream.char, stream.x, stream.y);
        stream.y += stream.speed;
        if (stream.y > H) {
          stream.y = Math.random() * -100;
          stream.char = Math.random() > 0.5 ? '1' : '0';
        }
      });
      frameId = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(frameId);
    };
  }, [alreadySeen, destroyed]);

  if (alreadySeen || destroyed) return null;

  return (
    <div
      className={`entry-loader ${exiting ? 'entry-loader--exiting' : ''}`}
      ref={containerRef}
      role="dialog"
      aria-label="Taksha CodeSpace System Boot Loader"
    >
      <canvas className="entry-loader__canvas" ref={canvasRef} />
      <div className="entry-loader__glow entry-loader__glow--top" />
      <div className="entry-loader__glow entry-loader__glow--bottom" />

      <div className="entry-loader__top-bar">
        <div className="entry-loader__badge">
          <span className="pulse-dot" />
          <span>TAKSHA CODESPACE</span>
        </div>
        {showSkip && (
          <button
            className="entry-loader__skip"
            onClick={handleExit}
            aria-label="Skip introduction animation (press ESC)"
          >
            <FastForward size={12} />
            <span>SKIP</span>
            <kbd>ESC</kbd>
          </button>
        )}
      </div>

      <div className="entry-loader__content">
        <div className="entry-loader__logo-wrapper">
          <TakshaAnimatedLogo
            maxWidth="380px"
            autoPlay={true}
            interactive={false}
            onComplete={() => {
              setTimeout(handleExit, 1000);
            }}
          />
        </div>
      </div>
    </div>
  );
}
