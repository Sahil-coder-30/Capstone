import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import {
  Briefcase, MapPin, Sparkles, CreditCard,
  ExternalLink, LogOut, ArrowRight, ShieldCheck, Calendar,
  Globe, Zap, X
} from 'lucide-react';
import api from '../services/api';
import { usePayments } from '../features/payments/Hooks/payments.hooks';

// Helper to check if photo is a valid URL
const isValidPhotoUrl = (url) => {
  return typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:image/') || url.startsWith('/'));
};

// Inline SVG icons for social platforms
const GithubIcon = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

const LinkedinIcon = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect x="2" y="9" width="4" height="12" />
    <circle cx="4" cy="4" r="2" />
  </svg>
);

const TwitterIcon = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
  </svg>
);

export default function UserProfileDropdown({
  user: initialUser,
  tierStyle,
  currentSubscription,
  isClosing,
  onMouseEnter,
  onMouseLeave,
  onClose
}) {
  const { credit } = usePayments();
  const [profileData, setProfileData] = useState(null);
  const [fetchedUser, setFetchedUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [imgError, setImgError] = useState(false);

  const user = fetchedUser || initialUser;
  const ideUrl = import.meta.env.VITE_MAIN_APP_URL || 'http://localhost:5173';

  useEffect(() => {
    let isMounted = true;
    const fetchUserData = async () => {
      try {
        setLoading(true);
        const [meRes, profileRes] = await Promise.allSettled([
          api.get('/api/auth/getMe', { baseURL: '' }),
          api.get('/api/auth/profile', { baseURL: '' }),
        ]);

        if (isMounted) {
          if (meRes.status === 'fulfilled' && meRes.value.data?.user) {
            setFetchedUser(meRes.value.data.user);
          }
          if (profileRes.status === 'fulfilled' && profileRes.value.data?.profile) {
            setProfileData(profileRes.value.data.profile);
          }
        }
      } catch (err) {
        console.warn('Profile fetch error:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchUserData();
    return () => { isMounted = false; };
  }, []);

  const handleLogout = async () => {
    try {
      await api.post('/api/auth/logout', {}, { baseURL: '' });
    } catch (e) {
      // ignore
    } finally {
      window.location.href = ideUrl;
    }
  };

  // Safe formatting helper for user identity & dates
  const displayName = user?.name || (user?.email ? user.email.split('@')[0] : 'Developer');
  const displayEmail = user?.email || 'user@codespace.dev';
  
  const getJoinedDateString = (rawDate) => {
    if (!rawDate) return 'July 2026';
    const d = new Date(rawDate);
    return isNaN(d.getTime()) ? 'July 2026' : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };
  const joinedDate = getJoinedDateString(user?.createdAt);

  // Credit & Token Calculations
  const subTier = (credit?.subscription || currentSubscription || 'free').toLowerCase();
  const creditsRemaining = credit?.credits !== undefined ? Number(credit.credits) : 60;
  const totalTokensUsed = credit?.totalTokens ? Number(credit.totalTokens) : 0;
  const maxCreditsCap = subTier === 'max' ? 500 : subTier === 'pro' ? 200 : 60;
  const creditPercent = Math.min(100, Math.max(0, Math.round((creditsRemaining / maxCreditsCap) * 100)));

  const jobTitle = profileData?.jobTitle || 'Full Stack Engineer';
  const company = profileData?.company ? `@ ${profileData.company}` : '';
  const bioText = profileData?.bio && profileData.bio !== 'Full Stack Software Engineer building with CodeSpace.'
    ? profileData.bio
    : 'Building next-gen applications on CodeSpace platform.';

  // Use React Portal to attach directly to document.body
  // This bypasses parent CSS transforms on .payments-nav-wrap and places the panel at top-right of the screen.
  return createPortal(
    <div
      className={`user-profile-flyout-panel tier-${subTier} ${isClosing ? 'is-leaving' : 'is-entering'}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="User profile flyout"
    >
      {/* Top Banner & Avatar Header */}
      <div className="profile-card-header">
        <div className="profile-avatar-large">
          {isValidPhotoUrl(user?.photo) && !imgError ? (
            <img
              src={user.photo}
              alt=""
              className="avatar-img"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="avatar-fallback">
              {displayName[0]?.toUpperCase() || 'U'}
            </div>
          )}
          <span className="avatar-status-dot" style={{ background: tierStyle.text }} />
        </div>

        <div className="profile-identity">
          <div className="profile-name-row">
            <h4 className="profile-user-name" title={displayName}>{displayName}</h4>
            <span
              className="profile-tier-chip"
              style={{ background: tierStyle.bg, color: tierStyle.text, borderColor: tierStyle.border }}
            >
              <Sparkles size={10} />
              {subTier.toUpperCase()}
            </span>
          </div>
          <p className="profile-user-email" title={displayEmail}>{displayEmail}</p>
        </div>

        {/* Manual Close Button */}
        <button className="panel-close-btn" onClick={onClose} aria-label="Close profile panel">
          <X size={15} />
        </button>
      </div>

      <div className="profile-card-divider" />

      {/* Subscription & Credit Meter */}
      <div className="profile-credit-section">
        <div className="credit-label-row">
          <span className="credit-title">
            <Zap size={13} className="zap-icon" /> AI Token Balance
          </span>
          <span className="credit-val">
            <strong>{creditsRemaining.toLocaleString()}</strong> credits
          </span>
        </div>

        <div className="credit-progress-track">
          <div
            className="credit-progress-fill"
            style={{
              width: `${creditPercent}%`,
              background: subTier === 'max'
                ? 'var(--gradient-blue)'
                : 'var(--gradient-green)'
            }}
          />
        </div>
        <div className="credit-sub-info">
          <span>Usage: {totalTokensUsed.toLocaleString()} tokens used</span>
        </div>
      </div>

      <div className="profile-card-divider" />

      {/* Extended Profile Info (API fetched) */}
      <div className="profile-details-body">
        {loading ? (
          <div className="profile-skeleton-wrapper">
            <div className="skeleton-line" style={{ width: '85%' }} />
            <div className="skeleton-line" style={{ width: '60%' }} />
            <div className="skeleton-line" style={{ width: '75%' }} />
          </div>
        ) : (
          <div className="profile-info-grid">
            <div className="profile-info-item">
              <Briefcase size={13} className="info-icon" />
              <span>{jobTitle} {company}</span>
            </div>

            {profileData?.location && (
              <div className="profile-info-item">
                <MapPin size={13} className="info-icon" />
                <span>{profileData.location}</span>
              </div>
            )}

            <div className="profile-info-item">
              <Calendar size={13} className="info-icon" />
              <span>Member since {joinedDate}</span>
            </div>

            <p className="profile-bio-text">{bioText}</p>

            {/* Social / Web Links */}
            {(profileData?.github || profileData?.linkedin || profileData?.twitter || profileData?.website) && (
              <div className="profile-social-links">
                {profileData.github && (
                  <a href={profileData.github} target="_blank" rel="noopener noreferrer" title="GitHub">
                    <GithubIcon size={13} />
                  </a>
                )}
                {profileData.linkedin && (
                  <a href={profileData.linkedin} target="_blank" rel="noopener noreferrer" title="LinkedIn">
                    <LinkedinIcon size={13} />
                  </a>
                )}
                {profileData.twitter && (
                  <a href={profileData.twitter} target="_blank" rel="noopener noreferrer" title="Twitter">
                    <TwitterIcon size={13} />
                  </a>
                )}
                {profileData.website && (
                  <a href={profileData.website} target="_blank" rel="noopener noreferrer" title="Website">
                    <Globe size={13} />
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="profile-card-divider" />

      {/* Quick Action Navigation Links */}
      <div className="profile-card-actions">
        <NavLink to="/status" className="profile-action-link" onClick={onClose}>
          <CreditCard size={14} />
          <span>Subscription & Limits</span>
          <ArrowRight size={12} className="link-arrow" />
        </NavLink>

        <NavLink to="/invoices" className="profile-action-link" onClick={onClose}>
          <ShieldCheck size={14} />
          <span>Invoices & History</span>
          <ArrowRight size={12} className="link-arrow" />
        </NavLink>

        <a href={ideUrl} className="profile-action-link ide-link">
          <ExternalLink size={14} />
          <span>Return to IDE</span>
        </a>

        <button className="profile-action-link logout-btn" onClick={handleLogout}>
          <LogOut size={14} />
          <span>Sign Out</span>
        </button>
      </div>
    </div>,
    document.body
  );
}
