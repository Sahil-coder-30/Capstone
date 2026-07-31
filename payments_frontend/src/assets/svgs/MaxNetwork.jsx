// MaxNetwork.jsx — Full multi-node network graph SVG for Max tier
import React, { useEffect, useRef } from 'react';
import { svgDrawIn } from '../../utils/animations';

export default function MaxNetwork({ size = 120, animated = true }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!animated || !ref.current) return;
    const paths = ref.current.querySelectorAll('.draw-path');
    svgDrawIn(Array.from(paths), ref.current, 0.05);
  }, [animated]);

  // 7-node network layout
  const nodes = [
    { id: 'center', cx: 60, cy: 60, r: 10, color: '#3DC5A1', fill: 'rgba(61,197,161,0.2)' },
    { id: 'top',    cx: 60, cy: 18, r: 7,  color: '#1B6EF3', fill: 'rgba(27,110,243,0.15)' },
    { id: 'right',  cx: 100,cy: 42, r: 7,  color: '#3DC5A1', fill: 'rgba(61,197,161,0.15)' },
    { id: 'br',     cx: 92, cy: 88, r: 7,  color: '#1B6EF3', fill: 'rgba(27,110,243,0.15)' },
    { id: 'bl',     cx: 28, cy: 88, r: 7,  color: '#3DC5A1', fill: 'rgba(61,197,161,0.15)' },
    { id: 'left',   cx: 20, cy: 42, r: 7,  color: '#1B6EF3', fill: 'rgba(27,110,243,0.15)' },
    { id: 'orbit',  cx: 60, cy: 104, r: 5, color: '#3DC5A1', fill: 'rgba(61,197,161,0.12)' },
  ];

  const edges = [
    [60, 60, 60, 18],
    [60, 60, 100, 42],
    [60, 60, 92, 88],
    [60, 60, 28, 88],
    [60, 60, 20, 42],
    [60, 18, 100, 42],
    [100, 42, 92, 88],
    [92, 88, 28, 88],
    [28, 88, 20, 42],
    [20, 42, 60, 18],
    [60, 60, 60, 104],
  ];

  const edgeLengths = edges.map(([x1, y1, x2, y2]) =>
    Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
  );

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
      {/* Edges */}
      {edges.map(([x1, y1, x2, y2], i) => {
        const isSolid = i < 5; // center spokes solid, perimeter dashed
        return (
          <line key={i} className="draw-path"
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={i % 2 === 0 ? '#3DC5A1' : '#1B6EF3'}
            strokeWidth={isSolid ? '1.5' : '1'}
            strokeDasharray={isSolid ? undefined : '3 3'}
            opacity={isSolid ? 0.9 : 0.55}
            style={{ '--path-length': Math.round(edgeLengths[i]) }}
          />
        );
      })}

      {/* Nodes */}
      {nodes.map((n) => (
        <g key={n.id}>
          <circle cx={n.cx} cy={n.cy} r={n.r + 4} fill={n.fill} />
          <circle cx={n.cx} cy={n.cy} r={n.r} stroke={n.color} strokeWidth="2" fill="rgba(9,10,14,0.8)" />
          <circle cx={n.cx} cy={n.cy} r={n.r * 0.4} fill={n.color} />
        </g>
      ))}

      {/* Center pulse */}
      <circle cx="60" cy="60" r="18" stroke="#3DC5A1" strokeWidth="1" opacity="0.25"
        style={{ animation: 'pulse-ring 1.8s ease-out infinite' }} />
      <circle cx="60" cy="60" r="26" stroke="#3DC5A1" strokeWidth="0.5" opacity="0.12"
        style={{ animation: 'pulse-ring 1.8s ease-out 0.6s infinite' }} />
    </svg>
  );
}
