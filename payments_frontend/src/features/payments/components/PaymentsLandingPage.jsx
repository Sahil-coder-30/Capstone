import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, ArrowUpRight, CalendarClock, Check, CheckCircle2, Clock, CreditCard,
  Download, AlertTriangle, RefreshCw, XCircle, LogIn,
} from 'lucide-react';
import { usePayments } from '../Hooks/payments.hooks';
import UsageChart from './overview/UsageChart';
import { PLANS, TIER_RANK, planByTier } from './overview/plans';
import {
  capitalize, fillTimeline, formatCompact, formatDate, formatDuration, formatINR,
  formatNumber, formatRelative, formatShortDate, shortModel,
} from './overview/format';
import './overview/BillingOverview.scss';

const RANGES = [7, 30, 90];
const METRICS = [
  { id: 'tokens', label: 'Tokens' },
  { id: 'requests', label: 'Requests' },
  { id: 'credits', label: 'Credits' },
];
const DAY_MS = 86400000;

// ── Small building blocks ─────────────────────────────────────────────────────

function Panel({ title, description, action, children, className = '' }) {
  return (
    <section className={`bo-panel ${className}`}>
      {(title || action) && (
        <header className="bo-panel__head">
          <div>
            <h2 className="bo-panel__title">{title}</h2>
            {description && <p className="bo-panel__desc">{description}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

function Meter({ value, max, tone = 'brand', label }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      className="bo-meter"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <div className={`bo-meter__fill bo-meter__fill--${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatusPill({ status }) {
  const s = String(status || '').toLowerCase();
  if (s === 'success' || s === 'captured' || s === 'paid') {
    return <span className="bo-pill bo-pill--ok"><CheckCircle2 size={12} /> Paid</span>;
  }
  if (s === 'failed') {
    return <span className="bo-pill bo-pill--bad"><XCircle size={12} /> Failed</span>;
  }
  return <span className="bo-pill bo-pill--warn"><Clock size={12} /> {capitalize(s) || 'Pending'}</span>;
}

function Segmented({ options, value, onChange, label }) {
  return (
    <div className="bo-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`bo-seg__btn${value === o.id ? ' is-active' : ''}`}
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Plans (shown to everyone) ─────────────────────────────────────────────────

function PlansSection({ currentTier, signedIn, onBuy }) {
  return (
    <section id="plans" className="bo-plans">
      <div className="bo-section-head">
        <div>
          <h2 className="bo-section-head__title">Plans</h2>
          <p className="bo-section-head__desc">
            Each paid plan runs for 30 days. Buying while a plan is active queues the new one, so no days are lost.
          </p>
        </div>
        <Link to="/compare" className="bo-link">Compare all features <ArrowRight size={14} /></Link>
      </div>

      <div className="bo-plans__grid">
        {PLANS.map((plan) => {
          const isCurrent = signedIn && plan.tier === currentTier;
          const isLower = signedIn && TIER_RANK[plan.tier] < TIER_RANK[currentTier];
          let cta;
          if (plan.tier === 'free') {
            cta = <button type="button" className="bo-btn bo-btn--ghost bo-btn--block" disabled>{isCurrent ? 'Current plan' : 'Included'}</button>;
          } else if (isCurrent) {
            cta = <button type="button" className="bo-btn bo-btn--secondary bo-btn--block" onClick={() => onBuy(plan.id)}>Extend 30 days</button>;
          } else {
            cta = (
              <button
                type="button"
                className={`bo-btn bo-btn--block ${plan.recommended && !isLower ? 'bo-btn--primary' : 'bo-btn--secondary'}`}
                onClick={() => onBuy(plan.id)}
              >
                {isLower ? `Queue ${plan.name}` : `Get ${plan.name}`}
              </button>
            );
          }

          return (
            <article key={plan.id} className={`bo-plan${isCurrent ? ' is-current' : ''}`}>
              <div className="bo-plan__top">
                <h3 className="bo-plan__name">{plan.name}</h3>
                {isCurrent && <span className="bo-tag bo-tag--brand">Current</span>}
                {!isCurrent && plan.recommended && <span className="bo-tag">Most chosen</span>}
              </div>
              <p className="bo-plan__summary">{plan.summary}</p>
              <div className="bo-plan__price">
                <span className="bo-plan__amount">{formatINR(plan.priceINR)}</span>
                <span className="bo-plan__period">{plan.priceINR ? '/ 30 days' : 'forever'}</span>
              </div>
              <dl className="bo-plan__limits">
                {plan.limits.map(([k, v]) => (
                  <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
                ))}
              </dl>
              <ul className="bo-plan__features">
                {plan.features.map((f) => <li key={f}><Check size={14} /> {f}</li>)}
              </ul>
              {cta}
            </article>
          );
        })}
      </div>
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PaymentsLandingPage({ user, authChecked = true }) {
  const navigate = useNavigate();
  const {
    subscription, credit, usageAnalytics, dashboardOverview, transactions, transactionsSummary,
    loadDashboardOverview, loadTransactions, loadUsageAnalytics, selectPlan,
  } = usePayments();

  const [range, setRange] = useState(30);
  const [metric, setMetric] = useState('tokens');
  const [status, setStatus] = useState('idle'); // idle (first load) | loading | ready | error
  const [updatedAt, setUpdatedAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const signedIn = Boolean(user);

  const fetchAll = useCallback(() => Promise.all([
    loadDashboardOverview(),
    loadTransactions({ page: 1, limit: 6 }),
  ]), [loadDashboardOverview, loadTransactions]);

  const applyResult = ([overview]) => {
    setStatus(overview ? 'ready' : 'error');
    setUpdatedAt(Date.now());
  };

  const refresh = () => {
    setStatus('loading');
    fetchAll().then(applyResult);
  };

  useEffect(() => {
    if (!signedIn) return undefined;
    let active = true;
    fetchAll().then((res) => { if (active) applyResult(res); });
    return () => { active = false; };
  }, [signedIn, fetchAll]);

  // The overview already carries 30 days; other ranges load on demand.
  useEffect(() => {
    if (signedIn && range !== 30) loadUsageAnalytics(range);
  }, [signedIn, range, loadUsageAnalytics]);

  // Keep the refill countdown fresh.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const handleRange = (days) => {
    setRange(days);
    if (days === 30) loadUsageAnalytics(30);
  };

  const handleBuy = (planId) => {
    selectPlan(planId);
    navigate(`/checkout/${planId}`);
  };

  // ── Derived numbers ─────────────────────────────────────────────────────────
  const tier = subscription?.activeTier || credit?.subscription || 'free';
  const plan = planByTier(tier);
  const activeSlot = subscription?.activeSlot || null;
  const queued = subscription?.reservedSlots || [];
  // Backend limits win; the plan catalogue fills gaps when the API is down.
  const tierConfig = { ...plan.caps, ...(credit?.tierConfig || {}) };

  const windowTotal = credit?.windowCreditsTotal ?? tierConfig.windowCredits ?? 0;
  const windowLeft = credit?.windowCreditsRemaining ?? credit?.credits ?? 0;
  const windowUsed = Math.max(0, windowTotal - windowLeft);
  const refillAt = credit?.windowRefillAt ? new Date(credit.windowRefillAt).getTime() : null;
  const lowerLimit = tierConfig.creditLowerLimit ?? 5;
  const creditTone = windowLeft <= lowerLimit ? 'bad' : windowLeft / Math.max(1, windowTotal) < 0.25 ? 'warn' : 'brand';

  const days = useMemo(
    () => fillTimeline(usageAnalytics?.timeline || [], range),
    [usageAnalytics, range],
  );
  const totals = usageAnalytics?.totals || {};
  const periodSum = days.reduce((a, d) => a + d[metric], 0);
  const peak = days.reduce((best, d) => (d[metric] > (best?.[metric] ?? -1) ? d : best), null);

  // Last half of the range vs the half before it.
  const half = Math.floor(days.length / 2);
  const recentTokens = days.slice(half).reduce((a, d) => a + d.tokens, 0);
  const priorTokens = days.slice(0, half).reduce((a, d) => a + d.tokens, 0);
  const tokenDelta = priorTokens > 0 ? ((recentTokens - priorTokens) / priorTokens) * 100 : null;

  const cycleStart = activeSlot?.validFrom ? new Date(activeSlot.validFrom).getTime() : null;
  const cycleEnd = activeSlot?.validUntil ? new Date(activeSlot.validUntil).getTime() : null;
  const cycleDays = cycleStart && cycleEnd ? Math.max(1, Math.round((cycleEnd - cycleStart) / DAY_MS)) : 30;
  const cycleDay = cycleStart ? Math.min(cycleDays, Math.max(1, Math.ceil((now - cycleStart) / DAY_MS))) : 0;

  const monthlyCap = tierConfig.monthlyTokenCap ?? null;
  const dailyCap = tierConfig.dailyTokenCap ?? null;

  const byAgent = (usageAnalytics?.byAgent || []).slice(0, 6);
  const agentMax = Math.max(1, ...byAgent.map((a) => a.totalTokens || 0));
  const promptTokens = Number(totals.promptTokens) || 0;
  const completionTokens = Number(totals.completionTokens) || 0;
  const mixTotal = promptTokens + completionTokens;
  const promptPct = mixTotal ? Math.round((promptTokens / mixTotal) * 100) : 0;

  const recentEvents = dashboardOverview?.recentEvents || [];
  const spent = transactionsSummary?.totalSpentINR ?? 0;
  const paidCount = transactionsSummary?.successCount ?? 0;

  const ideUrl = import.meta.env.VITE_MAIN_APP_URL || 'http://localhost:5173';
  const loading = (status === 'idle' || status === 'loading') && !dashboardOverview;

  // ── Signed-out view ─────────────────────────────────────────────────────────
  if (!signedIn) {
    return (
      <div className="bo">
        <div className="bo__inner">
          <header className="bo-pagehead">
            <div>
              <h1 className="bo-pagehead__title">Billing</h1>
              <p className="bo-pagehead__desc">Plans, AI credits and payments for Taksha CodeSpace.</p>
            </div>
          </header>

          {authChecked && (
            <div className="bo-signin">
              <div className="bo-signin__icon"><LogIn size={18} /></div>
              <div className="bo-signin__text">
                <strong>Sign in to see your billing</strong>
                <span>Your plan, credit balance, usage and payment history show up here after you sign in.</span>
              </div>
              <a className="bo-btn bo-btn--primary" href={ideUrl}>Sign in</a>
            </div>
          )}

          <PlansSection currentTier="free" signedIn={false} onBuy={handleBuy} />
          <p className="bo-footnote">Payments are processed by Razorpay. Prices are in Indian rupees. Plans do not renew on their own.</p>
        </div>
      </div>
    );
  }

  // ── Signed-in dashboard ─────────────────────────────────────────────────────
  return (
    <div className="bo">
      <div className="bo__inner">
        <header className="bo-pagehead">
          <div>
            <h1 className="bo-pagehead__title">Billing overview</h1>
            <p className="bo-pagehead__desc">
              {user?.name ? `${user.name} · ` : ''}{user?.email}
            </p>
          </div>
          <div className="bo-pagehead__actions">
            <button type="button" className="bo-btn bo-btn--ghost" onClick={refresh} disabled={status === 'loading'} aria-label="Refresh data">
              <RefreshCw size={14} className={status === 'loading' ? 'bo-spin' : ''} />
              <span className="bo-hide-sm">{updatedAt ? `Updated ${formatRelative(updatedAt, now)}` : 'Refresh'}</span>
            </button>
            <Link to="/invoices" className="bo-btn bo-btn--secondary"><Download size={14} /> Invoices</Link>
            <a href="#plans" className="bo-btn bo-btn--primary">Change plan</a>
          </div>
        </header>

        {status === 'error' && (
          <div className="bo-alert" role="alert">
            <AlertTriangle size={16} />
            <span>We could not load your latest billing data. The numbers below may be out of date.</span>
            <button type="button" className="bo-link" onClick={refresh}>Try again</button>
          </div>
        )}

        {/* ── KPI tiles ───────────────────────────────────────────────────── */}
        <div className={`bo-kpis${loading ? ' is-loading' : ''}`}>
          <div className="bo-kpi">
            <span className="bo-kpi__label">Current plan</span>
            <span className="bo-kpi__value">{plan.name}</span>
            <span className="bo-kpi__foot">
              {activeSlot
                ? <>Ends {formatDate(activeSlot.validUntil)} · {activeSlot.daysRemaining} days left</>
                : 'Free forever'}
            </span>
          </div>

          <div className="bo-kpi">
            <span className="bo-kpi__label">AI credits available</span>
            <span className="bo-kpi__value">
              {formatNumber(windowLeft)}<span className="bo-kpi__unit"> / {formatNumber(windowTotal)}</span>
            </span>
            <Meter value={windowLeft} max={windowTotal} tone={creditTone} label="Credits left in this window" />
            <span className="bo-kpi__foot">
              {refillAt && refillAt > now ? `Refills to ${windowTotal} in ${formatDuration(refillAt - now)}` : 'Full window available'}
            </span>
          </div>

          <div className="bo-kpi">
            <span className="bo-kpi__label">Tokens · last {range} days</span>
            <span className="bo-kpi__value">{formatCompact(totals.totalTokens)}</span>
            <span className="bo-kpi__foot">
              {tokenDelta == null
                ? `${formatNumber(totals.totalRequests)} requests`
                : (
                  <>
                    <span className={tokenDelta >= 0 ? 'bo-delta bo-delta--up' : 'bo-delta bo-delta--down'}>
                      {tokenDelta >= 0 ? '+' : ''}{tokenDelta.toFixed(0)}%
                    </span>{' '}
                    vs previous {range - half} days
                  </>
                )}
            </span>
          </div>

          <div className="bo-kpi">
            <span className="bo-kpi__label">Total spent</span>
            <span className="bo-kpi__value">{formatINR(spent)}</span>
            <span className="bo-kpi__foot">{paidCount} successful {paidCount === 1 ? 'payment' : 'payments'}</span>
          </div>
        </div>

        {/* ── Usage chart + plan details ──────────────────────────────────── */}
        <div className="bo-grid bo-grid--main">
          <Panel
            title="Usage"
            description={`Daily ${metric} across all agents`}
            action={(
              <div className="bo-panel__controls">
                <Segmented label="Metric" options={METRICS} value={metric} onChange={setMetric} />
                <Segmented
                  label="Time range"
                  options={RANGES.map((r) => ({ id: r, label: `${r}D` }))}
                  value={range}
                  onChange={handleRange}
                />
              </div>
            )}
          >
            <div className="bo-usage-stats">
              <div><span>Total</span><strong>{formatNumber(periodSum)}</strong></div>
              <div><span>Daily average</span><strong>{formatNumber(Math.round(periodSum / Math.max(1, days.length)))}</strong></div>
              <div><span>Peak day</span><strong>{peak && peak[metric] > 0 ? `${formatNumber(peak[metric])} · ${formatShortDate(peak.date)}` : '—'}</strong></div>
            </div>
            <UsageChart data={days} metric={metric} />
          </Panel>

          <Panel
            title="Subscription"
            action={<span className={`bo-tag ${activeSlot ? 'bo-tag--ok' : ''}`}>{activeSlot ? 'Active' : 'Free'}</span>}
          >
            <div className="bo-sub">
              <div className="bo-sub__plan">
                <span className="bo-sub__name">Taksha AI {plan.name}</span>
                <span className="bo-sub__price">{plan.priceINR ? <>{formatINR(plan.priceINR)} <small>/ 30 days</small></> : 'No charge'}</span>
              </div>

              {activeSlot && (
                <div className="bo-sub__cycle">
                  <div className="bo-sub__cycle-row">
                    <span>Day {cycleDay} of {cycleDays}</span>
                    <span>{activeSlot.daysRemaining} days left</span>
                  </div>
                  <Meter value={cycleDay} max={cycleDays} tone="neutral" label="Plan period elapsed" />
                  <div className="bo-sub__cycle-row bo-sub__cycle-row--muted">
                    <span>{formatDate(activeSlot.validFrom)}</span>
                    <span>{formatDate(activeSlot.validUntil)}</span>
                  </div>
                </div>
              )}

              <dl className="bo-kv">
                <div><dt>Credits per 5 hours</dt><dd>{formatNumber(windowTotal)}</dd></div>
                <div>
                  <dt>Token limit</dt>
                  <dd>{monthlyCap ? `${formatCompact(monthlyCap)} / month` : dailyCap ? `${formatCompact(dailyCap)} / day` : 'No cap'}</dd>
                </div>
                <div><dt>Requests per minute</dt><dd>{tierConfig.requestsPerMinute ?? '—'}</dd></div>
              </dl>

              <div className="bo-sub__queue">
                <span className="bo-sub__queue-title"><CalendarClock size={14} /> Up next</span>
                {queued.length === 0 ? (
                  <p className="bo-muted">
                    {activeSlot ? `Nothing queued. You move to Free on ${formatDate(activeSlot.validUntil)}.` : 'No paid plan queued.'}
                  </p>
                ) : (
                  <ul className="bo-sub__queue-list">
                    {queued.map((q) => (
                      <li key={q.id}>
                        <span className="bo-sub__queue-name">{capitalize(q.tier)}</span>
                        <span className="bo-muted">{formatShortDate(q.validFrom)} – {formatDate(q.validUntil)}</span>
                        <span className="bo-sub__queue-days">{q.daysRemaining} days</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <a href="#plans" className="bo-btn bo-btn--secondary bo-btn--block">
                {tier === 'max' ? 'Extend plan' : 'Upgrade plan'} <ArrowUpRight size={14} />
              </a>
            </div>
          </Panel>
        </div>

        {/* ── Breakdown row ───────────────────────────────────────────────── */}
        <div className="bo-grid bo-grid--three">
          <Panel title="Credit window" description="Credits refill every 5 hours">
            <div className="bo-window">
              <div className="bo-window__big">
                <strong>{formatNumber(windowLeft)}</strong>
                <span>of {formatNumber(windowTotal)} left</span>
              </div>
              <Meter value={windowLeft} max={windowTotal} tone={creditTone} label="Credits left in this window" />
              <dl className="bo-kv">
                <div><dt>Used this window</dt><dd>{formatNumber(windowUsed)}</dd></div>
                <div><dt>Next refill</dt><dd>{refillAt && refillAt > now ? `in ${formatDuration(refillAt - now)}` : '—'}</dd></div>
                <div><dt>1 credit</dt><dd>{formatNumber(credit?.tokensPerCredit || 1000)} tokens</dd></div>
              </dl>
              <p className="bo-muted bo-small">AI requests pause when fewer than {lowerLimit} credits are left.</p>
            </div>
          </Panel>

          <Panel title="Usage by agent" description={`Tokens · last ${range} days`}>
            {byAgent.length === 0 ? (
              <p className="bo-empty">No agent usage yet.</p>
            ) : (
              <ul className="bo-bars">
                {byAgent.map((a) => (
                  <li key={a.agentType}>
                    <div className="bo-bars__row">
                      <span className="bo-bars__name">{capitalize(a.agentType || 'other')}</span>
                      <span className="bo-bars__value">{formatCompact(a.totalTokens)}</span>
                    </div>
                    <div className="bo-bars__track">
                      <div className="bo-bars__fill" style={{ width: `${((a.totalTokens || 0) / agentMax) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Token mix" description="Input sent vs output generated">
            {mixTotal === 0 ? (
              <p className="bo-empty">No tokens used yet.</p>
            ) : (
              <div className="bo-mix">
                <div className="bo-mix__bar" role="img" aria-label={`Prompt ${promptPct}%, completion ${100 - promptPct}%`}>
                  <div className="bo-mix__seg bo-mix__seg--a" style={{ width: `${promptPct}%` }} />
                  <div className="bo-mix__seg bo-mix__seg--b" style={{ width: `${100 - promptPct}%` }} />
                </div>
                <ul className="bo-mix__legend">
                  <li>
                    <span className="bo-swatch bo-swatch--a" />
                    <span className="bo-mix__name">Prompt</span>
                    <span className="bo-mix__pct">{promptPct}%</span>
                    <span className="bo-mix__val">{formatCompact(promptTokens)}</span>
                  </li>
                  <li>
                    <span className="bo-swatch bo-swatch--b" />
                    <span className="bo-mix__name">Completion</span>
                    <span className="bo-mix__pct">{100 - promptPct}%</span>
                    <span className="bo-mix__val">{formatCompact(completionTokens)}</span>
                  </li>
                </ul>
                <dl className="bo-kv">
                  <div><dt>Requests</dt><dd>{formatNumber(totals.totalRequests)}</dd></div>
                  <div><dt>Avg tokens / request</dt><dd>{formatNumber(Math.round((totals.totalTokens || 0) / Math.max(1, totals.totalRequests || 0)))}</dd></div>
                  <div><dt>Provider</dt><dd>{(usageAnalytics?.byProvider || []).map((p) => capitalize(p.company)).join(', ') || 'NVIDIA'}</dd></div>
                </dl>
              </div>
            )}
          </Panel>
        </div>

        {/* ── Payments + activity ─────────────────────────────────────────── */}
        <div className="bo-grid bo-grid--main">
          <Panel
            title="Recent payments"
            action={<Link to="/invoices" className="bo-link">View all <ArrowRight size={14} /></Link>}
            className="bo-panel--flush"
          >
            {transactions.length === 0 ? (
              <div className="bo-empty bo-empty--pad">
                <CreditCard size={18} />
                <span>No payments yet. Your receipts will appear here.</span>
              </div>
            ) : (
              <div className="bo-table-wrap">
                <table className="bo-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th className="bo-hide-sm">Invoice</th>
                      <th>Status</th>
                      <th className="bo-num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.slice(0, 6).map((t) => (
                      <tr key={t.id || t._id}>
                        <td className="bo-nowrap">{formatDate(t.createdAt)}</td>
                        <td>
                          <span className="bo-table__main">{t.description || `${capitalize(t.subscription?.plan || t.metadata?.plan || 'Plan')} plan`}</span>
                          <span className="bo-table__sub">{t.razorpay?.paymentId || t.razorpay?.orderId || '—'}</span>
                        </td>
                        <td className="bo-hide-sm bo-mono">{t.invoiceNumber || '—'}</td>
                        <td><StatusPill status={t.status} /></td>
                        <td className="bo-num">{formatINR(t.amountINR ?? (t.amountPaise || 0) / 100)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel
            title="Recent AI activity"
            action={<Link to="/requests" className="bo-link">All logs <ArrowRight size={14} /></Link>}
          >
            {recentEvents.length === 0 ? (
              <p className="bo-empty">No AI requests yet.</p>
            ) : (
              <ul className="bo-activity">
                {recentEvents.slice(0, 5).map((e) => (
                  <li key={e.id || e._id}>
                    <div className="bo-activity__main">
                      <span className="bo-activity__agent">{capitalize(e.agentType || 'request')}</span>
                      <span className="bo-activity__model">{shortModel(e.modelId)}</span>
                    </div>
                    <div className="bo-activity__meta">
                      <span>{formatNumber(e.totalTokens)} tokens</span>
                      <span className="bo-muted">{formatRelative(e.createdAt, now)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <PlansSection currentTier={tier} signedIn onBuy={handleBuy} />
        <p className="bo-footnote">Payments are processed by Razorpay. Prices are in Indian rupees. Plans do not renew on their own.</p>
      </div>
    </div>
  );
}
