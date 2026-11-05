import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import './Badge.scss';

/** Neutral or tinted label. tone: ok | warn | bad | brand */
export function Tag({ tone, children }) {
  return <span className={`tag${tone ? ` tag--${tone}` : ''}`}>{children}</span>;
}

/** Payment status with icon + word, never color alone. status: paid | failed | pending */
export function StatusPill({ status }) {
  if (status === 'paid') return <span className="pill pill--ok"><CheckCircle2 size={12} /> Paid</span>;
  if (status === 'failed') return <span className="pill pill--bad"><XCircle size={12} /> Failed</span>;
  return <span className="pill pill--warn"><Clock size={12} /> Pending</span>;
}
