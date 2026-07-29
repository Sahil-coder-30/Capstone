import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { usePayments } from '../features/payments/Hooks/payments.hooks';

export default function ThemeToggle() {
  const { theme, toggleTheme } = usePayments();
  const isLight = theme === 'light';

  return (
    <button
      onClick={toggleTheme}
      className="theme-toggle-btn"
      title={`Switch to ${isLight ? 'Dark' : 'Light'} Mode`}
      aria-label="Toggle Theme"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        borderRadius: '20px',
        background: 'var(--bg-element)',
        border: '1px solid var(--border)',
        color: 'var(--text-primary)',
        fontSize: '0.82rem',
        fontWeight: '500',
        transition: 'all 0.2s ease',
      }}
    >
      {isLight ? <Moon size={14} style={{ color: '#6366F1' }} /> : <Sun size={14} style={{ color: '#F59E0B' }} />}
      <span>{isLight ? 'Dark' : 'Light'}</span>
    </button>
  );
}
