import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import { api, SUPPORTED_UPLOADS } from '../api.js';
import { Logo, UserMenu } from '../components/Header.jsx';
import Toolbar from '../components/Toolbar.jsx';
import ShareDialog from '../components/ShareDialog.jsx';
import Avatar from '../components/Avatar.jsx';
import { useToast } from '../components/Toast.jsx';

const AUTOSAVE_MS = 800;
const POLL_MS = 4000;

const STATUS_LABEL = {
  saved: 'All changes saved',
  dirty: 'Unsaved changes…',
  saving: 'Saving…',
  error: 'Save failed — retrying',
  conflict: 'Edited elsewhere',
};

export default function EditorPage() {
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    setDoc(null);
    setLoadError('');
    api.getDoc(id).then((r) => setDoc(r.document)).catch((e) => setLoadError(e.message));
  }, [id]);

  if (loadError) {
    return (
      <div className="center-screen">
        <div className="empty-card">
          <h2>Can’t open this document</h2>
          <p className="muted">{loadError} It may have been deleted, or the owner hasn’t shared it with you.</p>
          <Link to="/" className="btn btn-primary">Back to documents</Link>
        </div>
      </div>
    );
  }
  if (!doc) return <div className="center-screen"><div className="spinner" /></div>;
  return <DocEditor key={doc.id} initial={doc} />;
}

function DocEditor({ initial }) {
  const [doc, setDoc] = useState(initial);
  const [title, setTitle] = useState(initial.title);
  const [status, setStatus] = useState('saved');
  const [conflict, setConflict] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const versionRef = useRef(initial.version);
  const titleRef = useRef(initial.title);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const timerRef = useRef(null);
  const conflictRef = useRef(null);
  const fileInput = useRef(null);
  const titleInput = useRef(null);
  const saveRef = useRef(() => {});

  const canEdit = doc.role !== 'viewer';
  const closeShare = useCallback(() => setShareOpen(false), []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
    ],
    content: initial.content,
    editable: initial.role !== 'viewer',
    onUpdate: () => markDirty(),
  });

  const scheduleSave = useCallback((delay = AUTOSAVE_MS) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => saveRef.current(), delay);
  }, []);

  function markDirty() {
    dirtyRef.current = true;
    if (!conflictRef.current) setStatus('dirty');
    scheduleSave();
  }

  // Sends the latest title + content. Only one request is in flight at a time;
  // edits made during a save trigger a follow-up save when it finishes.
  async function save({ force = false } = {}) {
    if (!editor || (conflictRef.current && !force)) return;
    if (savingRef.current) { pendingRef.current = true; return; }
    if (!dirtyRef.current && !force) return;

    clearTimeout(timerRef.current);
    savingRef.current = true;
    dirtyRef.current = false;
    setStatus('saving');
    try {
      const { document } = await api.updateDoc(doc.id, {
        title: titleRef.current.trim() || 'Untitled document',
        content: editor.getHTML(),
        baseVersion: versionRef.current,
        force,
      });
      versionRef.current = document.version;
      conflictRef.current = null;
      setConflict(null);
      setDoc((d) => ({ ...d, ...document, content: undefined }));
      setStatus(dirtyRef.current ? 'dirty' : 'saved');
    } catch (e) {
      dirtyRef.current = true;
      if (e.status === 409) {
        conflictRef.current = e.body.document;
        setConflict(e.body.document);
        setStatus('conflict');
      } else if (e.status === 403 || e.status === 404) {
        toast(e.message, 'error');
        setStatus('error');
      } else {
        setStatus('error');
        scheduleSave(5000);
      }
    } finally {
      savingRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        scheduleSave(0);
      }
    }
  }
  saveRef.current = save;

  // Pull other people's saves while we have nothing unsaved locally.
  useEffect(() => {
    if (!editor) return undefined;
    const tick = async () => {
      if (dirtyRef.current || savingRef.current || conflictRef.current) return;
      try {
        const { document } = await api.getDoc(doc.id);
        if (dirtyRef.current || savingRef.current) return;
        if (document.version > versionRef.current) {
          versionRef.current = document.version;
          editor.commands.setContent(document.content, false);
          titleRef.current = document.title;
          setTitle(document.title);
          toast(`Updated by ${document.updatedBy || 'a collaborator'}`);
        }
        // emitUpdate=false: toggling editability must not look like a content edit.
        const editable = document.role !== 'viewer';
        if (editor.isEditable !== editable) editor.setEditable(editable, false);
        setDoc((d) => ({ ...d, ...document, content: undefined }));
      } catch (e) {
        if (e.status === 404) {
          toast('Your access to this document was removed.', 'error');
          navigate('/');
        }
      }
    };
    const handle = setInterval(tick, POLL_MS);
    return () => clearInterval(handle);
  }, [editor, doc.id, navigate, toast]);

  // ⌘/Ctrl+S saves immediately; warn before leaving with unsaved work.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveRef.current({});
      }
    };
    const onBeforeUnload = (e) => {
      if (dirtyRef.current || savingRef.current) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onBeforeUnload);
      clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (location.state?.focusTitle) titleInput.current?.select();
  }, [location.state]);

  function onTitleChange(value) {
    setTitle(value);
    titleRef.current = value;
    markDirty();
  }

  function onTitleBlur() {
    if (!title.trim()) onTitleChange('Untitled document');
  }

  function resolveConflict(keepMine) {
    if (keepMine) {
      save({ force: true });
      return;
    }
    const remote = conflictRef.current;
    versionRef.current = remote.version;
    conflictRef.current = null;
    dirtyRef.current = false;
    editor.commands.setContent(remote.content, false);
    titleRef.current = remote.title;
    setTitle(remote.title);
    setConflict(null);
    setStatus('saved');
  }

  async function insertFile(file) {
    if (!file) return;
    try {
      const { html } = await api.importInto(doc.id, file);
      editor.chain().focus().insertContent(html).run();
      toast(`Inserted "${file.name}"`, 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      fileInput.current.value = '';
    }
  }

  const words = editor ? (editor.state.doc.textContent.match(/\S+/g) || []).length : 0;

  return (
    <div className="app-shell editor-shell">
      <header className="topbar editor-topbar">
        <Logo />
        <div className="title-block">
          <input
            ref={titleInput}
            className="title-input"
            value={title}
            maxLength={200}
            readOnly={!canEdit}
            aria-label="Document title"
            onChange={(e) => onTitleChange(e.target.value)}
            onBlur={onTitleBlur}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          <div className="title-meta">
            {doc.role === 'owner' ? <span className="badge badge-owner">Owner</span>
              : <span className={`badge badge-${doc.role}`}>{doc.role === 'editor' ? 'Can edit' : 'View only'} · shared by {doc.owner.name}</span>}
            {canEdit && <span className={`save-status status-${status}`}>{STATUS_LABEL[status]}</span>}
          </div>
        </div>
        <div className="editor-actions">
          <div className="avatars">
            {[doc.owner, ...doc.shares].map((u) => <Avatar key={u.id} user={u} size={26} />)}
          </div>
          <details className="menu">
            <summary className="btn btn-ghost">Export ▾</summary>
            <div className="menu-pop">
              <a href={api.exportUrl(doc.id, 'md')} onClick={() => saveRef.current({})}>Markdown (.md)</a>
              <a href={api.exportUrl(doc.id, 'html')} onClick={() => saveRef.current({})}>HTML (.html)</a>
              <button type="button" onClick={() => window.print()}>Print / Save as PDF</button>
            </div>
          </details>
          {doc.role === 'owner' && (
            <button className="btn btn-primary" onClick={() => setShareOpen(true)}>Share</button>
          )}
          <UserMenu />
        </div>
      </header>

      {canEdit ? (
        <Toolbar editor={editor} onImport={() => fileInput.current?.click()} />
      ) : (
        <div className="banner banner-info">You have view-only access to this document. Ask {doc.owner.name} for edit access.</div>
      )}
      <input ref={fileInput} type="file" accept={SUPPORTED_UPLOADS} hidden onChange={(e) => insertFile(e.target.files[0])} />

      {conflict && (
        <div className="banner banner-warn" role="alert">
          <span><strong>{conflict.updatedBy || 'Someone'}</strong> saved a newer version while you were editing.</span>
          <span className="banner-actions">
            <button className="btn btn-sm" onClick={() => resolveConflict(false)}>Load their version</button>
            <button className="btn btn-sm btn-primary" onClick={() => resolveConflict(true)}>Overwrite with mine</button>
          </span>
        </div>
      )}

      <main className="page-wrap" onClick={(e) => e.target === e.currentTarget && editor?.commands.focus('end')}>
        <article className="page">
          <EditorContent editor={editor} className="doc-content" />
        </article>
      </main>

      <footer className="statusbar">
        <span>{words} {words === 1 ? 'word' : 'words'}</span>
        <span>Last edited by {doc.updatedBy || doc.owner.name}</span>
        <Link to="/">← All documents</Link>
      </footer>

      {shareOpen && <ShareDialog doc={doc} onChange={(d) => setDoc((cur) => ({ ...cur, ...d, content: undefined }))} onClose={closeShare} />}
    </div>
  );
}
