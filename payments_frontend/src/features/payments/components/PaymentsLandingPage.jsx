import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  Sparkles, Globe, ArrowRight, ShieldCheck, Cpu, Zap,
  ChevronDown, Layers, Network, Activity, Lock, Check, ArrowUpRight
} from 'lucide-react';
import { usePayments } from '../Hooks/payments.hooks';
import PlanCard from './PlanCard';
import FeatureComparisonTable from './FeatureComparisonTable';
import CardSwap, { Card } from '../../../components/reactbits/CardSwap';
import GradientText from '../../../components/reactbits/GradientText';
import ShinyText from '../../../components/reactbits/ShinyText';
import MagicBento from '../../../components/reactbits/MagicBento';
import CursorGrid from '../../../components/reactbits/CursorGrid';
import {
  revealBatch, priceCounter, horizontalScrollStrip, toggleAccordion
} from '../../../utils/animations';

import freePlanBanner from '../../../assets/images/free_plan_banner.png';
import proPlanBanner from '../../../assets/images/pro_plan_banner.png';
import maxPlanBanner from '../../../assets/images/max_plan_banner.png';
import cardSandboxImg from '../../../assets/images/card_sandbox.png';
import cardMultiAgentImg from '../../../assets/images/card_multi_agent.png';
import cardTokenMeteringImg from '../../../assets/images/card_token_metering.png';
import cardHmacSecurityImg from '../../../assets/images/card_hmac_security.png';

gsap.registerPlugin(ScrollTrigger);

// ── Feature Spotlight Data (CardSwap Showcase) ────────────────────────────────
const SPOTLIGHT_ITEMS = [
  {
    id: 0,
    title: 'Isolated vCPU AI Sandbox',
    tagline: 'Dedicated Compute Containers',
    color: '#FFB347',
    icon: <Cpu size={20} />,
    desc: 'Each session runs inside an isolated container with dedicated vCPU and RAM, protecting your workspace state and guaranteeing lightning-fast code synthesis.',
    image: cardSandboxImg,
    badge: 'Hardware Isolated'
  },
  {
    id: 1,
    title: 'Multi-Agent Model Orchestration',
    tagline: 'Gemini, Claude, GPT & Cohere',
    color: '#4F46E5',
    icon: <Network size={20} />,
    desc: 'Intelligent routing automatically directs complex refactoring, reasoning, or quick inline autocompletion to the optimal AI model tier without latency bottlenecks.',
    image: cardMultiAgentImg,
    badge: 'Multi-Model Core'
  },
  {
    id: 2,
    title: 'Real-Time Token Telemetry',
    tagline: 'Live Usage & Quota Gauges',
    color: '#00DFD8',
    icon: <Activity size={20} />,
    desc: 'Monitor token consumption live per provider with sub-millisecond precision, visual quota breakdown, and automated soft-cap warnings.',
    image: cardTokenMeteringImg,
    badge: 'Live Telemetry'
  },
  {
    id: 3,
    title: 'HMAC SHA-256 Security',
    tagline: 'Cryptographic Verification',
    color: '#4F46E5',
    icon: <ShieldCheck size={20} />,
    desc: 'All billing events and subscription status upgrades are cryptographically signed with SHA-256 HMAC tokens, keeping auth and payment microservices decoupled.',
    image: cardHmacSecurityImg,
    badge: 'Zero Trust Ledger'
  }
];

// ── Platform Capabilities Data ────────────────────────────────────────────────
const PLATFORM_CAPABILITIES = [
  {
    id: 'sandbox',
    title: 'Isolated vCPU AI Sandbox',
    shortTitle: 'Isolated Sandbox',
    tagline: 'Dedicated Hardware Isolation',
    icon: <Cpu size={20} />,
    color: '#FFB347',
    metric: '0.18ms',
    metricLabel: 'Spin-Up Latency',
    badge: 'Hardware Isolated',
    desc: 'Each session runs inside a secure, dedicated hardware container with isolated vCPU and RAM, protecting workspace state and guaranteeing lightning-fast code synthesis.',
    specs: [
      'Isolated Docker / gVisor Container Environment',
      'Up to 4.0 vCPU + 4 GB RAM allocation per container',
      'Encrypted persistent SSD workspace storage'
    ],
    codeSnippet: `// Active Sandbox Session #8492
const sandbox = await Taksha.createContainer({
  isolation: 'hardware_gvisor',
  resources: { vcpu: 4.0, ram: '4GB' },
  security: 'ephemeral_vault'
});
// Container Status: RUNNING (0.18ms init)`
  },
  {
    id: 'multi_agent',
    title: 'Multi-Agent Model Orchestration',
    shortTitle: 'Multi-Agent Core',
    tagline: 'Parallel Model Dispatch',
    icon: <Network size={20} />,
    color: '#4F46E5',
    metric: '4 LLMs',
    metricLabel: 'Auto-Routed Models',
    badge: 'Multi-Model Core',
    desc: 'Intelligent routing automatically directs complex refactoring, multi-file reasoning, or quick inline autocompletion to the optimal AI model tier without latency bottlenecks.',
    specs: ['Google Gemini, Claude, GPT & Cohere integration', 'Real-time cost & latency-aware query routing', 'Automated model fallback and failover execution'],
    codeSnippet: `// Multi-Agent Router Dispatcher
const response = await Router.dispatch({
  task: 'refactor_ast_and_verify',
  agents: ['copilot_fast', 'reasoner_pro'],
  fallbackTier: 'max_regular'
});`
  },
  {
    id: 'token_meter',
    title: 'Real-Time Token Telemetry',
    shortTitle: 'Token Telemetry',
    tagline: 'Live Usage & Quotas',
    icon: <Activity size={20} />,
    color: '#00DFD8',
    metric: '99.99%',
    metricLabel: 'Telemetry Precision',
    badge: 'Live Telemetry',
    desc: 'Monitor token consumption live per provider with sub-millisecond precision, visual quota breakdown, and automated soft-cap warnings directly tied to payment ledgers.',
    specs: ['Sub-millisecond token consumption tracking', 'Provider-by-provider quota breakdown & alerts', 'Zero-latency WebSocket billing telemetry'],
    codeSnippet: `// Telemetry WebSocket Stream
Telemetry.on('token_consumed', (event) => {
  updateGauge({ provider: event.provider, count: event.delta });
  // Live Quota: 4,820,100 / 5,000,000 tokens
});`
  },
  {
    id: 'hmac_security',
    title: 'HMAC SHA-256 Secured Billing',
    shortTitle: 'HMAC Security',
    tagline: 'Cryptographic Verification',
    icon: <ShieldCheck size={20} />,
    color: '#4F46E5',
    metric: 'SHA-256',
    metricLabel: 'Signature Encryption',
    badge: 'Zero Trust Ledger',
    desc: 'Every payment event, credit top-up, and subscription status upgrade is cryptographically signed with SHA-256 HMAC tokens, keeping auth and payment services decoupled.',
    specs: ['SHA-256 HMAC signature verification', 'Idempotent webhook transaction locking', 'Decoupled payment microservice database'],
    codeSnippet: `// Webhook Signature Verification
const isAuthorized = Crypto.verifyHMAC({
  payload: req.rawBody,
  signature: req.headers['x-razorpay-signature'],
  secret: process.env.HMAC_SECRET
});`
  },
  {
    id: 'context_window',
    title: 'Context Window Expansion',
    shortTitle: '128K Context',
    tagline: 'Deep Codebase Analysis',
    icon: <Layers size={20} />,
    color: '#FF7D00',
    metric: '128,000',
    metricLabel: 'Max Token Window',
    badge: 'Deep Memory',
    desc: 'Ingest and analyze massive multi-file repositories, AST dependency graphs, and full-stack project structures seamlessly within a single AI session context.',
    specs: ['Up to 128K token window on flagship models', 'AST tree compaction for fast prompt caching', 'Semantic vector indexing across workspace files'],
    codeSnippet: `// Repository AST Context Builder
const context = await Workspace.buildContext({
  maxTokens: 128000,
  includeAST: true,
  depth: 'entire_workspace'
});`
  },
  {
    id: 'auth_isolation',
    title: 'Auth-Isolated Ledger Architecture',
    shortTitle: 'Auth Isolation',
    tagline: 'Decoupled Architecture',
    icon: <Lock size={20} />,
    color: '#FFB347',
    metric: '100%',
    metricLabel: 'DB Decoupling',
    badge: 'Decoupled Ledger',
    desc: 'The Payments microservice operates with its own isolated database schema. User authentication token verification happens independently, preserving security and privacy.',
    specs: ['Dedicated Postgres billing & credit ledger', 'Asymmetric JWT public-key verification', 'Zero shared DB state between Auth & Payments'],
    codeSnippet: `// Microservice Bound Verification
const authUser = await AuthToken.verify(bearerToken);
const creditBalance = await PaymentsLedger.getBalance(authUser.id);
// Auth service has ZERO access to raw credit DB`
  }
];

// ── Plan Data ─────────────────────────────────────────────────────────────────
const PLANS = [
  {
    id: 'free', label: 'Taksha AI Free', tier: 'free', priceINR: 0,
    badge: 'Get Started',
    bannerImg: freePlanBanner,
    description: 'Essential sandbox and AI model credits for developers getting started.',
    highlights: [
      '20 AI credits per 5-hr window',
      '50,000 daily token limit',
      '0.5 vCPU + 512 MB RAM container',
      'Coding Agent + Copilot',
      'Community Forum support',
    ],
  },
  {
    id: 'pro_regular', label: 'Taksha AI Pro', tier: 'pro', pricingModel: 'regular', priceINR: 499,
    badge: 'Most Popular', popular: true,
    bannerImg: proPlanBanner,
    description: 'Full AI power with high-performance isolated sandbox containers.',
    highlights: [
      '150 AI credits per 5-hr window',
      '5,000,000 tokens per month cap',
      '2.0 vCPU + 2 GB RAM dedicated container',
      'Coding Agent + Copilot + App Agent',
      'Priority Email & Discord support',
    ],
  },
  {
    id: 'max_regular', label: 'Taksha AI Max', tier: 'max', pricingModel: 'regular', priceINR: 999,
    badge: 'Flagship Tier',
    bannerImg: maxPlanBanner,
    description: 'Uncapped tokens, flagship LLMs, and priority worker execution queue.',
    highlights: [
      '200 AI credits per 5-hr window',
      'Truly Unlimited Tokens — zero throttling',
      '4.0 vCPU + 4 GB RAM container allocation',
      'All Agents + Flagship LLM models',
      'Dedicated 24/7 technical manager',
    ],

  },
];

const FAQS = [
  {
    q: 'Can I change my plan or cancel anytime?',
    a: 'Yes! Upgrades take effect instantly. You can upgrade, downgrade, or cancel at any time from your subscription dashboard.',
  },
  {
    q: 'What happens when I run out of daily tokens on the Free tier?',
    a: 'Your daily token cap resets automatically every 24 hours. Upgrading to Pro or Max gives you monthly or truly unlimited token quotas.',
  },
  {
    q: 'Are sandbox containers dedicated and secure?',
    a: 'Pro and Max plans feature isolated, dedicated vCPU and RAM containers with high-speed persistent SSD workspace storage.',
  },
  {
    q: 'Where is my subscription status stored?',
    a: 'Subscription tier and token balances are stored exclusively inside the Payments Microservice database. The Auth service only handles token verification.',
  },
  {
    q: 'Do you offer refunds?',
    a: 'We offer a 7-day money-back guarantee on your first subscription payment. Contact support within 7 days of purchase for a full refund.',
  },
  {
    q: 'What AI providers are included?',
    a: 'All plans include Google Gemini, Mistral, OpenAI, and Cohere. Pro and Max unlock higher quotas and premium model access.',
  },
];


// ── Component ─────────────────────────────────────────────────────────────────
export default function PaymentsLandingPage({ user }) {
  const { credit, billingCycle, loadCredit, loadPackages, selectPlan, selectBillingCycle } = usePayments();
  const navigate = useNavigate();

  const pageRef      = useRef(null);
  const heroRef      = useRef(null);
  const cardsRef     = useRef(null);
  const priceRefs    = useRef([]);
  const faqRefs      = useRef([]);

  const [openFaq, setOpenFaq] = useState(null);
  const [activeSpotlight, setActiveSpotlight] = useState(0);
  const [activeCapTab, setActiveCapTab] = useState(0);
  const currentSubscription = credit?.subscription || 'free';

  useEffect(() => {
    loadCredit();
    loadPackages();
  }, [loadCredit, loadPackages]);

  // ── GSAP animations (auto-cleaned on unmount via useGSAP) ──────────────────
  useGSAP(() => {
    // Hero word reveal
    gsap.fromTo('#hero-badge',
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', delay: 0.1 }
    );
    gsap.fromTo('#hero-headline',
      { opacity: 0, y: 30 },
      { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', delay: 0.25 }
    );
    gsap.fromTo('#hero-subtext',
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', delay: 0.4 }
    );
    gsap.fromTo('#hero-controls',
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', delay: 0.55 }
    );

    // Ambient glow pulse on hero
    gsap.to('#hero-glow', {
      opacity: 0.4, scale: 1.15,
      duration: 3, ease: 'sine.inOut', yoyo: true, repeat: -1
    });

    // Plan cards stagger reveal
    const planCards = pageRef.current?.querySelectorAll('.plan-card-item');
    if (planCards && planCards.length > 0) {
      gsap.fromTo(planCards,
        { opacity: 0, y: 30, scale: 0.98 },
        {
          opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'power3.out', stagger: 0.1,
          scrollTrigger: { trigger: cardsRef.current || planCards[0], start: 'top 90%', toggleActions: 'play none none none' }
        }
      );
    }

    // Feature reveal rows in comparison table
    const featRows = pageRef.current?.querySelectorAll('.feat-row');
    if (featRows && featRows.length > 0) {
      ScrollTrigger.batch(featRows, {
        start: 'top 92%',
        onEnter: (batch) => {
          gsap.fromTo(batch,
            { opacity: 0, y: 14 },
            { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out', stagger: 0.04 }
          );
        },
      });
    }

    // Section reveals (each section gets smooth trigger)
    const sections = pageRef.current?.querySelectorAll('.section-reveal');
    if (sections && sections.length > 0) {
      sections.forEach((sec) => {
        gsap.fromTo(sec,
          { opacity: 0, y: 24 },
          {
            opacity: 1, y: 0, duration: 0.6, ease: 'power3.out',
            scrollTrigger: { trigger: sec, start: 'top 90%', toggleActions: 'play none none none' }
          }
        );
      });
    }

    // FAQ items (batch reveal on scroll)
    const faqItems = pageRef.current?.querySelectorAll('.faq-item');
    if (faqItems && faqItems.length > 0) {
      ScrollTrigger.batch(faqItems, {
        start: 'top 92%',
        onEnter: (batch) => {
          gsap.fromTo(batch,
            { opacity: 0, y: 16 },
            { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out', stagger: 0.05 }
          );
        },
      });
    }

    // Refresh triggers to ensure exact calculations after layout mount and image loading
    const timer1 = setTimeout(() => ScrollTrigger.refresh(), 150);
    const timer2 = setTimeout(() => ScrollTrigger.refresh(), 600);
    const timer3 = setTimeout(() => ScrollTrigger.refresh(), 1200);

    const handleLoad = () => ScrollTrigger.refresh();
    window.addEventListener('load', handleLoad);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      window.removeEventListener('load', handleLoad);
    };
  }, { scope: pageRef });

  // Price counters (separate, need DOM refs)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const timeout = setTimeout(() => {
      priceRefs.current.forEach((el, i) => {
        if (el) priceCounter(el, PLANS[i].priceINR);
      });
    }, 600);
    return () => clearTimeout(timeout);
  }, []);

  const handleCheckout = (planId) => {
    selectPlan(planId);
    navigate(`/checkout/${planId}`);
  };

  const toggleFaq = (i) => {
    const newOpen = openFaq === i ? null : i;
    setOpenFaq(newOpen);

    faqRefs.current.forEach((panel, idx) => {
      if (!panel) return;
      toggleAccordion(panel, idx === newOpen);
    });
  };

  return (
    <div ref={pageRef} style={{ minHeight: '100vh', background: 'var(--bg-canvas)', overflowX: 'hidden', position: 'relative' }}>
      {/* ── Full-Page Clean Container ── */}
      <div className="landing-glass-container">
        {/* Ambient Glow */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
          <div id="hero-glow" style={{
            position: 'absolute', top: '-20%', left: '50%', transform: 'translateX(-50%)',
            width: '80vw', height: '60vh',
            background: 'radial-gradient(ellipse, rgba(255, 179, 71,0.08) 0%, rgba(27,110,243,0.06) 40%, transparent 70%)',
            opacity: 0.25,
          }} />
        </div>

        {/* ── PROLOGUE: FULL 100VH HERO SECTION (100% SCREEN WIDTH) ────── */}
        <section
          ref={heroRef}
          style={{
            width: '100%',
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
            textAlign: 'center',
            paddingTop: '110px',
            paddingBottom: '36px',
            position: 'relative',
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}
        >
          {/* Background CursorGrid animation - 100% full width of screen */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              zIndex: 0,
              pointerEvents: 'none',
              overflow: 'hidden',
            }}
          >
            <CursorGrid
              cellSize={40}
              color="#FFB347"
              radius={140}
              falloff="smooth"
              holdTime={400}
              fadeDuration={450}
              lineWidth={1.2}
              maxOpacity={0.85}
              fillOpacity={0.06}
              gridOpacity={0.035}
              cellRadius={8}
              clickPulse
              pulseSpeed={1600}
            />
          </div>

          {/* Centered Main Inner Content Wrapper */}
          <div style={{ maxWidth: '1240px', width: '100%', margin: 'auto auto', padding: '0 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 1, boxSizing: 'border-box' }}>
              <div id="hero-badge" className="chapter-badge" style={{ display: 'inline-flex', marginBottom: 24 }}>
                <Sparkles size={14} />
                <ShinyText
                  text="PROLOGUE // TAKSHA AI PLATFORM"
                  color="#FFB347"
                  shineColor="#FFFFFF"
                  speed={2.5}
                  spread={120}
                />
              </div>

              <h1
                id="hero-headline"
                style={{
                  fontSize: 'clamp(2.6rem, 5.8vw, 4.6rem)',
                  fontWeight: 900,
                  fontFamily: 'var(--font-heading)',
                  color: 'var(--text-primary)',
                  lineHeight: 1.14,
                  letterSpacing: '-0.035em',
                  marginBottom: 24,
                  maxWidth: '940px',
                  marginLeft: 'auto',
                  marginRight: 'auto',
                }}
              >
                Power your coding workflow<br />
                with a{' '}
                <GradientText
                  colors={['#FFB347', '#4F46E5', '#00DFD8', '#FFB347']}
                  animationSpeed={5}
                  showBorder={false}
                >
                  Taksha AI Plan
                </GradientText>
              </h1>

              <p
                id="hero-subtext"
                style={{
                  fontSize: '1.18rem',
                  color: 'var(--text-muted)',
                  maxWidth: 640,
                  margin: '0 auto 40px',
                  lineHeight: 1.65,
                  fontWeight: 400
                }}
              >
                Advanced AI coding agents, high-performance vCPU sandboxes, and enterprise-grade token quotas — built for modern engineers.
              </p>

              {/* Clean Hero Action CTAs */}
              <div id="hero-controls" style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  className="btn-primary"
                  onClick={() => cardsRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  style={{ padding: '14px 32px', fontSize: '0.98rem' }}
                >
                  Explore Pricing Plans <ArrowRight size={17} />
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    const el = pageRef.current?.querySelector('#chapter-1');
                    el?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  style={{ padding: '14px 28px', fontSize: '0.98rem' }}
                >
                  Read Platform Story
                </button>
              </div>
            </div>

            {/* Bottom 100vh Scroll Indicator */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Scroll to explore story"
              onClick={() => {
                const el = pageRef.current?.querySelector('#chapter-1');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  const el = pageRef.current?.querySelector('#chapter-1');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                color: 'var(--text-muted)',
                fontSize: '0.78rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                cursor: 'pointer',
                transition: 'color 0.2s ease',
                zIndex: 2,
                userSelect: 'none',
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--brand-primary)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <span>SCROLL TO EXPLORE STORY</span>
              <ChevronDown size={18} className="animate-float" style={{ color: 'var(--brand-primary)' }} />
            </div>
          </section>

          <main style={{ maxWidth: '1240px', margin: '0 auto', padding: '0 24px', position: 'relative', zIndex: 1 }}>
            {/* Chapter Separator */}
            <div className="chapter-divider" />

          {/* ── CHAPTER 01: CORE ENGINE INFRASTRUCTURE (SPOTLIGHT CARD SWAP) ─── */}
          <section id="chapter-1" className="section-reveal story-section">
            {/* Subtle glow behind animation */}
            <div style={{
              position: 'absolute',
              top: '50%',
              right: '-5%',
              transform: 'translate(0, -50%)',
              width: '650px',
              height: '650px',
              background: 'radial-gradient(circle, rgba(255, 179, 71,0.12) 0%, rgba(27,110,243,0.07) 45%, transparent 70%)',
              filter: 'blur(50px)',
              pointerEvents: 'none',
              zIndex: 0,
            }} />

            {/* Centered Chapter Header */}
            <div style={{ textAlign: 'center', marginBottom: 48, position: 'relative', zIndex: 1, width: '100%' }}>
              <div className="chapter-badge">
                <Zap size={14} /> CHAPTER 01 // ENGINE INFRASTRUCTURE
              </div>
              <h2 className="section-title">Engineered for speed, isolation, &amp; precision</h2>
              <p className="section-subtitle" style={{ margin: '0 auto' }}>
                Hover over the stack or click any feature card to inspect Taksha AI’s underlying infrastructure powering thousands of daily code generations.
              </p>
            </div>

            <div className="spotlight-section-grid" style={{ zIndex: 1, width: '100%' }}>
              {/* Left Column: Interactive Spotlight List */}
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {SPOTLIGHT_ITEMS.map((item, idx) => {
                    const isActive = activeSpotlight === idx;
                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`Inspect ${item.title}`}
                        onClick={() => setActiveSpotlight(idx)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setActiveSpotlight(idx);
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 16,
                          padding: '16px 20px',
                          borderRadius: 16,
                          background: isActive ? 'var(--bg-active)' : 'var(--bg-surface)',
                          border: `1px solid ${isActive ? item.color + '60' : 'var(--border)'}`,
                          borderLeft: `4px solid ${isActive ? item.color : 'transparent'}`,
                          cursor: 'pointer',
                          transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                          backdropFilter: isActive ? 'blur(12px)' : 'none',
                          boxShadow: isActive ? `0 8px 30px -4px ${item.color}22` : 'none',
                        }}
                      >
                        <div style={{
                          width: 42, height: 42, borderRadius: 12,
                          background: isActive ? `${item.color}25` : 'var(--bg-element)',
                          border: `1px solid ${isActive ? item.color + '70' : 'var(--border)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: isActive ? item.color : 'var(--text-muted)', flexShrink: 0,
                          transition: 'all 0.3s ease',
                        }}>
                          {item.icon}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                            <p style={{ fontSize: '1.02rem', fontWeight: 700, color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)', margin: 0 }}>
                              {item.title}
                            </p>
                            <span style={{
                              fontSize: '0.68rem', padding: '2px 9px', borderRadius: 20,
                              background: isActive ? `${item.color}25` : 'var(--bg-element)',
                              color: isActive ? item.color : 'var(--text-muted)',
                              fontWeight: 600,
                              letterSpacing: '0.02em',
                            }}>
                              {item.badge}
                            </span>
                          </div>
                          <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                            {item.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Big 3D CardSwap Animation */}
              <div style={{
                position: 'relative',
                height: '520px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1,
              }}>
                <div className="card-swap-responsive-container">
                  <CardSwap
                    width={560}
                    height={320}
                    cardDistance={62}
                    verticalDistance={32}
                    delay={3500}
                    pauseOnHover={true}
                    onCardClick={(idx) => setActiveSpotlight(idx)}
                    skewAmount={2.5}
                    easing="elastic"
                  >
                    {SPOTLIGHT_ITEMS.map((item) => (
                      <Card key={item.id}>
                        <div style={{
                          position: 'relative',
                          width: '100%',
                          height: '100%',
                          borderRadius: 20,
                          overflow: 'hidden',
                          border: `2px solid ${item.color}`,
                          boxShadow: `0 25px 65px -10px rgba(0,0,0,0.95), 0 0 40px ${item.color}45`,
                          background: '#090D16',
                        }}>
                          <img
                            src={item.image}
                            alt={item.title}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />

                          {/* Top Accent Badge */}
                          <div style={{
                            position: 'absolute',
                            top: 14,
                            left: 14,
                            padding: '4px 12px',
                            borderRadius: 20,
                            background: `${item.color}35`,
                            border: `1px solid ${item.color}70`,
                            color: '#fff',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            backdropFilter: 'blur(10px)',
                            zIndex: 2,
                          }}>
                            {item.badge}
                          </div>

                          <div style={{
                            position: 'absolute', inset: 'auto 0 0 0',
                            padding: '18px 22px',
                            background: 'linear-gradient(to top, rgba(5,8,15,0.98) 0%, rgba(5,8,15,0.7) 70%, transparent 100%)',
                            color: '#fff',
                            backdropFilter: 'blur(8px)',
                            zIndex: 2,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: item.color }}>
                                {item.tagline}
                              </span>
                              <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.18)', color: '#fff', fontWeight: 600 }}>
                                Taksha AI
                              </span>
                            </div>
                            <h4 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>
                              {item.title}
                            </h4>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </CardSwap>
                </div>
              </div>
            </div>
          </section>

          {/* Chapter Separator */}
          <div className="chapter-divider" />

          {/* ── CHAPTER 02: WORKSPACE SUITE (MAGIC BENTO GRID) ────────────────── */}
          <section id="chapter-2" className="section-reveal story-section">
            <div style={{ textAlign: 'center', marginBottom: 48, width: '100%' }}>
              <div className="chapter-badge">
                <Sparkles size={14} /> CHAPTER 02 // WORKSPACE SUITE
              </div>
              <h2 className="section-title">Fully Equipped Cloud IDE &amp; Execution Environment</h2>
              <p className="section-subtitle" style={{ margin: '0 auto' }}>
                From a real-time auto-saving code editor to an interactive terminal shell — explore what powers your Taksha workspace.
              </p>
            </div>

            <div style={{ width: '100%' }}>
              <MagicBento 
                textAutoHide={true}
                enableStars={true}
                enableSpotlight={true}
                enableBorderGlow={true}
                enableTilt={true}
                enableMagnetism={true}
                clickEffect={true}
                spotlightRadius={300}
                particleCount={12}
                glowColor="61, 197, 161"
              />
            </div>
          </section>

          {/* Chapter Separator */}
          <div className="chapter-divider" />

          {/* ── CHAPTER 03: PLATFORM CAPABILITIES CONSOLE ─────────────────────── */}
          <section id="chapter-3" className="section-reveal story-section">
            <div style={{ textAlign: 'center', marginBottom: 40, width: '100%' }}>
              <div className="chapter-badge">
                <Cpu size={14} /> CHAPTER 03 // DEEP CAPABILITIES
              </div>
              <h2 className="section-title">Interactive Platform Capabilities Console</h2>
              <p className="section-subtitle" style={{ margin: '0 auto' }}>
                An interactive look into Taksha AI’s unified infrastructure — from sandboxed execution to billing-isolated ledgers.
              </p>
            </div>

            {/* Interactive Capability Navigation Pills */}
            <div
              role="tablist"
              aria-label="Platform capabilities"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: 10,
                marginBottom: 36,
                width: '100%'
              }}
            >
              {PLATFORM_CAPABILITIES.map((cap, i) => {
                const isActive = activeCapTab === i;
                return (
                  <button
                    key={cap.id}
                    role="tab"
                    aria-selected={isActive}
                    aria-label={cap.shortTitle}
                    onClick={() => setActiveCapTab(i)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 20px',
                      borderRadius: 30,
                      background: isActive ? `${cap.color}25` : 'var(--bg-surface)',
                      border: `1px solid ${isActive ? cap.color : 'var(--border)'}`,
                      color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                      fontSize: '0.9rem',
                      fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                      boxShadow: isActive ? `0 4px 20px ${cap.color}30` : 'none',
                      backdropFilter: 'blur(8px)',
                    }}
                  >
                    <span style={{ color: isActive ? cap.color : 'var(--text-muted)', display: 'flex' }}>
                      {cap.icon}
                    </span>
                    <span>{cap.shortTitle}</span>
                    {isActive && (
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: cap.color, boxShadow: `0 0 8px ${cap.color}`
                      }} />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Dynamic Interactive Stage (Transparent container with smooth tab transition) */}
            {(() => {
              const activeCap = PLATFORM_CAPABILITIES[activeCapTab];
              return (
                <div style={{
                  position: 'relative',
                  background: 'transparent',
                  border: 'none',
                  boxShadow: 'none',
                  padding: '16px 0 0',
                  overflow: 'hidden',
                  width: '100%'
                }}>
                  {/* Background Ambient Glow */}
                  <div style={{
                    position: 'absolute', top: '-40%', right: '-15%',
                    width: '550px', height: '550px',
                    background: `radial-gradient(circle, ${activeCap.color}15 0%, transparent 70%)`,
                    filter: 'blur(60px)', pointerEvents: 'none', zIndex: 0,
                    transition: 'background 0.6s ease',
                  }} />

                  <div key={activeCap.id} className="spotlight-section-grid stage-animated-content" style={{ zIndex: 1, gap: 48 }}>
                    {/* Left Column: Capability Details & Specs */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                        <div style={{
                          width: 52, height: 52, borderRadius: 14,
                          background: `${activeCap.color}25`,
                          border: `1px solid ${activeCap.color}70`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: activeCap.color, flexShrink: 0
                        }}>
                          {activeCap.icon}
                        </div>
                        <div>
                          <span style={{
                            fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em',
                            color: activeCap.color, fontWeight: 800
                          }}>
                            {activeCap.tagline}
                          </span>
                          <h3 style={{
                            margin: 0, fontSize: '1.65rem', fontWeight: 800,
                            color: 'var(--text-primary)', fontFamily: 'var(--font-heading)'
                          }}>
                            {activeCap.title}
                          </h3>
                        </div>
                      </div>

                      <p style={{
                        fontSize: '1.02rem', color: 'var(--text-muted)', lineHeight: 1.65,
                        marginBottom: 24, maxWidth: '520px'
                      }}>
                        {activeCap.desc}
                      </p>

                      {/* Specifications List */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
                        {activeCap.specs.map((spec, sIdx) => (
                          <div key={sIdx} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{
                              width: 22, height: 22, borderRadius: '50%',
                              background: `${activeCap.color}25`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: activeCap.color, flexShrink: 0
                            }}>
                              <Check size={13} />
                            </div>
                            <span style={{ fontSize: '0.92rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                              {spec}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Live Metric Counter Pill */}
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 18,
                        padding: '14px 22px', borderRadius: 16,
                        background: 'var(--bg-surface)',
                        border: `1px solid ${activeCap.color}35`,
                        backdropFilter: 'blur(8px)',
                      }}>
                        <div>
                          <div style={{ fontSize: '1.45rem', fontWeight: 900, color: activeCap.color, fontFamily: 'var(--font-heading)' }}>
                            {activeCap.metric}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                            {activeCap.metricLabel}
                          </div>
                        </div>
                        <div style={{ width: 1, height: 34, background: 'var(--border)' }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: activeCap.color, boxShadow: `0 0 10px ${activeCap.color}` }} />
                          <span style={{ fontSize: '0.84rem', color: 'var(--text-primary)', fontWeight: 600 }}>Active Production Engine</span>
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Code Console & Live Simulation Terminal */}
                    <div style={{ position: 'relative' }}>
                      <div style={{
                        borderRadius: 16,
                        background: '#060A12',
                        border: `1px solid ${activeCap.color}45`,
                        boxShadow: `0 20px 45px rgba(0,0,0,0.7), 0 0 25px ${activeCap.color}15`,
                        overflow: 'hidden'
                      }}>
                        {/* Terminal Bar */}
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '12px 18px', background: 'rgba(255,255,255,0.03)',
                          borderBottom: '1px solid rgba(255,255,255,0.06)'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF5F56' }} />
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FFBD2E' }} />
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#27C93F' }} />
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: 8, fontFamily: 'monospace' }}>
                              taksha-engine-{activeCap.id}.ts
                            </span>
                          </div>
                          <span style={{
                            fontSize: '0.68rem', padding: '2px 8px', borderRadius: 4,
                            background: `${activeCap.color}25`, color: activeCap.color,
                            fontWeight: 700, fontFamily: 'monospace'
                          }}>
                            {activeCap.badge}
                          </span>
                        </div>

                        {/* Code Snippet Box */}
                        <div style={{ padding: '22px 24px', fontFamily: 'monospace', fontSize: '0.86rem', lineHeight: 1.65, color: '#A0AEC0' }}>
                          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#E4E4E7' }}>
                            {activeCap.codeSnippet}
                          </pre>
                        </div>

                        {/* Terminal Footer Status Bar */}
                        <div style={{
                          padding: '10px 18px', background: 'rgba(0,0,0,0.4)',
                          borderTop: '1px solid rgba(255,255,255,0.04)',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          fontSize: '0.75rem', color: 'var(--text-muted)'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: activeCap.color }} />
                            <span>Microservice Connection: ONLINE</span>
                          </div>
                          <span style={{ color: activeCap.color, fontWeight: 600 }}>Taksha AI v2.4</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </section>

          {/* Chapter Separator */}
          <div className="chapter-divider" />

          {/* ── CHAPTER 04: TRANSPARENT PRICING & PLAN CARDS ─────────────────── */}
          <section id="chapter-4" ref={cardsRef} className="section-reveal story-section">
            <div style={{ textAlign: 'center', marginBottom: 32, width: '100%' }}>
              <div className="chapter-badge">
                <Sparkles size={14} /> CHAPTER 04 // TRANSPARENT PRICING
              </div>
              <h2 className="section-title">Select your plan &amp; start building</h2>
              <p className="section-subtitle" style={{ margin: '0 auto' }}>
                Instant container provisioning, zero hidden fees, and seamless payment processing powered by Razorpay.
              </p>
            </div>

            {/* Region & Billing Cycle Controls Bar (Moved to Pricing Section) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 48, width: '100%' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-secondary)',
                background: 'var(--bg-surface)',
                padding: '9px 18px',
                borderRadius: 12, border: '1px solid var(--border)',
                backdropFilter: 'blur(8px)',
              }}>
                <Globe size={16} style={{ color: 'var(--brand-primary)' }} />
                <span>Region: India (INR ₹)</span>
              </div>

              <div style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'var(--bg-surface)',
                padding: 4,
                borderRadius: 14, border: '1px solid var(--border)',
                backdropFilter: 'blur(8px)',
              }}>
                {['monthly', 'yearly'].map((cycle) => (
                  <button
                    key={cycle}
                    onClick={() => selectBillingCycle(cycle)}
                    style={{
                      padding: '8px 20px', borderRadius: 10, fontSize: '0.86rem', fontWeight: 600,
                      color: billingCycle === cycle ? 'var(--text-primary)' : 'var(--text-muted)',
                      background: billingCycle === cycle ? 'var(--bg-element)' : 'transparent',
                      boxShadow: billingCycle === cycle ? '0 2px 10px rgba(0,0,0,0.3)' : 'none',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {cycle === 'monthly' ? 'Monthly' : 'Annual Billing'}
                  </button>
                ))}
                <span className="badge-green" style={{ fontSize: '0.74rem', marginRight: 4, padding: '4px 10px' }}>Save 20%</span>
              </div>
            </div>

            {/* 3 Plan Cards Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 28,
              alignItems: 'stretch',
              width: '100%',
            }}>
              {PLANS.map((plan, i) => (
                <div key={plan.id} className="plan-card-item">
                  <PlanCard
                    plan={plan}
                    billingCycle={billingCycle}
                    isCurrent={currentSubscription === plan.tier}
                    onSelectPlan={handleCheckout}
                    priceRef={(el) => { priceRefs.current[i] = el; }}
                    planIndex={i}
                  />
                </div>
              ))}
            </div>

            {/* Compare link fallback anchor */}
            <div style={{ textAlign: 'center', marginTop: 36, width: '100%' }}>
              <Link
                to="/compare"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-muted)',
                  transition: 'color 0.2s ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--brand-primary)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
              >
                Need custom enterprise tokens or dedicated VPC? View details <ArrowUpRight size={15} />
              </Link>
            </div>
          </section>

          {/* Chapter Separator */}
          <div className="chapter-divider" />

          {/* ── CHAPTER 05: FEATURE COMPARISON MATRIX ────────────────────────── */}
          <section id="chapter-5" className="section-reveal story-section">
            <div style={{ textAlign: 'center', marginBottom: 40, width: '100%' }}>
              <div className="chapter-badge">
                <Layers size={14} /> CHAPTER 05 // FEATURE MATRIX
              </div>
              <h2 className="section-title">Full capability breakdown</h2>
              <p className="section-subtitle" style={{ margin: '0 auto' }}>
                Choose the level of speed, compute sandbox capacity, and tokens needed for your development.
              </p>
            </div>
            <div style={{ width: '100%' }}>
              <FeatureComparisonTable />
            </div>
          </section>

          {/* Chapter Separator */}
          <div className="chapter-divider" />

          {/* ── CHAPTER 06: FAQ ACCORDION & JOIN TAKSHA AI BANNER ────────────── */}
          <section id="chapter-6" className="section-reveal story-section" style={{ paddingBottom: '80px' }}>
            <div style={{ textAlign: 'center', marginBottom: 36, width: '100%' }}>
              <div className="chapter-badge">
                <ShieldCheck size={14} /> CHAPTER 06 // FREQUENTLY ASKED
              </div>
              <h2 className="section-title">Frequently asked questions</h2>
              <p className="section-subtitle" style={{ margin: '0 auto' }}>
                Everything you need to know about Taksha AI plans, sandbox billing, and token limits.
              </p>
            </div>

            {/* FAQ Accordion Grid */}
            <div
              className="faq-grid"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 14, maxWidth: 960, margin: '0 auto 48px', width: '100%' }}
            >
              {FAQS.map((faq, i) => (
                <div
                  key={i}
                  className={`faq-item ${openFaq === i ? 'is-open' : ''}`}
                >
                  <button className="faq-trigger" onClick={() => toggleFaq(i)}>
                    <span className="faq-question">{faq.q}</span>
                    <ChevronDown size={18} className="faq-chevron" />
                  </button>
                  <div
                    className="faq-panel"
                    ref={(el) => { faqRefs.current[i] = el; }}
                  >
                    <p className="faq-answer">{faq.a}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Integrated Join Taksha AI Banner */}
            <div
              style={{
                width: '100%',
                maxWidth: 960,
                padding: '44px 40px',
                background: 'linear-gradient(135deg, rgba(255, 179, 71,0.08) 0%, rgba(27,110,243,0.06) 100%)',
                border: '1px solid var(--border-glow)',
                borderRadius: 24,
                textAlign: 'center',
                position: 'relative',
                overflow: 'hidden',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 20px 50px -10px rgba(0,0,0,0.5), 0 0 30px rgba(255, 179, 71,0.12)',
              }}
            >
              {/* Decorative glows */}
              <div style={{
                position: 'absolute', top: -60, right: -60,
                width: 240, height: 240,
                background: 'radial-gradient(circle, rgba(27,110,243,0.15), transparent 70%)',
                pointerEvents: 'none',
              }} />
              <div style={{
                position: 'absolute', bottom: -60, left: -60,
                width: 200, height: 200,
                background: 'radial-gradient(circle, rgba(255, 179, 71,0.12), transparent 70%)',
                pointerEvents: 'none',
              }} />

              <div className="chapter-badge" style={{ display: 'inline-flex', marginBottom: 14 }}>
                <Sparkles size={14} /> EPILOGUE // JOIN TAKSHA AI
              </div>
              <h3 style={{
                fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', fontWeight: 900,
                fontFamily: 'var(--font-heading)', color: 'var(--text-primary)',
                marginBottom: 12, letterSpacing: '-0.025em',
              }}>
                Ready to unlock the full power of Taksha AI?
              </h3>
              <p style={{ fontSize: '0.98rem', color: 'var(--text-muted)', marginBottom: 28, lineHeight: 1.6, maxWidth: 580, margin: '0 auto 28px' }}>
                Join thousands of engineers shipping faster with AI-powered sandboxes, agents, and enterprise-grade token quotas.
              </p>
              <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  className="btn-primary"
                  onClick={() => handleCheckout('pro_regular')}
                  style={{ padding: '13px 28px', fontSize: '0.95rem' }}
                >
                  Upgrade to Pro <ArrowRight size={17} />
                </button>
                <Link to="/compare" className="btn-secondary" style={{ padding: '13px 28px', fontSize: '0.95rem' }}>
                  Compare All Plans
                </Link>
              </div>
            </div>
          </section>

        </main>
      </div>
    </div>
  );
}
