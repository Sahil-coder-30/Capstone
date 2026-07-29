import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Header from './components/Header';
import PaymentsLandingPage from './features/payments/components/PaymentsLandingPage';
import SubscriptionDashboard from './features/payments/components/SubscriptionDashboard';
import InvoicesView from './features/payments/components/InvoicesView';
import CheckoutModal from './features/payments/components/CheckoutModal';
import { usePayments } from './features/payments/Hooks/payments.hooks';
import api, { setAccessToken } from './services/api';
import './styles/index.scss';

// Main auth service URL — payments app redirects here if session is dead
const MAIN_APP_LOGIN_URL = import.meta.env.VITE_MAIN_APP_URL || 'http://localhost:5173';

export default function App() {
  const { theme } = usePayments();
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const navigate = useNavigate();

  // ── Theme boot on load before paint ────────────────────────────────────────
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
      document.documentElement.classList.add('light-theme');
    } else {
      document.documentElement.classList.remove('light-theme');
    }
  }, []);

  // ── Session Verification on App Boot ───────────────────────────────────────
  // Flow:
  //  1. Call GET /api/auth/getMe (no token in memory on fresh load → 401)
  //  2. api.js response interceptor catches 401
  //  3. Interceptor fires POST /api/auth/refresh → browser sends httpOnly cookie
  //  4. Auth service returns new accessToken in JSON body
  //  5. Interceptor stores token in memory (_accessToken) and retries /getMe
  //  6. /getMe returns user data → setUser() called
  //  If refresh token is dead/missing:
  //  → Interceptor propagates error → catch block → redirect to main app login
  useEffect(() => {
    const verifySession = async () => {
      try {
        const res = await api.get('/api/auth/getMe', { baseURL: '' });
        // If this call succeeds, the interceptor already got and stored a new
        // access token in memory. Store user data from response.
        if (res.data?.user) {
          setUser(res.data.user);
        }
      } catch (err) {
        // Refresh token is dead or missing → redirect to main app to log in
        window.location.href = MAIN_APP_LOGIN_URL;
      } finally {
        setAuthChecked(true);
      }
    };

    verifySession();
  }, []);

  // ── Legacy URL search param redirect ───────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const route = params.get('route');

    if (route === 'invoices') {
      navigate('/invoices', { replace: true });
    } else if (route === 'status') {
      navigate('/status', { replace: true });
    } else if (route === 'checkout') {
      navigate('/checkout/pro_regular', { replace: true });
    }
  }, [navigate]);

  // ── Wait for auth check before rendering protected content ─────────────────
  if (!authChecked) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-canvas)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Verifying session…</p>
      </div>
    );
  }

  return (
    <div className="payments-app-wrapper" style={{ minHeight: '100vh', background: 'var(--bg-canvas)' }}>
      <Header user={user} />
      <Routes>
        <Route path="/" element={<PaymentsLandingPage user={user} />} />
        <Route path="/status" element={<SubscriptionDashboard />} />
        <Route path="/invoices" element={<InvoicesView />} />
        <Route path="/checkout/:planId" element={<CheckoutModal />} />
      </Routes>
    </div>
  );
}
