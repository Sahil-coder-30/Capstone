import React, { useState, useEffect, useRef, useCallback } from 'react';
import gsap from 'gsap';
import {
  Cpu, Code, Activity, Zap, ArrowRight, Sparkles,
  ChevronRight, Server, Play, RotateCw, CheckCircle,
  Layers, TerminalSquare, Box, ChevronDown, MessageSquare,
  Rocket, ShieldCheck, Download, MousePointerClick,
  FileCode, Braces, X
} from 'lucide-react';
import './LandingPage.scss';
import BrandLogo from './BrandLogo';

/* ── GitHub icon ────────────────────────────────────────────────── */
function GithubIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

/* ── Scroll-triggered reveal wrapper ────────────────────────────── */
function Reveal({ children, className = '', delay = 0, style = {} }) {
  const ref = useRef(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect(); } },
      { threshold: 0.07, rootMargin: '0px 0px -30px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`reveal ${vis ? 'reveal--in' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms`, ...style }}
    >
      {children}
    </div>
  );
}

/* ── Canvas particles ───────────────────────────────────────────── */
function ParticleBackground() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    let W = (cv.width = window.innerWidth);
    let H = (cv.height = window.innerHeight);
    const onResize = () => { W = cv.width = window.innerWidth; H = cv.height = window.innerHeight; };
    window.addEventListener('resize', onResize);
    const N = 60;
    const pts = Array.from({ length: N }, (_, i) => ({
      x: Math.random() * W, y: Math.random() * H,
      r: Math.random() * 1.6 + 0.5, op: Math.random() * 0.45 + 0.1,
      color: i % 3 === 0 ? '#0D8A6A' : i % 3 === 1 ? '#1B6EF3' : '#3DC5A1',
    }));
    const tweens = pts.map(p => gsap.to(p, {
      x: `+=${(Math.random() - 0.5) * 180}`,
      y: `+=${(Math.random() - 0.5) * 180}`,
      op: 'random(0.04, 0.55)',
      duration: 'random(5,10)', repeat: -1, yoyo: true, ease: 'power1.inOut',
    }));
    let mouse = { x: null, y: null };
    const mm = e => { mouse.x = e.clientX; mouse.y = e.clientY; };
    const ml = () => { mouse.x = null; mouse.y = null; };
    window.addEventListener('mousemove', mm);
    window.addEventListener('mouseleave', ml);
    let raf;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 110) {
          ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = `rgba(168,170,184,${(1 - d / 110) * 0.055})`; ctx.lineWidth = 0.5; ctx.stroke();
        }
      }
      pts.forEach(p => {
        if (p.x < 0) p.x = W; else if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; else if (p.y > H) p.y = 0;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color; ctx.globalAlpha = p.op; ctx.fill(); ctx.globalAlpha = 1;
        if (mouse.x !== null) {
          const dx = p.x - mouse.x, dy = p.y - mouse.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 140) {
            const a = (1 - d / 140) * 0.18;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(mouse.x, mouse.y);
            ctx.strokeStyle = p.color === '#0D8A6A' ? `rgba(13,138,106,${a})` : `rgba(27,110,243,${a})`;
            ctx.lineWidth = 0.6; ctx.stroke();
          }
        }
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', mm);
      window.removeEventListener('mouseleave', ml);
      cancelAnimationFrame(raf);
      tweens.forEach(t => t.kill());
    };
  }, []);
  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.7, willChange: 'transform', transform: 'translate3d(0,0,0)', backfaceVisibility: 'hidden' }} />;
}

/* ── Static data ────────────────────────────────────────────────── */
const AGENTS = [
  {
    id: 'planner', step: '01', name: 'Planner', color: '#0D8A6A',
    tag: 'Layer 01', icon: Layers,
    headline: 'Breaks the prompt into a precise developer task graph',
    desc: 'Decomposes natural-language input into file topology, Redux slice maps, and a dependency order for the Builder.',
    logs: [
      { cls: 'log-muted',   text: 'PROMPT: "Build a telemetry dashboard with live Redux state."' },
      { cls: 'log-planner', text: '[PLANNER] Decomposing into developer operations…' },
      { cls: 'log-planner', text: '[PLANNER] ✦ Init dir → /src/features/telemetry/' },
      { cls: 'log-planner', text: '[PLANNER] ✦ Scaffold Redux slice: telemetry.slice.js' },
      { cls: 'log-planner', text: '[PLANNER] ✦ Map websocket payloads to state shape' },
      { cls: 'log-success', text: '[PLANNER] ✔ Task graph ready — handoff to BUILDER' },
    ],
  },
  {
    id: 'builder', step: '02', name: 'Builder', color: '#1B6EF3',
    tag: 'Layer 02', icon: Code,
    headline: 'Writes all source files and resolves every import',
    desc: 'Outputs complete, runnable source code — components, slices, API calls — resolving imports and syncing file buffers.',
    logs: [
      { cls: 'log-muted',   text: 'SPEC: "Write telemetry dashboard + Redux slice."' },
      { cls: 'log-builder', text: '[BUILDER] Scaffolding TelemetryConsole.jsx (124 lines)' },
      { cls: 'log-builder', text: '[BUILDER] Writing telemetry.slice.js — 84 lines' },
      { cls: 'log-builder', text: '[BUILDER] Resolving imports: lucide-react, recharts' },
      { cls: 'log-builder', text: '[BUILDER] 1,204 lines modified across 6 files' },
      { cls: 'log-success', text: '[BUILDER] ✔ HMR patch synced — handoff to EXECUTOR' },
    ],
  },
  {
    id: 'executor', step: '03', name: 'Executor', color: '#D97B0C',
    tag: 'Layer 03', icon: Play,
    headline: 'Boots a live Kubernetes pod and runs the dev server',
    desc: 'Provisions the K8s sandbox, maps web ports, executes npm scripts, and opens an xterm.js shell for live interaction.',
    logs: [
      { cls: 'log-muted',    text: 'CMD: npm run dev --host → port 5173' },
      { cls: 'log-executor', text: '[EXECUTOR] Spawning pty in K8s pod…' },
      { cls: 'log-executor', text: '[EXECUTOR] $ npm install (42 packages)' },
      { cls: 'log-executor', text: '[EXECUTOR] $ npm run dev --host' },
      { cls: 'log-executor', text: '[EXECUTOR] > vite v8.0.16 dev server running' },
      { cls: 'log-success',  text: '[EXECUTOR] ✔ Sandbox ONLINE → sandbox.taksha.dev:5173' },
    ],
  },
  {
    id: 'healer', step: '04', name: 'Self-Healer', color: '#D63B3B',
    tag: 'Layer 04', icon: Activity,
    headline: 'Intercepts errors and applies surgical line-level patches',
    desc: 'Monitors stdout/stderr, detects compiler exceptions, analyses the AST, and auto-patches imports and type errors — no human needed.',
    logs: [
      { cls: 'log-muted',   text: 'SCAN: Monitoring container output stream…' },
      { cls: 'log-healer',  text: '[HEALER] ⚠ ReferenceError: "Cpu" is not defined — line 24' },
      { cls: 'log-healer',  text: '[HEALER] Analysing AST for missing import declarations…' },
      { cls: 'log-healer',  text: '[HEALER] Patch: inject "Cpu" into lucide-react import' },
      { cls: 'log-healer',  text: '[HEALER] Writing surgical fix to TelemetryConsole.jsx' },
      { cls: 'log-success', text: '[HEALER] ✔ Patch applied · HMR reload complete · 1.8s' },
    ],
    showDiff: true,
  },
];

const FEATURES = [
  {
    icon: Activity, title: 'Surgical Self-Healing',
    desc: 'Compiler errors intercepted, analysed, and patched automatically — line-level, not full rewrites.',
    tag: 'Core', accent: '#0D8A6A',
  },
  {
    icon: Braces, title: 'Monaco Code Editor',
    desc: 'Full VS Code Monaco with syntax highlighting, IntelliSense, and multi-file tabs.',
    accent: '#1B6EF3',
  },
  {
    icon: TerminalSquare, title: 'xterm.js Terminal',
    desc: 'Interactive bash shell inside your K8s pod. npm, git, curl — everything just works.',
    accent: '#3DC5A1',
  },
  {
    icon: Server, title: 'Isolated K8s Pods',
    desc: 'Each workspace in a private Namespace with hard CPU/RAM ceilings and zero cross-container access.',
    accent: '#D97B0C',
  },
  {
    icon: FileCode, title: 'AST Validator Guards',
    desc: 'Pre-validates Abstract Syntax Trees before each compile to prevent cascading runtime failures.',
    accent: '#1B6EF3',
  },
  {
    icon: Download, title: 'One-Click Export',
    desc: 'ZIP download, GitHub push, or Dockerfile generation — from inside the IDE in one click.',
    accent: '#3DC5A1',
  },
];

const TECH_STACK = [
  'React 18', 'Vite 8', 'Kubernetes', 'LangGraph',
  'Mistral Devstral', 'MongoDB Atlas', 'FastAPI', 'Docker',
  'Monaco Editor', 'xterm.js', 'Redux Toolkit', 'Tailwind CSS',
];

const STATS = [
  { value: '< 30s', label: 'First live preview' },
  { value: '4', label: 'Agent layers' },
  { value: '1.8s', label: 'Auto-heal cycle' },
  { value: '100%', label: 'Pod isolation' },
];

const FAQ = [
  {
    q: 'How do the 4 agent layers coordinate?',
    a: 'They run as isolated nodes in a LangGraph state machine. Planner → Builder → Executor → Self-Healer. Each passes structured output to the next. The orchestrator graph handles retries and state persistence between steps.',
  },
  {
    q: 'Are sandboxes secure and isolated?',
    a: 'Yes. Every workspace runs in a private Kubernetes Namespace with hard CPU/RAM resource ceilings, NVMe persistent volumes, and zero cross-container network access. Each session gets a freshly provisioned pod.',
  },
  {
    q: 'Can I export my generated code?',
    a: 'Absolutely — download as ZIP, push to GitHub with one click, or generate a Dockerfile for local self-hosting from the Workspace Exporter panel inside the IDE.',
  },
  {
    q: 'What languages and frameworks work?',
    a: 'React, Vite, Next.js, Express, and plain HTML/CSS/JS out of the box. The container includes Node.js and Python, so you can install any npm or pip package and run custom build scripts.',
  },
  {
    q: 'Can it build full-stack apps?',
    a: 'Yes. The Builder agent can scaffold both React frontends and FastAPI/Express backends. Both run in the same pod with inter-service communication over localhost.',
  },
];

const PROMPTS = [
  'Build a React todo list with Redux state',
  'Build a REST API with JWT authentication',
  'Build a Markdown notes app with local storage',
  'Build a real-time chat with WebSocket',
  'Build a dashboard with live Recharts graphs',
];

/* ── Demo log simulator ─────────────────────────────────────────── */
function buildLines(prompt) {
  return [
    { cls: 'log-muted',    text: `▶  "${prompt}"` },
    { cls: 'log-planner',  text: '[PLANNER] Decomposing into task graph…' },
    { cls: 'log-planner',  text: '[PLANNER] ✦ File topology mapped → /src/App.jsx, /src/store/' },
    { cls: 'log-builder',  text: '[BUILDER] Scaffolding /src/App.jsx…' },
    { cls: 'log-builder',  text: '[BUILDER] Writing Redux slice — 1,024 lines synced' },
    { cls: 'log-executor', text: '[EXECUTOR] Booting K8s sandbox pod…' },
    { cls: 'log-executor', text: '[EXECUTOR] > vite v8.0.16 dev server — port 5173' },
    { cls: 'log-healer',   text: '[HEALER] ⚠  ReferenceError detected — line 18' },
    { cls: 'log-healer',   text: '[HEALER] Generating surgical patch…' },
    { cls: 'log-success',  text: '✔  Workspace live & auto-healed in 28.4s' },
  ];
}

/* ══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════ */
export default function LandingPage({ onNavigateToLogin }) {
  const landingRef  = useRef(null);
  const headerRef   = useRef(null);
  const heroInnerRef = useRef(null);
  const logsEndRef  = useRef(null);
  const ivRef       = useRef(null);

  const [isScrolled,   setIsScrolled]   = useState(false);
  const [isScrolling,  setIsScrolling]  = useState(false);
  const [isHovered,    setIsHovered]    = useState(false);
  const [activeAgent,  setActiveAgent]  = useState('planner');
  const [openFaq,      setOpenFaq]      = useState(null);
  const [email,        setEmail]        = useState('');
  const [submitted,    setSubmitted]    = useState(false);
  const [showChevron,  setShowChevron]  = useState(true);

  // Pricing state
  const [isYearly,     setIsYearly]     = useState(false);

  // Demo state
  const [promptText,  setPromptText]  = useState(PROMPTS[0]);
  const [demoLogs,    setDemoLogs]    = useState([]);
  const [demoState,   setDemoState]   = useState('idle'); // idle | running | done

  /* title */
  useEffect(() => { document.title = 'Taksha Codespace — AI-Powered Cloud IDE'; }, []);

  /* scroll */
  useEffect(() => {
    const el = landingRef.current;
    if (!el) return;
    let scrollTimeout;
    const h = () => {
      const scrollTop = el.scrollTop;
      // Scroll hysteresis: collapse past 80px, restore only when returning close to top (< 20px)
      if (scrollTop > 80) {
        setIsScrolled(true);
      } else if (scrollTop < 20) {
        setIsScrolled(false);
      }
      setShowChevron(scrollTop < 80);
      
      // Temporarily lock hover state during active scroll to avoid cursor trigger glitch
      setIsScrolling(true);
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        setIsScrolling(false);
      }, 150);
    };
    el.addEventListener('scroll', h, { passive: true });
    return () => {
      el.removeEventListener('scroll', h);
      clearTimeout(scrollTimeout);
    };
  }, []);

  /* dynamic island expanded state */
  const expanded = !isScrolled || (isHovered && !isScrolling);

  /* mount animations */
  useEffect(() => {
    if (headerRef.current) {
      gsap.fromTo(headerRef.current,
        { y: -50, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.7, ease: 'power3.out' }
      );
    }
    if (heroInnerRef.current) {
      gsap.fromTo(heroInnerRef.current,
        { y: 32, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.95, ease: 'power3.out', delay: 0.1 }
      );
    }
  }, []);

  /* smooth scroll to sections with offset */
  const handleScrollTo = useCallback((e, targetId) => {
    if (e && e.preventDefault) e.preventDefault();
    const container = landingRef.current;
    const targetEl = document.getElementById(targetId);
    if (container && targetEl) {
      const targetOffsetTop = targetEl.offsetTop;
      container.scrollTo({
        top: targetOffsetTop - 80,
        behavior: 'smooth'
      });
    }
  }, []);

  /* auto-scroll demo logs */
  useEffect(() => {
    if (demoLogs.length > 0) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [demoLogs]);

  /* run demo */
  const runDemo = useCallback(() => {
    if (demoState === 'running' || !promptText.trim()) return;
    clearInterval(ivRef.current);
    const lines = buildLines(promptText);
    setDemoLogs([]);
    setDemoState('running');
    let i = 0;
    ivRef.current = setInterval(() => {
      if (i < lines.length) {
        const currentLine = lines[i]; // Evaluate lines[i] immediately outside inner state updater closure to prevent out-of-bounds undefined references.
        setDemoLogs(prev => [...prev, currentLine]);
        i++;
      } else {
        clearInterval(ivRef.current);
        setDemoState('done');
      }
    }, 360);
  }, [demoState, promptText]);

  const resetDemo = useCallback(() => {
    clearInterval(ivRef.current);
    setDemoLogs([]);
    setDemoState('idle');
  }, []);

  /* cleanup */
  useEffect(() => () => clearInterval(ivRef.current), []);

  const agent = AGENTS.find(a => a.id === activeAgent);

  /* ── JSX ─────────────────────────────────────────────────────── */
  return (
    <div ref={landingRef} className="lp">
      <ParticleBackground />
      <div className="lp__glow lp__glow--tr" />
      <div className="lp__glow lp__glow--bl" />
      <div className="lp__glow lp__glow--mid" />
      <div className="lp__glow lp__glow--bottom" />

      {/* ━━━━ NAV ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="lp__nav-wrap">
        <header
          ref={headerRef}
          className={`lp__header ${expanded ? 'lp__header--expanded' : 'lp__header--collapsed'}`}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* pill — collapsed */}
          <div className="lp__pill-collapsed">
            <span className="pulse-dot" /><span>Taksha Codespace</span>
          </div>
          {/* pill — expanded */}
          <div className="lp__pill-expanded">
            <div className="lp__brand"><BrandLogo height={22} variant="dark" /></div>
            <nav className="lp__nav-links">
              <a href="#demo" onClick={(e) => handleScrollTo(e, 'demo')}>Demo</a>
              <a href="#pipeline" onClick={(e) => handleScrollTo(e, 'pipeline')}>Architecture</a>
              <a href="#features" onClick={(e) => handleScrollTo(e, 'features')}>Features</a>
              <a href="#access" onClick={(e) => handleScrollTo(e, 'access')}>Early Access</a>
            </nav>
            <div className="lp__nav-cta">
              <button onClick={onNavigateToLogin} className="btn btn--ghost btn--sm">Sign in</button>
              <button onClick={onNavigateToLogin} className="btn btn--primary btn--sm">Get started <ChevronRight size={11} /></button>
            </div>
          </div>
        </header>
      </div>

      {/* ━━━━ HERO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="lp__hero">
        <div ref={heroInnerRef} className="lp__hero-inner">

          <div className="lp__badge">
            <Sparkles size={10} />
            <span>Mistral Devstral · LangGraph · Kubernetes</span>
          </div>

          <h1 className="lp__hero-h1">
            Describe your app.<br />
            <span className="grad">Taksha builds, tests &amp; heals it.</span>
          </h1>

          <p className="lp__hero-sub">
            A 4-layer multi-agent pipeline on Kubernetes. One prompt &rarr; a production-ready
            React app running live in a browser sandbox — with a self-healing compiler
            loop that fixes its own errors automatically.
          </p>

          <div className="lp__hero-actions">
            <a href="#demo" onClick={(e) => handleScrollTo(e, 'demo')} className="btn btn--primary btn--lg">
              Try the live demo <ArrowRight size={14} />
            </a>
            <button onClick={onNavigateToLogin} className="btn btn--ghost btn--lg">
              Open workspace
            </button>
          </div>

          <div className="lp__stats">
            {STATS.map((s, i) => (
              <div key={i} className="lp__stat">
                <span className="lp__stat-val">{s.value}</span>
                <span className="lp__stat-label">{s.label}</span>
              </div>
            ))}
          </div>

        </div>

        <div 
          className={`lp__scroll-cue${showChevron ? ' lp__scroll-cue--on' : ''}`}
          onClick={(e) => handleScrollTo(e, 'demo')}
          style={{ cursor: 'pointer' }}
        >
          <ChevronDown size={17} />
        </div>
        <div className="lp__hero-fade" />
      </section>

      {/* ━━━━ DEMO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section id="demo" className="lp__section lp__demo">
        <div className="lp__container">

          <Reveal>
            <div className="lp__sect-head">
              <div className="lp__label"><MousePointerClick size={10} /> Interactive Demo</div>
              <h2 className="lp__sect-title">Type what you want. Watch it build.</h2>
              <p className="lp__sect-sub">
                No sign-up needed. Pick a template or write your own prompt and run the 4-agent pipeline live.
              </p>
            </div>
          </Reveal>

          <Reveal delay={60}>
            <div className={`demo-shell${demoState === 'running' ? ' demo-shell--running' : ''}`}>

              {/* — Left panel — */}
              <div className="demo-left">
                <div className="demo-left__top">
                  <span className="demo-left__label">Your prompt</span>
                </div>

                <textarea
                  className="demo-textarea"
                  value={promptText}
                  onChange={e => setPromptText(e.target.value)}
                  rows={4}
                  placeholder="Describe what you want to build…"
                  spellCheck={false}
                />

                <div className="demo-chips">
                  {PROMPTS.map((p, i) => (
                    <button
                      key={i}
                      className={`demo-chip${promptText === p ? ' demo-chip--active' : ''}`}
                      onClick={() => { setPromptText(p); resetDemo(); }}
                    >
                      {p.replace('Build a ', '')}
                    </button>
                  ))}
                </div>

                <div className="demo-actions">
                  <button
                    className="btn btn--primary btn--sm"
                    onClick={runDemo}
                    disabled={demoState === 'running'}
                  >
                    {demoState === 'running'
                      ? <><RotateCw size={11} className="spin" /> Running…</>
                      : <><Play size={11} /> Run pipeline</>}
                  </button>
                  {demoState !== 'idle' && (
                    <button className="btn btn--ghost btn--sm" onClick={resetDemo}>
                      <X size={11} /> Reset
                    </button>
                  )}
                </div>
              </div>

              {/* — Right panel — */}
              <div className="demo-right">
                <div className="demo-right__bar">
                  <div className="demo-dots"><span /><span /><span /></div>
                  <span className="demo-path"><TerminalSquare size={10} color="#0D8A6A" /> langgraph://orchestrator.trace</span>
                  <span className="demo-status">
                    {demoState === 'running' && <span className="demo-streaming">STREAMING ▍</span>}
                    {demoState === 'done'    && <span className="demo-done">DONE</span>}
                    {demoState === 'idle'    && <span className="demo-idle">READY</span>}
                  </span>
                </div>
                <div className="demo-right__body">
                  {demoLogs.length === 0 && demoState === 'idle' && (
                    <div className="demo-empty">
                      <Play size={20} strokeWidth={1.5} />
                      <span>Run the pipeline to see the agent trace</span>
                    </div>
                  )}
                  {demoLogs.map((l, i) => (
                    <div key={i} className={`demo-line ${l.cls}`}>
                      <span className="demo-ln">{String(i + 1).padStart(2, '0')}</span>
                      <span>{l.text}</span>
                    </div>
                  ))}
                  {demoState === 'done' && (
                    <div className="demo-success-bar">
                      <CheckCircle size={13} /> App compiled · sandbox live · click "Open workspace" to continue
                    </div>
                  )}
                  <div ref={logsEndRef} />
                </div>
              </div>

            </div>
          </Reveal>
        </div>
      </section>

      {/* ━━━━ HOW IT WORKS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="lp__section lp__how">
        <div className="lp__container">
          <Reveal>
            <div className="lp__sect-head lp__sect-head--center">
              <div className="lp__label">How it works</div>
              <h2 className="lp__sect-title">From idea to live app in three steps</h2>
              <p className="lp__sect-sub">The full pipeline is autonomous — you only write the prompt.</p>
            </div>
          </Reveal>

          <div className="how-steps">
            {[
              { icon: MessageSquare, n: '01', title: 'Describe', color: '#3DC5A1',
                desc: 'Type a plain-English prompt. Scaffold a React component, a full-stack API, a state machine — anything.' },
              { icon: Cpu, n: '02', title: 'Orchestrate & Heal', color: '#1B6EF3',
                desc: 'The 4-agent chain plans, writes, executes and automatically patches every compiler error in a K8s sandbox.' },
              { icon: Rocket, n: '03', title: 'Preview & Export', color: '#D97B0C',
                desc: 'Preview live in a browser iframe, shell into the terminal, or export as ZIP / push to GitHub.' },
            ].map((s, i) => {
              const Icon = s.icon;
              return (
                <Reveal key={i} delay={i * 80}>
                  <div className="how-card" style={{ '--c': s.color }}>
                    <div className="how-card__num">STEP {s.n}</div>
                    <div className="how-card__icon"><Icon size={22} /></div>
                    <h3 className="how-card__title">{s.title}</h3>
                    <p className="how-card__desc">{s.desc}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ━━━━ PIPELINE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section id="pipeline" className="lp__section lp__pipeline">
        <div className="lp__container">
          <Reveal>
            <div className="lp__sect-head">
              <div className="lp__label">Multi-Agent Architecture</div>
              <h2 className="lp__sect-title">4-layer LangGraph agent pipeline</h2>
              <p className="lp__sect-sub">
                Click a layer to inspect its live execution trace and auto-generated code diff.
              </p>
            </div>
          </Reveal>

          {/* Tabs */}
          <div className="pipe-tabs">
            {AGENTS.map(a => {
              const Icon = a.icon;
              const active = activeAgent === a.id;
              return (
                <button
                  key={a.id}
                  className={`pipe-tab${active ? ' pipe-tab--active' : ''}`}
                  style={{ '--c': a.color }}
                  onClick={() => setActiveAgent(a.id)}
                >
                  <span className="pipe-tab__step">{a.tag}</span>
                  <Icon size={15} />
                  <span className="pipe-tab__name">{a.name}</span>
                </button>
              );
            })}
          </div>

          {/* Panel */}
          <div className="pipe-panel">
            {/* Info col */}
            <div className="pipe-info">
              <div className="pipe-info__tag" style={{ color: agent.color }}>
                {agent.tag} · {agent.name}
              </div>
              <h3 className="pipe-info__headline">{agent.headline}</h3>
              <p className="pipe-info__desc">{agent.desc}</p>
              <div className="pipe-info__chip" style={{ '--c': agent.color }}>
                <span className="pipe-info__dot" style={{ background: agent.color }} />
                {agent.id === 'healer' ? 'Self-healing active' : 'Status: operational'}
              </div>
            </div>

            {/* Console col */}
            <div className="pipe-console">
              <div className="pipe-console__bar">
                <div className="pipe-dots"><span /><span /><span /></div>
                <span className="pipe-console__path">
                  <TerminalSquare size={10} color={agent.color} /> agent://{agent.id}.log
                </span>
                <span className="pipe-console__live" style={{ color: agent.color }}>● LIVE</span>
              </div>
              <div className="pipe-console__body">
                {agent.logs.map((l, i) => (
                  <div key={i} className={`pipe-line ${l.cls}`}>
                    <span className="pipe-ln">[{String(i + 1).padStart(2, '0')}]</span>
                    <span>{l.text}</span>
                  </div>
                ))}

                {agent.showDiff && (
                  <div className="diff-grid">
                    <div className="diff-half">
                      <div className="diff-head diff-head--del">BEFORE <span>line 24</span></div>
                      <div className="diff-body">
                        <div className="diff-line">18: import React from 'react';</div>
                        <div className="diff-line diff-line--del">24: - import &#123; Sparkles &#125; from 'lucide-react';</div>
                        <div className="diff-line">25: export default function T() &#123;</div>
                        <div className="diff-line diff-line--err">26: &nbsp; return &lt;Cpu /&gt; <span className="diff-comment">// ⚠ ReferenceError</span></div>
                      </div>
                    </div>
                    <div className="diff-half">
                      <div className="diff-head diff-head--add">AFTER <span>1.8s</span></div>
                      <div className="diff-body">
                        <div className="diff-line">18: import React from 'react';</div>
                        <div className="diff-line diff-line--add">24: + import &#123; Sparkles, Cpu &#125; from 'lucide-react';</div>
                        <div className="diff-line">25: export default function T() &#123;</div>
                        <div className="diff-line diff-line--ok">26: &nbsp; return &lt;Cpu /&gt; <span className="diff-comment">// ✔ OK</span></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━━ FEATURES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section id="features" className="lp__section lp__features">
        <div className="lp__container">
          <Reveal>
            <div className="lp__sect-head">
              <div className="lp__label">Feature Set</div>
              <h2 className="lp__sect-title">Everything inside one cloud IDE</h2>
              <p className="lp__sect-sub">
                Editor, terminal, sandbox, self-healer, and export — all orchestrated by AI agents.
              </p>
            </div>
          </Reveal>

          <div className="feat-grid">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <Reveal key={i} delay={i * 45}>
                  <div className={`feat-card${f.tag === 'Core' ? ' feat-card--hero' : ''}`} style={{ '--a': f.accent }}>
                    {f.tag && <span className="feat-card__tag">{f.tag}</span>}
                    <div className="feat-card__icon"><Icon size={17} /></div>
                    <h3 className="feat-card__title">{f.title}</h3>
                    <p className="feat-card__desc">{f.desc}</p>
                    {f.tag === 'Core' && (
                      <div className="feat-heal-preview">
                        <div className="feat-heal-bar"><span /><span /><span /><span className="feat-heal-bar__name">self_heal.log</span></div>
                        <div className="feat-heal-body">
                          <div className="log-healer">⚠ SyntaxError — line 42</div>
                          <div className="log-muted">→ Analysing AST…</div>
                          <div className="log-healer">→ Generating patch (3 lines)…</div>
                          <div className="log-success">✔ Patch applied · HMR reload · 1.8s</div>
                        </div>
                      </div>
                    )}
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ━━━━ TECH STACK MARQUEE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="lp__stack">
        <div className="lp__stack-label">Powered by</div>
        <div className="marquee-vp">
          <div className="marquee-track">
            {[...TECH_STACK, ...TECH_STACK, ...TECH_STACK].map((t, i) => (
              <span key={i} className="marquee-item">
                <span className="marquee-dot" />
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━━ EARLY ACCESS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section id="access" className="lp__section lp__access">
        <div className="lp__container">

          <Reveal>
            <div className="lp__sect-head lp__sect-head--center">
              <div className="lp__label">Early Access</div>
              <h2 className="lp__sect-title">Reserve your sandbox node</h2>
              <p className="lp__sect-sub">
                Phase 1 is open to 50 developers. Join the waitlist for priority access.
              </p>
            </div>
          </Reveal>

          <Reveal delay={90}>
            <div className="lp__billing-wrap">
              <button
                type="button"
                className={`lp__billing-btn ${!isYearly ? 'lp__billing-btn--active' : ''}`}
                onClick={() => setIsYearly(false)}
              >
                Monthly
              </button>
              <button
                type="button"
                className={`lp__billing-btn ${isYearly ? 'lp__billing-btn--active' : ''}`}
                onClick={() => setIsYearly(true)}
              >
                Yearly
                <span className="lp__billing-save">Save 20%</span>
              </button>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="pricing-row">
              {/* Free */}
              <div className="price-card">
                <div className="price-card__tier">Free</div>
                <div className="price-card__price">$0 <small>/mo</small></div>
                <div className="price-card__divider" />
                <ul className="price-card__list">
                  {['1 sandbox container pod', 'Planner & Builder agents', 'Monaco code editor & terminal', 'Standard AST syntax validation', 'Manual workspace ZIP export'].map((f, i) => (
                    <li key={i}><CheckCircle size={11} color="#0D8A6A" /> {f}</li>
                  ))}
                </ul>
                <button onClick={onNavigateToLogin} className="btn btn--ghost btn--sm price-card__cta">Get started free →</button>
              </div>
              {/* Pro */}
              <div className="price-card price-card--pro">
                <div className="price-card__head">
                  <div className="price-card__tier">Orchestrator Pro</div>
                  <span className="price-card__badge">BETA WAITLIST</span>
                </div>
                <div className="price-card__price">
                  {isYearly ? '$19' : '$24'} <small>/mo</small>
                </div>
                <div className="price-card__subtext">
                  {isYearly ? 'Billed annually ($228/yr)' : 'Billed monthly ($288/yr)'}
                </div>
                <div className="price-card__divider" />
                <ul className="price-card__list">
                  {['Unlimited active sandboxes', 'Full 4-agent orchestrator pipeline', 'Real-time self-healing compiler loops', '100 GB NVMe high-performance storage', 'One-click GitHub push & Dockerfile export', 'Priority container provisioning'].map((f, i) => (
                    <li key={i}><CheckCircle size={11} color="#0D8A6A" /> {f}</li>
                  ))}
                </ul>
                <a href="#access" onClick={(e) => handleScrollTo(e, 'access')} className="btn btn--primary btn--sm price-card__cta">Join beta waitlist →</a>
              </div>
            </div>
          </Reveal>

          <Reveal delay={150}>
            <div className="waitlist-box">
              <div className="waitlist-badge">
                <Sparkles size={11} /> BETA WAITLIST PHASE 1
              </div>
              <h3 className="waitlist-title">Reserve your node</h3>
              <p className="waitlist-desc">
                Phase 1 is limited to 50 active developers. Submit your email to request an invite.
              </p>
              
              {!submitted ? (
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (email.trim() && email.includes('@')) {
                      setSubmitted(true);
                    }
                  }} 
                  className="waitlist-form"
                >
                  <input
                    type="email"
                    placeholder="Enter your email address…"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <button type="submit" className="btn btn--primary btn--sm">
                    Request invite
                  </button>
                </form>
              ) : (
                <div className="waitlist-success">
                  <CheckCircle size={13} /> You're on the list! We'll reach out shortly.
                </div>
              )}

              <div className="waitlist-perks">
                <span className="waitlist-perk">✓ 100% Free Trial</span>
                <span className="waitlist-perk">✓ 100GB NVMe Node</span>
                <span className="waitlist-perk">✓ Direct Discord Access</span>
              </div>
            </div>
          </Reveal>

        </div>
      </section>

      {/* ━━━━ FAQ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="lp__section lp__faq">
        <div className="lp__container lp__container--narrow">
          <Reveal>
            <div className="lp__sect-head lp__sect-head--center">
              <div className="lp__label">FAQ</div>
              <h2 className="lp__sect-title">Common questions</h2>
            </div>
          </Reveal>

          <div className="faq-list">
            {FAQ.map((item, i) => {
              const open = openFaq === i;
              return (
                <Reveal key={i} delay={i * 35}>
                  <div className={`faq-item${open ? ' faq-item--open' : ''}`}>
                    <button
                      className="faq-item__q"
                      onClick={() => setOpenFaq(open ? null : i)}
                    >
                      <span className="faq-item__q-text">
                        <span className="faq-q-badge">Q{i + 1}</span>
                        {item.q}
                      </span>
                      <ChevronDown size={14} className={`faq-chevron${open ? ' faq-chevron--open' : ''}`} />
                    </button>
                    <div className="faq-item__a">
                      <div className="faq-item__a-inner">{item.a}</div>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ━━━━ FOOTER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <footer className="lp__footer">
        <div className="lp__footer-inner">
          <div className="lp__footer-brand">
            <BrandLogo height={18} variant="dark" />
            <span className="lp__footer-copy">© {new Date().getFullYear()} Taksha Codespace</span>
          </div>

          <div className="lp__footer-status">
            <span className="pulse-dot" />
            <span>All systems operational</span>
          </div>

          <div className="lp__footer-links">
            <a href="https://github.com" target="_blank" rel="noreferrer" aria-label="GitHub">
              <GithubIcon size={14} />
            </a>
            <a href="#security">Security</a>
            <a href="#terms">Terms</a>
            <a href="#privacy">Privacy</a>
            <span className="lp__footer-by">Built by Sahil · JSS Noida</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
