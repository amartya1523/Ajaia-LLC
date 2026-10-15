import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import { api } from '../api.js';
import Avatar from './Avatar.jsx';

export function Logo() {
  return (
    <Link to="/" className="logo">
      <span className="logo-mark">
        <svg viewBox="0 0 32 32" width="28" height="28"><rect width="32" height="32" rx="7" fill="#4f46e5" /><path d="M10 9h9l4 4v10H10z" fill="white" /><path d="M13 16h7M13 19h7" stroke="#4f46e5" strokeWidth="1.5" /></svg>
      </span>
      <span>Ajaia <b>Docs</b></span>
    </Link>
  );
}

export function UserMenu() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  async function logout() {
    await api.logout().catch(() => {});
    setUser(null);
    navigate('/login');
  }
  return (
    <div className="user-menu">
      <Avatar user={user} />
      <div className="user-meta">
        <span className="user-name">{user.name}</span>
        <span className="user-email">{user.email}</span>
      </div>
      <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
    </div>
  );
}
