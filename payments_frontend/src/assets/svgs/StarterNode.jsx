// StarterNode.jsx — Single node SVG, stroke-dashoffset draw-in animation
import React, { useEffect, useRef } from 'react';
import { svgDrawIn } from '../../utils/animations';

export default function StarterNode({ size = 120, animated = true }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!animated || !ref.current) return;
    const paths = ref.current.querySelectorAll('.draw-path');
    svgDrawIn(Array.from(paths), ref.current);
  }, [animated]);

  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="svg-draw"
    >
      {/* Central node ring */}
      <circle
        className="draw-path"
        cx="60" cy="60" r="28"
        stroke="#FFB347" strokeWidth="2"
        style={{ '--path-length': '176' }}
      />
      {/* Inner dot */}
      <circle cx="60" cy="60" r="8" fill="#FFB347" opacity="0.9" />

      {/* Pulse rings (CSS animation) */}
      <circle cx="60" cy="60" r="38" stroke="#FFB347" strokeWidth="1" opacity="0.3"
        style={{ animation: 'pulse-ring 2.4s ease-out infinite' }} />
      <circle cx="60" cy="60" r="48" stroke="#FFB347" strokeWidth="0.5" opacity="0.15"
        style={{ animation: 'pulse-ring 2.4s ease-out 0.8s infinite' }} />

      {/* Tick marks around ring */}
      {[0, 60, 120, 180, 240, 300].map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = 60 + 30 * Math.cos(rad);
        const y1 = 60 + 30 * Math.sin(rad);
        const x2 = 60 + 36 * Math.cos(rad);
        const y2 = 60 + 36 * Math.sin(rad);
        return (
          <line key={i} className="draw-path"
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="#FFB347" strokeWidth="1.5" strokeLinecap="round"
            style={{ '--path-length': '6' }}
          />
        );
      })}

      {/* Data streams */}
      <line className="draw-path" x1="60" y1="10" x2="60" y2="32"
        stroke="#FFB347" strokeWidth="1" strokeDasharray="3 4" opacity="0.5"
        style={{ '--path-length': '22' }} />
      <line className="draw-path" x1="110" y1="60" x2="88" y2="60"
        stroke="#FFB347" strokeWidth="1" strokeDasharray="3 4" opacity="0.5"
        style={{ '--path-length': '22' }} />
    </svg>
  );
}
