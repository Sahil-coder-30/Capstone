import React, { useState, useEffect, useRef, useCallback } from 'react';
import gsap from 'gsap';
import {
  Cpu, Code, Activity, Zap, ArrowRight, Sparkles,
  ChevronRight, Server, Play, RotateCw, CheckCircle,
  Layers, TerminalSquare, Box, ChevronDown, MessageSquare,
  Rocket, ShieldCheck, Download, MousePointerClick,
  FileCode, Braces, X, GitBranch, Globe, Menu, Crown
} from 'lucide-react';
import './LandingPage.scss';
import BrandLogo from '../../../components/BrandLogo';
import EntryLoader from '../../../components/EntryLoader';
import AmbientOrbs from '../../../components/AmbientOrbs';

function LinkedinIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect width="4" height="12" x="2" y="9" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}

function GithubIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

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

// AmbientOrbs is imported from src/components/AmbientOrbs.jsx

// ── Interactive 3D Card Component for Pricing Tier Cards ─────────────────────
function PricingCard3D({ plan, isYearly, onSelectPlan }) {
  const cardRef = useRef(null);
  const [style, setStyle] = useState({
    transform: 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)',
    spotlight: 'radial-gradient(circle 240px at 50% 50%, rgba(255,255,255,0.03), transparent 80%)',
  });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -12;
    const rotateY = ((x - centerX) / centerX) * 12;

    const glowColor = plan.glowColor || 'rgba(234, 88, 12, 0.25)';

    setStyle({
      transform: `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.025, 1.025, 1.025)`,
      spotlight: `radial-gradient(circle 280px at ${x}px ${y}px, ${glowColor}, transparent 80%)`,
    });
  };

  const handleMouseEnter = () => setIsHovered(true);

  const handleMouseLeave = () => {
    setIsHovered(false);
    setStyle({
      transform: 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)',
      spotlight: 'radial-gradient(circle 240px at 50% 50%, transparent, transparent)',
    });
  };

  const calculatePrice = () => {
    if (plan.priceINR === 0) return '₹0';
    const monthlyPrice = plan.priceINR;
    if (isYearly) {
      const discounted = Math.round(monthlyPrice * 0.8);
      return `₹${discounted}`;
    }
    return `₹${monthlyPrice}`;
  };

  return (
    <div
      ref={cardRef}
      className={`price-card-3d price-card-3d--${plan.id} ${plan.popular ? 'price-card-3d--popular' : ''} ${isHovered ? 'price-card-3d--hovered' : ''}`}
      style={{
        transform: style.transform,
        '--card-accent': plan.accentColor,
        '--card-glow': plan.glowColor,
        '--card-shadow': plan.shadowColor,
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="price-card-3d__spotlight" style={{ background: style.spotlight }} />
      <div className="price-card-3d__glass-border" />

      {plan.popular && (
        <div className="price-card-3d__top-badge">
          <Sparkles size={11} /> {plan.badge}
        </div>
      )}

      {/* Banner Image */}
      {plan.bannerImg && (
        <div className="price-card-3d__banner">
          <img src={plan.bannerImg} alt={`${plan.label} plan visual`} />
          <div className="price-card-3d__banner-overlay" />
        </div>
      )}

      <div className="price-card-3d__body">
        <div className="price-card-3d__head">
          <div className="price-card-3d__tier-group">
            {plan.icon && <plan.icon size={16} className="price-card-3d__icon" />}
            <span className="price-card-3d__tier">{plan.label}</span>
          </div>
          {!plan.popular && plan.badge && (
            <span className="price-card-3d__badge">{plan.badge}</span>
          )}
        </div>

        <p className="price-card-3d__desc">{plan.description}</p>

        <div className="price-card-3d__price-box">
          <span className="price-card-3d__price">{calculatePrice()}</span>
          <span className="price-card-3d__cycle">/month</span>
          {isYearly && plan.priceINR > 0 && (
            <span className="price-card-3d__billed-annually">Billed annually (Save 20%)</span>
          )}
        </div>

        <div className="price-card-3d__divider" />

        <ul className="price-card-3d__list">
          {plan.highlights.map((h, i) => (
            <li key={i}>
              <CheckCircle size={13} className="price-card-3d__check" />
              <span>{h}</span>
            </li>
          ))}
        </ul>

        <button
          onClick={onSelectPlan}
          className={`btn price-card-3d__cta ${plan.popular ? 'btn--primary' : 'btn--ghost'}`}
        >
          {plan.ctaText || 'Get Started'} <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}

const AGENTS = [
  {
    id: 'planner', step: '01', name: 'Planner', color: '#EA580C', tag: 'Layer 01', icon: Layers,
    headline: 'Breaks the prompt into a precise developer task graph',
    desc: 'Decomposes natural-language input into file topology, Redux slice maps, and a dependency order for the Builder.',
    logs: [
      { cls: 'log-muted',   text: 'PROMPT: "Build a telemetry dashboard with live Redux state."' },
      { cls: 'log-planner', text: '[PLANNER] Decomposing into developer operations...' },
      { cls: 'log-planner', text: '[PLANNER] Init dir: /src/features/telemetry/' },
      { cls: 'log-planner', text: '[PLANNER] Scaffold Redux slice: telemetry.slice.js' },
      { cls: 'log-planner', text: '[PLANNER] Map websocket payloads to state shape' },
      { cls: 'log-success', text: '[PLANNER] Task graph ready — handoff to BUILDER' },
    ],
  },
  {
    id: 'builder', step: '02', name: 'Builder', color: '#4F46E5', tag: 'Layer 02', icon: Code,
    headline: 'Writes all source files and resolves every import',
    desc: 'Outputs complete, runnable source code — components, slices, API calls — resolving imports and syncing file buffers.',
    logs: [
      { cls: 'log-muted',   text: 'SPEC: "Write telemetry dashboard + Redux slice."' },
      { cls: 'log-builder', text: '[BUILDER] Scaffolding TelemetryConsole.jsx (124 lines)' },
      { cls: 'log-builder', text: '[BUILDER] Writing telemetry.slice.js — 84 lines' },
      { cls: 'log-builder', text: '[BUILDER] Resolving imports: lucide-react, recharts' },
      { cls: 'log-builder', text: '[BUILDER] 1,204 lines modified across 6 files' },
      { cls: 'log-success', text: '[BUILDER] HMR patch synced — handoff to EXECUTOR' },
    ],
  },
  {
    id: 'executor', step: '03', name: 'Executor', color: '#D97B0C', tag: 'Layer 03', icon: Play,
    headline: 'Boots a live Kubernetes pod and runs the dev server',
    desc: 'Provisions the K8s sandbox, maps web ports, executes npm scripts, and opens an xterm.js shell for live interaction.',
    logs: [
      { cls: 'log-muted',    text: 'CMD: npm run dev --host -> port 5173' },
      { cls: 'log-executor', text: '[EXECUTOR] Spawning pty in K8s pod...' },
      { cls: 'log-executor', text: '[EXECUTOR] $ npm install (42 packages)' },
      { cls: 'log-executor', text: '[EXECUTOR] $ npm run dev --host' },
      { cls: 'log-executor', text: '[EXECUTOR] > vite v8.0.16 dev server running' },
      { cls: 'log-success',  text: '[EXECUTOR] Sandbox ONLINE -> sandbox.taksha.dev:5173' },
    ],
  },
  {
    id: 'healer', step: '04', name: 'Self-Healer', color: '#D63B3B', tag: 'Layer 04', icon: Activity,
    headline: 'Intercepts errors and applies surgical line-level patches',
    desc: 'Monitors stdout/stderr, detects compiler exceptions, analyses the AST, and auto-patches imports and type errors.',
    logs: [
      { cls: 'log-muted',   text: 'SCAN: Monitoring container output stream...' },
      { cls: 'log-healer',  text: '[HEALER] ReferenceError: "Cpu" is not defined — line 24' },
      { cls: 'log-healer',  text: '[HEALER] Analysing AST for missing import declarations...' },
      { cls: 'log-healer',  text: '[HEALER] Patch: inject "Cpu" into lucide-react import' },
      { cls: 'log-healer',  text: '[HEALER] Writing surgical fix to TelemetryConsole.jsx' },
      { cls: 'log-success', text: '[HEALER] Patch applied · HMR reload complete · 1.8s' },
    ],
    showDiff: true,
  },
];

const FEATURES = [
  { icon: Box,            title: 'Sandbox Environment',         desc: 'Fully isolated, cloud-based dev environment — spin up, build, break, restart, zero risk.', accent: '#4F46E5' },
  { icon: TerminalSquare, title: 'Full Code Editor + Terminal', desc: 'Code by hand, install dependencies, run any command — a complete environment, not just a chat box.', accent: '#4ADE80' },
  { icon: Activity,       title: 'Agentic Build Pipeline',      desc: 'Give it one prompt. Agents and subagents plan, build, test, and debug a full React app end to end.', tag: 'Core', accent: '#EA580C' },
  { icon: GitBranch,      title: 'GitHub Integration via MCP',  desc: 'Deploy directly, or push your finished project straight to GitHub — no manual handoff.', accent: '#D97B0C' },
];

const TECH_STACK = ['React 18','Vite 8','Kubernetes','LangGraph','Mistral Devstral','MongoDB Atlas','FastAPI','Docker','Monaco Editor','xterm.js','Redux Toolkit','Tailwind CSS'];

const STATS = [
  { value: '< 30s', label: 'First live preview' },
  { value: '4',     label: 'Agent layers' },
  { value: '1.8s',  label: 'Auto-heal cycle' },
  { value: '100%',  label: 'Pod isolation' },
];

const SHOWCASE_ITEMS = [
  { id: 0, src: '/images/codespace-preview-1.jpg', fallbackSrc: '/images/free_plan_banner.png', sideLabel: 'editor.jsx',   tag: 'Builder Agent', TagIcon: Code },
  { id: 1, src: '/images/Dahboard_Image_pure.jpg', fallbackSrc: '/images/pro_plan_banner.png',  sideLabel: 'dashboard.jsx', tag: 'Dashboard',     TagIcon: Layers },
  { id: 2, src: '/images/codespace-preview-2.jpg', fallbackSrc: '/images/max_plan_banner.png',  sideLabel: 'agent.log',    tag: 'Self-Healer',   TagIcon: Activity },
];

const PRICING_PLANS = [
  {
    id: 'free',
    label: 'Taksha AI Free',
    priceINR: 0,
    badge: 'GET STARTED',
    icon: Code,
    bannerImg: '/images/free_plan_banner.png',
    accentColor: '#EA580C',
    glowColor: 'rgba(234, 88, 12, 0.22)',
    shadowColor: 'rgba(234, 88, 12, 0.25)',
    description: 'Essential sandbox and AI model credits for developers getting started.',
    ctaText: 'Get Started Free',
    highlights: [
      '20 AI credits per provider daily',
      '50,000 daily token limit',
      '0.5 vCPU + 512 MB RAM container',
      'Coding Agent + Copilot',
      'Community Forum support'
    ]
  },
  {
    id: 'pro',
    label: 'Taksha AI Pro',
    priceINR: 499,
    badge: 'MOST POPULAR',
    popular: true,
    icon: Zap,
    bannerImg: '/images/pro_plan_banner.png',
    accentColor: '#4F46E5',
    glowColor: 'rgba(27, 110, 243, 0.28)',
    shadowColor: 'rgba(27, 110, 243, 0.35)',
    description: 'Full AI power with high-performance isolated sandbox containers.',
    ctaText: 'Start Pro Plan',
    highlights: [
      '4x higher usage limits in Taksha AI',
      '5,000,000 tokens per month cap',
      '2.0 vCPU + 2 GB RAM dedicated container',
      'Coding Agent + Copilot + App Agent',
      'Priority Email & Discord support'
    ]
  },
  {
    id: 'max',
    label: 'Taksha AI Max',
    priceINR: 999,
    badge: 'FLAGSHIP TIER',
    icon: Crown,
    bannerImg: '/images/max_plan_banner.png',
    accentColor: '#F5A83C',
    glowColor: 'rgba(245, 168, 60, 0.28)',
    shadowColor: 'rgba(245, 168, 60, 0.35)',
    description: 'Uncapped tokens, flagship LLMs, and priority worker execution queue.',
    ctaText: 'Upgrade to Max',
    highlights: [
      'Up to 20x higher usage limits than Pro',
      'Truly Unlimited Tokens with zero throttling',
      '4.0 vCPU + 4 GB RAM container allocation',
      'All Agents + Flagship LLM models',
      'Dedicated 24/7 technical manager'
    ]
  }
];

const FAQ = [
  { q: 'How do the 4 agent layers coordinate?', a: 'They run as isolated nodes in a LangGraph state machine. Planner -> Builder -> Executor -> Self-Healer. Each passes structured output to the next. The orchestrator graph handles retries and state persistence between steps.' },
  { q: 'Are sandboxes secure and isolated?', a: 'Yes. Every workspace runs in a private Kubernetes Namespace with hard CPU/RAM resource ceilings, NVMe persistent volumes, and zero cross-container network access. Each session gets a freshly provisioned pod.' },
  { q: 'Can I export my generated code?', a: 'Absolutely — download as ZIP, push to GitHub with one click, or generate a Dockerfile for local self-hosting from the Workspace Exporter panel inside the IDE.' },
  { q: 'What languages and frameworks work?', a: 'React, Vite, Next.js, Express, and plain HTML/CSS/JS out of the box. The container includes Node.js and Python, so you can install any npm or pip package and run custom build scripts.' },
  { q: 'Can it build full-stack apps?', a: 'Yes. The Builder agent can scaffold both React frontends and FastAPI/Express backends. Both run in the same pod with inter-service communication over localhost.' },
];

const PROMPTS = [
  'Build a React todo list with Redux state',
  'Build a REST API with JWT authentication',
  'Build a Markdown notes app with local storage',
  'Build a real-time chat with WebSocket',
  'Build a dashboard with live Recharts graphs',
];

function buildLines(prompt) {
  return [
    { cls: 'log-muted',    text: `> "${prompt}"` },
    { cls: 'log-planner',  text: '[PLANNER] Decomposing into task graph...' },
    { cls: 'log-planner',  text: '[PLANNER] File topology mapped -> /src/App.jsx, /src/store/' },
    { cls: 'log-builder',  text: '[BUILDER] Scaffolding /src/App.jsx...' },
    { cls: 'log-builder',  text: '[BUILDER] Writing Redux slice — 1,024 lines synced' },
    { cls: 'log-executor', text: '[EXECUTOR] Booting K8s sandbox pod...' },
    { cls: 'log-executor', text: '[EXECUTOR] > vite v8.0.16 dev server — port 5173' },
    { cls: 'log-healer',   text: '[HEALER] ReferenceError detected — line 18' },
    { cls: 'log-healer',   text: '[HEALER] Generating surgical patch...' },
    { cls: 'log-success',  text: 'Workspace live & auto-healed in 28.4s' },
  ];
}

export default function LandingPage({ onNavigateToLogin }) {
  const landingRef     = useRef(null);
  const headerRef      = useRef(null);
  const heroInnerRef   = useRef(null);
  const consoleBodyRef = useRef(null);
  const ivRef          = useRef(null);

  const [showLoader, setShowLoader] = useState(() => {
    try {
      return sessionStorage.getItem('taksha_session_loader_v1') !== 'true';
    } catch (e) {
      return true;
    }
  });
  const [isScrolled,     setIsScrolled]     = useState(false);
  const [isScrolling,    setIsScrolling]    = useState(false);
  const [isHovered,      setIsHovered]      = useState(false);
  const [activeAgent,    setActiveAgent]    = useState('planner');
  const [openFaq,        setOpenFaq]        = useState(null);
  const [showChevron,    setShowChevron]    = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isYearly,       setIsYearly]       = useState(false);

  // Showcase FLIP card swap state
  const [slots, setSlots]       = useState({ left: 0, center: 1, right: 2 });
  const [swapping, setSwapping] = useState(false);
  const leftPanelRef            = useRef(null);
  const centerPanelRef          = useRef(null);
  const rightPanelRef           = useRef(null);
  const isSwapping              = useRef(false);

  const handlePanelClick = useCallback((clickedSide) => {
    if (isSwapping.current) return;
    isSwapping.current = true;
    setSwapping(true);

    const sideEl   = clickedSide === 'left' ? leftPanelRef.current : rightPanelRef.current;
    const centerEl = centerPanelRef.current;
    if (!sideEl || !centerEl) { isSwapping.current = false; setSwapping(false); return; }

    const sR = sideEl.getBoundingClientRect();
    const cR = centerEl.getBoundingClientRect();

    const spawnActor = (source, rect) => {
      const actor = source.cloneNode(true);
      Object.assign(actor.style, {
        position:      'fixed',
        top:           `${rect.top}px`,
        left:          `${rect.left}px`,
        width:         `${rect.width}px`,
        height:        `${rect.height}px`,
        margin:        '0',
        padding:       '0',
        zIndex:        '9999',
        pointerEvents: 'none',
        overflow:      'hidden',
        boxSizing:     'border-box',
        willChange:    'transform, left, top, width, height, opacity',
      });
      actor.querySelectorAll('img').forEach(img => {
        img.style.width          = '100%';
        img.style.height         = '100%';
        img.style.maxHeight      = 'none';
        img.style.objectFit      = 'cover';
        img.style.objectPosition = 'top';
        img.style.display        = 'block';
      });
      actor.querySelectorAll('.lp__showcase-frame-body').forEach(el => {
        el.style.flex      = '1 1 0';
        el.style.minHeight = '0';
        el.style.overflow  = 'hidden';
      });
      document.body.appendChild(actor);
      return actor;
    };

    const sideActor   = spawnActor(sideEl,  sR);
    const centerActor = spawnActor(centerEl, cR);

    gsap.set([sideEl, centerEl], { opacity: 0 });

    const tiltY = clickedSide === 'left' ? 18 : -18;
    gsap.set(sideActor, {
      rotateY:              tiltY,
      rotateX:              4,
      transformPerspective: 900,
    });

    const DUR  = 0.72;
    const EASE = 'power4.inOut';

    const tl = gsap.timeline({
      onComplete: () => {
        setSlots(prev => ({
          left:   clickedSide === 'left'  ? prev.center : prev.left,
          center: clickedSide === 'left'  ? prev.left   : prev.right,
          right:  clickedSide === 'right' ? prev.center : prev.right,
        }));
        requestAnimationFrame(() => {
          gsap.set([sideEl, centerEl], { clearProps: 'opacity' });
          sideActor.remove();
          centerActor.remove();
          isSwapping.current = false;
          setSwapping(false);
        });
      },
    });

    tl.to(sideActor, {
      left:                 cR.left,
      top:                  cR.top,
      width:                cR.width,
      height:               cR.height,
      rotateY:              0,
      rotateX:              0,
      transformPerspective: 1400,
      duration:             DUR,
      ease:                 EASE,
    }, 0);

    tl.to(centerActor, {
      left:                 sR.left,
      top:                  sR.top,
      width:                sR.width,
      height:               sR.height,
      rotateY:              tiltY,
      rotateX:              4,
      transformPerspective: 900,
      duration:             DUR,
      ease:                 EASE,
    }, 0);

    tl.to(sideActor, {
      boxShadow: '0 -8px 60px rgba(234, 88, 12, 0.08), 0 40px 120px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
      duration:  DUR,
      ease:      EASE,
    }, 0);

    tl.to(centerActor, {
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.07)',
      duration:  DUR,
      ease:      EASE,
    }, 0);

    tl.to(centerActor, {
      opacity:  0.65,
      duration: DUR * 0.55,
      ease:     'power2.in',
    }, DUR * 0.15);
  }, []);

  const [promptText, setPromptText] = useState(PROMPTS[0]);
  const [demoLogs,   setDemoLogs]   = useState([]);
  const [demoState,  setDemoState]  = useState('idle');

  useEffect(() => { document.title = 'Taksha CodeSpace Studio — Agentic Cloud IDE'; }, []);

  useEffect(() => {
    const el = landingRef.current;
    if (!el) return;
    let t;
    const h = () => {
      const s = el.scrollTop;
      setIsScrolled(s > 80);
      setShowChevron(s < 80);
      setIsScrolling(true);
      clearTimeout(t);
      t = setTimeout(() => setIsScrolling(false), 150);
    };
    el.addEventListener('scroll', h, { passive: true });
    return () => { el.removeEventListener('scroll', h); clearTimeout(t); };
  }, []);

  const expanded = !isScrolled || (isHovered && !isScrolling);

  const hasRevealedRef = useRef(false);

  const revealLandingContent = useCallback(() => {
    if (hasRevealedRef.current) return;
    hasRevealedRef.current = true;

    if (headerRef.current) {
      gsap.to(headerRef.current, {
        y: 0,
        opacity: 1,
        duration: 0.75,
        ease: 'power3.out',
        overwrite: 'auto',
      });
    }
    if (heroInnerRef.current) {
      gsap.to(heroInnerRef.current, {
        y: 0,
        opacity: 1,
        duration: 0.95,
        ease: 'power3.out',
        delay: 0.08,
        overwrite: 'auto',
      });
    }
  }, []);

  // Pre-hide header and hero on initial mount if loader is active to prevent flash of content
  useEffect(() => {
    if (showLoader) {
      if (headerRef.current) gsap.set(headerRef.current, { y: -40, opacity: 0 });
      if (heroInnerRef.current) gsap.set(heroInnerRef.current, { y: 32, opacity: 0 });
    } else {
      revealLandingContent();
    }
  }, [showLoader, revealLandingContent]);

  const handleScrollTo = useCallback((e, id) => {
    if (e?.preventDefault) e.preventDefault();
    const el = document.getElementById(id);
    if (landingRef.current && el) landingRef.current.scrollTo({ top: el.offsetTop - 80, behavior: 'smooth' });
    setMobileMenuOpen(false);
  }, []);

  useEffect(() => {
    if (demoLogs.length > 0 && consoleBodyRef.current)
      consoleBodyRef.current.scrollTop = consoleBodyRef.current.scrollHeight;
  }, [demoLogs]);

  const runDemo = useCallback(() => {
    if (demoState === 'running' || !promptText.trim()) return;
    clearInterval(ivRef.current);
    setDemoLogs([]); setDemoState('running');
    const lines = buildLines(promptText);
    let i = 0;
    ivRef.current = setInterval(() => {
      if (i < lines.length) {
        const nextLine = lines[i];
        setDemoLogs(p => [...p, nextLine]);
        i++;
      } else {
        clearInterval(ivRef.current);
        setDemoState('done');
      }
    }, 360);
  }, [demoState, promptText]);

  const resetDemo = useCallback(() => { clearInterval(ivRef.current); setDemoLogs([]); setDemoState('idle'); }, []);
  useEffect(() => () => clearInterval(ivRef.current), []);

  const handleCtaClick = useCallback((e) => {
    if (e?.preventDefault) e.preventDefault();
    if (onNavigateToLogin) {
      onNavigateToLogin();
    }
  }, [onNavigateToLogin]);

  const agent = AGENTS.find(a => a.id === activeAgent);

  return (
    <div ref={landingRef} className="lp">
      {showLoader && (
        <EntryLoader 
          onExitStart={revealLandingContent}
          onComplete={() => {
            try {
              sessionStorage.setItem('taksha_session_loader_v1', 'true');
              sessionStorage.setItem('taksha_intro_seen', 'true');
            } catch (_) {}
            setShowLoader(false);
          }} 
        />
      )}
      
      {/* Giant Slow Orbs + Small Glowing Twinkling Stars + Shooting Star Meteor Engine */}
      <AmbientOrbs />

      {/* NAV */}
      <div className="lp__nav-wrap">
        <header
          ref={headerRef}
          className={`lp__header ${expanded ? 'lp__header--expanded' : 'lp__header--collapsed'}`}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Collapsed pill */}
          <div
            className="lp__pill-collapsed"
            onClick={() => setMobileMenuOpen(true)}
          >
            <span className="pulse-dot" />
            <span>Taksha Codespace</span>
          </div>

          {/* Expanded pill */}
          <div className="lp__pill-expanded">
            <div className="lp__brand"><BrandLogo height={22} variant="dark" /></div>
            <nav className="lp__nav-links">
              <a href="#demo"     onClick={e => handleScrollTo(e, 'demo')}>Demo</a>
              <a href="#pipeline" onClick={e => handleScrollTo(e, 'pipeline')}>Architecture</a>
              <a href="#features" onClick={e => handleScrollTo(e, 'features')}>Features</a>
              <a href="#pricing"  onClick={e => handleScrollTo(e, 'pricing')}>Pricing</a>
            </nav>
            <div className="lp__nav-cta">
              <button onClick={handleCtaClick} className="btn btn--ghost btn--sm">
                Sign in
              </button>
              <button onClick={handleCtaClick} className="btn btn--primary btn--sm">
                Get started <ChevronRight size={11} />
              </button>
              <button
                className="lp__hamburger"
                onClick={(e) => {
                  e.stopPropagation();
                  setMobileMenuOpen(true);
                }}
                aria-label="Open navigation menu"
              >
                <Menu size={16} />
              </button>
            </div>
          </div>
        </header>
      </div>

      {/* MOBILE FULL-SCREEN MENU */}
      <div className={`lp__mobile-menu${mobileMenuOpen ? ' lp__mobile-menu--open' : ''}`} role="dialog" aria-modal="true" aria-label="Navigation menu">
        <button className="lp__mobile-menu-close" onClick={() => setMobileMenuOpen(false)} aria-label="Close navigation menu">
          <X size={18} />
        </button>
        <a href="#demo"     onClick={e => handleScrollTo(e, 'demo')}>Demo</a>
        <a href="#pipeline" onClick={e => handleScrollTo(e, 'pipeline')}>Architecture</a>
        <a href="#features" onClick={e => handleScrollTo(e, 'features')}>Features</a>
        <a href="#pricing"  onClick={e => handleScrollTo(e, 'pricing')}>Pricing</a>
        <button onClick={handleCtaClick} className="btn btn--primary btn--md" style={{ marginTop: '16px', width: '80%', justifyContent: 'center' }}>
          Open Workspace <ArrowRight size={14} />
        </button>
      </div>

      {/* HERO */}
      <section className="lp__hero">
        <div ref={heroInnerRef} className="lp__hero-inner">

          {/* Headline + Sub + CTAs */}
          <div className="lp__hero-text">
            <div className="lp__badge"><Sparkles size={10} /><span>AI Agentic Cloud IDE · Powered by Mistral Devstral</span></div>
            <h1 className="lp__hero-h1">Describe your app.<br /><span className="grad">Taksha builds, tests &amp; heals it.</span></h1>
            <p className="lp__hero-sub">
              A cloud-based, sandboxed, agentic coding IDE — one prompt plans, codes, tests, debugs, and deploys a complete React application.
            </p>
            <div className="lp__hero-actions">
              <button onClick={handleCtaClick} className="btn btn--primary btn--lg">
                Get Started Free <ArrowRight size={14} />
              </button>
              <a href="#demo" onClick={e => handleScrollTo(e, 'demo')} className="btn btn--ghost btn--lg">Try Live Demo</a>
            </div>
          </div>

          {/* Showcase browser mockup frame with 3D tilt FLIP animations */}
          <div className={`lp__showcase ${swapping ? 'lp__showcase--swapping' : ''}`}>

            {/* Left floating panel */}
            {(() => {
              const item = SHOWCASE_ITEMS[slots.left];
              const TagIcon = item.TagIcon;
              return (
                <div
                  className="lp__showcase-side lp__showcase-side--left"
                  onClick={() => handlePanelClick('left')}
                  role="button" tabIndex={0} aria-label={`Expand ${item.tag} view`}
                  onKeyDown={e => e.key === 'Enter' && handlePanelClick('left')}
                >
                  <div ref={leftPanelRef} className="lp__showcase-frame lp__showcase-frame--side lp__showcase-frame--clickable">
                    <div className="lp__showcase-frame-header">
                      <div className="lp__showcase-frame-dots">
                        <span className="dot dot--red" />
                        <span className="dot dot--yellow" />
                        <span className="dot dot--green" />
                      </div>
                      <span className="lp__showcase-frame-address">{item.sideLabel}</span>
                    </div>
                    <div className="lp__showcase-frame-body">
                      <img
                        src={item.src}
                        alt={`Taksha CodeSpace ${item.sideLabel}`}
                        onError={(e) => { e.currentTarget.src = item.fallbackSrc; }}
                      />
                      <div className="lp__showcase-frame-fade" />
                    </div>
                  </div>
                  <div className="lp__showcase-tag lp__showcase-tag--left">
                    {TagIcon && <TagIcon size={10} />} {item.tag}
                  </div>
                </div>
              );
            })()}

            {/* Center — main browser mockup */}
            <div className="lp__showcase-center">
              <div ref={centerPanelRef} className="lp__showcase-frame lp__showcase-frame--center">
                <div className="lp__showcase-frame-header">
                  <div className="lp__showcase-frame-dots">
                    <span className="dot dot--red" />
                    <span className="dot dot--yellow" />
                    <span className="dot dot--green" />
                  </div>
                  <span className="lp__showcase-frame-address">codespace.taksha.dev</span>
                </div>
                <div className="lp__showcase-frame-body">
                  <img
                    src={SHOWCASE_ITEMS[slots.center].src}
                    alt="Taksha CodeSpace main dashboard"
                    onError={(e) => { e.currentTarget.src = SHOWCASE_ITEMS[slots.center].fallbackSrc; }}
                  />
                </div>
              </div>
              <div className="lp__showcase-glow" />
            </div>

            {/* Right floating panel */}
            {(() => {
              const item = SHOWCASE_ITEMS[slots.right];
              const TagIcon = item.TagIcon;
              return (
                <div
                  className="lp__showcase-side lp__showcase-side--right"
                  onClick={() => handlePanelClick('right')}
                  role="button" tabIndex={0} aria-label={`Expand ${item.tag} view`}
                  onKeyDown={e => e.key === 'Enter' && handlePanelClick('right')}
                >
                  <div ref={rightPanelRef} className="lp__showcase-frame lp__showcase-frame--side lp__showcase-frame--clickable">
                    <div className="lp__showcase-frame-header">
                      <div className="lp__showcase-frame-dots">
                        <span className="dot dot--red" />
                        <span className="dot dot--yellow" />
                        <span className="dot dot--green" />
                      </div>
                      <span className="lp__showcase-frame-address">{item.sideLabel}</span>
                    </div>
                    <div className="lp__showcase-frame-body">
                      <img
                        src={item.src}
                        alt={`Taksha CodeSpace ${item.sideLabel}`}
                        onError={(e) => { e.currentTarget.src = item.fallbackSrc; }}
                      />
                      <div className="lp__showcase-frame-fade" />
                    </div>
                  </div>
                  <div className="lp__showcase-tag lp__showcase-tag--right">
                    {TagIcon && <TagIcon size={10} />} {item.tag}
                  </div>
                </div>
              );
            })()}

          </div>

          {/* Stats bar */}
          <div className="lp__stats">
            {STATS.map((s, i) => (
              <div key={i} className="lp__stat">
                <span className="lp__stat-val">{s.value}</span>
                <span className="lp__stat-label">{s.label}</span>
              </div>
            ))}
          </div>

        </div>
        <div className={`lp__scroll-cue${showChevron ? ' lp__scroll-cue--on' : ''}`} onClick={e => handleScrollTo(e, 'demo')} style={{ cursor: 'pointer' }}>
          <ChevronDown size={17} />
        </div>
        <div className="lp__hero-fade" />
      </section>

      {/* HOW IT WORKS */}
      <section className="lp__section lp__how">
        <div className="lp__container">
          <Reveal>
            <div className="lp__sect-head lp__sect-head--center">
              <div className="lp__label">How it works</div>
              <h2 className="lp__sect-title">From idea to live app in seconds</h2>
              <p className="lp__sect-sub">The full pipeline is autonomous — you only write the prompt.</p>
            </div>
          </Reveal>
          <div className="how-steps">
            {[
              { icon: MessageSquare, n: '01', title: 'Describe',          color: '#FFB347', desc: 'Type a plain-English prompt. Scaffold a React component, a full-stack API, a state machine — anything.' },
              { icon: Cpu,           n: '02', title: 'Orchestrate & Heal', color: '#4F46E5', desc: 'The 4-agent chain plans, writes, executes and automatically patches every compiler error in a K8s sandbox.' },
              { icon: Rocket,        n: '03', title: 'Preview & Export',   color: '#D97B0C', desc: 'Preview live in a browser iframe, shell into the terminal, or export as ZIP / push to GitHub.' },
            ].map((s, i) => { const Icon = s.icon; return (
              <Reveal key={i} delay={i * 80}>
                <div className="how-card" style={{ '--c': s.color }}>
                  <div className="how-card__num">STEP {s.n}</div>
                  <div className="how-card__icon"><Icon size={22} /></div>
                  <h3 className="how-card__title">{s.title}</h3>
                  <p className="how-card__desc">{s.desc}</p>
                </div>
              </Reveal>
            ); })}
          </div>
        </div>
      </section>

      {/* DEMO */}
      <section id="demo" className="lp__section lp__demo">
        <div className="lp__container">
          <Reveal>
            <div className="lp__sect-head">
              <div className="lp__label"><MousePointerClick size={10} /> Interactive Demo</div>
              <h2 className="lp__sect-title">Type what you want. Watch it build.</h2>
              <p className="lp__sect-sub">Pick a template or write your own prompt and run the 4-agent pipeline live.</p>
            </div>
          </Reveal>
          <Reveal delay={60}>
            <div className={`demo-shell${demoState === 'running' ? ' demo-shell--running' : ''}`}>
              <div className="demo-left">
                <div className="demo-left__top"><span className="demo-left__label">Your prompt</span></div>
                <textarea className="demo-textarea" value={promptText} onChange={e => setPromptText(e.target.value)} rows={4} placeholder="Describe what you want to build..." spellCheck={false} />
                <div className="demo-chips">
                  {PROMPTS.map((p, i) => (
                    <button key={i} className={`demo-chip${promptText === p ? ' demo-chip--active' : ''}`} onClick={() => { setPromptText(p); resetDemo(); }}>
                      {p.replace('Build a ', '')}
                    </button>
                  ))}
                </div>
                <div className="demo-actions">
                  <button className="btn btn--primary btn--sm" onClick={runDemo} disabled={demoState === 'running'}>
                    {demoState === 'running' ? <><RotateCw size={11} className="spin" /> Running...</> : <><Play size={11} /> Run pipeline</>}
                  </button>
                  {demoState !== 'idle' && <button className="btn btn--ghost btn--sm" onClick={resetDemo}><X size={11} /> Reset</button>}
                </div>
              </div>
              <div className="demo-right">
                <div className="demo-right__bar">
                  <div className="demo-dots"><span /><span /><span /></div>
                  <span className="demo-path"><TerminalSquare size={10} color="#EA580C" /> langgraph://orchestrator.trace</span>
                  <span className="demo-status">
                    {demoState === 'running' && <span className="demo-streaming">STREAMING</span>}
                    {demoState === 'done'    && <span className="demo-done">DONE</span>}
                    {demoState === 'idle'    && <span className="demo-idle">READY</span>}
                  </span>
                </div>
                <div ref={consoleBodyRef} className="demo-right__body">
                  {demoLogs.length === 0 && demoState === 'idle' && (
                    <div className="demo-empty"><Play size={20} strokeWidth={1.5} /><span>Run the pipeline to see the agent trace</span></div>
                  )}
                  {demoLogs.map((l, i) => l && (
                    <div key={i} className={`demo-line ${l.cls || ''}`}>
                      <span className="demo-ln">{String(i + 1).padStart(2, '0')}</span>
                      <span>{l.text || ''}</span>
                    </div>
                  ))}
                  {demoState === 'done' && (
                    <div className="demo-success-bar">
                      <CheckCircle size={13} /> App compiled · sandbox live · <a href="#login" onClick={handleCtaClick} style={{ color: 'inherit', textDecoration: 'underline', fontWeight: 'bold' }}>Open workspace to start coding</a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* PIPELINE */}
      <section id="pipeline" className="lp__section lp__pipeline">
        <div className="lp__container">
          <Reveal>
            <div className="lp__sect-head">
              <div className="lp__label">Multi-Agent Architecture</div>
              <h2 className="lp__sect-title">4-layer LangGraph agent pipeline</h2>
              <p className="lp__sect-sub">Click a layer to inspect its live execution trace and auto-generated code diff.</p>
            </div>
          </Reveal>
          <div className="pipe-tabs">
            {AGENTS.map(a => { const Icon = a.icon; const active = activeAgent === a.id; return (
              <button key={a.id} className={`pipe-tab${active ? ' pipe-tab--active' : ''}`} style={{ '--c': a.color }} onClick={() => setActiveAgent(a.id)}>
                <span className="pipe-tab__step">{a.tag}</span>
                <Icon size={15} />
                <span className="pipe-tab__name">{a.name}</span>
              </button>
            ); })}
          </div>
          <div className="pipe-panel">
            <div className="pipe-info">
              <div className="pipe-info__tag" style={{ color: agent.color }}>{agent.tag} · {agent.name}</div>
              <h3 className="pipe-info__headline">{agent.headline}</h3>
              <p className="pipe-info__desc">{agent.desc}</p>
              <div className="pipe-info__chip">
                <span className="pipe-info__dot" style={{ background: agent.color }} />
                {agent.id === 'healer' ? 'Self-healing active' : 'Status: operational'}
              </div>
            </div>
            <div className="pipe-console">
              <div className="pipe-console__bar">
                <div className="pipe-dots"><span /><span /><span /></div>
                <span className="pipe-console__path"><TerminalSquare size={10} color={agent.color} /> agent://{agent.id}.log</span>
                <span className="pipe-console__live" style={{ color: agent.color }}>LIVE</span>
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
                        <div className="diff-line diff-line--del">24: - import {'{'} Sparkles {'}'} from 'lucide-react';</div>
                        <div className="diff-line">25: export default function T() {'{'}</div>
                        <div className="diff-line diff-line--err">26:   return &lt;Cpu /&gt; <span className="diff-comment">// ReferenceError</span></div>
                      </div>
                    </div>
                    <div className="diff-half">
                      <div className="diff-head diff-head--add">AFTER <span>1.8s</span></div>
                      <div className="diff-body">
                        <div className="diff-line">18: import React from 'react';</div>
                        <div className="diff-line diff-line--add">24: + import {'{'} Sparkles, Cpu {'}'} from 'lucide-react';</div>
                        <div className="diff-line">25: export default function T() {'{'}</div>
                        <div className="diff-line diff-line--ok">26:   return &lt;Cpu /&gt; <span className="diff-comment">// OK</span></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="lp__section lp__features">
        <div className="lp__container">
          <Reveal>
            <div className="lp__sect-head">
              <div className="lp__label">Feature Set</div>
              <h2 className="lp__sect-title">Everything inside one cloud IDE</h2>
              <p className="lp__sect-sub">Editor, terminal, sandbox, self-healer, and GitHub export — all in one place.</p>
            </div>
          </Reveal>
          <div className="feat-grid">
            {FEATURES.map((f, i) => { const Icon = f.icon; return (
              <Reveal key={i} delay={i * 60}>
                <div className="feat-card" style={{ '--a': f.accent }}>
                  {f.tag && <span className="feat-card__tag">{f.tag}</span>}
                  <div className="feat-card__icon"><Icon size={18} /></div>
                  <h3 className="feat-card__title">{f.title}</h3>
                  <p className="feat-card__desc">{f.desc}</p>
                </div>
              </Reveal>
            ); })}
          </div>
        </div>
      </section>

      {/* TECH STACK MARQUEE */}
      <section className="lp__stack">
        <div className="lp__stack-label">Powered by</div>
        <div className="marquee-vp">
          <div className="marquee-track">
            {[...TECH_STACK, ...TECH_STACK, ...TECH_STACK].map((t, i) => (
              <span key={i} className="marquee-item"><span className="marquee-dot" />{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING & PLANS */}
      <section id="pricing" className="lp__section lp__pricing">
        <div className="lp__container">
          <Reveal>
            <div className="lp__sect-head lp__sect-head--center">
              <div className="lp__label">Plans &amp; Pricing</div>
              <h2 className="lp__sect-title">Supercharge your code with Taksha AI</h2>
              <p className="lp__sect-sub">
                Access advanced AI coding agents, high-performance vCPU sandboxes, and dedicated token quotas.
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
                Annual Billing
                <span className="lp__billing-save">Save 20%</span>
              </button>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="pricing-grid-3d">
              {PRICING_PLANS.map((plan) => (
                <PricingCard3D
                  key={plan.id}
                  plan={plan}
                  isYearly={isYearly}
                  onSelectPlan={handleCtaClick}
                />
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section className="lp__section lp__faq">
        <div className="lp__container lp__container--narrow">
          <Reveal>
            <div className="lp__sect-head lp__sect-head--center">
              <div className="lp__label">FAQ</div>
              <h2 className="lp__sect-title">Common questions</h2>
            </div>
          </Reveal>
          <div className="faq-list">
            {FAQ.map((item, i) => { const open = openFaq === i; return (
              <Reveal key={i} delay={i * 35}>
                <div className={`faq-item${open ? ' faq-item--open' : ''}`}>
                  <button className="faq-item__q" onClick={() => setOpenFaq(open ? null : i)}>
                    <span className="faq-item__q-text"><span className="faq-q-badge">Q{i + 1}</span>{item.q}</span>
                    <ChevronDown size={14} className={`faq-chevron${open ? ' faq-chevron--open' : ''}`} />
                  </button>
                  <div className="faq-item__a"><div className="faq-item__a-inner">{item.a}</div></div>
                </div>
              </Reveal>
            ); })}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lp__footer">
        <div className="lp__footer-inner">
          <div className="lp__footer-brand">
            <BrandLogo height={18} variant="dark" />
            <span className="lp__footer-copy">© {new Date().getFullYear()} Taksha CodeSpace Studio</span>
          </div>
          <div className="lp__footer-status">
            <span className="pulse-dot" />
            <span>All systems operational</span>
          </div>
          <div className="lp__footer-links">
            <a href="https://www.linkedin.com/in/sahil-sharma-1a024b330/" target="_blank" rel="noreferrer" aria-label="LinkedIn"><LinkedinIcon size={14} /></a>
            <a href="https://github.com/Sahil-coder-30" target="_blank" rel="noreferrer" aria-label="GitHub"><GithubIcon size={14} /></a>
            <span className="lp__footer-by">Built by Sahil Sharma</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
