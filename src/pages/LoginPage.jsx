import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import Avatar from '../components/Avatar.jsx';

export default function LoginPage() {
  const { setUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.demoUsers().then((r) => setUsers(r.users)).catch(() => {});
  }, []);

  async function signIn(address) {
    setError('');
    setBusy(true);
    try {
      const { user } = await api.login(address);
      setUser(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <svg viewBox="0 0 32 32" width="44" height="44"><rect width="32" height="32" rx="7" fill="#4f46e5" /><path d="M10 9h9l4 4v10H10z" fill="white" /><path d="M13 16h7M13 19h7" stroke="#4f46e5" strokeWidth="1.5" /></svg>
          <h1>Ajaia Docs</h1>
          <p>Write, import and share documents with your team.</p>
        </div>

        <h2 className="login-section">Continue as a demo user</h2>
        <div className="demo-users">
          {users.map((u) => (
            <button key={u.email} className="demo-user" disabled={busy} onClick={() => signIn(u.email)}>
              <Avatar user={u} size={36} />
              <span>
                <strong>{u.name}</strong>
                <small>{u.email}</small>
              </span>
              <span className="chev">→</span>
            </button>
          ))}
        </div>

        <form className="login-form" onSubmit={(e) => { e.preventDefault(); signIn(email); }}>
          <label htmlFor="email">Or sign in with email</label>
          <div className="row">
            <input id="email" type="email" placeholder="alice@ajaia.dev" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <button className="btn btn-primary" disabled={busy}>Sign in</button>
          </div>
          {error && <p className="form-error">{error}</p>}
        </form>
        <p className="login-note">Demo environment: authentication is simulated with seeded accounts (no passwords).</p>
      </div>
    </div>
  );
}
