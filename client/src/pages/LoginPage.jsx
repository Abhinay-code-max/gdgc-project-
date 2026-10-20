import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { Notice, FieldError } from '../components.jsx';

export function LoginPage({ user, onAuthenticated }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [fields, setFields] = useState({});
  const [rateLimited, setRateLimited] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState(true);

  // If already authenticated, redirect
  useEffect(() => {
    if (user) {
      navigate(user.role === 'studio' ? '/seller' : '/buyer', { replace: true });
    }
  }, [user, navigate]);

  // Check auth config and URL error params
  useEffect(() => {
    Promise.resolve().then(() => {
      api('/api/auth/config')
        .then((cfg) => {
          setGoogleAvailable(Boolean(cfg?.googleAuthAvailable));
        })
        .catch(() => {});

      const oauthError = searchParams.get('error');
      if (oauthError) {
        if (oauthError === 'oauth_not_configured') {
          setError('Google OAuth is not configured on this server. Please use email and password.');
        } else if (oauthError === 'unverified_email') {
          setError('Your Google email address is not verified. Please use a verified account.');
        } else if (oauthError === 'oauth_denied') {
          setError('Google authentication was cancelled.');
        } else {
          setError('Google authentication was not completed. Please try again.');
        }
      }
    });
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    setFields({});
    setRateLimited(false);

    try {
      const result = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      onAuthenticated(result.user);
      navigate(result.user.role === 'studio' ? '/seller' : '/buyer', { replace: true });
    } catch (problem) {
      if (problem instanceof ApiError) {
        if (problem.status === 429 || problem.code === 'RATE_LIMITED') {
          setRateLimited(true);
          setError('Too many attempts. You are temporarily rate-limited. Please wait a few minutes before trying again.');
        } else {
          setError(problem.message);
          setFields(problem.fields || {});
        }
      } else {
        setError('An unexpected error occurred during sign in.');
      }
    } finally {
      setPending(false);
    }
  };

  const handleGoogleClick = (e) => {
    if (!googleAvailable) {
      e.preventDefault();
      setError('Google OAuth is not configured on this server. Please use email and password.');
    }
  };

  return (
    <div className="auth-page-container">
      <div className="auth-card">
        <p className="eyebrow">WELCOME BACK</p>
        <h1 style={{ font: "600 32px 'Playfair Display', serif", margin: '0 0 8px' }}>
          Sign In to Atelier
        </h1>
        <p className="muted" style={{ margin: '0 0 24px', fontSize: '14px' }}>
          Buyers and studio sellers use the same secure authentication.
        </p>

        {error && (
          <Notice kind={rateLimited ? 'conflict' : 'error'}>
            {error}
          </Notice>
        )}

        {/* Google OAuth Button */}
        <a
          href="/api/auth/google"
          className="button--google"
          onClick={handleGoogleClick}
          aria-label="Continue with Google"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
              d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z"
              fill="#4285F4"
            />
            <path
              d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
              fill="#34A853"
            />
            <path
              d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"
              fill="#FBBC05"
            />
            <path
              d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </a>

        {!googleAvailable && (
          <small className="muted" style={{ display: 'block', textAlign: 'center', marginTop: '6px' }}>
            (Google OAuth not configured; use email login)
          </small>
        )}

        <div className="auth-divider">
          <span>or sign in with password</span>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <label>
            Email address
            <input
              type="email"
              autoFocus
              required
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              disabled={pending}
            />
            <FieldError value={fields.email} />
          </label>

          <label>
            Password
            <input
              type="password"
              required
              minLength={12}
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              disabled={pending}
            />
            <FieldError value={fields.password} />
          </label>

          <button
            type="submit"
            className="button button--wide"
            disabled={pending}
            style={{ marginTop: '16px' }}
          >
            {pending ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div className="auth-footer-link">
          Don't have an account?
          <Link to="/register">Create a buyer account</Link>
        </div>
      </div>
    </div>
  );
}
