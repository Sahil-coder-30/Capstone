import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ExternalLink, LogOut, Moon, Sun, ChevronsUpDown } from 'lucide-react';
import TakshaIcon from '../TakshaIcon';
import Meter from '../../features/payments/components/ui/Meter';
import { Skeleton } from '../../features/payments/components/ui/Skeleton';
import { usePayments } from '../../features/payments/Hooks/payments.hooks';
import { formatDuration, formatNumber } from '../../features/payments/utils/format';
import { refillText, remainingTone } from '../../features/payments/utils/stats';
import { planByTier } from '../../features/payments/utils/plans';
import { NAV_GROUPS } from './navigation';
import './Sidebar.scss';

const initials = (user) => (user?.name || user?.email || '?')
  .split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('');

function CreditWidget({ credit, now }) {
  if (!credit) {
    return (
      <div className="sidebar__credits" aria-busy="true" aria-label="Loading credits">
        <div className="sidebar__credits-row"><Skeleton w={60} h={10} /><Skeleton w={44} h={12} /></div>
        <Skeleton h={4} />
        <Skeleton w={90} h={9} />
      </div>
    );
  }
  const total = credit?.windowCreditsTotal ?? credit?.tierConfig?.windowCredits ?? 0;
  const left = credit?.windowCreditsRemaining ?? credit?.credits ?? 0;
  const refillAt = credit?.windowRefillAt ? new Date(credit.windowRefillAt).getTime() : null;
  return (
    <NavLink to="/" className="sidebar__credits">
      <div className="sidebar__credits-row">
        <span>AI credits</span>
        <strong>{formatNumber(left)}<span> / {formatNumber(total)}</span></strong>
      </div>
      <Meter value={left} max={total} tone={remainingTone(left, total, 5)} size="sm" label="AI credits left" />
      <span className="sidebar__credits-foot">
        {refillText({ left, total, refillAt, now, formatDuration })}
      </span>
    </NavLink>
  );
}

export default function Sidebar({ user, creditFailed, open, onClose, onSignOut, ideUrl }) {
  const { credit, subscription, theme, toggleTheme } = usePayments();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const menuRef = useRef(null);
  const tier = subscription?.activeTier || credit?.subscription || 'free';

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (e) => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const isActive = (item) => (item.end ? pathname === item.to : pathname.startsWith(item.to))
    || (item.match || []).some((m) => pathname.startsWith(m));

  return (
    <>
      <div className={`sidebar-scrim${open ? ' is-open' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`sidebar${open ? ' is-open' : ''}`} aria-label="Main navigation">
        <div className="sidebar__brand">
          <TakshaIcon size={26} />
          <div className="sidebar__brand-text">
            <strong>Taksha</strong>
            <span>Billing</span>
          </div>
        </div>

        <nav className="sidebar__nav">
          {NAV_GROUPS.map((group) => (
            <div className="sidebar__group" key={group.label || 'main'}>
              {group.label && <span className="sidebar__group-label">{group.label}</span>}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onClose}
                  className={() => `sidebar__link${isActive(item) ? ' is-active' : ''}`}
                  aria-current={isActive(item) ? 'page' : undefined}
                >
                  <item.icon size={16} aria-hidden="true" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar__bottom">
          {user && !(creditFailed && !credit) && <CreditWidget credit={credit} now={now} />}

          <div className="sidebar__theme" role="group" aria-label="Theme">
            <button type="button" className={theme === 'light' ? 'is-active' : ''} aria-pressed={theme === 'light'} onClick={() => theme !== 'light' && toggleTheme()}>
              <Sun size={14} /> Light
            </button>
            <button type="button" className={theme !== 'light' ? 'is-active' : ''} aria-pressed={theme !== 'light'} onClick={() => theme === 'light' && toggleTheme()}>
              <Moon size={14} /> Dark
            </button>
          </div>

          {user ? (
            <div className="sidebar__user" ref={menuRef}>
              <button type="button" className="sidebar__user-btn" onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen}>
                <span className="sidebar__avatar">{initials(user)}</span>
                <span className="sidebar__user-text">
                  <strong>{user.name || 'Account'}</strong>
                  <span>{credit ? `${planByTier(tier).name} plan` : user.email}</span>
                </span>
                <ChevronsUpDown size={14} aria-hidden="true" />
              </button>
              {menuOpen && (
                <div className="sidebar__menu" role="menu">
                  <div className="sidebar__menu-email">{user.email}</div>
                  <a href={ideUrl} role="menuitem"><ExternalLink size={14} /> Open IDE</a>
                  <button type="button" role="menuitem" onClick={onSignOut}><LogOut size={14} /> Sign out</button>
                </div>
              )}
            </div>
          ) : (
            <a href={ideUrl} className="sidebar__signin">Sign in</a>
          )}
        </div>
      </aside>
    </>
  );
}
