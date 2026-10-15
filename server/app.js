import crypto from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { fileToHtml, htmlToMarkdown, sanitizeContent, UnsupportedFileError, MAX_UPLOAD_BYTES } from './content.js';

const SESSION_COOKIE = 'ajaia_session';
const MAX_TITLE = 200;
const MAX_CONTENT_BYTES = 1024 * 1024;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

function cleanTitle(raw, fallback) {
  if (raw === undefined) return fallback;
  if (typeof raw !== 'string') throw new HttpError(400, 'Title must be a string.');
  const title = raw.replace(/\s+/g, ' ').trim();
  if (!title) throw new HttpError(400, 'Title cannot be empty.');
  if (title.length > MAX_TITLE) throw new HttpError(400, `Title must be at most ${MAX_TITLE} characters.`);
  return title;
}

function cleanContent(raw) {
  if (typeof raw !== 'string') throw new HttpError(400, 'Content must be an HTML string.');
  if (Buffer.byteLength(raw) > MAX_CONTENT_BYTES) throw new HttpError(413, 'Document is too large (max 1 MB).');
  return sanitizeContent(raw);
}

export function createApp(db) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  // ---------- data access helpers ----------
  const q = {
    userByEmail: db.prepare('SELECT id, email, name, color FROM users WHERE email = ?'),
    userBySession: db.prepare(
      'SELECT u.id, u.email, u.name, u.color FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?'),
    doc: db.prepare('SELECT * FROM documents WHERE id = ?'),
    share: db.prepare('SELECT role FROM document_shares WHERE document_id = ? AND user_id = ?'),
  };

  /**
   * Single source of truth for access: 'owner' | 'editor' | 'viewer' | null.
   * Every document route goes through loadDoc(), which uses this.
   */
  function roleFor(doc, userId) {
    if (doc.owner_id === userId) return 'owner';
    return q.share.get(doc.id, userId)?.role ?? null;
  }

  function loadDoc(req, minRole) {
    const doc = q.doc.get(req.params.id);
    const role = doc && roleFor(doc, req.user.id);
    // Same 404 for "missing" and "no access" so document IDs don't leak.
    if (!role) throw new HttpError(404, 'Document not found.');
    const rank = { viewer: 1, editor: 2, owner: 3 };
    if (rank[role] < rank[minRole]) {
      throw new HttpError(403, minRole === 'owner' ? 'Only the owner can do that.' : 'You have view-only access.');
    }
    return { doc, role };
  }

  function serializeDoc(doc, role) {
    const owner = db.prepare('SELECT id, name, email, color FROM users WHERE id = ?').get(doc.owner_id);
    const updatedBy = doc.updated_by && db.prepare('SELECT name FROM users WHERE id = ?').get(doc.updated_by);
    const result = {
      id: doc.id, title: doc.title, content: doc.content, version: doc.version,
      createdAt: doc.created_at, updatedAt: doc.updated_at, updatedBy: updatedBy?.name ?? null,
      owner, role,
    };
    result.shares = db.prepare(
      `SELECT u.id, u.name, u.email, u.color, s.role FROM document_shares s
       JOIN users u ON u.id = s.user_id WHERE s.document_id = ? ORDER BY u.name`).all(doc.id);
    return result;
  }

  function createDoc(ownerId, title, content) {
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO documents (id, title, content, owner_id, updated_by) VALUES (?, ?, ?, ?, ?)')
      .run(id, title, content, ownerId, ownerId);
    return q.doc.get(id);
  }

  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  // ---------- auth ----------
  app.post('/api/auth/login', (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    if (!email) throw new HttpError(400, 'Email is required.');
    const user = q.userByEmail.get(email);
    if (!user) throw new HttpError(401, 'No account with that email. Use one of the demo accounts.');
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, user.id);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 1000 * 60 * 60 * 24 * 7,
    });
    res.json({ user });
  });

  app.get('/api/auth/demo-users', (_req, res) => {
    res.json({ users: db.prepare('SELECT email, name, color FROM users ORDER BY id').all() });
  });

  // Everything below requires a session.
  app.use('/api', (req, _res, next) => {
    const token = req.cookies?.[SESSION_COOKIE];
    req.user = token ? q.userBySession.get(token) : undefined;
    if (!req.user) return next(new HttpError(401, 'Please sign in.'));
    next();
  });

  app.post('/api/auth/logout', (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(req.cookies[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => res.json({ user: req.user }));

  app.get('/api/users', (req, res) => {
    res.json({ users: db.prepare('SELECT id, email, name, color FROM users WHERE id != ? ORDER BY name').all(req.user.id) });
  });

  // ---------- documents ----------
  app.get('/api/documents', (req, res) => {
    const owned = db.prepare(
      `SELECT d.id, d.title, d.updated_at AS updatedAt, 'owner' AS role,
              (SELECT COUNT(*) FROM document_shares s WHERE s.document_id = d.id) AS shareCount
       FROM documents d WHERE d.owner_id = ? ORDER BY d.updated_at DESC`).all(req.user.id);
    const shared = db.prepare(
      `SELECT d.id, d.title, d.updated_at AS updatedAt, s.role, u.name AS ownerName, u.color AS ownerColor
       FROM document_shares s JOIN documents d ON d.id = s.document_id JOIN users u ON u.id = d.owner_id
       WHERE s.user_id = ? ORDER BY d.updated_at DESC`).all(req.user.id);
    res.json({ owned, shared });
  });

  app.post('/api/documents', (req, res) => {
    const title = cleanTitle(req.body?.title, 'Untitled document');
    const content = req.body?.content === undefined ? '' : cleanContent(req.body.content);
    const doc = createDoc(req.user.id, title, content);
    res.status(201).json({ document: serializeDoc(doc, 'owner') });
  });

  app.get('/api/documents/:id', (req, res) => {
    const { doc, role } = loadDoc(req, 'viewer');
    res.json({ document: serializeDoc(doc, role) });
  });

  /**
   * Saves title and/or content. Clients send the version they started from;
   * if someone else saved in the meantime we return 409 instead of silently
   * overwriting their work. `force: true` lets the user explicitly overwrite.
   */
  app.patch('/api/documents/:id', (req, res) => {
    const { doc, role } = loadDoc(req, 'editor');
    const body = req.body ?? {};
    if (body.title === undefined && body.content === undefined) throw new HttpError(400, 'Nothing to update.');
    const title = cleanTitle(body.title, doc.title);
    const content = body.content === undefined ? doc.content : cleanContent(body.content);

    if (body.baseVersion !== undefined && !body.force && Number(body.baseVersion) !== doc.version) {
      return res.status(409).json({
        error: 'This document was changed by someone else.',
        document: serializeDoc(doc, role),
      });
    }

    db.prepare(
      `UPDATE documents SET title = ?, content = ?, version = version + 1,
       updated_at = datetime('now'), updated_by = ? WHERE id = ?`).run(title, content, req.user.id, doc.id);
    res.json({ document: serializeDoc(q.doc.get(doc.id), role) });
  });

  app.delete('/api/documents/:id', (req, res) => {
    const { doc } = loadDoc(req, 'owner');
    db.prepare('DELETE FROM documents WHERE id = ?').run(doc.id);
    res.status(204).end();
  });

  // ---------- sharing ----------
  app.post('/api/documents/:id/shares', (req, res) => {
    const { doc } = loadDoc(req, 'owner');
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const role = req.body?.role ?? 'editor';
    if (!email) throw new HttpError(400, 'Email is required.');
    if (!['viewer', 'editor'].includes(role)) throw new HttpError(400, 'Role must be "viewer" or "editor".');
    const target = q.userByEmail.get(email);
    if (!target) throw new HttpError(404, `No user found with email ${email}.`);
    if (target.id === doc.owner_id) throw new HttpError(400, 'The owner already has full access.');

    db.prepare(
      `INSERT INTO document_shares (document_id, user_id, role) VALUES (?, ?, ?)
       ON CONFLICT (document_id, user_id) DO UPDATE SET role = excluded.role`).run(doc.id, target.id, role);
    res.status(201).json({ document: serializeDoc(q.doc.get(doc.id), 'owner') });
  });

  app.delete('/api/documents/:id/shares/:userId', (req, res) => {
    const { doc } = loadDoc(req, 'owner');
    db.prepare('DELETE FROM document_shares WHERE document_id = ? AND user_id = ?').run(doc.id, Number(req.params.userId));
    res.json({ document: serializeDoc(q.doc.get(doc.id), 'owner') });
  });

  // ---------- file import / export ----------
  const singleFile = (req, res, next) =>
    upload.single('file')(req, res, (err) => {
      if (err?.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, 'File is too large (max 2 MB).'));
      next(err);
    });

  async function convertUpload(req) {
    if (!req.file) throw new HttpError(400, 'Attach a file in the "file" field.');
    try {
      return await fileToHtml(req.file.originalname, req.file.buffer);
    } catch (err) {
      if (err instanceof UnsupportedFileError) throw new HttpError(415, err.message);
      throw err;
    }
  }

  // Upload a file and turn it into a brand new document.
  app.post('/api/documents/import', singleFile, wrap(async (req, res) => {
    const { title, html } = await convertUpload(req);
    const doc = createDoc(req.user.id, title, html);
    res.status(201).json({ document: serializeDoc(doc, 'owner') });
  }));

  // Convert a file so the editor can insert it into an existing draft.
  app.post('/api/documents/:id/import', singleFile, wrap(async (req, res) => {
    loadDoc(req, 'editor');
    const { html } = await convertUpload(req);
    res.json({ html });
  }));

  app.get('/api/documents/:id/export', (req, res) => {
    const { doc } = loadDoc(req, 'viewer');
    const format = req.query.format === 'html' ? 'html' : 'md';
    const safeName = doc.title.replace(/[^\w\- ]+/g, '').trim() || 'document';
    const body = format === 'md'
      ? `# ${doc.title}\n\n${htmlToMarkdown(doc.content)}\n`
      : `<!doctype html><html><head><meta charset="utf-8"><title>${safeName}</title></head><body>${doc.content}</body></html>`;
    res.setHeader('Content-Type', format === 'md' ? 'text/markdown; charset=utf-8' : 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.${format}"`);
    res.send(body);
  });

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found.')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') err = new HttpError(400, 'Malformed JSON body.');
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong on our side.' : err.message });
  });

  return app;
}
