import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import BrandLogo from './BrandLogo';
import ThemeToggle from './ThemeToggle';
import UserProfileDropdown from './UserProfileDropdown';
import { usePayments } from '../features/payments/Hooks/payments.hooks';
import { Menu, X, ArrowLeft } from 'lucide-react';

const NAV_LINKS = [
  { to: '/',          label: 'Plans',        end: true },
  { to: '/dashboard',  label: 'Dashboard',    end: false },
  { to: '/requests',   label: 'AI Logs',      end: false },
  { to: '/invoices',   label: 'Invoices',     end: false },
  { to: '/compare',    label: 'Compare',      end: false },
];


const TIER_COLORS = {
  free: { bg: 'var(--bg-element)',   text: 'var(--text-muted)',     border: 'var(--border)' },
  pro:  { bg: 'var(--brand-subtle)', text: 'var(--brand-primary)',  border: 'rgba(61,197,161,0.3)' },
  max:  { bg: 'var(--accent-subtle)',text: 'var(--accent-primary)', border: 'rgba(27,110,243,0.3)' },
};

const isValidPhotoUrl = (url) => {
  return typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:image/') || url.startsWith('/'));
};

export default function Header({ user }) {
  const { credit } = usePayments();
  const currentSubscription = credit?.subscription || 'free';
  const tierStyle = TIER_COLORS[currentSubscription] || TIER_COLORS.free;
  const location = useLocation();

  const [isScrolled, setIsScrolled] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileClosing, setProfileClosing] = useState(false);
  const [headerImgError, setHeaderImgError] = useState(false);
  const scrollTimeoutRef = useRef(null);
  const hideTimerRef = useRef(null);

  const ideUrl = import.meta.env.VITE_MAIN_APP_URL || 'http://localhost:5173';

  const handleProfileMouseEnter = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setProfileClosing(false);
    setProfileOpen(true);
  };

  const handleProfileMouseLeave = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    // 2-second (2000ms) delay before starting hide animation
    hideTimerRef.current = setTimeout(() => {
      setProfileClosing(true);
      hideTimerRef.current = setTimeout(() => {
        setProfileOpen(false);
        setProfileClosing(false);
      }, 300);
    }, 2000);
  };

  const handleManualClose = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setProfileClosing(true);
    setTimeout(() => {
      setProfileOpen(false);
      setProfileClosing(false);
    }, 300);
  };

  useEffect(() => {
    const handleScroll = () => {
      const s = window.scrollY || document.documentElement.scrollTop;
      setIsScrolled(s > 60);
      setIsScrolling(true);

      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, 150);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  const expanded = !isScrolled || (isHovered && !isScrolling) || mobileOpen;

  return (
    <>
      {/* ── Fixed Floating Nav Wrap ─────────────────────────────────────────── */}
      <div className="payments-nav-wrap">
        <header
          className={`payments-header ${expanded ? 'payments-header--expanded' : 'payments-header--collapsed'}`}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={() => {
            if (!expanded) setIsHovered(true);
          }}
        >
          {/* Collapsed Dynamic Island Pill */}
          <div
            className="payments-pill-collapsed"
            onClick={(e) => {
              e.stopPropagation();
              setMobileOpen(true);
            }}
          >
            <span className="pulse-dot" />
            <span>Taksha Payments</span>
            <span style={{
              fontSize: '0.65rem', fontWeight: 800, padding: '1px 6px', borderRadius: 10,
              background: tierStyle.bg, color: tierStyle.text, border: `1px solid ${tierStyle.border}`,
              textTransform: 'uppercase', marginLeft: 2
            }}>
              {currentSubscription}
            </span>
          </div>

          {/* Expanded Dynamic Island Header */}
          <div className="payments-pill-expanded">
            {/* Brand Logo */}
            <Link to="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', gap: 8, flexShrink: 0 }}>
              <BrandLogo height={26} animated={false} />
              <span className="payments-badge-tag">
                PAYMENTS
              </span>
            </Link>

            {/* Desktop Navigation Links */}
            <nav className="desktop-nav-links">
              {NAV_LINKS.map(({ to, label, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  {label}
                </NavLink>
              ))}
            </nav>

            {/* Actions & Controls */}
            <div className="header-actions">
              <ThemeToggle />

              {/* User Tier Badge Dropdown Trigger */}
              <div
                className="user-tier-badge-container"
                onMouseEnter={handleProfileMouseEnter}
                onMouseLeave={handleProfileMouseLeave}
              >
                <div
                  className={`user-tier-badge ${profileOpen ? 'is-active' : ''}`}
                  style={{ background: tierStyle.bg, borderColor: tierStyle.border }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setProfileOpen((prev) => !prev);
                  }}
                  role="button"
                  tabIndex={0}
                  aria-expanded={profileOpen}
                  aria-label="User profile details"
                >
                  <div className="user-avatar-circle">
                    {isValidPhotoUrl(user?.photo) && !headerImgError ? (
                      <img
                        src={user.photo}
                        alt=""
                        className="user-avatar-img"
                        onError={() => setHeaderImgError(true)}
                      />
                    ) : (
                      <span>{user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}</span>
                    )}
                  </div>
                  <span className="tier-label-text" style={{ color: tierStyle.text }}>
                    {currentSubscription}
                  </span>
                </div>

                {profileOpen && (
                  <UserProfileDropdown
                    user={user}
                    tierStyle={tierStyle}
                    currentSubscription={currentSubscription}
                    isClosing={profileClosing}
                    onMouseEnter={handleProfileMouseEnter}
                    onMouseLeave={handleProfileMouseLeave}
                    onClose={handleManualClose}
                  />
                )}
              </div>

              {/* Back to IDE Link */}
              <a
                href={ideUrl}
                className="btn-back-ide"
              >
                <ArrowLeft size={13} />
                <span>IDE</span>
              </a>

              {/* Mobile Hamburger Button */}
              <button
                className="mobile-hamburger-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setMobileOpen(true);
                }}
                aria-label="Open navigation menu"
              >
                <Menu size={16} />
              </button>
            </div>
          </div>
        </header>
      </div>

      {/* ── Mobile Navigation Drawer ───────────────────────────────────────── */}
      <div className={`payments-mobile-menu ${mobileOpen ? 'payments-mobile-menu--open' : ''}`} role="dialog" aria-modal="true" aria-label="Navigation menu">
        <button
          className="payments-mobile-menu-close"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation menu"
        >
          <X size={20} />
        </button>

        <div style={{ marginBottom: 24, textAlign: 'center' }}>
          <BrandLogo height={36} />
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-primary)', letterSpacing: '0.08em', marginTop: 6, textTransform: 'uppercase' }}>
            TAKSHA PAYMENTS PLATFORM
          </div>
        </div>

        {NAV_LINKS.map(({ to, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
          >
            {label}
          </NavLink>
        ))}

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 20 }}>
          <ThemeToggle />
          <a
            href={ideUrl}
            className="btn-back-ide"
            style={{ padding: '8px 18px', fontSize: '0.85rem' }}
          >
            <ArrowLeft size={14} /> Back to IDE
          </a>
        </div>
      </div>
    </>
  );
}
