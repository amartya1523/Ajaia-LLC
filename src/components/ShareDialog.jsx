import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import Avatar from './Avatar.jsx';

export default function ShareDialog({ doc, onChange, onClose }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const inputRef = useRef(null);

  useEffect(() => {
    api.users().then((r) => setUsers(r.users)).catch(() => {});
    inputRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sharedIds = new Set(doc.shares.map((s) => s.id));
  const suggestions = users.filter((u) => !sharedIds.has(u.id));

  async function run(fn, success) {
    setBusy(true);
    setError('');
    try {
      const { document } = await fn();
      onChange(document);
      if (success) toast(success, 'success');
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e) {
    e.preventDefault();
    const address = email.trim();
    if (!address) return;
    if (await run(() => api.share(doc.id, address, role), `Shared with ${address}`)) setEmail('');
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <div className="modal-head">
          <h2 id="share-title">Share “{doc.title}”</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form className="share-form" onSubmit={add}>
          <input
            ref={inputRef}
            list="share-users"
            type="email"
            placeholder="Add people by email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <datalist id="share-users">
            {suggestions.map((u) => <option key={u.id} value={u.email}>{u.name}</option>)}
          </datalist>
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Permission">
            <option value="editor">Can edit</option>
            <option value="viewer">Can view</option>
          </select>
          <button className="btn btn-primary" disabled={busy || !email.trim()}>Share</button>
        </form>
        {error && <p className="form-error">{error}</p>}
        {suggestions.length > 0 && (
          <div className="suggest-chips">
            {suggestions.map((u) => (
              <button key={u.id} type="button" className="chip" onClick={() => setEmail(u.email)}>
                <Avatar user={u} size={18} /> {u.name}
              </button>
            ))}
          </div>
        )}

        <h3 className="modal-sub">People with access</h3>
        <ul className="access-list">
          <li>
            <Avatar user={doc.owner} />
            <span className="access-who"><strong>{doc.owner.name}</strong><small>{doc.owner.email}</small></span>
            <span className="muted">Owner</span>
          </li>
          {doc.shares.map((s) => (
            <li key={s.id}>
              <Avatar user={s} />
              <span className="access-who"><strong>{s.name}</strong><small>{s.email}</small></span>
              <select
                value={s.role}
                disabled={busy}
                aria-label={`Permission for ${s.name}`}
                onChange={(e) => run(() => api.share(doc.id, s.email, e.target.value), `${s.name} can now ${e.target.value === 'editor' ? 'edit' : 'view'}`)}
              >
                <option value="editor">Can edit</option>
                <option value="viewer">Can view</option>
              </select>
              <button className="btn btn-ghost btn-sm danger" disabled={busy} onClick={() => run(() => api.unshare(doc.id, s.id), `Removed ${s.name}`)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="modal-foot">
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
