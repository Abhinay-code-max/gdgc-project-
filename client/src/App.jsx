import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Link, useNavigate } from 'react-router-dom';
import { api, ApiError, displayRole } from './api.js';
import { Notice } from './components.jsx';
import { LogoLoader } from './components/LogoLoader.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { HomePage } from './pages/HomePage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { RegisterPage } from './pages/RegisterPage.jsx';
import { GalleryPage } from './pages/GalleryPage.jsx';
import { BuyerDashboard } from './pages/BuyerDashboard.jsx';
import { SellerDashboard } from './pages/SellerDashboard.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

function AppShell() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [logoutPending, setLogoutPending] = useState(false);

  useEffect(() => {
    let active = true;
    api('/api/auth/me')
      .then((data) => {
        if (active) setUser(data.user);
      })
      .catch((error) => {
        if (active && error.status !== 401) {
          setToast({
            kind: 'error',
            text: error instanceof ApiError ? error.message : 'Session verification failed.',
          });
        }
      })
      .finally(() => {
        if (active) setSessionLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleLogout = async () => {
    setLogoutPending(true);
    try {
      await api('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setToast({ kind: 'success', text: 'You have been signed out safely.' });
      navigate('/login');
    } catch (error) {
      setToast({
        kind: 'error',
        text: error instanceof ApiError ? error.message : 'Sign out failed.',
      });
    } finally {
      setLogoutPending(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link to="/" className="wordmark" aria-label="Atelier home">
          <span>Atelier</span>
          <small>ART STUDIO</small>
        </Link>

        <nav aria-label="Main navigation">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'nav-active' : '')}>
            Home
          </NavLink>
          <NavLink to="/gallery" className={({ isActive }) => (isActive ? 'nav-active' : '')}>
            Paintings
          </NavLink>
          {user?.role === 'customer' && (
            <NavLink to="/buyer" className={({ isActive }) => (isActive ? 'nav-active' : '')}>
              My Orders
            </NavLink>
          )}
          {user?.role === 'studio' && (
            <NavLink to="/seller" className={({ isActive }) => (isActive ? 'nav-active' : '')}>
              Manage Studio
            </NavLink>
          )}
        </nav>

        <div className="account-actions">
          {sessionLoading ? (
            <span className="muted" style={{ fontSize: '13px' }}>
              Checking session…
            </span>
          ) : user ? (
            <>
              <span className="account-label">
                {user.email} · <strong>{displayRole(user.role)}</strong>
              </span>
              <button
                className="button button--quiet"
                onClick={handleLogout}
                disabled={logoutPending}
              >
                {logoutPending ? 'Signing out…' : 'Log out'}
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="button button--quiet">
                Log in
              </Link>
              <Link to="/register" className="button">
                Register
              </Link>
            </>
          )}
        </div>
      </header>

      {toast && (
        <div className="toast-wrap">
          <Notice
            kind={toast.kind}
            action={
              <button aria-label="Dismiss notification" onClick={() => setToast(null)}>
                ×
              </button>
            }
          >
            {toast.text}
          </Notice>
        </div>
      )}

      <main>
        {sessionLoading ? (
          <LogoLoader message="Connecting to Atelier Art Studio…" />
        ) : (
          <Routes>
            <Route path="/" element={<HomePage user={user} />} />
            <Route
              path="/login"
              element={<LoginPage user={user} onAuthenticated={setUser} />}
            />
            <Route
              path="/register"
              element={<RegisterPage user={user} onAuthenticated={setUser} />}
            />
            <Route
              path="/gallery"
              element={<GalleryPage user={user} notify={setToast} />}
            />
            <Route
              path="/buyer"
              element={
                <ProtectedRoute user={user} loading={sessionLoading} requiredRole="customer">
                  <BuyerDashboard user={user} notify={setToast} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/seller"
              element={
                <ProtectedRoute user={user} loading={sessionLoading} requiredRole="studio">
                  <SellerDashboard user={user} notify={setToast} />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        )}
      </main>

      <footer>
        <span>Original work, thoughtfully collected.</span>
        <span>Purchases do not include online payment.</span>
      </footer>
    </div>
  );
}
