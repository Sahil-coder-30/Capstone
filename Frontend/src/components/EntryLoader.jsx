import React, { useEffect, useRef, useState, useCallback, useId } from 'react';
import gsap from 'gsap';
import { Layers, Code, Cpu, ShieldCheck, CheckCircle2, FastForward } from 'lucide-react';
import './EntryLoader.scss';

const TAKSHA_CHARS = ['T', 'A', 'K', 'S', 'H', 'A'];
const STUDIO_CHARS = ['S', 't', 'u', 'd', 'i', 'o'];
const SCRAMBLE_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*?+=';

const SWEEP_LEFT = 62;
const SWEEP_RIGHT = 162;
const SWEEP_DIST = SWEEP_RIGHT - SWEEP_LEFT;
const SWEEP_DUR = 1.15;
const SCRAMBLE_MS = 650;
const SESSION_KEY = 'taksha_session_loader_v1';

const AGENT_LAYERS = [
  { id: 'planner', name: 'Planner', tag: 'Layer 01', color: '#3DC5A1', icon: Layers, desc: 'State Graph AST' },
  { id: 'builder', name: 'Builder', tag: 'Layer 02', color: '#1B6EF3', icon: Code, desc: 'Component Compiler' },
  { id: 'executor', name: 'Executor', tag: 'Layer 03', color: '#F5A83C', icon: Cpu, desc: 'Sandbox Pod (5173)' },
  { id: 'healer', name: 'Self-Healer', tag: 'Layer 04', color: '#22C55E', icon: ShieldCheck, desc: 'Integrity Verification' },
];

export default function EntryLoader({ onComplete, forcePlay = false }) {
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
  const terminalRef = useRef(null);
  const activeRAFsRef = useRef([]);
  const triggeredRef = useRef(Array(6).fill(false));
  const masterTLRef = useRef(null);

  const [logs, setLogs] = useState([]);
  const [showSkip, setShowSkip] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeLayerId, setActiveLayerId] = useState('planner');
  const [layerStatuses, setLayerStatuses] = useState({
    planner: 'pending',
    builder: 'pending',
    executor: 'pending',
    healer: 'pending'
  });

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

    if (masterTLRef.current) masterTLRef.current.kill();
    activeRAFsRef.current.forEach(cancelAnimationFrame);
    activeRAFsRef.current = [];

    if (containerRef.current) {
      gsap.to(containerRef.current, {
        opacity: 0,
        scale: 1.06,
        filter: 'blur(20px)',
        duration: 0.65,
        ease: 'power3.inOut',
        onComplete: () => {
          setDestroyed(true);
          if (onComplete) onComplete();
        }
      });
    } else {
      setDestroyed(true);
      if (onComplete) onComplete();
    }
  }, [exiting, markSessionSeen, onComplete]);

  useEffect(() => {
    if (alreadySeen || destroyed) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') handleExit();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [alreadySeen, destroyed, handleExit]);

  useEffect(() => {
    if (alreadySeen || destroyed) {
      if (onComplete) onComplete();
    }
  }, [alreadySeen, destroyed, onComplete]);

  useEffect(() => {
    if (alreadySeen || destroyed) return;
    const skipTimer = setTimeout(() => setShowSkip(true), 500);
    return () => clearTimeout(skipTimer);
  }, [alreadySeen, destroyed]);

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

    const cols = Math.floor(W / 32);
    const bitStreams = Array.from({ length: cols }, (_, i) => ({
      x: i * 32 + 16,
      y: Math.random() * -H,
      speed: Math.random() * 2.4 + 1.2,
      char: Math.random() > 0.5 ? '1' : '0',
      opacity: Math.random() * 0.35 + 0.08,
    }));

    let frameId;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(28, 30, 46, 0.18)';
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 0; y < H; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      ctx.font = '10px "JetBrains Mono", monospace';
      bitStreams.forEach(stream => {
        ctx.fillStyle = `rgba(61, 197, 161, ${stream.opacity})`;
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

  const scrambleLetter = useCallback((el, targetChar) => {
    if (!el) return;
    const t0 = performance.now();
    const settle0 = SCRAMBLE_MS * 0.65;
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
        const lockP = st * st * st;
        if (Math.random() < lockP) {
          locked = true;
          el.textContent = targetChar;
          el.setAttribute('fill', `url(#${ids.lgMetalText})`);
          activeRAFsRef.current = activeRAFsRef.current.filter((id) => id !== rafId);
          return;
        }
        const skip = Math.round(1 + st * 8);
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

  // Auto-scroll terminal log body to bottom whenever new logs arrive
  useEffect(() => {
    if (!terminalRef.current) return;
    const el = terminalRef.current;
    el.scrollTop = el.scrollHeight;
    const raf = requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(raf);
  }, [logs]);

  useEffect(() => {
    if (alreadySeen || destroyed) return;
    const scope = containerRef.current;
    if (!scope) return;
    const addLog = (text, type = 'info') => {
      const time = new Date().toLocaleTimeString().split(' ')[0];
      setLogs(prev => [...prev, { time, text, type }]);
    };
    const updateLayer = (layerId, status) => {
      setActiveLayerId(layerId);
      setLayerStatuses(prev => ({ ...prev, [layerId]: status }));
    };
    const boxTrace = scope.querySelector('.box-trace');
    const boxFill = scope.querySelector('.box-fill');
    const gls = scope.querySelectorAll('.gl');
    const sigPath = scope.querySelector('.sig-path');
    const sigPathShine = scope.querySelector('.sig-path-shine');
    const nds = scope.querySelectorAll('.nd');
    const nodeA = scope.querySelector('.node-a');
    const nodeB = scope.querySelector('.node-b');
    const gWordmark = scope.querySelector('.g-wordmark');
    const gSweep = scope.querySelector('.g-sweep');
    const gSheen = scope.querySelector('.g-sheen');
    const gSheenMove = scope.querySelector('.g-sheen-move');
    const codespace = scope.querySelector('.codespace-submark');
    const letterElements = scope.querySelectorAll('.letter-slot');
    const letterX = [75, 89, 103, 117, 131, 145];
    letterElements.forEach((el, i) => {
      if (el) {
        el.textContent = STUDIO_CHARS[i];
        el.setAttribute('fill', '#E2E8F0');
      }
    });
    gsap.set(boxTrace, { strokeDashoffset: 200 });
    gsap.set(boxFill, { opacity: 0 });
    gsap.set(gls, { strokeDashoffset: 26 });
    gsap.set(sigPath, { strokeDashoffset: 44 });
    gsap.set(sigPathShine, { strokeDashoffset: 14, opacity: 0 });
    gsap.set(nds, { scale: 0, opacity: 0, transformOrigin: 'center', transformBox: 'fill-box' });
    gsap.set([nodeA, nodeB], { scale: 0, opacity: 0, transformOrigin: 'center', transformBox: 'fill-box' });
    gsap.set(gWordmark, { opacity: 0 });
    gsap.set(gSweep, { opacity: 0, x: 0 });
    gsap.set(gSheen, { opacity: 0 });
    gsap.set(gSheenMove, { x: 0 });
    gsap.set(codespace, { opacity: 0 });
    triggeredRef.current = Array(6).fill(false);
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      addLog('SYSTEM: Reduced motion enabled. Booting directly...', 'system');
      handleExit();
      return;
    }
    const tl = gsap.timeline({ onComplete: handleExit });
    const progObj = { val: 0 };
    tl.to(progObj, {
      val: 100,
      duration: 5.4,
      ease: 'power1.inOut',
      onUpdate: () => setProgress(Math.round(progObj.val))
    }, 0);
    tl.call(() => {
      addLog('SYSTEM: Initializing Taksha CodeSpace core sandbox...', 'system');
      updateLayer('planner', 'active');
    }, [], 0.0);
    tl.to(boxTrace, { strokeDashoffset: 0, duration: 1.0, ease: 'power2.inOut' }, 0.1);
    tl.to(boxFill, { opacity: 1, duration: 0.4, ease: 'power2.out' }, 0.7);
    tl.call(() => {
      addLog('PLANNER: Tracing SVG blueprint & state graph nodes...', 'planner');
      updateLayer('planner', 'online');
      updateLayer('builder', 'active');
    }, [], 0.85);
    tl.to(gls, { strokeDashoffset: 0, duration: 0.25, stagger: 0.08, ease: 'power1.out' }, 0.9);
    tl.to(nds, {
      scale: 1, opacity: 1, duration: 0.3, stagger: 0.05,
      ease: 'back.out(2.5)', transformOrigin: 'center', transformBox: 'fill-box'
    }, 1.25);
    tl.call(() => {
      addLog('BUILDER: Compiling codebase AST buffers & signal path...', 'builder');
      updateLayer('builder', 'online');
      updateLayer('executor', 'active');
    }, [], 1.45);
    tl.to(sigPath, { strokeDashoffset: 0, duration: 0.6, ease: 'power2.inOut' }, 1.5);
    tl.to([nodeA, nodeB], {
      scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(2)',
      transformOrigin: 'center', transformBox: 'fill-box'
    }, 1.85);
    tl.set(sigPathShine, { opacity: 1 }, 1.95);
    tl.to(sigPathShine, { strokeDashoffset: -44, duration: 0.75, ease: 'power2.inOut' }, 1.95);
    tl.set(sigPathShine, { opacity: 0 }, 2.7);
    tl.call(() => {
      addLog('EXECUTOR: Spawning sandbox Kubernetes container (Port 5173)...', 'executor');
      updateLayer('executor', 'online');
      updateLayer('healer', 'active');
    }, [], 2.2);
    tl.to(gWordmark, { opacity: 1, duration: 0.45, ease: 'power2.out' }, 2.25);
    tl.call(() => addLog('CIPHER: Executing cipher transformation Studio → TAKSHA...', 'planner'), [], 2.95);
    tl.set(gSweep, { opacity: 1, x: 0 }, 3.0);
    tl.to(gSweep, {
      x: SWEEP_DIST,
      duration: SWEEP_DUR,
      ease: 'power1.inOut',
      onUpdate() {
        const p = this.progress();
        const sweepX = SWEEP_LEFT + p * SWEEP_DIST;
        letterX.forEach((lx, i) => {
          if (sweepX > lx && !triggeredRef.current[i]) {
            triggeredRef.current[i] = true;
            const el = letterElements[i];
            if (el) scrambleLetter(el, TAKSHA_CHARS[i]);
          }
        });
      }
    }, 3.0);
    tl.set(gSweep, { opacity: 0 }, 3.0 + SWEEP_DUR + 0.02);
    tl.call(() => {
      addLog('HEALER: Verifying pipeline integrity constraints...', 'healer');
      updateLayer('healer', 'online');
    }, [], 4.45);
    tl.set(gSheen, { opacity: 1 }, 4.5);
    tl.to(gSheenMove, { x: 172, duration: 0.8, ease: 'power2.inOut' }, 4.5);
    tl.to(gSheen, { opacity: 0, duration: 0.12 }, 5.3);
    tl.to(codespace, { opacity: 1, duration: 0.45, ease: 'power2.out' }, 4.75);
    tl.call(() => addLog('[OK] Dev environment online. Sandbox mapped.', 'success'), [], 5.35);
    tl.to({}, { duration: 0.4 });
    masterTLRef.current = tl;
    return () => { if (tl) tl.kill(); };
  }, [alreadySeen, destroyed, scrambleLetter, handleExit]);

  if (alreadySeen || destroyed) return null;

  return (
    <div className={`entry-loader ${exiting ? 'entry-loader--exiting' : ''}`} ref={containerRef} role="dialog" aria-label="Taksha CodeSpace System Boot Loader">
      <canvas className="entry-loader__canvas" ref={canvasRef} />
      <div className="entry-loader__glow entry-loader__glow--top" />
      <div className="entry-loader__glow entry-loader__glow--bottom" />
      <div className="entry-loader__top-bar">
        <div className="entry-loader__badge">
          <span className="pulse-dot" />
          <span>TAKSHA AGENTIC ENGINE v2.5</span>
        </div>
        {showSkip && (
          <button className="entry-loader__skip" onClick={handleExit} aria-label="Skip introduction animation (press ESC)">
            <FastForward size={12} />
            <span>SKIP INTRO</span>
            <kbd>ESC</kbd>
          </button>
        )}
      </div>
      <div className="entry-loader__content">
        <div className="entry-loader__logo-wrapper">
          <div className="taksha-logo-wrapper">
            <svg className="taksha-logo-svg" viewBox="0 0 170 64" overflow="hidden" xmlns="http://www.w3.org/2000/svg" aria-label="Taksha CodeSpace logo animation">
              <defs>
                <linearGradient id={ids.lgMetalBox} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#3DC5A1"><animate attributeName="stop-color" values="#3DC5A1;#E2E8F0;#5591F7;#FFFFFF;#3DC5A1" dur="5s" repeatCount="indefinite" /></stop>
                  <stop offset="45%" stopColor="#FFFFFF"><animate attributeName="stop-color" values="#FFFFFF;#3DC5A1;#1B6EF3;#E2E8F0;#FFFFFF" dur="5s" repeatCount="indefinite" /></stop>
                  <stop offset="100%" stopColor="#0D8A6A"><animate attributeName="stop-color" values="#0D8A6A;#1B6EF3;#3DC5A1;#E2E8F0;#0D8A6A" dur="5s" repeatCount="indefinite" /></stop>
                </linearGradient>
                <linearGradient id={ids.lgMetalText} gradientUnits="userSpaceOnUse" x1="64" y1="0" x2="162" y2="0">
                  <stop offset="0%" stopColor="#FFFFFF" />
                  <stop offset="25%" stopColor="#E2E8F0" />
                  <stop offset="52%" stopColor="#3DC5A1"><animate attributeName="stop-color" values="#3DC5A1;#FFFFFF;#5591F7;#3DC5A1" dur="5s" repeatCount="indefinite" /></stop>
                  <stop offset="78%" stopColor="#E2E8F0" />
                  <stop offset="100%" stopColor="#FFFFFF" />
                </linearGradient>
                <linearGradient id={ids.lgBlue} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#5591F7" />
                  <stop offset="100%" stopColor="#1B6EF3" />
                </linearGradient>
                <linearGradient id={ids.lgSheen} gradientUnits="userSpaceOnUse" x1="30" y1="0" x2="82" y2="0">
                  <stop offset="0%" stopColor="white" stopOpacity="0" />
                  <stop offset="30%" stopColor="white" stopOpacity="0.38" />
                  <stop offset="50%" stopColor="white" stopOpacity="0.72" />
                  <stop offset="70%" stopColor="white" stopOpacity="0.38" />
                  <stop offset="100%" stopColor="white" stopOpacity="0" />
                </linearGradient>
                <filter id={ids.fGlow} x="-70%" y="-70%" width="240%" height="240%"><feGaussianBlur in="SourceGraphic" stdDeviation="1.4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                <filter id={ids.fScan} x="-400%" y="-30%" width="900%" height="160%"><feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                <clipPath id={ids.cpText}><rect x="64" y="13" width="100" height="24" /></clipPath>
              </defs>
              <rect className="box-trace" x="7.5" y="7.5" width="49" height="49" rx="10.5" fill="none" stroke={`url(#${ids.lgMetalBox})`} strokeWidth="1.2" strokeDasharray="200" strokeDashoffset="200" />
              <rect className="box-fill" x="8" y="8" width="48" height="48" rx="10" fill="#141520" stroke={`url(#${ids.lgMetalBox})`} strokeWidth="1.2" opacity="0" />
              <line className="gl" x1="20" y1="20" x2="44" y2="20" stroke="#1C1E2E" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="26" strokeDashoffset="26" />
              <line className="gl" x1="20" y1="32" x2="44" y2="32" stroke="#1C1E2E" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="26" strokeDashoffset="26" />
              <line className="gl" x1="20" y1="44" x2="44" y2="44" stroke="#1C1E2E" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="26" strokeDashoffset="26" />
              <line className="gl" x1="20" y1="20" x2="20" y2="44" stroke="#1C1E2E" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="26" strokeDashoffset="26" />
              <line className="gl" x1="44" y1="20" x2="44" y2="44" stroke="#1C1E2E" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="26" strokeDashoffset="26" />
              <path className="sig-path" d="M20 44 L32 20 L44 32" fill="none" stroke={`url(#${ids.lgMetalBox})`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="44" strokeDashoffset="44" />
              <path className="sig-path-shine" d="M20 44 L32 20 L44 32" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="14 44" strokeDashoffset="14" opacity="0" filter={`url(#${ids.fGlow})`} />
              <circle className="nd" cx="20" cy="20" r="3.5" fill="#3D3F52" opacity="0" />
              <circle className="nd" cx="44" cy="20" r="2.5" fill="#3D3F52" opacity="0" />
              <circle className="nd" cx="20" cy="44" r="2.5" fill="#3D3F52" opacity="0" />
              <circle className="nd" cx="44" cy="44" r="2.5" fill="#3D3F52" opacity="0" />
              <circle className="nd" cx="32" cy="44" r="3" fill="#0D8A6A" opacity="0" />
              <circle className="node-a" cx="32" cy="20" r="2.5" fill="#3DC5A1" filter={`url(#${ids.fGlow})`} opacity="0" />
              <circle className="node-b" cx="44" cy="32" r="3.5" fill={`url(#${ids.lgBlue})`} filter={`url(#${ids.fGlow})`} opacity="0" />
              <g className="g-wordmark" opacity="0">
                <text className="letter-slot" x="75" y="33" fontFamily="Inter, -apple-system, sans-serif" fontSize="22" fontWeight="700" textAnchor="middle" fill="#E2E8F0">S</text>
                <text className="letter-slot" x="89" y="33" fontFamily="Inter, -apple-system, sans-serif" fontSize="22" fontWeight="700" textAnchor="middle" fill="#E2E8F0">t</text>
                <text className="letter-slot" x="103" y="33" fontFamily="Inter, -apple-system, sans-serif" fontSize="22" fontWeight="700" textAnchor="middle" fill="#E2E8F0">u</text>
                <text className="letter-slot" x="117" y="33" fontFamily="Inter, -apple-system, sans-serif" fontSize="22" fontWeight="700" textAnchor="middle" fill="#E2E8F0">d</text>
                <text className="letter-slot" x="131" y="33" fontFamily="Inter, -apple-system, sans-serif" fontSize="22" fontWeight="700" textAnchor="middle" fill="#E2E8F0">i</text>
                <text className="letter-slot" x="145" y="33" fontFamily="Inter, -apple-system, sans-serif" fontSize="22" fontWeight="700" textAnchor="middle" fill="#E2E8F0">o</text>
              </g>
              <g className="g-sheen" clipPath={`url(#${ids.cpText})`} opacity="0">
                <g className="g-sheen-move"><rect x="12" y="13" width="52" height="24" fill={`url(#${ids.lgSheen})`} /></g>
              </g>
              <g className="g-sweep" opacity="0">
                <line x1="64" y1="11" x2="64" y2="43" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
                <line x1="64" y1="11" x2="64" y2="43" stroke="#3DC5A1" strokeWidth="5" strokeLinecap="round" opacity="0.65" filter={`url(#${ids.fScan})`} />
                <line x1="64" y1="11" x2="64" y2="43" stroke="#5591F7" strokeWidth="13" strokeLinecap="round" opacity="0.12" />
              </g>
              <text className="codespace-submark" x="68" y="48" fontFamily="Inter, -apple-system, sans-serif" fontSize="10" fontWeight="400" fill="#94A3B8" letterSpacing="2.5" opacity="0">CODESPACE</text>
            </svg>
          </div>
        </div>
        <div className="entry-loader__progress-wrap">
          <div className="entry-loader__progress-meta">
            <span className="entry-loader__progress-label">INITIALIZING SANDBOX</span>
            <span className="entry-loader__progress-value">{progress}%</span>
          </div>
          <div className="entry-loader__progress-track"><div className="entry-loader__progress-bar" style={{ width: `${progress}%` }} /></div>
        </div>
        <div className="entry-loader__agents-grid">
          {AGENT_LAYERS.map(layer => {
            const Icon = layer.icon;
            const status = layerStatuses[layer.id];
            const isActive = activeLayerId === layer.id;
            return (
              <div key={layer.id} className={`agent-chip agent-chip--${status} ${isActive ? 'agent-chip--active' : ''}`} style={{ '--chip-color': layer.color }}>
                <div className="agent-chip__icon"><Icon size={14} /></div>
                <div className="agent-chip__info">
                  <div className="agent-chip__head">
                    <span className="agent-chip__name">{layer.name}</span>
                    <span className="agent-chip__tag">{layer.tag}</span>
                  </div>
                  <span className="agent-chip__desc">{layer.desc}</span>
                </div>
                <div className="agent-chip__status">
                  {status === 'online' ? <CheckCircle2 size={12} color="#22C55E" /> : status === 'active' ? <span className="agent-chip__pulse" /> : <span className="agent-chip__dot" />}
                </div>
              </div>
            );
          })}
        </div>
        <div className="entry-loader__console">
          <div className="entry-loader__console-header">
            <div className="dots"><span className="dot dot--red" /><span className="dot dot--yellow" /><span className="dot dot--green" /></div>
            <span className="terminal-title">taksha-boot.log</span>
            <span className="terminal-live">LIVE</span>
          </div>
          <div className="entry-loader__console-body" ref={terminalRef}>
            {logs.map((log, index) => (
              <div className={`log-line log-line--${log.type}`} key={index}>
                <span className="log-line__time">[{log.time}]</span>
                <span className="log-line__text">{log.text}</span>
              </div>
            ))}
            <div className="log-line"><span className="log-line__cursor">_</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
