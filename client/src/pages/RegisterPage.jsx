import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { Notice, FieldError } from '../components.jsx';

export function RegisterPage({ user, onAuthenticated }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [fields, setFields] = useState({});
  const [rateLimited, setRateLimited] = useState(false);

  useEffect(() => {
    if (user) {
      navigate(user.role === 'studio' ? '/seller' : '/buyer', { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    setFields({});
    setRateLimited(false);

    try {
      const result = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      onAuthenticated(result.user);
      navigate('/buyer', { replace: true });
    } catch (problem) {
      if (problem instanceof ApiError) {
        if (problem.status === 429 || problem.code === 'RATE_LIMITED') {
          setRateLimited(true);
          setError('Registration limit reached. Please wait a few moments before trying again.');
        } else if (problem.status === 409) {
          setError(problem.message);
        } else {
          setError(problem.message);
          setFields(problem.fields || {});
        }
      } else {
        setError('An unexpected error occurred during account creation.');
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="auth-page-container">
      <div className="auth-card">
        <p className="eyebrow">JOIN THE STUDIO</p>
        <h1 style={{ font: "600 32px 'Playfair Display', serif", margin: '0 0 8px' }}>
          Create Buyer Account
        </h1>
        <p className="muted" style={{ margin: '0 0 24px', fontSize: '14px' }}>
          Registration creates a collector account enabling you to purchase original paintings and manage orders.
        </p>

        {error && (
          <Notice kind={rateLimited ? 'conflict' : 'error'}>
            {error}
          </Notice>
        )}

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
            Password <span className="muted">(minimum 12 characters)</span>
            <input
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
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
            {pending ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <div className="auth-footer-link">
          Already have an account?
          <Link to="/login">Sign in here</Link>
        </div>
      </div>
    </div>
  );
}
