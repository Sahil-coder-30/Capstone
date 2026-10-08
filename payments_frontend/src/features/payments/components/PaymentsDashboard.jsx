import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  ShieldCheck, ArrowUpRight, CheckCircle2, RefreshCw, Zap,
  Calendar, Layers, Clock, Sparkles, TrendingUp, Activity,
  Cpu, FileText, ArrowRight, DollarSign, PieChart, BarChart3,
  Bot, Terminal, Database, Check
} from 'lucide-react';
import { usePayments } from '../Hooks/payments.hooks';

gsap.registerPlugin(ScrollTrigger);

// Animated Circular Ring Gauge
function RingGauge({ percent, color, size = 64 }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, percent)) / 100) * circ;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-element)" strokeWidth="4" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth="4" strokeLinecap="round"
        strokeDasharray={`${dash} ${circ - dash}`}
        style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
      />
    </svg>
  );
}

// Interactive SVG Area & Line Chart
function TimeSeriesAreaChart({ data = [], activeKey = 'totalTokens', color = '#3DC5A1', label = 'Tokens' }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const containerRef = useRef(null);

  if (!data || data.length === 0) {
    return (
      <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
        No activity recorded in this timeframe yet. AI requests will automatically chart here.
      </div>
    );
  }

  const values = data.map(d => d[activeKey] || 0);
  const maxVal = Math.max(...values, 100);
  const minVal = 0;
  const range = maxVal - minVal || 1;

  const width = 800;
  const height = 220;
  const paddingX = 30;
  const paddingY = 25;

  const points = data.map((d, i) => {
    const x = paddingX + (i / Math.max(data.length - 1, 1)) * (width - paddingX * 2);
    const y = height - paddingY - ((d[activeKey] || 0) / range) * (height - paddingY * 2);
    return { x, y, ...d };
  });

  const pathD = points.reduce((acc, pt, i) => {
    return i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
  }, '');

  const areaD = `${pathD} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`;

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 'auto', minWidth: 460, display: 'block' }}
      >
        <defs>
          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={color} stopOpacity="0.00" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
          const y = paddingY + pct * (height - paddingY * 2);
          const gridVal = Math.round(maxVal - pct * maxVal);
          return (
            <g key={idx}>
              <line
                x1={paddingX} y1={y}
                x2={width - paddingX} y2={y}
                stroke="var(--border)" strokeDasharray="3 3" opacity="0.6"
              />
              <text
                x={paddingX - 6} y={y + 4}
                textAnchor="end" fill="var(--text-muted)" fontSize="9"
                fontFamily="var(--font-mono)"
              >
                {gridVal >= 1000 ? `${(gridVal / 1000).toFixed(0)}k` : gridVal}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaD} fill="url(#chartGradient)" />

        {/* Line stroke */}
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Interactive Dots */}
        {points.map((pt, i) => (
          <circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r={hoveredPoint?.date === pt.date ? 6 : 3.5}
            fill={hoveredPoint?.date === pt.date ? '#FFFFFF' : color}
            stroke={color}
            strokeWidth={hoveredPoint?.date === pt.date ? 3 : 1.5}
            style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
            onMouseEnter={() => setHoveredPoint(pt)}
          />
        ))}
      </svg>

      {/* Hover Floating Tooltip */}
      {hoveredPoint && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 12,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            padding: '8px 14px',
            borderRadius: 8,
            boxShadow: 'var(--shadow-card)',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            zIndex: 10,
          }}
        >
          <span style={{ color: 'var(--text-muted)' }}>Date: <strong style={{ color: 'var(--text-primary)' }}>{hoveredPoint.date}</strong></span>
          <span style={{ color: color }}>
            {label}: <strong style={{ fontFamily: 'var(--font-mono)' }}>{(hoveredPoint[activeKey] || 0).toLocaleString()}</strong>
          </span>
          {hoveredPoint.requestCount !== undefined && (
            <span style={{ color: 'var(--text-secondary)' }}>
              Reqs: <strong>{hoveredPoint.requestCount}</strong>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function PaymentsDashboard() {
  const {
    subscription,
    credit,
    usageAnalytics,
    loadDashboardOverview,
    loadUsageAnalytics,
    loadSubscription,
    loadCredit,
    isLoading
  } = usePayments();

  const navigate = useNavigate();
  const pageRef  = useRef(null);
  const [timeRange, setTimeRange] = useState(30);
  const [activeMetric, setActiveMetric] = useState('totalTokens');

  useEffect(() => {
    loadDashboardOverview();
    loadUsageAnalytics(timeRange);
  }, [loadDashboardOverview, loadUsageAnalytics, timeRange]);

  const currentTier = subscription?.activeTier || credit?.subscription || 'free';
  const activeSlot  = subscription?.activeSlot || null;
  const reservedSlots = subscription?.reservedSlots || [];

  const isMax = currentTier === 'max';
  const isPro = currentTier === 'pro';
  const accentColor = isMax ? 'var(--accent-primary)' : isPro ? 'var(--brand-primary)' : 'var(--text-muted)';

  const totals = usageAnalytics?.totals || {
    totalTokens: credit?.totalTokens || 0,
    promptTokens: credit?.promptTokens || 0,
    completionTokens: credit?.completionTokens || 0,
    totalRequests: 0,
  };

  const windowCreditsTotal = credit?.windowCreditsTotal || credit?.tierConfig?.windowCredits || (isMax ? 200 : isPro ? 150 : 20);
  const windowCreditsRemaining = credit?.windowCreditsRemaining !== undefined && credit?.windowCreditsRemaining !== null
    ? credit.windowCreditsRemaining
    : windowCreditsTotal;

  const mistralBucket = credit?.providerCredits?.find(p => p.company?.toLowerCase() === 'mistral') || {
    company: 'Mistral',
    totalTokens: credit?.totalTokens || 0,
  };

  const providerCredits = [
    {
      company: 'Mistral AI',
      creditsRemaining: windowCreditsRemaining,
      creditsGranted: windowCreditsTotal,
      totalTokens: mistralBucket.totalTokens || credit?.totalTokens || 0,
    },
  ];

  useGSAP(() => {
    gsap.fromTo('.dashboard-kpi-card',
      { opacity: 0, y: 20, scale: 0.98 },
      { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'power3.out', stagger: 0.08 }
    );
    gsap.fromTo('.dashboard-chart-box',
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', delay: 0.2 }
    );
  }, { scope: pageRef });

  return (
    <div ref={pageRef} style={{ maxWidth: 1180, margin: '0 auto', padding: '100px 24px 64px' }}>

      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div className="section-label" style={{ marginBottom: 6 }}>
            <Activity size={13} /> Telemetry & Operations
          </div>
          <h1 style={{
            fontSize: 'clamp(1.5rem, 2.8vw, 2.1rem)', fontWeight: 900,
            fontFamily: 'var(--font-heading)', color: 'var(--text-primary)',
            letterSpacing: '-0.02em', marginBottom: 6,
          }}>
            Payments & AI Usage Command Center
          </h1>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
            Real-time multi-model AI token telemetry, plan queue states, and financial ledger records.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => { loadDashboardOverview(); loadUsageAnalytics(timeRange); }}
            className="btn-secondary"
            style={{ padding: '8px 16px', fontSize: '0.84rem' }}
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Refresh Live Data
          </button>
          <button
            onClick={() => navigate('/requests')}
            className="btn-secondary"
            style={{ padding: '8px 16px', fontSize: '0.84rem' }}
          >
            <Terminal size={14} /> AI Request Logs
          </button>
          <button
            onClick={() => navigate('/invoices')}
            className="btn-primary"
            style={{ padding: '8px 18px', fontSize: '0.84rem' }}
          >
            <FileText size={14} /> Invoices & Ledger
          </button>
        </div>
      </div>

      {/* ── Active Subscription Hero Banner ─────────────────────────────── */}
      <div
        id="status-banner"
        style={{
          background: `linear-gradient(135deg, rgba(${isMax ? '27,110,243' : isPro ? '61,197,161' : '168,85,247'},0.08) 0%, var(--bg-surface) 100%)`,
          border: `1px solid ${accentColor}33`,
          borderRadius: 18, padding: '24px 30px',
          marginBottom: 28,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          boxShadow: 'var(--shadow-card)',
          flexWrap: 'wrap', gap: 20,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <ShieldCheck size={18} style={{ color: accentColor }} />
            <span style={{
              fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase',
              letterSpacing: '0.06em', color: accentColor
            }}>
              Active Plan Status
            </span>
          </div>
          <h2 style={{
            fontSize: '1.65rem', fontWeight: 900,
            fontFamily: 'var(--font-heading)', color: 'var(--text-primary)',
            textTransform: 'capitalize', letterSpacing: '-0.02em'
          }}>
            Taksha AI {currentTier} Plan
          </h2>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
            {activeSlot ? (
              <>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <Calendar size={14} style={{ color: accentColor }} />
                  Expires: <strong>{new Date(activeSlot.validUntil).toLocaleDateString()}</strong>
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <Clock size={14} style={{ color: accentColor }} />
                  Remaining: <strong style={{ color: accentColor }}>{activeSlot.daysRemaining ?? '—'} days</strong>
                </span>
              </>
            ) : (
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Unlimited Free tier · Upgrade to Pro/Max for high-memory sandboxes and uncapped tokens
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => navigate('/')} className="btn-primary" style={{ padding: '8px 18px', fontSize: '0.84rem' }}>
            Upgrade / Extend <ArrowUpRight size={14} />
          </button>
        </div>
      </div>

      {/* ── Preserved Plan Queue (Zero Day-Waste Banner) ──────────────────── */}
      {reservedSlots.length > 0 && (
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          borderRadius: 16, padding: '18px 24px',
          marginBottom: 28, boxShadow: 'var(--shadow-card)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Layers size={17} style={{ color: 'var(--amber-primary)' }} />
            <h4 style={{ fontSize: '0.94rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Preserved Plan Queue (Zero Day-Waste Guaranteed)
            </h4>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 12 }}>
            The following plan slots are queued and will <strong>automatically activate</strong> the moment your current tier expires:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {reservedSlots.map((slot, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 16px', borderRadius: 8,
                  background: 'var(--bg-element)', border: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    padding: '3px 8px', borderRadius: 5, fontSize: '0.72rem', fontWeight: 800,
                    textTransform: 'uppercase', background: 'rgba(245, 158, 11, 0.15)', color: 'var(--amber-primary)',
                  }}>
                    {slot.tier} Plan
                  </span>
                  <span style={{ fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
                    Preserved Duration: <strong>{slot.daysRemaining ?? 30} days</strong>
                  </span>
                </div>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Scheduled auto-promotion on expiry
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── KPI Metric Cards Grid ────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16, marginBottom: 28 }}>
        {[
          {
            icon: <Zap size={18} />, label: 'Total Tokens Consumed',
            value: (totals.totalTokens || 0).toLocaleString(),
            color: 'var(--brand-primary)', subtle: 'var(--brand-subtle)',
          },
          {
            icon: <Terminal size={18} />, label: 'Total AI Requests',
            value: (totals.totalRequests || 0).toLocaleString(),
            color: 'var(--accent-primary)', subtle: 'var(--accent-subtle)',
          },
          {
            icon: <Bot size={18} />, label: 'Prompt Tokens',
            value: (totals.promptTokens || 0).toLocaleString(),
            color: 'var(--amber-primary)', subtle: 'var(--amber-subtle)',
          },
          {
            icon: <Sparkles size={18} />, label: 'Completion Tokens',
            value: (totals.completionTokens || 0).toLocaleString(),
            color: '#C084FC', subtle: 'rgba(192, 132, 252, 0.12)',
          },
        ].map((kpi, i) => (
          <div
            key={i}
            className="dashboard-kpi-card"
            style={{
              padding: '20px 22px',
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 14, boxShadow: 'var(--shadow-card)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{
                width: 30, height: 30, borderRadius: 7,
                background: kpi.subtle, color: kpi.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {kpi.icon}
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>{kpi.label}</span>
            </div>
            <div style={{
              fontSize: '1.55rem', fontWeight: 900,
              fontFamily: 'var(--font-heading)', color: 'var(--text-primary)',
            }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Main Time-Series Chart Box ───────────────────────────────────── */}
      <div
        className="dashboard-chart-box"
        style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 16, padding: '24px 26px', marginBottom: 28,
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={18} style={{ color: 'var(--brand-primary)' }} />
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Token Telemetry Velocity
              </h3>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
              Daily token consumption and request velocity across multi-model AI coding agents.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Metric selector */}
            <div style={{ display: 'flex', background: 'var(--bg-element)', borderRadius: 8, padding: 3, border: '1px solid var(--border)' }}>
              <button
                onClick={() => setActiveMetric('totalTokens')}
                style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: '0.76rem', fontWeight: 700,
                  background: activeMetric === 'totalTokens' ? 'var(--brand-primary)' : 'transparent',
                  color: activeMetric === 'totalTokens' ? '#000' : 'var(--text-muted)',
                  border: 'none', cursor: 'pointer',
                }}
              >
                Tokens
              </button>
              <button
                onClick={() => setActiveMetric('requestCount')}
                style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: '0.76rem', fontWeight: 700,
                  background: activeMetric === 'requestCount' ? 'var(--accent-primary)' : 'transparent',
                  color: activeMetric === 'requestCount' ? '#FFF' : 'var(--text-muted)',
                  border: 'none', cursor: 'pointer',
                }}
              >
                Requests
              </button>
            </div>

            {/* Timeframe selector */}
            <div style={{ display: 'flex', background: 'var(--bg-element)', borderRadius: 8, padding: 3, border: '1px solid var(--border)' }}>
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setTimeRange(d)}
                  style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: '0.76rem', fontWeight: 700,
                    background: timeRange === d ? 'var(--bg-surface)' : 'transparent',
                    color: timeRange === d ? 'var(--text-primary)' : 'var(--text-muted)',
                    border: timeRange === d ? '1px solid var(--border)' : 'none',
                    cursor: 'pointer',
                  }}
                >
                  {d}D
                </button>
              ))}
            </div>
          </div>
        </div>

        <TimeSeriesAreaChart
          data={usageAnalytics?.timeline || []}
          activeKey={activeMetric}
          color={activeMetric === 'totalTokens' ? '#3DC5A1' : '#1B6EF3'}
          label={activeMetric === 'totalTokens' ? 'Total Tokens' : 'AI Requests'}
        />
      </div>

      {/* ── Breakdown Grids: Providers & Agents ───────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 28 }}>
        
        {/* Provider Breakdown */}
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 16, padding: '22px 24px', boxShadow: 'var(--shadow-card)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <PieChart size={17} style={{ color: 'var(--accent-primary)' }} />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Usage by AI Provider
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {(usageAnalytics?.byProvider?.length > 0 ? usageAnalytics.byProvider : [
              { company: 'google', totalTokens: totals.totalTokens * 0.45 || 1000, requestCount: 12 },
              { company: 'mistral', totalTokens: totals.totalTokens * 0.25 || 600, requestCount: 8 },
              { company: 'openai', totalTokens: totals.totalTokens * 0.20 || 400, requestCount: 5 },
              { company: 'cohere', totalTokens: totals.totalTokens * 0.10 || 200, requestCount: 2 },
            ]).map((prov, i) => {
              const totalAll = usageAnalytics?.byProvider?.reduce((acc, p) => acc + (p.totalTokens || 0), 0) || 1;
              const pct = Math.round(((prov.totalTokens || 0) / totalAll) * 100) || 25;
              const color = ['#3DC5A1', '#1B6EF3', '#F59E0B', '#C084FC'][i % 4];

              return (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 5 }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                      {prov.company}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {(prov.totalTokens || 0).toLocaleString()} tokens ({pct}%)
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-element)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Agent Breakdown */}
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 16, padding: '22px 24px', boxShadow: 'var(--shadow-card)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <BarChart3 size={17} style={{ color: 'var(--brand-primary)' }} />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Usage by Agent Architecture
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {(usageAnalytics?.byAgent?.length > 0 ? usageAnalytics.byAgent : [
              { agentType: 'codingAgent', totalTokens: totals.totalTokens * 0.60 || 1200, requestCount: 15 },
              { agentType: 'appAgent',    totalTokens: totals.totalTokens * 0.25 || 500,  requestCount: 6 },
              { agentType: 'copilot',     totalTokens: totals.totalTokens * 0.15 || 300,  requestCount: 9 },
            ]).map((agent, i) => {
              const totalAll = usageAnalytics?.byAgent?.reduce((acc, a) => acc + (a.totalTokens || 0), 0) || 1;
              const pct = Math.round(((agent.totalTokens || 0) / totalAll) * 100) || 33;
              const color = ['#3DC5A1', '#FFB800', '#1B6EF3'][i % 3];

              return (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 5 }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                      {agent.agentType.replace(/([A-Z])/g, ' $1')}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {(agent.totalTokens || 0).toLocaleString()} tokens ({pct}%)
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-element)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Provider Token Quotas Section ────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>
          AI Provider Credit Window (5-Hour Slot)
        </h3>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Refills 5 hours after exhaustion
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 28 }}>
        {providerCredits.map((prov, i) => {
          const totalGranted = prov.creditsGranted || windowCreditsTotal;
          const pct = Math.min(100, Math.max(0, Math.round((prov.creditsRemaining / totalGranted) * 100)));
          const gaugeColor = pct > 60 ? 'var(--brand-primary)' : pct > 30 ? 'var(--amber-primary)' : 'var(--red-primary)';

          return (
            <div
              key={i}
              style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 14, padding: '20px 22px', boxShadow: 'var(--shadow-card)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <p style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {prov.company}
                  </p>
                  <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    Active AI Model Provider
                  </p>
                </div>
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <RingGauge percent={pct} color={gaugeColor} size={48} />
                  <span style={{
                    position: 'absolute', fontSize: '0.68rem', fontWeight: 800,
                    color: gaugeColor, fontFamily: 'var(--font-mono)',
                  }}>
                    {pct}%
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <span style={{ fontSize: '1.4rem', fontWeight: 900, fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>
                  {prov.creditsRemaining}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  /{totalGranted} credits
                </span>
              </div>

              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                Consumed:{' '}
                <strong style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  {(prov.totalTokens || 0).toLocaleString()} tokens
                </strong>
              </div>
            </div>
          );
        })}
      </div>


    </div>
  );
}
