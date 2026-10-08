import React from 'react';

/**
 * Premium cyberpunk/dark-onyx skeleton loaders matching Taksha Codespace IDE tokens.
 * Zero layout shifts, high aesthetic value while chunks load.
 */

export function EditorSkeleton() {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: 'var(--bg-canvas, #07080B)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      userSelect: 'none',
      border: '1px solid var(--border, #252A40)',
      borderRadius: '6px'
    }}>
      {/* Editor Tab Bar Ghost */}
      <div style={{
        height: '36px',
        background: 'var(--bg-surface, #0E1017)',
        borderBottom: '1px solid var(--border, #252A40)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: '8px'
      }}>
        <div style={{
          width: '110px',
          height: '20px',
          background: 'var(--bg-element, #202438)',
          borderRadius: '4px',
          opacity: 0.7
        }} />
      </div>

      {/* Code Lines Shimmer */}
      <div style={{
        flex: 1,
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}>
        {[
          { w: '28%', op: 0.6 },
          { w: '45%', op: 0.5 },
          { w: '62%', op: 0.4 },
          { w: '35%', op: 0.5 },
          { w: '50%', op: 0.4 },
          { w: '20%', op: 0.6 },
          { w: '70%', op: 0.3 },
          { w: '40%', op: 0.5 },
        ].map((line, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{
              width: '24px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono, monospace)',
              color: 'var(--text-muted, #64748B)',
              textAlign: 'right'
            }}>
              {idx + 1}
            </span>
            <div style={{
              height: '14px',
              width: line.w,
              background: 'var(--bg-element, #202438)',
              borderRadius: '4px',
              opacity: line.op,
              animation: 'pulse 1.8s ease-in-out infinite'
            }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TerminalSkeleton() {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: 'var(--bg-canvas, #07080B)',
      padding: '12px 16px',
      fontFamily: 'var(--font-mono, monospace)',
      fontSize: '12px',
      color: 'var(--text-muted, #64748B)',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      borderTop: '1px solid var(--border, #252A40)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ color: 'var(--primary, #10B981)', fontWeight: 600 }}>taksha@codespace</span>
        <span style={{ color: 'var(--text-muted, #64748B)' }}>:~$</span>
        <span style={{
          display: 'inline-block',
          width: '8px',
          height: '14px',
          background: 'var(--primary, #10B981)',
          animation: 'pulse 1s infinite'
        }} />
      </div>
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: 'var(--bg-surface, #0E1017)',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }}>
      <div style={{
        width: '60%',
        height: '42px',
        background: 'var(--bg-element, #202438)',
        borderRadius: '10px',
        animation: 'pulse 1.8s ease-in-out infinite'
      }} />
      <div style={{
        width: '80%',
        height: '64px',
        background: 'var(--bg-element, #202438)',
        borderRadius: '10px',
        alignSelf: 'flex-start',
        opacity: 0.6,
        animation: 'pulse 1.8s ease-in-out infinite 0.2s'
      }} />
    </div>
  );
}

export function PageSkeleton({ title = 'Loading...' }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-canvas, #07080B)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px'
    }}>
      <div style={{
        width: '40px',
        height: '40px',
        border: '3px solid var(--border, #252A40)',
        borderTopColor: 'var(--primary, #10B981)',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      }} />
      <span style={{
        fontSize: '12px',
        color: 'var(--text-muted, #64748B)',
        fontFamily: 'var(--font-mono, monospace)',
        letterSpacing: '0.05em'
      }}>
        {title}
      </span>
    </div>
  );
}
