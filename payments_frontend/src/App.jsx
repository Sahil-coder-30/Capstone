import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import Header from './components/Header';
import PaymentsLandingPage from './features/payments/components/PaymentsLandingPage';
import PaymentsDashboard from './features/payments/components/PaymentsDashboard';
import AIRequestsView from './features/payments/components/AIRequestsView';
import InvoicesView from './features/payments/components/InvoicesView';
import CheckoutModal from './features/payments/components/CheckoutModal';
import PlanDetailPage from './features/payments/components/PlanDetailPage';
import CompareTablePage from './features/payments/components/CompareTablePage';
import AmbientOrbs from './components/AmbientOrbs';
import PaymentsIntroLoader from './features/payments/components/PaymentsIntroLoader';
import { usePayments } from './features/payments/Hooks/payments.hooks';
import api, { setAccessToken } from './services/api';
import './styles/index.scss';

export default function App() {
  const { theme } = usePayments();
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const navigate = useNavigate();
  const isForcePlay = new URLSearchParams(window.location.search).get('forceLoader') === 'true';
  const [showIntro, setShowIntro] = useState(() => {
    if (isForcePlay) return true;
    return !sessionStorage.getItem('taksha_payments_intro_v10_clip');
  });

  const handleIntroComplete = () => {
    setShowIntro(false);
    if (window.location.search.includes('forceLoader')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('forceLoader');
      window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
    }
  };

  // ── Theme boot on load before paint ────────────────────────────────────────
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'light') {
      document.documentElement.classList.add('light-theme');
    } else {
      document.documentElement.classList.remove('light-theme');
    }
  }, []);

  // ── Session Verification on App Boot ───────────────────────────────────────
  useEffect(() => {
    let isMounted = true;

    const verifySession = async () => {
      try {
        const res = await api.get('/api/auth/getMe', { baseURL: '', timeout: 3000 });
        if (isMounted && res.data?.user) {
          if (res.data?.accessToken) {
            setAccessToken(res.data.accessToken);
          }
          setUser(res.data.user);
        }
      } catch (err) {
        if (isMounted) {
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setAuthChecked(true);
        }
      }
    };

    verifySession();
    return () => { isMounted = false; };
  }, []);

  // ── Legacy URL search param redirect ───────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const route = params.get('route');

    if (route === 'invoices') {
      navigate('/invoices', { replace: true });
    } else if (route === 'status' || route === 'dashboard') {
      navigate('/dashboard', { replace: true });
    } else if (route === 'requests' || route === 'logs') {
      navigate('/requests', { replace: true });
    } else if (route === 'checkout') {
      navigate('/checkout/pro_regular', { replace: true });
    }
  }, [navigate]);

  return (
    <div className="payments-app-wrapper" style={{ minHeight: '100vh', background: 'var(--bg-canvas)', position: 'relative' }}>
      {showIntro && (
        <PaymentsIntroLoader
          forcePlay={isForcePlay}
          onComplete={handleIntroComplete}
        />
      )}
      {/* Space ambient background */}
      <AmbientOrbs showMeteors={true} opacity={1} />
      <div id="payments-main-content" style={{ position: 'relative', zIndex: 1 }}>
        <Header user={user} />
        <Routes>
          <Route path="/"                 element={<PaymentsLandingPage user={user} />} />
          <Route path="/dashboard"        element={<PaymentsDashboard />} />
          <Route path="/status"           element={<PaymentsDashboard />} />
          <Route path="/requests"         element={<AIRequestsView />} />
          <Route path="/invoices"         element={<InvoicesView />} />
          <Route path="/checkout/:planId" element={<CheckoutModal user={user} />} />

          <Route path="/plans/:planId"    element={<PlanDetailPage />} />
          <Route path="/compare"          element={<CompareTablePage />} />
        </Routes>
      </div>
    </div>
  );
}
