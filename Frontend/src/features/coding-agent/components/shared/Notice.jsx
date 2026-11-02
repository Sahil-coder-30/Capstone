import { AlertCircle, AlertTriangle, WifiOff } from 'lucide-react';
import './Notice.scss';

const ICONS = { error: AlertCircle, warning: AlertTriangle, offline: WifiOff };

/** Inline message for errors, warnings and the offline state. */
export default function Notice({ variant = 'error', children }) {
  const Icon = ICONS[variant];
  return (
    <div className={`orion-notice orion-notice--${variant}`} role={variant === 'error' ? 'alert' : undefined}>
      <Icon size={13} className="orion-notice__icon" aria-hidden="true" />
      <span className="orion-notice__text">{children}</span>
    </div>
  );
}
