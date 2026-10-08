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

export default function BrandLogo({ height = 32, variant, animated = false, style = {}, ...props }) {
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
  const gIdA = `g_full_a_${baseId}`;
  const gIdB = `g_full_b_${baseId}`;

  return (
    <svg 
      width={width} 
      height={height} 
      viewBox="0 0 240 64" 
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Taksha Codespace logo"
      style={{ display: 'block', userSelect: 'none', ...style }}
      {...props}
    >
      <defs>
        <linearGradient id={gIdA} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3DC5A1"/>
          <stop offset="100%" stopColor="#0D8A6A"/>
        </linearGradient>
        <linearGradient id={gIdB} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5591F7"/>
          <stop offset="100%" stopColor="#1B6EF3"/>
        </linearGradient>
      </defs>

      {/* Base container box */}
      <rect x="8" y="8" width="48" height="48" rx="10" fill={isLight ? '#E8FFF8' : '#141520'} stroke={isLight ? '#C5E8E0' : 'rgba(61, 197, 161, 0.3)'} strokeWidth="1" />

      {/* Connection grid lines */}
      <line x1="20" y1="20" x2="44" y2="20" stroke={isLight ? '#C5E8E0' : '#1C1E2E'} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="20" y1="32" x2="44" y2="32" stroke={isLight ? '#C5E8E0' : '#1C1E2E'} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="20" y1="44" x2="44" y2="44" stroke={isLight ? '#C5E8E0' : '#1C1E2E'} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="20" y1="20" x2="20" y2="44" stroke={isLight ? '#C5E8E0' : '#1C1E2E'} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="44" y1="20" x2="44" y2="44" stroke={isLight ? '#C5E8E0' : '#1C1E2E'} strokeWidth="1.5" strokeLinecap="round" />

      {/* Signal path */}
      <path d="M20 44 L32 20 L44 32" fill="none" stroke={`url(#${gIdA})`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* Nodes */}
      <circle cx="20" cy="20" r="3.5" fill={isLight ? '#C5C7D4' : '#3D3F52'} />
      <circle cx="44" cy="20" r="2.5" fill={isLight ? '#C5C7D4' : '#3D3F52'} />
      <circle cx="32" cy="20" r="2.5" fill="#3DC5A1" />
      <circle cx="20" cy="32" r="2.5" fill={isLight ? '#C5C7D4' : '#3D3F52'} />
      <circle cx="44" cy="32" r="4" fill={isLight ? '#1B6EF3' : `url(#${gIdB})`} />
      <circle cx="20" cy="44" r="2.5" fill={isLight ? '#C5C7D4' : '#3D3F52'} />
      <circle cx="32" cy="44" r="3.5" fill="#0D8A6A" />
      <circle cx="44" cy="44" r="2.5" fill={isLight ? '#C5C7D4' : '#3D3F52'} />

      {/* Text Mark */}
      <text x="72" y="30" fontFamily="'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif" fontSize="21" fontWeight="700" fill={isLight ? '#0A0B0F' : '#F0F0F5'} letterSpacing="-0.5">
        TAKSHA
      </text>
      <text x="72" y="50" fontFamily="'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif" fontSize="10" fontWeight="600" fill={isLight ? '#7A7D96' : '#94A3B8'} letterSpacing="2.5">
        CODESPACE
      </text>
    </svg>
  );
}
