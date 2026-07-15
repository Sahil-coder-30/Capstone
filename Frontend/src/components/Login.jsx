import React, { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { Cpu, ArrowLeft, Terminal, ShieldCheck } from 'lucide-react';
import './Login.scss';
import BrandLogo from './BrandLogo';

export default function Login({ onBackToHome }) {
  const [logs, setLogs] = useState([
    'booting sandbox container...',
    'listening for WebSocket connections...'
  ]);
  const [showPulse, setShowPulse] = useState(false);
  const backBtnRef = useRef(null);
  const cardRef = useRef(null);

  const handleGoogleLogin = () => {
    // Redirect browser to the backend Google Auth endpoint
    window.location.href = `${window.location.origin}/api/auth/google`;
  };

  // Dynamically append logs to the telemetry stream
  useEffect(() => {
    const extraLogs = [
      'fetching config via vault...',
      'handshake established with nodes-us-east-1',
      'allocating cpu/mem resources...',
      'environment: production',
      'status: ready'
    ];

    let index = 0;
    const addLog = () => {
      if (index < extraLogs.length) {
        const nextLog = extraLogs[index];
        setLogs((prev) => {
          const updated = [...prev, nextLog];
          // Keep only the last 4 log lines to keep the terminal compact
          if (updated.length > 5) {
            return updated.slice(updated.length - 5);
          }
          return updated;
        });

        if (nextLog === 'status: ready') {
          setShowPulse(true);
          return;
        }

        index++;
        setTimeout(addLog, Math.random() * 1500 + 1000);
      }
    };

    const timer = setTimeout(addLog, 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (backBtnRef.current) {
      gsap.fromTo(backBtnRef.current,
        { x: -20, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.8, ease: "power3.out", delay: 0.3 }
      );
    }
    if (cardRef.current) {
      gsap.fromTo(cardRef.current,
        { scale: 0.95, opacity: 0, y: 15 },
        { scale: 1, opacity: 1, y: 0, duration: 1, ease: "power3.out" }
      );
    }
  }, []);

  return (
    <div className="login">
      
      {/* Circuit overlay background */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.2, overflow: 'hidden' }}>
        <svg height="100%" width="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern height="200" id="circuit" patternUnits="userSpaceOnUse" width="200" x="0" y="0">
              <path d="M 0 100 L 40 100 L 60 80 L 100 80 L 120 100 L 200 100" fill="none" stroke="#adc6ff" strokeWidth="0.5"></path>
              <circle cx="60" cy="80" fill="#adc6ff" r="1.5"></circle>
              <circle cx="120" cy="100" fill="#adc6ff" r="1.5"></circle>
            </pattern>
          </defs>
          <rect fill="url(#circuit)" height="100%" width="100%"></rect>
        </svg>
      </div>

      {/* Cyber Grid background */}
      <div className="login__cyber-grid" style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.01) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.01) 1px, transparent 1px)', backgroundSize: '40px 40px', opacity: 0.45, pointerEvents: 'none' }} />

      {/* Ambient background glowing circles */}
      <div className="login__glow login__glow--center" />
      <div className="login__glow login__glow--offset" />

      {/* Floating back button */}
      <button ref={backBtnRef} onClick={onBackToHome} className="login__back-btn">
        <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
        Back to Home
      </button>

      {/* Main Container */}
      <main className="login__main">
        
        {/* Brand/Identity Header */}
        <div className="login__brand" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <BrandLogo height={32} />
        </div>

        {/* Central Login Card */}
        {/* Central Login Card */}
        <div ref={cardRef} className="login__card">
          
          {/* Header Section */}
          <div className="login__header">
            <h1 className="login__title">Welcome to Taksha</h1>
            <p className="login__subtitle">
              Access your sandboxed containers and resume live pair-programming sessions.
            </p>
          </div>

          {/* Action Buttons Section */}
          <div className="login__actions">
            
            {/* Google CTA */}
            <button onClick={handleGoogleLogin} className="login__btn login__btn--google">
              <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              <span>Continue with Google</span>
            </button>

            {/* OR Divider */}
            <div className="login__divider">
              <span>OR</span>
            </div>

            {/* SSO CTA */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button onClick={() => alert("SSO Login Initiated")} className="login__btn login__btn--sso">
                Sign in with SSO
              </button>
              <p className="login__access-info">
                New here? <a href="#request">Request early access</a>
              </p>
            </div>

          </div>

          {/* Telemetry Stream Block */}
          <div className="login__telemetry">
            
            <div className="login__telemetry__header">
              <span className="login__telemetry__stream-label">
                <Terminal size={12} />
                telemetry-stream
              </span>
              <div className="login__telemetry__dots">
                <div className="login__telemetry__dot" />
                <div className="login__telemetry__dot" />
              </div>
            </div>

            {/* Telemetry Logs Container */}
            <div className="login__telemetry__logs">
              {logs.map((log, idx) => {
                const isReadyLine = log === 'status: ready';
                return (
                  <div key={idx} className="login__telemetry__line">
                    <span className={isReadyLine ? "login__telemetry__arrow login__telemetry__arrow--accent" : "login__telemetry__arrow"}>&gt;</span>
                    <span className={isReadyLine ? "login__telemetry__line--accent" : ""}>
                      {log}
                    </span>
                    {isReadyLine && showPulse && (
                      <div className="login__telemetry__indicator" />
                    )}
                  </div>
                );
              })}
            </div>

          </div>

        </div>

        {/* Footer Secure Info */}
        <footer style={{ marginTop: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div className="login__secure-badge">
            <ShieldCheck size={14} color="#10b981" />
            <span>AES-256 SECURED SESSION</span>
          </div>
          <div className="login__footer-links">
            <a href="#privacy">Privacy Policy</a>
            <span>|</span>
            <a href="#terms">Terms of Service</a>
            <span>|</span>
            <a href="#status">System Status</a>
          </div>
        </footer>

      </main>

      {/* Background Decorative corner lines */}
      <div className="login__corner-border login__corner-border--top-left" />
      <div className="login__corner-border login__corner-border--bottom-right" />

    </div>
  );
}
