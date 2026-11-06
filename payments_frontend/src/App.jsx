import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import RequireAuth from './components/layout/RequireAuth';
import PaymentsIntroLoader from './features/payments/components/intro/PaymentsIntroLoader';
import DashboardPage from './features/payments/components/dashboard/DashboardPage';
import UsagePage from './features/payments/components/usage/UsagePage';
import RequestsPage from './features/payments/components/requests/RequestsPage';
import PlansPage from './features/payments/components/plans/PlansPage';
import CheckoutPage from './features/payments/components/checkout/CheckoutPage';
import InvoicesPage from './features/payments/components/invoices/InvoicesPage';
import { applyTheme, usePayments } from './features/payments/Hooks/payments.hooks';
import { syncOwner } from './features/payments/Hooks/payments.queries';
import api, { setAccessToken } from './services/api';
import './styles/index.scss';

const INTRO_KEY = 'taksha_payments_intro_v10_clip';

const readIntroSeen = () => {
  try {
    return sessionStorage.getItem(INTRO_KEY) === 'true';
  } catch {
    return true;
  }
};

/** Old /plans/:planId links now go straight to checkout. */
function PlanRedirect() {
  const { planId } = useParams();
  return <Navigate to={`/checkout/${planId}`} replace />;
}

export default function App() {
  const { theme } = usePayments();
  const navigate = useNavigate();
  const forceIntro = new URLSearchParams(window.location.search).get('forceLoader') === 'true';
  const [showIntro, setShowIntro] = useState(() => forceIntro || !readIntroSeen());
  const dispatch = useDispatch();
  const [session, setSession] = useState({ user: null, checked: false });
  const { user, checked: authChecked } = session;

  useEffect(() => { applyTheme(theme); }, [theme]);

  // Session check: the access token lives in memory only, getMe restores it.
  // Cached billing data is kept only when it belongs to this same user.
  useEffect(() => {
    let active = true;
    const done = (next) => {
      if (!active) return;
      dispatch(syncOwner(next ? String(next._id || next.id || next.email) : null));
      setSession({ user: next, checked: true });
    };
    api.get('/api/auth/getMe', { baseURL: '', timeout: 5000 })
      .then((res) => {
        if (res.data?.accessToken) setAccessToken(res.data.accessToken);
        done(res.data?.user || null);
      })
      .catch(() => done(null));
    return () => { active = false; };
  }, [dispatch]);

  // Links from the IDE use ?route=...; map them to real paths.
  useEffect(() => {
    const route = new URLSearchParams(window.location.search).get('route');
    const target = { invoices: '/invoices', status: '/', dashboard: '/', requests: '/requests', logs: '/requests', usage: '/usage', checkout: '/checkout/pro_regular', plans: '/plans' }[route];
    if (target) navigate(target, { replace: true });
  }, [navigate]);

  const finishIntro = () => {
    setShowIntro(false);
    if (forceIntro) {
      const url = new URL(window.location.href);
      url.searchParams.delete('forceLoader');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  };

  return (
    <>
      {showIntro && <PaymentsIntroLoader forcePlay={forceIntro} onComplete={finishIntro} />}
      <Routes>
        <Route element={<AppShell user={user} authChecked={authChecked} />}>
          <Route index element={<RequireAuth><DashboardPage /></RequireAuth>} />
          <Route path="usage" element={<RequireAuth><UsagePage /></RequireAuth>} />
          <Route path="requests" element={<RequireAuth><RequestsPage /></RequireAuth>} />
          <Route path="plans" element={<PlansPage />} />
          <Route path="checkout" element={<Navigate to="/checkout/pro_regular" replace />} />
          <Route path="checkout/:planId" element={<RequireAuth><CheckoutPage /></RequireAuth>} />
          <Route path="invoices" element={<RequireAuth><InvoicesPage /></RequireAuth>} />

          {/* Old paths from the previous layout. */}
          <Route path="dashboard" element={<Navigate to="/" replace />} />
          <Route path="status" element={<Navigate to="/" replace />} />
          <Route path="compare" element={<Navigate to="/plans" replace />} />
          <Route path="plans/:planId" element={<PlanRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}
