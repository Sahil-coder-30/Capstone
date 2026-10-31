import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Box, Check, Loader2, Moon, ShieldCheck, Sun } from 'lucide-react';
import './Login.scss';
import BrandLogo from '../../../components/BrandLogo';

const FACTS = [
  { icon: ShieldCheck, text: 'You approve the plan before code starts' },
  { icon: Box, text: 'Every project runs in its own sandbox' },
  { icon: Check, text: 'Free to start, no credit card required' },
];

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

export default function Login({ onBackToHome }) {
  const [redirecting, setRedirecting] = useState(false);
  const [isLight, setIsLight] = useState(() => document.documentElement.classList.contains('light-theme'));

  useEffect(() => {
    document.title = 'Sign in | Taksha CodeSpace';
  }, []);

  // A page restored by the browser Back button must not stay stuck on "Redirecting".
  useEffect(() => {
    const resetOnRestore = (event) => {
      if (event.persisted) setRedirecting(false);
    };
    window.addEventListener('pageshow', resetOnRestore);
    return () => window.removeEventListener('pageshow', resetOnRestore);
  }, []);

  const handleGoogleLogin = () => {
    setRedirecting(true);
    window.location.href = `${window.location.origin}/api/auth/google`;
  };

  const toggleTheme = useCallback(() => {
    const next = !document.documentElement.classList.contains('light-theme');
    document.documentElement.classList.toggle('light-theme', next);
    try {
      localStorage.setItem('theme', next ? 'light' : 'dark');
    } catch { /* theme still applies for this visit */ }
    setIsLight(next);
  }, []);

  return (
    <div className="login">
      <div className="login__bg" aria-hidden="true" />

      <header className="login__bar">
        <button type="button" onClick={onBackToHome} className="login__back">
          <ArrowLeft size={15} />
          Back to home
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          className="login__theme"
          aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          {isLight ? <Moon size={15} /> : <Sun size={15} />}
        </button>
      </header>

      <main className="login__main">
        <section className="login__card">
          <BrandLogo height={40} className="login__logo" />

          <div className="login__header">
            <h1 className="login__title">Welcome to Taksha</h1>
            <p className="login__subtitle">Sign in to open your projects, or start your first one.</p>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            className="login__google"
            disabled={redirecting}
            aria-busy={redirecting}
          >
            {redirecting ? <Loader2 size={18} className="login__spinner" /> : <GoogleIcon />}
            <span>{redirecting ? 'Redirecting to Google...' : 'Continue with Google'}</span>
          </button>

          <ul className="login__facts">
            {FACTS.map(({ icon: Icon, text }) => (
              <li key={text}>
                <Icon size={15} aria-hidden="true" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="login__footer">
        © {new Date().getFullYear()} Taksha CodeSpace Studio
      </footer>
    </div>
  );
}
