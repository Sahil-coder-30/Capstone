import { Link, useLocation } from 'react-router-dom';
import { ArrowUpRight, Menu } from 'lucide-react';
import { usePayments } from '../../features/payments/Hooks/payments.hooks';
import { planByTier } from '../../features/payments/utils/plans';
import { pageTitle } from './navigation';
import './Topbar.scss';

export default function Topbar({ onMenu, user, ideUrl }) {
  const { pathname } = useLocation();
  const { subscription, credit } = usePayments();
  const tier = subscription?.activeTier || credit?.subscription || 'free';

  return (
    <header className="topbar">
      <button type="button" className="topbar__menu" onClick={onMenu} aria-label="Open navigation">
        <Menu size={18} />
      </button>

      <nav className="topbar__crumbs" aria-label="Breadcrumb">
        <span>Billing</span>
        <span aria-hidden="true">/</span>
        <strong>{pageTitle(pathname)}</strong>
      </nav>

      <div className="topbar__right">
        {user && credit && (
          <Link to="/plans" className={`topbar__plan topbar__plan--${tier}`}>
            {planByTier(tier).name} plan
          </Link>
        )}
        <a href={ideUrl} className="topbar__ide">
          Open IDE <ArrowUpRight size={14} />
        </a>
      </div>
    </header>
  );
}
