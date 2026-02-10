import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './LoginPage.css';

export default function LoginPage() {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;

    setError('');
    setLoading(true);

    const success = await login(key.trim());
    setLoading(false);

    if (success) {
      navigate('/', { replace: true });
    } else {
      setError('Incorrect access key');
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <img src="/logo.png" alt="AEBC Logo" className="login-logo" />
        <h1>AEBC Attendance</h1>
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
      </form>
    </div>
  );
}
