import React from 'react';

export function TakshaIcon({ size = 32, variant = 'primary' }) {
  // If variant is 'white', we use white color for the nodes & self-heal path
  const isWhite = variant === 'white';
  const gId = `g_icon_${variant}`;

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color={isWhite ? '#ffffff' : '#3DC5A1'} />
          <stop offset="100%" stop-color={isWhite ? '#e8fff8' : '#0D8A6A'} />
        </linearGradient>
        <linearGradient id={`${gId}b`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color={isWhite ? '#ffffff' : '#5591F7'} />
          <stop offset="100%" stop-color={isWhite ? '#e2ecfb' : '#1B6EF3'} />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="64" height="64" rx="14" fill={isWhite ? 'rgba(255, 255, 255, 0.05)' : '#0D8A6A'} />
      
      {/* Grid Lines */}
      <line x1="16" y1="16" x2="48" y2="16" stroke={isWhite ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.2)"} stroke-width="1.5" stroke-linecap="round" />
      <line x1="16" y1="32" x2="48" y2="32" stroke={isWhite ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.2)"} stroke-width="1.5" stroke-linecap="round" />
      <line x1="16" y1="48" x2="48" y2="48" stroke={isWhite ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.2)"} stroke-width="1.5" stroke-linecap="round" />
      <line x1="16" y1="16" x2="16" y2="48" stroke={isWhite ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.2)"} stroke-width="1.5" stroke-linecap="round" />
      <line x1="48" y1="16" x2="48" y2="48" stroke={isWhite ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.2)"} stroke-width="1.5" stroke-linecap="round" />
      
      {/* Self-heal path */}
      <path d="M16 48 L32 16 L48 32" fill="none" stroke={isWhite ? '#ffffff' : 'url(#' + gId + ')'} stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      
      {/* Nodes */}
      <circle cx="16" cy="16" r="5" fill="#ffffff" />
      <circle cx="48" cy="16" r="3.5" fill={isWhite ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.4)"} />
      <circle cx="32" cy="16" r="3" fill={isWhite ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.7)"} />
      <circle cx="16" cy="32" r="3" fill={isWhite ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.4)"} />
      <circle cx="48" cy="32" r="5" fill={isWhite ? "#ffffff" : "url(#" + gId + "b)"} />
      <circle cx="16" cy="48" r="3.5" fill={isWhite ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.4)"} />
      <circle cx="32" cy="48" r="4.5" fill="#ffffff" />
      <circle cx="48" cy="48" r="3" fill={isWhite ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.4)"} />
    </svg>
  );
}

export default function BrandLogo({ height = 32, variant = 'dark' }) {
  // Compute matching width (logo aspect ratio is 240:64 = 3.75)
  const width = height * 3.75;
  const isLight = variant === 'light';

  return (
    <svg width={width} height={height} viewBox="0 0 240 64" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="g_full_a" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#3DC5A1"/>
          <stop offset="100%" stop-color="#0D8A6A"/>
        </linearGradient>
        <linearGradient id="g_full_b" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#5591F7"/>
          <stop offset="100%" stop-color="#1B6EF3"/>
        </linearGradient>
      </defs>
      
      {/* Base container box */}
      <rect x="8" y="8" width="48" height="48" rx="10" fill={isLight ? '#E8FFF8' : '#141520'} />
      
      {/* Connection grid lines */}
      <line x1="20" y1="20" x2="44" y2="20" stroke={isLight ? '#C5E8E0' : '#1C1E2E'} stroke-width="1.5" stroke-linecap="round" />
      <line x1="20" y1="32" x2="44" y2="32" stroke={isLight ? '#C5E8E0' : '#1C1E2E'} stroke-width="1.5" stroke-linecap="round" />
      <line x1="20" y1="44" x2="44" y2="44" stroke={isLight ? '#C5E8E0' : '#1C1E2E'} stroke-width="1.5" stroke-linecap="round" />
      <line x1="20" y1="20" x2="20" y2="44" stroke={isLight ? '#C5E8E0' : '#1C1E2E'} stroke-width="1.5" stroke-linecap="round" />
      <line x1="44" y1="20" x2="44" y2="44" stroke={isLight ? '#C5E8E0' : '#1C1E2E'} stroke-width="1.5" stroke-linecap="round" />
      
      {/* Self-heal path */}
      <path d="M20 44 L32 20 L44 32" fill="none" stroke="url(#g_full_a)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      
      {/* Dynamic Nodes */}
      <circle cx="20" cy="20" r="4" fill="#0D8A6A" />
      <circle cx="44" cy="20" r="3" fill={isLight ? '#C5C7D4' : '#3D3F52'} />
      <circle cx="32" cy="20" r="2.5" fill="#3DC5A1" />
      <circle cx="20" cy="32" r="2.5" fill={isLight ? '#C5C7D4' : '#3D3F52'} />
      <circle cx="44" cy="32" r="4" fill={isLight ? '#1B6EF3' : 'url(#g_full_b)'} />
      <circle cx="20" cy="44" r="3" fill={isLight ? '#C5C7D4' : '#3D3F52'} />
      <circle cx="32" cy="44" r="3.5" fill="#0D8A6A" />
      <circle cx="44" cy="44" r="2.5" fill={isLight ? '#C5C7D4' : '#3D3F52'} />
      
      {/* Text Mark */}
      <text x="72" y="30" font-family="'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif" font-size="21" font-weight="700" fill={isLight ? '#0A0B0F' : '#F0F0F5'} letter-spacing="-0.5">
        TAKSHA
      </text>
      <text x="72" y="50" font-family="'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif" font-size="10" font-weight="600" fill={isLight ? '#7A7D96' : '#6B6E82'} letter-spacing="2">
        CODESPACE
      </text>
    </svg>
  );
}
