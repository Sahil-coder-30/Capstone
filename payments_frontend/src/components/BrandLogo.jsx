import React, { useId } from 'react';
import TakshaLogoAnimation from './TakshaLogoAnimation';

export { TakshaLogoAnimation as TakshaAnimatedLogo };
export { TakshaLogoAnimation };

export function TakshaIcon({ size = 32, variant = 'primary' }) {
  const isWhite = variant === 'white';
  const baseId = useId().replace(/:/g, '_');
  const gId = `g_icon_${variant}_${baseId}`;

  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 64 64" 
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Taksha Icon"
      style={{ display: 'block', userSelect: 'none' }}
    >
      <defs>
        <linearGradient id={gId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={isWhite ? '#ffffff' : '#3DC5A1'} />
          <stop offset="100%" stopColor={isWhite ? '#e8fff8' : '#0D8A6A'} />
        </linearGradient>
        <linearGradient id={`${gId}b`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={isWhite ? '#ffffff' : '#5591F7'} />
          <stop offset="100%" stopColor={isWhite ? '#e2ecfb' : '#1B6EF3'} />
        </linearGradient>
        <filter id={`${gId}glow`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Onyx container box */}
      <rect x="0" y="0" width="64" height="64" rx="14" fill={isWhite ? 'rgba(255, 255, 255, 0.08)' : '#141520'} stroke={isWhite ? 'none' : 'rgba(61, 197, 161, 0.3)'} strokeWidth="1" />

      {/* Grid Lines */}
      <line x1="16" y1="16" x2="48" y2="16" stroke={isWhite ? "rgba(255,255,255,0.15)" : "#1C1E2E"} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="16" y1="32" x2="48" y2="32" stroke={isWhite ? "rgba(255,255,255,0.15)" : "#1C1E2E"} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="16" y1="48" x2="48" y2="48" stroke={isWhite ? "rgba(255,255,255,0.15)" : "#1C1E2E"} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="16" y1="16" x2="16" y2="48" stroke={isWhite ? "rgba(255,255,255,0.15)" : "#1C1E2E"} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="48" y1="16" x2="48" y2="48" stroke={isWhite ? "rgba(255,255,255,0.15)" : "#1C1E2E"} strokeWidth="1.5" strokeLinecap="round" />

      {/* Connection path Z/V */}
      <path d="M16 48 L32 16 L48 32" fill="none" stroke={isWhite ? '#ffffff' : `url(#${gId})`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* Accent Nodes */}
      <circle cx="16" cy="16" r="3.5" fill={isWhite ? "rgba(255,255,255,0.4)" : "#3D3F52"} />
      <circle cx="48" cy="16" r="2.5" fill={isWhite ? "rgba(255,255,255,0.4)" : "#3D3F52"} />
      <circle cx="32" cy="16" r="3" fill={isWhite ? "#ffffff" : "#3DC5A1"} filter={isWhite ? undefined : `url(#${gId}glow)`} />
      <circle cx="16" cy="32" r="2.5" fill={isWhite ? "rgba(255,255,255,0.4)" : "#3D3F52"} />
      <circle cx="48" cy="32" r="4.5" fill={isWhite ? "#ffffff" : `url(#${gId}b)`} filter={isWhite ? undefined : `url(#${gId}glow)`} />
      <circle cx="16" cy="48" r="3" fill={isWhite ? "rgba(255,255,255,0.4)" : "#3D3F52"} />
      <circle cx="32" cy="48" r="3.5" fill={isWhite ? "#ffffff" : "#0D8A6A"} />
      <circle cx="48" cy="48" r="2.5" fill={isWhite ? "rgba(255,255,255,0.4)" : "#3D3F52"} />
    </svg>
  );
}

export default function BrandLogo({ height = 32, variant, animated = true, style = {}, ...props }) {
  const [isDocLight, setIsDocLight] = React.useState(
    typeof document !== 'undefined' && document.documentElement.classList.contains('light-theme')
  );

  React.useEffect(() => {
    const updateTheme = () => {
      setIsDocLight(document.documentElement.classList.contains('light-theme'));
    };
    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  const isLight = variant ? variant === 'light' : isDocLight;

  if (animated) {
    const width = height * (170 / 64);
    return (
      <TakshaLogoAnimation 
        maxWidth={`${width}px`}
        style={{ height: `${height}px`, width: `${width}px`, display: 'inline-block', ...style }}
        {...props}
      />
    );
  }

  const width = height * 3.75;
  const baseId = useId().replace(/:/g, '_');
  const gId = `g_${variant}_${baseId}`;

  return (
    <svg 
      height={height} 
      width={width} 
      viewBox="0 0 240 64" 
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Taksha CodeSpace Logo"
      style={{ display: 'block', userSelect: 'none', ...style }}
      {...props}
    >
      <defs>
        <linearGradient id={gId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={isLight ? '#0D8A6A' : '#3DC5A1'} />
          <stop offset="100%" stopColor={isLight ? '#065444' : '#0D8A6A'} />
        </linearGradient>
        <linearGradient id={`${gId}b`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={isLight ? '#1452C8' : '#5591F7'} />
          <stop offset="100%" stopColor={isLight ? '#1045A8' : '#1B6EF3'} />
        </linearGradient>
      </defs>

      {/* Icon */}
      <rect x="0" y="0" width="64" height="64" rx="14" fill={isLight ? '#E8EDF8' : '#141520'} stroke={isLight ? '#B0BAD8' : 'rgba(61, 197, 161, 0.3)'} strokeWidth="1" />
      <line x1="16" y1="16" x2="48" y2="16" stroke={isLight ? "#C0C9E0" : "#1C1E2E"} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="16" y1="32" x2="48" y2="32" stroke={isLight ? "#C0C9E0" : "#1C1E2E"} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="16" y1="48" x2="48" y2="48" stroke={isLight ? "#C0C9E0" : "#1C1E2E"} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="16" y1="16" x2="16" y2="48" stroke={isLight ? "#C0C9E0" : "#1C1E2E"} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="48" y1="16" x2="48" y2="48" stroke={isLight ? "#C0C9E0" : "#1C1E2E"} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 48 L32 16 L48 32" fill="none" stroke={`url(#${gId})`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="16" r="3.5" fill={isLight ? "#909CC0" : "#3D3F52"} />
      <circle cx="48" cy="16" r="2.5" fill={isLight ? "#909CC0" : "#3D3F52"} />
      <circle cx="32" cy="16" r="3" fill={isLight ? "#0D8A6A" : "#3DC5A1"} />
      <circle cx="16" cy="32" r="2.5" fill={isLight ? "#909CC0" : "#3D3F52"} />
      <circle cx="48" cy="32" r="4.5" fill={`url(#${gId}b)`} />
      <circle cx="16" cy="48" r="3" fill={isLight ? "#909CC0" : "#3D3F52"} />
      <circle cx="32" cy="48" r="3.5" fill={isLight ? "#065444" : "#0D8A6A"} />
      <circle cx="48" cy="48" r="2.5" fill={isLight ? "#909CC0" : "#3D3F52"} />

      {/* Wordmark */}
      <text x="76" y="36" fontFamily="Outfit, Inter, sans-serif" fontSize="24" fontWeight="800" fill={isLight ? '#0F1324' : '#FFFFFF'} letterSpacing="-0.5">TAKSHA</text>
      <text x="76" y="51" fontFamily="Inter, sans-serif" fontSize="10" fontWeight="600" fill={isLight ? '#0D8A6A' : '#3DC5A1'} letterSpacing="2.5">CODESPACE</text>
    </svg>
  );
}
