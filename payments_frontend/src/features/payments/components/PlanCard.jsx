import React, { useRef, useState } from 'react';
import { Check, ArrowRight, Sparkles, Zap, Crown } from 'lucide-react';
import BorderGlow from '../../../components/reactbits/BorderGlow';
import SpecularButton from '../../../components/reactbits/SpecularButton';
import ShinyText from '../../../components/reactbits/ShinyText';

const TIER_CONFIG = {
  free: {
    accentColor: '#C084FC',
    glowHsl: '268 90 70',
    borderColors: ['#C084FC', '#F472B6', '#38BDF8'],
    glowColor: 'rgba(192, 132, 252, 0.20)',
    shadowColor: 'rgba(192, 132, 252, 0.15)',
    badgeBg: 'rgba(192, 132, 252, 0.12)',
    badgeBorder: 'rgba(192, 132, 252, 0.35)',
    badgeColor: '#E9D5FF',
    icon: Zap,
    buttonTint: '#7E22CE',
    buttonLine: '#C084FC',
    buttonBase: '#4C1D95',
  },
  pro: {
    accentColor: '#3DC5A1',
    glowHsl: '160 80 55',
    borderColors: ['#3DC5A1', '#059669', '#10B981'],
    glowColor: 'rgba(61, 197, 161, 0.25)',
    shadowColor: 'rgba(61, 197, 161, 0.20)',
    badgeBg: 'rgba(61, 197, 161, 0.15)',
    badgeBorder: 'rgba(61, 197, 161, 0.45)',
    badgeColor: '#3DC5A1',
    icon: Sparkles,
    buttonTint: '#3DC5A1',
    buttonLine: '#52D4B0',
    buttonBase: '#0D8A6A',
  },
  max: {
    accentColor: '#FFB800',
    glowHsl: '45 100 52',
    borderColors: ['#FFB800', '#F59E0B', '#FBBF24', '#D97706'],
    glowColor: 'rgba(255, 184, 0, 0.28)',
    shadowColor: 'rgba(245, 158, 11, 0.22)',
    badgeBg: 'rgba(255, 184, 0, 0.16)',
    badgeBorder: 'rgba(255, 184, 0, 0.50)',
    badgeColor: '#FBBF24',
    icon: Crown,
    buttonTint: '#F59E0B',
    buttonLine: '#FBBF24',
    buttonBase: '#B45309',
  },
};

export default function PlanCard({ plan, billingCycle, isCurrent, onSelectPlan, priceRef }) {
  const cardRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const [transformStyle, setTransformStyle] = useState(
    'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)'
  );
  const [spotlightStyle, setSpotlightStyle] = useState(
    'radial-gradient(circle 380px at 50% 50%, transparent, transparent)'
  );

  const tierKey = plan.tier || 'free';
  const config = TIER_CONFIG[tierKey] || TIER_CONFIG.free;
  const TierIcon = config.icon;

  const isYearly = billingCycle === 'yearly';
  const effectivePrice = isYearly ? Math.round(plan.priceINR * 0.8) : plan.priceINR;
  const isPopular = plan.popular;
  const isMax = plan.tier === 'max';

  const handleMouseMove = (e) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Gentle 3D micro-tilt (max ~4.5 degrees)
    const rotateX = ((y - centerY) / centerY) * -4.5;
    const rotateY = ((x - centerX) / centerX) * 4.5;

    setTransformStyle(
      `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.015, 1.015, 1.015) translateZ(6px)`
    );
    setSpotlightStyle(
      `radial-gradient(circle 380px at ${x}px ${y}px, ${config.glowColor}, transparent 80%)`
    );
  };

  const handleMouseEnter = () => setIsHovered(true);

  const handleMouseLeave = () => {
    setIsHovered(false);
    setTransformStyle('perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1) translateZ(0px)');
    setSpotlightStyle('radial-gradient(circle 380px at 50% 50%, transparent, transparent)');
  };

  return (
    <BorderGlow
      backgroundColor="transparent"
      glowColor={config.glowHsl}
      colors={config.borderColors}
      glowIntensity={1.2}
      fillOpacity={0.35}
      glowRadius={30}
      borderRadius={24}
      edgeSensitivity={25}
      coneSpread={30}
      animated={isPopular || isHovered}
      className={`plan-card-border-glow ${isPopular ? 'popular-card' : ''} ${isMax ? 'max-card' : ''}`}
    >
      <div
        ref={cardRef}
        className="plan-card-3d-inner"
        style={{
          transform: transformStyle,
          transition: isHovered
            ? 'transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s ease'
            : 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.5s ease',
          transformStyle: 'preserve-3d',
          willChange: 'transform',
          position: 'relative',
          height: '100%',
          borderRadius: 24,
          background: 'linear-gradient(180deg, var(--bg-surface) 0%, var(--bg-overlay) 100%)',
          border: `1px solid ${isHovered ? config.badgeBorder : 'var(--border)'}`,
          boxShadow: isHovered
            ? `0 24px 50px -12px ${config.shadowColor}, 0 0 30px ${config.glowColor}`
            : 'var(--shadow-card)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          backdropFilter: 'blur(12px)',
          cursor: 'pointer',
        }}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Dynamic Cursor Spotlight Layer */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: spotlightStyle,
            pointerEvents: 'none',
            zIndex: 1,
            transition: 'background 0.05s ease',
          }}
        />

        {/* Animated Aurora Neon Border Gradient Beam for Popular & Max */}
        {(isPopular || isMax || isHovered) && (
          <div
            style={{
              position: 'absolute',
              inset: '-1px',
              borderRadius: 24,
              background: `linear-gradient(135deg, ${config.accentColor}, transparent 55%, ${config.accentColor})`,
              opacity: isHovered ? 0.6 : 0.2,
              transition: 'opacity 0.4s ease',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />
        )}

        {/* ── Top Visual Banner Header ── */}
        {plan.bannerImg && (
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '130px',
              overflow: 'hidden',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              zIndex: 2,
            }}
          >
            <img
              src={plan.bannerImg}
              alt={`${plan.label} banner visual`}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: isHovered ? 'scale(1.05)' : 'scale(1)',
                transition: 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            />
            {/* Glass Gradient Blend Overlay */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to bottom, rgba(10,15,25,0.08) 0%, rgba(10,15,25,0.6) 65%, var(--bg-surface) 100%)',
              }}
            />

            {/* Floating Pill Badge over Banner */}
            {plan.badge && (
              <div
                style={{
                  position: 'absolute',
                  top: 14,
                  right: 14,
                  padding: '4px 12px',
                  borderRadius: 20,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  letterSpacing: '0.03em',
                  background: config.badgeBg,
                  border: `1px solid ${config.badgeBorder}`,
                  color: config.badgeColor,
                  backdropFilter: 'blur(10px)',
                  boxShadow: `0 4px 14px ${config.shadowColor}`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <TierIcon size={12} />
                <ShinyText text={plan.badge} color={config.badgeColor} shineColor="#FFFFFF" speed={2.5} />
              </div>
            )}
          </div>
        )}

        {/* ── Card Body Container ── */}
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            padding: '24px 26px 28px',
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            justifyContent: 'space-between',
          }}
        >
          <div>
            {/* Tier Title & Icon Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  background: config.badgeBg,
                  border: `1px solid ${config.badgeBorder}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: config.accentColor,
                }}
              >
                <TierIcon size={16} />
              </div>
              <h3
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  fontFamily: 'var(--font-heading)',
                  color: 'var(--text-primary)',
                  margin: 0,
                  lineHeight: 1.2,
                }}
              >
                {plan.label.replace('Taksha AI ', '')}
              </h3>
            </div>

            <p
              style={{
                fontSize: '0.86rem',
                color: 'var(--text-muted)',
                lineHeight: 1.55,
                marginBottom: 18,
                minHeight: 38,
              }}
            >
              {plan.description}
            </p>

            {/* Pricing Display */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span
                  ref={priceRef}
                  style={{
                    fontSize: '2.6rem',
                    fontWeight: 900,
                    fontFamily: 'var(--font-heading)',
                    color: 'var(--text-primary)',
                    lineHeight: 1,
                    letterSpacing: '-0.02em',
                  }}
                >
                  ₹{effectivePrice}
                </span>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  /month
                </span>
              </div>
              {isYearly && plan.priceINR > 0 && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 6,
                    padding: '2px 9px',
                    borderRadius: 10,
                    background: 'rgba(61,197,161,0.08)',
                    border: '1px solid rgba(61,197,161,0.20)',
                    fontSize: '0.74rem',
                    color: '#3DC5A1',
                    fontWeight: 600,
                  }}
                >
                  <span>Billed annually — Save ₹{(plan.priceINR - effectivePrice) * 12}/yr</span>
                </div>
              )}
            </div>
          </div>

          {/* Main Action CTA Button */}
          <div style={{ marginBottom: 22 }}>
            {isCurrent ? (
              <div
                style={{
                  padding: '12px',
                  borderRadius: 12,
                  textAlign: 'center',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  background: config.badgeBg,
                  color: config.accentColor,
                  border: `1px solid ${config.badgeBorder}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <Check size={16} /> Current Active Plan
              </div>
            ) : (
              <SpecularButton
                size="md"
                radius={12}
                tint={config.buttonTint}
                tintOpacity={0.8}
                textColor="#ffffff"
                lineColor="#FFFFFF"
                baseColor="#64748B"
                intensity={1.3}
                shineSize={16}
                shineFade={40}
                thickness={1.4}
                speed={0.3}
                followMouse
                proximity={250}
                onClick={() => onSelectPlan(plan.id)}
                style={{ width: '100%', cursor: 'pointer' }}
              >
                <span style={{ fontWeight: 700 }}>
                  {plan.priceINR === 0 ? 'Get Started Free' : `Sign Up with ${plan.tier === 'pro' ? 'Pro' : 'Max'}`}
                </span>
                <ArrowRight size={14} style={{ transform: isHovered ? 'translateX(3px)' : 'none', transition: 'transform 0.2s' }} />
              </SpecularButton>
            )}
          </div>

          {/* Feature List Section */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 14,
              }}
            >
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
              <span
                style={{
                  fontSize: '0.64rem',
                  fontWeight: 800,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                KEY HIGHLIGHTS
              </span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            </div>

            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 11, margin: 0, padding: 0 }}>
              {plan.highlights.map((feat, i) => (
                <li
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    fontSize: '0.84rem',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <div
                    style={{
                      width: 17,
                      height: 17,
                      borderRadius: '50%',
                      flexShrink: 0,
                      marginTop: 2,
                      background: config.badgeBg,
                      border: `1px solid ${config.badgeBorder}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Check size={10} style={{ color: config.accentColor }} />
                  </div>
                  <span style={{ lineHeight: 1.4 }}>
                    {i === 0 ? (
                      <ShinyText
                        text={feat}
                        color="var(--text-primary)"
                        shineColor={config.accentColor}
                        speed={3}
                        delay={i * 0.5}
                        spread={120}
                      />
                    ) : (
                      feat
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </BorderGlow>
  );
}
