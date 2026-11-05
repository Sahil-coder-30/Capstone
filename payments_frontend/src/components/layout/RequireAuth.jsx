import { useOutletContext } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { KpiSkeleton, PanelSkeleton } from '../../features/payments/components/ui/Skeleton';
import Button from '../../features/payments/components/ui/Button';
import './RequireAuth.scss';

/** Shows the page only for a signed-in user; skeleton while the session check runs. */
export default function RequireAuth({ children }) {
  const { user, authChecked, ideUrl } = useOutletContext();

  if (!authChecked) {
    return (
      <div className="auth-wait">
        <KpiSkeleton count={4} />
        <div className="grid grid--2-1">
          <PanelSkeleton />
          <PanelSkeleton variant="list" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-gate">
        <div className="auth-gate__card">
          <div className="auth-gate__icon"><LogIn size={20} /></div>
          <h1>Sign in to see your billing</h1>
          <p>Your plan, AI credits, usage and invoices show up here once you are signed in to Taksha CodeSpace.</p>
          <div className="auth-gate__actions">
            <Button variant="primary" href={ideUrl}>Sign in</Button>
            <Button to="/plans">See plans</Button>
          </div>
        </div>
      </div>
    );
  }

  return children;
}
