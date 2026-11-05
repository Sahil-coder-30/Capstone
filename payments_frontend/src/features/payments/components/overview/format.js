// Formatting helpers for the billing overview page.

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
// Counts use the same grouping as the compact K / M labels next to them.
const plain = new Intl.NumberFormat('en-US');
const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const shortDate = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

export const formatINR = (n) => inr.format(Number(n) || 0);
export const formatCompact = (n) => compact.format(Number(n) || 0);
export const formatNumber = (n) => plain.format(Number(n) || 0);

export const formatDate = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? '—' : dateFmt.format(date);
};

export const formatShortDate = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? '—' : shortDate.format(date);
};

/** "2h 24m", "18m", "now" for a future timestamp. */
export const formatDuration = (ms) => {
  if (ms == null || ms <= 0) return 'now';
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

/** "5 min ago", "3 h ago", "2 d ago". */
export const formatRelative = (d, now = Date.now()) => {
  if (!d) return '';
  const diff = Math.max(0, now - new Date(d).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
};

export const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

/** "nvidia/nemotron-3-ultra-550b-a55b" -> "nemotron-3-ultra-550b-a55b". */
export const shortModel = (id) => (id ? String(id).split('/').pop() : 'unknown model');

/**
 * The backend timeline only has days with usage. Fill every day in the range
 * with zeros so the chart shows real gaps.
 */
export const fillTimeline = (timeline = [], days = 30, now = new Date()) => {
  const byDate = new Map(timeline.map((t) => [t.date, t]));
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    const key = d.toISOString().slice(0, 10);
    const row = byDate.get(key) || {};
    out.push({
      date: key,
      tokens: Number(row.totalTokens) || 0,
      requests: Number(row.requestCount ?? row.totalRequests) || 0,
      credits: Number(row.creditsDeducted ?? row.totalCreditsDeducted) || 0,
    });
  }
  return out;
};
