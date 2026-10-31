import React, { useId } from 'react';
import TakshaLogoAnimation from './TakshaLogoAnimation';

export { TakshaLogoAnimation as TakshaAnimatedLogo };
export { TakshaLogoAnimation };

// The chisel T: a beam and a blade cut to a point, lit from the left.
function ChiselDefs({ id }) {
  return (
    <defs>
      <linearGradient id={`${id}f`} gradientUnits="userSpaceOnUse" x1="7" y1="10" x2="48" y2="58">
        <stop offset="0%" stopColor="#FFC14D" />
        <stop offset="100%" stopColor="#FF6A2B" />
      </linearGradient>
      <linearGradient id={`${id}s`} gradientUnits="userSpaceOnUse" x1="32" y1="28" x2="32" y2="58">
        <stop offset="0%" stopColor="#F0561A" />
        <stop offset="100%" stopColor="#B83A0A" />
      </linearGradient>
    </defs>
  );
}

function ChiselMark({ id, mono = false, transform }) {
  const face = mono ? '#ffffff' : `url(#${id}f)`;
  const shade = mono ? 'rgba(255, 255, 255, 0.6)' : `url(#${id}s)`;
  return (
    <g transform={transform}>
      <path d="M7 10H57L47 25H17Z" fill={face} />
      <path d="M23 28.5H32V58L23 47Z" fill={face} />
      <path d="M32 28.5H41V47L32 58Z" fill={shade} />
    </g>
  );
}

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
      <ChiselDefs id={gId} />
      <ChiselMark id={gId} mono={isWhite} />
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
  const gId = `g_full_${baseId}`;

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
      <ChiselDefs id={gId} />
      <ChiselMark id={gId} />

      {/* Text Mark */}
      <text x="72" y="30" fontFamily="'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif" fontSize="21" fontWeight="700" fill={isLight ? '#0A0A0C' : '#F4F4F5'} letterSpacing="-0.5">
        TAKSHA
      </text>
      <text x="72" y="50" fontFamily="'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif" fontSize="10" fontWeight="600" fill={isLight ? '#71717A' : '#A1A1AA'} letterSpacing="2.5">
        CODESPACE
      </text>
    </svg>
  );
}
