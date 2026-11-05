import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import './Alert.scss';

const ICONS = { warn: AlertTriangle, bad: XCircle, ok: CheckCircle2, info: Info };

/** Inline message. tone: info | ok | warn | bad */
export default function Alert({ tone = 'info', title, children, action }) {
  const Icon = ICONS[tone] || Info;
  return (
    <div className={`alert alert--${tone}`} role={tone === 'bad' || tone === 'warn' ? 'alert' : 'status'}>
      <Icon size={16} className="alert__icon" aria-hidden="true" />
      <div className="alert__text">
        {title && <strong>{title}</strong>}
        {children && <span>{children}</span>}
      </div>
      {action}
    </div>
  );
}
