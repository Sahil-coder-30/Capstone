import React, { useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  ArrowLeft, Check, Minus, ChevronDown, ArrowRight,
  Cpu, Network, Activity, Zap, ShieldCheck, Layers, Sparkles, Globe
} from 'lucide-react';
import StarterNode from '../../../assets/svgs/StarterNode';
import ProMesh from '../../../assets/svgs/ProMesh';
import MaxNetwork from '../../../assets/svgs/MaxNetwork';
import PaymentFlowDiagram from '../../../assets/svgs/PaymentFlowDiagram';
import { toggleAccordion, stickyCtaReveal } from '../../../utils/animations';

gsap.registerPlugin(ScrollTrigger);

// ── Per-plan content data ─────────────────────────────────────────────────────
const PLAN_DATA = {
  free: {
    label: 'Taksha AI Free',
    tier: 'free',
    priceINR: 0,
    pitch: 'Start coding with AI — zero commitment.',
    color: 'var(--text-muted)',
    Icon: StarterNode,
    badge: 'Get Started',
    capabilities: [
      {
        icon: <Cpu size={20} />,
        title: 'Shared Sandbox Environment',
        desc: 'Access a shared 0.5 vCPU + 512 MB RAM container for prototyping and learning. Perfect for developers exploring AI-assisted coding.',
        detail: '50,000 tokens/day · 1 GB storage · Community support',
      },
      {
        icon: <Zap size={20} />,
        title: 'Core AI Agents',
        desc: 'The Taksha Coding Agent and Inline Copilot are fully available. Get intelligent completions, refactor suggestions, and debugging help.',
        detail: '20 credits/day per provider · Standard context window',
      },
      {
        icon: <ShieldCheck size={20} />,
        title: 'Secure Billing Ledger',
        desc: 'Even on the free tier, your billing and token records are isolated inside the Payments microservice — never mixed with auth data.',
        detail: 'HMAC-verified billing events · Itemized invoice downloads',
      },
    ],
    comparedTo: {
      below: null,
      above: 'pro_regular',
    },
    faqs: [
      { q: 'Is the Free tier truly free?', a: 'Yes — no credit card required. You get 20 AI credits per provider daily and 50,000 tokens/day at zero cost.' },
      { q: 'Can I upgrade from Free to Pro?', a: 'Absolutely. You can upgrade at any time and your upgrade takes effect instantly via the Checkout page.' },
    ],
  },
  pro_regular: {
    label: 'Taksha AI Pro',
    tier: 'pro',
    priceINR: 499,
    pitch: 'For engineers who need serious AI horsepower.',
    color: 'var(--brand-primary)',
    Icon: ProMesh,
    badge: 'Most Popular',
    capabilities: [
      {
        icon: <Cpu size={20} />,
        title: 'Dedicated 2.0 vCPU Sandbox',
        desc: 'A fully isolated container with 2.0 vCPU and 2 GB RAM — no noisy neighbors, guaranteed compute allocation for your workspace.',
        detail: '10 GB SSD storage · 3 parallel execution threads',
      },
      {
        icon: <Network size={20} />,
        title: 'Full Agent Suite',
        desc: 'Unlock the Taksha App Agent for full-stack feature generation, in addition to the Coding Agent and Copilot available on Free.',
        detail: 'App Agent + Coding Agent + Copilot · 32K context window',
      },
      {
        icon: <Activity size={20} />,
        title: '5M Monthly Token Quota',
        desc: 'Get 5 million tokens per month — roughly 4x the capacity of the Free tier — without daily caps slowing you down mid-session.',
        detail: 'Metered provider billing · Priority email & Discord support',
      },
    ],
    comparedTo: { below: 'free', above: 'max_regular' },
    faqs: [
      { q: 'Is my sandbox truly isolated?', a: 'Yes. Pro users get a dedicated container slice — your vCPU and RAM are not shared with other tenants.' },
      { q: 'What happens if I exceed 5M tokens?', a: 'You will receive a notification at 80% and 100% of your quota. Sessions continue but at a reduced rate until your monthly cycle resets.' },
    ],
  },
  max_regular: {
    label: 'Taksha AI Max',
    tier: 'max',
    priceINR: 999,
    pitch: 'Uncapped compute and tokens for production-grade AI engineering.',
    color: 'var(--accent-primary)',
    Icon: MaxNetwork,
    badge: 'Flagship Tier',
    capabilities: [
      {
        icon: <Cpu size={20} />,
        title: '4.0 vCPU Dedicated Container',
        desc: 'The highest hardware allocation — 4.0 vCPU and 4 GB RAM with 50 GB NVMe storage. Designed for multi-file codebases and long-running agents.',
        detail: '50 GB NVMe storage · 10 parallel execution threads',
      },
      {
        icon: <Layers size={20} />,
        title: 'All Agents + Flagship Models',
        desc: 'Every agent in the Taksha suite plus priority access to flagship LLMs (GPT-4o, Gemini Ultra, Mistral Large). 128K+ context window on all.',
        detail: 'Multi-Agent Orchestrator · 128K+ context · Priority queue',
      },
      {
        icon: <ShieldCheck size={20} />,
        title: 'Dedicated Technical Manager',
        desc: 'A dedicated support manager available 24/7 for onboarding, migration help, and production incident escalation. Sub-1-hour SLA.',
        detail: '< 1 hour response SLA · Truly unlimited tokens',
      },
    ],
    comparedTo: { below: 'pro_regular', above: null },
    faqs: [
      { q: 'Are tokens truly unlimited on Max?', a: 'Yes. There is no monthly token cap, no daily throttle, and no soft limit. You pay ₹999/month and use as much as you need.' },
      { q: 'What does "dedicated technical manager" mean?', a: 'A named Taksha engineer is assigned to your account. You get a direct Slack/email channel with a guaranteed < 1 hour response SLA.' },
    ],
  },
};

const PLAN_LABELS = { free: 'Free', pro_regular: 'Pro', max_regular: 'Max' };

// ── Component ─────────────────────────────────────────────────────────────────
export default function PlanDetailPage() {
  const { planId } = useParams();
  const navigate   = useNavigate();
  const plan = PLAN_DATA[planId] || PLAN_DATA['pro_regular'];

  const pageRef    = useRef(null);
  const heroRef    = useRef(null);
  const diagramRef = useRef(null);
  const ctaBarRef  = useRef(null);
  const faqPanels  = useRef([]);
  const [openFaq, setOpenFaq] = useState(null);

  const isPopular = plan.tier === 'pro';
  const isMax     = plan.tier === 'max';

  useGSAP(() => {
    // Hero entrance
    gsap.fromTo('#detail-hero-content > *',
      { opacity: 0, y: 30 },
      { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', stagger: 0.12 }
    );

    // Hero SVG draw-in
    gsap.fromTo('#detail-hero-svg',
      { opacity: 0, scale: 0.8 },
      { opacity: 1, scale: 1, duration: 0.8, ease: 'back.out(1.4)', delay: 0.3 }
    );

    // Capability cards stagger
    ScrollTrigger.batch('.capability-card', {
      start: 'top 85%',
      onEnter: (batch) => gsap.fromTo(batch,
        { opacity: 0, y: 32 },
        { opacity: 1, y: 0, duration: 0.65, ease: 'power3.out', stagger: 0.1 }
      ),
    });

    // Payment flow diagram scroll-scrub
    if (diagramRef.current) {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: diagramRef.current,
          pin: true,
          scrub: 1.2,
          start: 'top top',
          end: '+=180%',
        },
      });

      const easing = 'power2.inOut';
      const pLen   = 50;
      const fadeIn = { opacity: 1, scale: 1, duration: 0.5 };
      const fadeInEl = { opacity: 1, duration: 0.4 };

      tl
        // Stage 1: Request
        .to('#node-request rect', { ...fadeIn, ease: easing })
        .to('#node-request text', { ...fadeInEl, ease: easing }, '<')
        .to('#node-request circle', { ...fadeInEl, ease: easing }, '<')
        // Path 1
        .to('#path-1', { strokeDashoffset: 0, duration: 0.4, ease: easing })
        .to('#arrow-1', { ...fadeInEl, ease: easing }, '<0.2')
        // Stage 2: Auth
        .to('#node-auth rect',   { ...fadeIn, ease: easing })
        .to('#node-auth text',   { ...fadeInEl, ease: easing }, '<')
        .to('#node-auth circle', { ...fadeInEl, ease: easing }, '<')
        // Path 2
        .to('#path-2', { strokeDashoffset: 0, duration: 0.4, ease: easing })
        .to('#arrow-2', { ...fadeInEl, ease: easing }, '<0.2')
        // Stage 3: Execution
        .to('#node-execution rect',   { ...fadeIn, ease: easing })
        .to('#node-execution text',   { ...fadeInEl, ease: easing }, '<')
        .to('#node-execution circle', { ...fadeInEl, ease: easing }, '<')
        // Path 3
        .to('#path-3', { strokeDashoffset: 0, duration: 0.4, ease: easing })
        .to('#arrow-3', { ...fadeInEl, ease: easing }, '<0.2')
        // Stage 4: Billing
        .to('#node-billing rect', { ...fadeIn, ease: easing })
        .to('#node-billing text', { ...fadeInEl, ease: easing }, '<');
    }

    // Sticky CTA bar
    if (ctaBarRef.current && heroRef.current) {
      stickyCtaReveal(ctaBarRef.current, heroRef.current);
    }

    // FAQ items reveal
    gsap.fromTo('.faq-detail-item',
      { opacity: 0, y: 16 },
      {
        opacity: 1, y: 0, duration: 0.45, ease: 'power3.out', stagger: 0.07,
        scrollTrigger: { trigger: '.faq-detail-section', start: 'top 85%' }
      }
    );

  }, { scope: pageRef });

  const toggleFaq = (i) => {
    const newOpen = openFaq === i ? null : i;
    setOpenFaq(newOpen);
    faqPanels.current.forEach((panel, idx) => {
      if (panel) toggleAccordion(panel, idx === newOpen);
    });
  };

  const accentColor = isMax ? 'var(--accent-primary)' : isPopular ? 'var(--brand-primary)' : 'var(--text-muted)';
  const accentShadow = isMax ? 'var(--shadow-blue)' : isPopular ? 'var(--shadow-green)' : 'none';
  const accentGrad   = isMax ? 'var(--gradient-blue)' : isPopular ? 'var(--gradient-green)' : 'linear-gradient(135deg, #374060, #6B7599)';

  return (
    <div ref={pageRef} style={{ minHeight: '100vh', background: 'transparent', overflowX: 'hidden' }}>

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section
        ref={heroRef}
        style={{
          position: 'relative',
          padding: '108px 24px 80px',
          background: `linear-gradient(180deg, rgba(${isMax ? '27,110,243' : '61,197,161'},0.05) 0%, transparent 100%)`,
          borderBottom: '1px solid var(--border)',
          overflow: 'hidden',
        }}
      >
        {/* Back nav */}
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <button
            onClick={() => navigate('/')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-muted)',
              marginBottom: 40, transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = accentColor}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            <ArrowLeft size={16} /> Back to Plans
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 48, alignItems: 'center' }}>
            {/* Left: text */}
            <div id="detail-hero-content">
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 14px', borderRadius: 20,
                background: isMax ? 'var(--accent-subtle)' : isPopular ? 'var(--brand-subtle)' : 'var(--bg-element)',
                color: accentColor, fontSize: '0.78rem', fontWeight: 800,
                textTransform: 'uppercase', letterSpacing: '0.06em',
                border: `1px solid rgba(${isMax ? '27,110,243' : '61,197,161'}, 0.25)`,
                marginBottom: 18,
              }}>
                {plan.badge}
              </div>

              <h1 style={{
                fontSize: 'clamp(2.2rem, 4.5vw, 3.5rem)',
                fontWeight: 900, fontFamily: 'var(--font-heading)',
                color: 'var(--text-primary)', lineHeight: 1.1,
                letterSpacing: '-0.035em', marginBottom: 16,
              }}>
                {plan.label}
              </h1>

              <p style={{ fontSize: '1.15rem', color: 'var(--text-muted)', lineHeight: 1.65, marginBottom: 32, maxWidth: 520 }}>
                {plan.pitch}
              </p>

              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {plan.priceINR > 0 ? (
                  <button
                    className={isMax ? 'btn-accent' : 'btn-primary'}
                    onClick={() => navigate(`/checkout/${planId}`)}
                    style={{ padding: '13px 28px', fontSize: '0.95rem' }}
                  >
                    Upgrade to {plan.tier === 'pro' ? 'Pro' : 'Max'} — ₹{plan.priceINR}/mo <ArrowRight size={16} />
                  </button>
                ) : (
                  <div style={{ padding: '13px 24px', borderRadius: 10, background: 'var(--bg-element)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.92rem', fontWeight: 600 }}>
                    ✓ Your Current Free Plan
                  </div>
                )}
                <Link to="/compare" className="btn-secondary" style={{ padding: '13px 22px', fontSize: '0.88rem' }}>
                  Compare all plans
                </Link>
              </div>

              {/* Price display */}
              {plan.priceINR > 0 && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 20 }}>
                  <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>₹</span>
                  <span style={{ fontSize: '2.8rem', fontWeight: 900, fontFamily: 'var(--font-heading)', color: accentColor, letterSpacing: '-0.03em' }}>
                    {plan.priceINR}
                  </span>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>/month</span>
                </div>
              )}
            </div>

            {/* Right: animated SVG hero */}
            <div id="detail-hero-svg" style={{
              background: isMax ? 'var(--accent-subtle)' : isPopular ? 'var(--brand-subtle)' : 'var(--bg-element)',
              border: `1px solid ${accentColor}22`,
              borderRadius: 24, padding: 32,
              boxShadow: accentShadow,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <plan.Icon size={140} animated />
            </div>
          </div>
        </div>
      </section>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '60px 24px' }}>

        {/* ── CAPABILITY SECTIONS ──────────────────────────────────────────── */}
        <section style={{ marginBottom: 80 }}>
          <div className="section-label" style={{ marginBottom: 32 }}>
            <Layers size={13} /> What's included
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {plan.capabilities.map((cap, i) => (
              <div
                key={i}
                className="capability-card"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr',
                  gap: 24,
                  padding: '28px 32px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  transition: 'border-color 0.25s, box-shadow 0.25s',
                  opacity: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = accentColor;
                  e.currentTarget.style.boxShadow = accentShadow;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{
                  width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                  background: isMax ? 'var(--accent-subtle)' : 'var(--brand-subtle)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: accentColor,
                }}>
                  {cap.icon}
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                    {cap.title}
                  </h3>
                  <p style={{ fontSize: '0.92rem', color: 'var(--text-muted)', lineHeight: 1.65, marginBottom: 10 }}>
                    {cap.desc}
                  </p>
                  <p style={{
                    fontSize: '0.8rem', fontFamily: 'var(--font-mono)',
                    color: accentColor, background: isMax ? 'var(--accent-subtle)' : 'var(--brand-subtle)',
                    display: 'inline-block', padding: '4px 10px', borderRadius: 6,
                  }}>
                    {cap.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── HOW IT WORKS — Scroll-scrubbed diagram ──────────────────────── */}
        <section ref={diagramRef} style={{ marginBottom: 80, minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div className="section-label"><Activity size={13} /> How billing works</div>
            <h2 className="section-title">Request → Auth → Execution → Billing</h2>
            <p className="section-subtitle" style={{ margin: '0 auto' }}>
              Every AI request flows through a secure 4-stage pipeline. Scroll to trace the path.
            </p>
          </div>

          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 20, padding: '48px 32px', boxShadow: 'var(--shadow-card)',
          }}>
            <PaymentFlowDiagram />

            {/* Stage labels */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 40 }}>
              {['User Request', 'Auth Verify', 'Agent Execution', 'Billing Event'].map((label, i) => (
                <div key={i} style={{ textAlign: 'center' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', margin: '0 auto 8px',
                    background: i % 2 === 0 ? 'var(--brand-subtle)' : 'var(--accent-subtle)',
                    color: i % 2 === 0 ? 'var(--brand-primary)' : 'var(--accent-primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700,
                  }}>
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── PLAN CONTEXT COMPARISON ────────────────────────────────────── */}
        <section style={{ marginBottom: 80 }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div className="section-label"><Network size={13} /> Plan comparison</div>
            <h2 className="section-title">How {plan.label} stacks up</h2>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
              <thead>
                <tr style={{ background: 'var(--bg-element)' }}>
                  <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-muted)' }}>Feature</th>
                  {['free', 'pro_regular', 'max_regular'].map((tid) => (
                    <th key={tid} style={{
                      padding: '16px 20px', textAlign: 'center', fontSize: '0.88rem', fontWeight: 700,
                      color: tid === planId ? accentColor : 'var(--text-muted)',
                      background: tid === planId ? (isMax ? 'rgba(27,110,243,0.06)' : 'rgba(61,197,161,0.05)') : 'transparent',
                    }}>
                      {PLAN_LABELS[tid]}
                      {tid === planId && <div style={{ width: 6, height: 6, borderRadius: '50%', background: accentColor, margin: '4px auto 0' }} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Daily Tokens',   free: '50K', pro: '5M/mo', max: 'Unlimited' },
                  { label: 'vCPU Alloc',     free: '0.5', pro: '2.0', max: '4.0' },
                  { label: 'RAM',            free: '512 MB', pro: '2 GB', max: '4 GB' },
                  { label: 'Storage',        free: '1 GB', pro: '10 GB', max: '50 GB' },
                  { label: 'App Agent',      free: false,  pro: true,  max: true },
                  { label: 'Multi-Agent',    free: false,  pro: false, max: true },
                  { label: 'Support SLA',    free: 'Community', pro: '<12h', max: '<1h dedicated' },
                ].map((row, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '14px 24px', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>{row.label}</td>
                    {['free', 'pro_regular', 'max_regular'].map((tid) => {
                      const val = row[tid === 'pro_regular' ? 'pro' : tid === 'max_regular' ? 'max' : 'free'];
                      return (
                        <td key={tid} style={{
                          padding: '14px 20px', textAlign: 'center',
                          background: tid === planId ? (isMax ? 'rgba(27,110,243,0.03)' : 'rgba(61,197,161,0.02)') : 'transparent',
                        }}>
                          {val === true  && <Check size={17} style={{ color: 'var(--brand-primary)', margin: '0 auto' }} />}
                          {val === false && <Minus size={17} style={{ color: 'var(--text-disabled)', margin: '0 auto' }} />}
                          {typeof val === 'string' && (
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: tid === planId ? accentColor : 'var(--text-muted)' }}>
                              {val}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────────────────────────────── */}
        <section className="faq-detail-section" style={{ marginBottom: 80 }}>
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <div className="section-label"><ShieldCheck size={13} /> FAQ</div>
            <h2 className="section-title">Questions about {plan.label}</h2>
          </div>
          <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {plan.faqs.map((faq, i) => (
              <div key={i} className={`faq-item faq-detail-item ${openFaq === i ? 'is-open' : ''}`}>
                <button className="faq-trigger" onClick={() => toggleFaq(i)}>
                  <span className="faq-question">{faq.q}</span>
                  <ChevronDown size={18} className="faq-chevron" />
                </button>
                <div className="faq-panel" ref={(el) => { faqPanels.current[i] = el; }}>
                  <p className="faq-answer">{faq.a}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

      </main>

      {/* ── STICKY BOTTOM CTA BAR ────────────────────────────────────────── */}
      {plan.priceINR > 0 && (
        <div ref={ctaBarRef} className="sticky-cta-bar">
          <div>
            <p style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
              {plan.label}
            </p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              ₹{plan.priceINR}/month — cancel anytime
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Link to="/" className="btn-secondary" style={{ padding: '9px 18px', fontSize: '0.86rem' }}>
              Back to Plans
            </Link>
            <button
              className={isMax ? 'btn-accent' : 'btn-primary'}
              onClick={() => navigate(`/checkout/${planId}`)}
              style={{ padding: '9px 22px', fontSize: '0.88rem' }}
            >
              Upgrade Now <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
