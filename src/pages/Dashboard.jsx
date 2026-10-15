import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, SUPPORTED_UPLOADS, UPLOAD_HELP } from '../api.js';
import { Logo, UserMenu } from '../components/Header.jsx';
import { useToast } from '../components/Toast.jsx';

function timeAgo(sqliteUtc) {
  const then = new Date(sqliteUtc.replace(' ', 'T') + 'Z').getTime();
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(then).toLocaleDateString();
}

const TABS = [
  { key: 'all', label: 'All documents' },
  { key: 'owned', label: 'Owned by me' },
  { key: 'shared', label: 'Shared with me' },
];

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);
  const navigate = useNavigate();
  const toast = useToast();

  const load = () => api.listDocs().then(setData).catch((e) => toast(e.message, 'error'));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function createBlank() {
    setBusy(true);
    try {
      const { document } = await api.createDoc();
      navigate(`/d/${document.id}`, { state: { focusTitle: true } });
    } catch (e) {
      toast(e.message, 'error');
      setBusy(false);
    }
  }

  async function importFile(file) {
    if (!file) return;
    setBusy(true);
    try {
      const { document } = await api.importAsNew(file);
      toast(`Imported "${file.name}"`, 'success');
      navigate(`/d/${document.id}`);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function remove(doc) {
    if (!window.confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    try {
      await api.deleteDoc(doc.id);
      toast('Document deleted');
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  const rows = !data ? [] : [
    ...(tab !== 'shared' ? data.owned.map((d) => ({ ...d, owned: true })) : []),
    ...(tab !== 'owned' ? data.shared.map((d) => ({ ...d, owned: false })) : []),
  ]
    .filter((d) => d.title.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="app-shell">
      <header className="topbar">
        <Logo />
        <input className="search" placeholder="Search documents" value={query} onChange={(e) => setQuery(e.target.value)} />
        <UserMenu />
      </header>

      <main className="dashboard">
        <section className="start-row">
          <button className="start-card" onClick={createBlank} disabled={busy}>
            <span className="start-icon plus">+</span>
            <strong>Blank document</strong>
            <small>Start writing from scratch</small>
          </button>
          <div
            className={`start-card dropzone ${dragging ? 'dragging' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => fileInput.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && fileInput.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); importFile(e.dataTransfer.files[0]); }}
          >
            <span className="start-icon">⇪</span>
            <strong>Import a file</strong>
            <small>Drop or browse. {UPLOAD_HELP}</small>
            <input ref={fileInput} type="file" accept={SUPPORTED_UPLOADS} hidden onChange={(e) => importFile(e.target.files[0])} />
          </div>
        </section>

        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
              {t.label}
              {data && <span className="count">{t.key === 'all' ? data.owned.length + data.shared.length : data[t.key].length}</span>}
            </button>
          ))}
        </nav>

        {!data ? (
          <div className="doc-list-empty"><div className="spinner" /></div>
        ) : rows.length === 0 ? (
          <div className="doc-list-empty">
            <p>{query ? 'No documents match your search.' : tab === 'shared' ? 'Nothing has been shared with you yet.' : 'No documents yet. Create one above.'}</p>
          </div>
        ) : (
          <ul className="doc-list">
            {rows.map((d) => (
              <li key={d.id} className="doc-row">
                <Link to={`/d/${d.id}`} className="doc-link">
                  <span className="doc-icon">▤</span>
                  <span className="doc-title">{d.title}</span>
                </Link>
                <span className="doc-owner">
                  {d.owned ? (
                    <span className="badge badge-owner">Owner{d.shareCount > 0 && ` · shared with ${d.shareCount}`}</span>
                  ) : (
                    <>
                      <span className={`badge badge-${d.role}`}>{d.role === 'editor' ? 'Can edit' : 'View only'}</span>
                      <span className="muted">from {d.ownerName}</span>
                    </>
                  )}
                </span>
                <span className="doc-time muted">{timeAgo(d.updatedAt)}</span>
                <span className="doc-actions">
                  {d.owned && <button className="btn btn-ghost btn-sm danger" onClick={() => remove(d)} aria-label={`Delete ${d.title}`}>Delete</button>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
