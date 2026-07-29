import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import { TakshaIcon } from './BrandLogo';
import ThemeToggle from './ThemeToggle';
import { usePayments } from '../features/payments/Hooks/payments.hooks';

export default function Header({ user }) {
  const { credit } = usePayments();
  const currentSubscription = credit?.subscription || 'free';

  const ideUrl = window.location.origin.replace(/:\d+$/, ':5173');

  return (
    <header className="google-nav-header" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 28px',
      background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      backdropFilter: 'blur(12px)'
    }}>
      <div className="nav-brand-group" style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        <Link to="/" className="nav-brand-logo" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
          <TakshaIcon size={26} />
          <span style={{ fontSize: '1.15rem', fontWeight: '700', fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>
            Taksha CodeSpace
          </span>
          <span style={{
            fontSize: '0.72rem',
            fontWeight: '600',
            padding: '2px 8px',
            borderRadius: '12px',
            background: 'var(--brand-subtle)',
            color: 'var(--brand-primary)',
            border: '1px solid rgba(16, 185, 129, 0.3)'
          }}>
            Checkout & Plans
          </span>
        </Link>

        <nav className="nav-tab-links" style={{ display: 'flex', gap: '4px', background: 'var(--bg-element)', padding: '4px', borderRadius: '10px' }}>
          <NavLink
            to="/"
            end
            style={({ isActive }) => ({
              padding: '6px 14px',
              borderRadius: '7px',
              fontSize: '0.85rem',
              fontWeight: '600',
              color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
              background: isActive ? 'var(--bg-surface)' : 'transparent',
              boxShadow: isActive ? '0 2px 6px rgba(0,0,0,0.15)' : 'none',
              transition: 'all 0.2s ease',
              textDecoration: 'none'
            })}
          >
            Overview & Plans
          </NavLink>

          <NavLink
            to="/status"
            style={({ isActive }) => ({
              padding: '6px 14px',
              borderRadius: '7px',
              fontSize: '0.85rem',
              fontWeight: '600',
              color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
              background: isActive ? 'var(--bg-surface)' : 'transparent',
              boxShadow: isActive ? '0 2px 6px rgba(0,0,0,0.15)' : 'none',
              transition: 'all 0.2s ease',
              textDecoration: 'none'
            })}
          >
            Subscription Status
          </NavLink>

          <NavLink
            to="/invoices"
            style={({ isActive }) => ({
              padding: '6px 14px',
              borderRadius: '7px',
              fontSize: '0.85rem',
              fontWeight: '600',
              color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
              background: isActive ? 'var(--bg-surface)' : 'transparent',
              boxShadow: isActive ? '0 2px 6px rgba(0,0,0,0.15)' : 'none',
              transition: 'all 0.2s ease',
              textDecoration: 'none'
            })}
          >
            Invoices & Billing
          </NavLink>
        </nav>
      </div>

      <div className="nav-user-group" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <ThemeToggle />

        <div className="user-pill-badge" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '4px 12px',
          borderRadius: '20px',
          background: 'var(--bg-element)',
          border: '1px solid var(--border)'
        }}>
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--brand-primary), var(--accent-primary))',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.75rem',
            fontWeight: '700'
          }}>
            {(user?.name || 'Developer').substring(0, 1).toUpperCase()}
          </div>
          <span style={{ fontSize: '0.85rem', fontWeight: '500', color: 'var(--text-primary)' }}>
            {user?.name || 'Developer'}
          </span>
          <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--brand-primary)', textTransform: 'capitalize' }}>
            ({currentSubscription})
          </span>
        </div>

        <a href={ideUrl} className="btn-secondary" style={{ padding: '6px 14px', fontSize: '0.83rem' }}>
          Return to IDE
        </a>
      </div>
    </header>
  );
}
