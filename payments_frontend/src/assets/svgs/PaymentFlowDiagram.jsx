// PaymentFlowDiagram.jsx — Scroll-scrubbed request→auth→execution→billing SVG
import React from 'react';

export default function PaymentFlowDiagram({ style }) {
  return (
    <svg
      id="payment-flow-diagram"
      viewBox="0 0 800 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', maxWidth: 800, ...style }}
    >
      {/* Stage 1: Request */}
      <g id="node-request">
        <rect x="20" y="70" width="140" height="60" rx="12"
          fill="rgba(255, 179, 71,0.08)" stroke="#FFB347" strokeWidth="1.5" opacity="0" />
        <text x="90" y="97" textAnchor="middle" fontSize="11" fontWeight="700" fill="#FFB347" opacity="0">USER REQUEST</text>
        <text x="90" y="114" textAnchor="middle" fontSize="9.5" fill="#6B7599" opacity="0">API Call / Agent Trigger</text>
        {/* Status dot */}
        <circle cx="148" cy="75" r="4" fill="#FFB347" opacity="0" />
      </g>

      {/* Path 1: Request → Auth */}
      <path id="path-1"
        d="M 160 100 L 210 100"
        stroke="#FFB347" strokeWidth="2" strokeLinecap="round"
        style={{ strokeDashoffset: 50, strokeDasharray: 50 }} />
      <polygon id="arrow-1" points="210,95 220,100 210,105"
        fill="#FFB347" opacity="0" />

      {/* Stage 2: Auth Check */}
      <g id="node-auth">
        <rect x="220" y="70" width="140" height="60" rx="12"
          fill="rgba(27,110,243,0.08)" stroke="#4F46E5" strokeWidth="1.5" opacity="0" />
        <text x="290" y="97" textAnchor="middle" fontSize="11" fontWeight="700" fill="#4F46E5" opacity="0">AUTH CHECK</text>
        <text x="290" y="114" textAnchor="middle" fontSize="9.5" fill="#6B7599" opacity="0">RS256 / JWKS Verify</text>
        <circle cx="348" cy="75" r="4" fill="#4F46E5" opacity="0" />
      </g>

      {/* Path 2: Auth → Execution */}
      <path id="path-2"
        d="M 360 100 L 410 100"
        stroke="#FFB347" strokeWidth="2" strokeLinecap="round"
        style={{ strokeDashoffset: 50, strokeDasharray: 50 }} />
      <polygon id="arrow-2" points="410,95 420,100 410,105"
        fill="#FFB347" opacity="0" />

      {/* Stage 3: Agent Execution */}
      <g id="node-execution">
        <rect x="420" y="70" width="140" height="60" rx="12"
          fill="rgba(255, 179, 71,0.08)" stroke="#FFB347" strokeWidth="1.5" opacity="0" />
        <text x="490" y="97" textAnchor="middle" fontSize="11" fontWeight="700" fill="#FFB347" opacity="0">AGENT EXEC</text>
        <text x="490" y="114" textAnchor="middle" fontSize="9.5" fill="#6B7599" opacity="0">vCPU Sandbox + Tokens</text>
        <circle cx="548" cy="75" r="4" fill="#FFB347" opacity="0" />
      </g>

      {/* Path 3: Execution → Billing */}
      <path id="path-3"
        d="M 560 100 L 610 100"
        stroke="#4F46E5" strokeWidth="2" strokeLinecap="round"
        style={{ strokeDashoffset: 50, strokeDasharray: 50 }} />
      <polygon id="arrow-3" points="610,95 620,100 610,105"
        fill="#4F46E5" opacity="0" />

      {/* Stage 4: Billing Event */}
      <g id="node-billing">
        <rect x="620" y="70" width="160" height="60" rx="12"
          fill="rgba(27,110,243,0.08)" stroke="#4F46E5" strokeWidth="1.5" opacity="0" />
        <text x="700" y="97" textAnchor="middle" fontSize="11" fontWeight="700" fill="#4F46E5" opacity="0">BILLING EVENT</text>
        <text x="700" y="114" textAnchor="middle" fontSize="9.5" fill="#6B7599" opacity="0">Ledger DB + Invoice</text>
      </g>

      {/* Stage labels below */}
      {[
        { x: 90,  label: '01' },
        { x: 290, label: '02' },
        { x: 490, label: '03' },
        { x: 700, label: '04' },
      ].map((s) => (
        <text key={s.x} x={s.x} y="150" textAnchor="middle"
          fontSize="10" fontWeight="700" fill="#1E2540" fontFamily="JetBrains Mono, monospace">
          {s.label}
        </text>
      ))}
    </svg>
  );
}
