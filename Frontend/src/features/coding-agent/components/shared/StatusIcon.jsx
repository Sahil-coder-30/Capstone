import { AlertCircle, AlertTriangle, Check, Loader2, Minus, Pause } from 'lucide-react';
import './StatusIcon.scss';

const ICONS = {
  success: Check,
  error: AlertCircle,
  warning: AlertTriangle,
  paused: Pause,
  skipped: Minus,
};

/** One icon per status, used by every list in the panel. */
export default function StatusIcon({ status, size = 12 }) {
  const Icon = ICONS[status];
  return (
    <span className={`orion-status-icon orion-status-icon--${status}`} aria-hidden="true">
      {status === 'running' && <Loader2 size={size} className="animate-spin" />}
      {Icon && <Icon size={size} strokeWidth={status === 'success' ? 3 : 2} />}
      {!Icon && status !== 'running' && <span className="orion-status-icon__dot" />}
    </span>
  );
}
