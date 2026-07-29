import React from 'react';

export function TakshaIcon({ size = 24, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width="32" height="32" rx="8" fill="url(#taksha-grad)" />
      <path
        d="M9 11L16 7L23 11V21L16 25L9 21V11Z"
        stroke="white"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M16 7V25"
        stroke="white"
        strokeWidth="1.5"
        strokeDasharray="2 2"
      />
      <path
        d="M9 11L23 21"
        stroke="white"
        strokeWidth="1.5"
        opacity="0.6"
      />
      <defs>
        <linearGradient
          id="taksha-grad"
          x1="0"
          y1="0"
          x2="32"
          y2="32"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#10B981" />
          <stop offset="1" stopColor="#3B82F6" />
        </linearGradient>
      </defs>
    </svg>
  );
}
