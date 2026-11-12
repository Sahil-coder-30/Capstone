// Pure helpers that turn API data into dashboard stats.

const DAY = 86400000;

/** Agent ids recorded by Ai_orchestration -> readable names. */
export const AGENT_LABELS = {
  codingAgent: 'Coding agent',
  copilot: 'Copilot',
  title: 'Chat titles',
  appAgent: 'App agent',
  memory: 'Memory agent',
};
export const agentLabel = (id) => AGENT_LABELS[id] || (id ? id.charAt(0).toUpperCase() + id.slice(1) : 'Other');

export const sum = (rows, key) => rows.reduce((a, r) => a + (Number(r[key]) || 0), 0);

/**
 * The backend timeline only has days with usage. Fill every day in the range
 * with zeros so charts show real gaps.
 */
export function fillTimeline(timeline = [], days = 30, now = new Date()) {
  const byDate = new Map(timeline.map((t) => [t.date, t]));
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    const key = d.toISOString().slice(0, 10);
    const row = byDate.get(key) || {};
    out.push({
      date: key,
      tokens: Number(row.totalTokens) || 0,
      prompt: Number(row.promptTokens) || 0,
      completion: Number(row.completionTokens) || 0,
      requests: Number(row.requestCount ?? row.totalRequests) || 0,
      credits: Number(row.creditsDeducted ?? row.totalCreditsDeducted) || 0,
    });
  }
  return out;
}

/** Percent change of the second half of a series vs the first half. */
export function halfDelta(days, key) {
  const half = Math.floor(days.length / 2);
  const prior = sum(days.slice(0, half), key);
  const recent = sum(days.slice(half), key);
  if (prior <= 0) return null;
  return ((recent - prior) / prior) * 100;
}

export function peakDay(days, key) {
  return days.reduce((best, d) => (d[key] > (best?.[key] ?? 0) ? d : best), null);
}

/** Usage by weekday (Mon..Sun) from a filled timeline. */
export function byWeekday(days, key) {
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const totals = names.map((label) => ({ label, value: 0 }));
  for (const d of days) {
    const wd = (new Date(`${d.date}T00:00:00Z`).getUTCDay() + 6) % 7;
    totals[wd].value += d[key];
  }
  return totals;
}

/** Requests by local hour of day from a sample of usage events. */
export function byHour(events) {
  const hours = Array.from({ length: 24 }, (_, h) => ({ label: String(h).padStart(2, '0'), value: 0 }));
  for (const e of events) {
    const t = new Date(e.createdAt);
    if (!Number.isNaN(t.getTime())) hours[t.getHours()].value += 1;
  }
  return hours;
}

/** Group a sample of events by a key, summing tokens and counting requests. */
export function groupEvents(events, key, labelFn = (v) => v) {
  const map = new Map();
  for (const e of events) {
    const id = e[key] || 'unknown';
    const row = map.get(id) || { id, label: labelFn(id), tokens: 0, requests: 0, credits: 0, lastAt: 0 };
    row.tokens += Number(e.totalTokens) || 0;
    row.requests += 1;
    row.credits += Number(e.creditsDeducted) || 0;
    row.lastAt = Math.max(row.lastAt, new Date(e.createdAt).getTime() || 0);
    map.set(id, row);
  }
  return [...map.values()].sort((a, b) => b.tokens - a.tokens);
}

const isPaid = (t) => ['success', 'captured', 'paid'].includes(String(t.status || '').toLowerCase());
const isFailed = (t) => String(t.status || '').toLowerCase() === 'failed';
export const txAmount = (t) => Number(t.amountINR ?? (Number(t.amountPaise) || 0) / 100) || 0;
export const txStatus = (t) => (isPaid(t) ? 'paid' : isFailed(t) ? 'failed' : 'pending');

/** Readable line item for a transaction. */
export const describeTx = (t) => {
  const tier = t.subscription?.plan || t.metadata?.newTier || 'plan';
  return t.metadata?.packageLabel || t.description || `${tier.charAt(0).toUpperCase()}${tier.slice(1)} plan`;
};

/** Spend per calendar month for the last `months` months (oldest first). */
export function spendByMonth(transactions, months = 6, now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-IN', { month: 'short' });
  const out = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: fmt.format(d), value: 0, count: 0 });
  }
  const index = new Map(out.map((m, i) => [m.key, i]));
  for (const t of transactions) {
    if (!isPaid(t)) continue;
    const d = new Date(t.createdAt);
    const i = index.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (i != null) {
      out[i].value += txAmount(t);
      out[i].count += 1;
    }
  }
  return out;
}

export function paymentStats(transactions) {
  const paid = transactions.filter(isPaid);
  const failed = transactions.filter(isFailed);
  const total = sum(paid.map((t) => ({ v: txAmount(t) })), 'v');
  const dates = paid.map((t) => new Date(t.createdAt).getTime()).filter(Boolean);
  return {
    paidCount: paid.length,
    failedCount: failed.length,
    attempts: transactions.length,
    successRate: transactions.length ? (paid.length / transactions.length) * 100 : null,
    totalPaid: total,
    average: paid.length ? total / paid.length : 0,
    firstPaidAt: dates.length ? Math.min(...dates) : null,
    lastPaidAt: dates.length ? Math.max(...dates) : null,
  };
}

/**
 * Credit refill line. The balance locks when it drops below the plan's lower
 * limit and comes back in full 5 hours later (Payments/services/credit.service.js).
 */
export function refillText({ left, total, refillAt, now, formatDuration }) {
  if (refillAt && refillAt > now) return `Refills in ${formatDuration(refillAt - now)}`;
  if (left >= total) return 'Full balance';
  return 'Refills 5 h after it runs low';
}

/** Pick a meter tone from what is left of a budget. */
export function remainingTone(left, total, floor = 0) {
  if (total <= 0) return 'neutral';
  if (left <= floor) return 'bad';
  if (left / total < 0.25) return 'warn';
  return 'brand';
}

/** Day N of a plan period and its length in days. */
export function cycleProgress(slot, now = Date.now()) {
  if (!slot?.validFrom || !slot?.validUntil) return null;
  const start = new Date(slot.validFrom).getTime();
  const end = new Date(slot.validUntil).getTime();
  const length = Math.max(1, Math.round((end - start) / DAY));
  const day = Math.min(length, Math.max(1, Math.ceil((now - start) / DAY)));
  return { day, length, start, end };
}
