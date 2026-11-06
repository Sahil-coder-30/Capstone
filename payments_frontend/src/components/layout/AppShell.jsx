import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { resetCache, useQueries } from '../../features/payments/Hooks/payments.queries';
import api, { clearAccessToken } from '../../services/api';
import './AppShell.scss';

const IDE_URL = import.meta.env.VITE_MAIN_APP_URL || 'http://localhost:5173';

/**
 * Full-screen app frame: fixed sidebar on the left, sticky top bar and the
 * routed page. Pages read the session through useOutletContext().
 */
export default function AppShell({ user, authChecked }) {
  const { pathname } = useLocation();
  const dispatch = useDispatch();
  const [navOpen, setNavOpen] = useState(false);

  // Sidebar credit widget and top bar plan badge need these on every page.
  // The dashboard overview also fills them, so on the dashboard this is free.
  const account = useQueries(['credit', 'subscription'], { enabled: Boolean(user) });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  const signOut = async () => {
    try {
      await api.post('/api/auth/logout', {}, { baseURL: '' });
    } catch {
      // Signing out locally still matters if the server call fails.
    }
    clearAccessToken();
    dispatch(resetCache());
    window.location.href = IDE_URL;
  };

  return (
    <div className="shell">
      <Sidebar
        user={user}
        creditFailed={account.error}
        open={navOpen}
        onClose={() => setNavOpen(false)}
        onSignOut={signOut}
        ideUrl={IDE_URL}
      />
      <div className="shell__main">
        <Topbar onMenu={() => setNavOpen(true)} user={user} ideUrl={IDE_URL} />
        <main className="shell__content" key={pathname}>
          <Outlet context={{ user, authChecked, ideUrl: IDE_URL }} />
        </main>
      </div>
    </div>
  );
}
