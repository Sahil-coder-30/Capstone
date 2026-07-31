// ProMesh.jsx — 3-node connected mesh SVG for Pro tier
import React, { useEffect, useRef } from 'react';
import { svgDrawIn } from '../../utils/animations';

export default function ProMesh({ size = 120, animated = true }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!animated || !ref.current) return;
    const paths = ref.current.querySelectorAll('.draw-path');
    svgDrawIn(Array.from(paths), ref.current, 0.1);
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
      {/* Connection lines */}
      <line className="draw-path" x1="30" y1="80" x2="60" y2="28"
        stroke="#3DC5A1" strokeWidth="1.5" style={{ '--path-length': '62' }} />
      <line className="draw-path" x1="60" y1="28" x2="90" y2="80"
        stroke="#3DC5A1" strokeWidth="1.5" style={{ '--path-length': '62' }} />
      <line className="draw-path" x1="30" y1="80" x2="90" y2="80"
        stroke="#3DC5A1" strokeWidth="1.5" style={{ '--path-length': '60' }} />

      {/* Dashed cross-connections (data flow) */}
      <line className="draw-path" x1="60" y1="28" x2="60" y2="80"
        stroke="#1B6EF3" strokeWidth="1" strokeDasharray="4 4"
        opacity="0.6" style={{ '--path-length': '52' }} />

      {/* Node: top */}
      <circle cx="60" cy="28" r="10" fill="rgba(61,197,161,0.15)" stroke="#3DC5A1" strokeWidth="2" />
      <circle cx="60" cy="28" r="4" fill="#3DC5A1" />

      {/* Node: bottom-left */}
      <circle cx="30" cy="80" r="10" fill="rgba(27,110,243,0.15)" stroke="#1B6EF3" strokeWidth="2" />
      <circle cx="30" cy="80" r="4" fill="#1B6EF3" />

      {/* Node: bottom-right */}
      <circle cx="90" cy="80" r="10" fill="rgba(61,197,161,0.15)" stroke="#3DC5A1" strokeWidth="2" />
      <circle cx="90" cy="80" r="4" fill="#3DC5A1" />

      {/* Pulse on top node */}
      <circle cx="60" cy="28" r="16" stroke="#3DC5A1" strokeWidth="1" opacity="0.3"
        style={{ animation: 'pulse-ring 2s ease-out infinite' }} />

      {/* Data packets on lines (small dots) */}
      <circle cx="45" cy="54" r="2.5" fill="#3DC5A1" opacity="0.7" />
      <circle cx="75" cy="54" r="2.5" fill="#3DC5A1" opacity="0.5" />
      <circle cx="60" cy="80" r="2.5" fill="#1B6EF3" opacity="0.7" />
    </svg>
  );
}
