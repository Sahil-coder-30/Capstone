import { useId } from 'react';

/** The Taksha chisel "T" mark. */
export default function TakshaIcon({ size = 28 }) {
  const id = `ti${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Taksha" style={{ display: 'block' }}>
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
      <path d="M7 10H57L47 25H17Z" fill={`url(#${id}f)`} />
      <path d="M23 28.5H32V58L23 47Z" fill={`url(#${id}f)`} />
      <path d="M32 28.5H41V47L32 58Z" fill={`url(#${id}s)`} />
    </svg>
  );
}
