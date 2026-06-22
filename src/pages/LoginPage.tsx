import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import type { AuthRole } from '../lib/constants';
import './LoginPage.css';

const ROLE_LABELS: Record<AuthRole, string> = {
  attendance: 'Attendance Taker',
  followup: 'Follow-up Dashboard',
};

export default function LoginPage() {
  const [role, setRole] = useState<AuthRole | null>(null);
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  // Hook is role-aware. LoginPage only ever calls login(), never reads
  // isAuthenticated, so the default 'attendance' instance before a role is
  // chosen is harmless; login() closes over the chosen role's keys.
  const { login } = useAuth(role ?? 'attendance');

  function chooseRole(next: AuthRole) {
    setRole(next);
    setKey('');
    setError('');
  }

  function back() {
    setRole(null);
    setKey('');
    setError('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!key.trim() || !role) return;

    setError('');
    setLoading(true);

    const success = await login(key.trim());
    setLoading(false);

    if (success) {
      navigate(role === 'followup' ? '/followup' : '/', { replace: true });
    } else {
      setError('Incorrect access key');
    }
  }

  if (!role) {
    return (
      <div className="login-page">
        <div className="login-card">
          <img src="/logo_small.png" alt="AEBC Logo" className="login-logo" />
          <h1>AEBC</h1>
          <p>Choose how you want to sign in</p>
          <div className="login-role-choices">
            <button
              type="button"
              className="login-role-btn"
              onClick={() => chooseRole('attendance')}
            >
              <span className="login-role-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
              </span>
              <span className="login-role-text">
                <span className="login-role-name">Attendance Taker</span>
                <span className="login-role-desc">Mark who's present at a service</span>
              </span>
              <span className="login-role-arrow" aria-hidden="true">→</span>
            </button>
            <button
              type="button"
              className="login-role-btn"
              onClick={() => chooseRole('followup')}
            >
              <span className="login-role-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </span>
              <span className="login-role-text">
                <span className="login-role-name">Follow-up Dashboard</span>
                <span className="login-role-desc">Track who needs a check-in</span>
              </span>
              <span className="login-role-arrow" aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <img src="/logo_small.png" alt="AEBC Logo" className="login-logo" />
        <h1>{ROLE_LABELS[role]}</h1>
        <p>Enter the access key to continue</p>
        {error && <div className="login-error">{error}</div>}
        <input
          type="password"
          placeholder="Access key"
          value={key}
          onChange={e => setKey(e.target.value)}
          autoFocus
        />
        <button type="submit" disabled={loading || !key.trim()}>
          {loading ? 'Checking...' : 'Enter'}
        </button>
        <button type="button" className="login-back-btn" onClick={back}>
          ← Back
        </button>
      </form>
    </div>
  );
}
