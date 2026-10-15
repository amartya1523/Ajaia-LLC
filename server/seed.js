import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDb, tx } from './db.js';

export const SEED_USERS = [
  { email: 'alice@ajaia.dev', name: 'Alice Johnson', color: '#4f46e5' },
  { email: 'bob@ajaia.dev', name: 'Bob Martinez', color: '#0d9488' },
  { email: 'carol@ajaia.dev', name: 'Carol Chen', color: '#c2410c' },
];

const WELCOME_HTML = `
<h1>Q4 Product Planning</h1>
<p>This document is owned by <strong>Alice</strong> and shared with <strong>Bob</strong> as an <em>editor</em>. Sign in as Carol to see that she cannot open it.</p>
<h2>Goals</h2>
<ul>
  <li><p>Ship the lightweight docs editor to the internal pilot team</p></li>
  <li><p>Support <u>file import</u> for .txt, .md and .docx</p></li>
  <li><p>Make sharing obvious: owned vs. shared documents</p></li>
</ul>
<h2>Next steps</h2>
<ol>
  <li><p>Collect pilot feedback</p></li>
  <li><p>Decide on real-time collaboration (CRDT) scope</p></li>
</ol>
<blockquote><p>Tip: changes are saved automatically.</p></blockquote>
`.trim();

/** Inserts demo users and one shared document if the database is empty. */
export function seed(db) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get();
  if (n > 0) return false;

  tx(db, () => {
    const insertUser = db.prepare('INSERT INTO users (email, name, color) VALUES (?, ?, ?)');
    const ids = SEED_USERS.map((u) => Number(insertUser.run(u.email, u.name, u.color).lastInsertRowid));
    const [alice, bob] = ids;

    const docId = crypto.randomUUID();
    db.prepare('INSERT INTO documents (id, title, content, owner_id, updated_by) VALUES (?, ?, ?, ?, ?)')
      .run(docId, 'Q4 Product Planning', WELCOME_HTML, alice, alice);
    db.prepare("INSERT INTO document_shares (document_id, user_id, role) VALUES (?, ?, 'editor')").run(docId, bob);

    db.prepare('INSERT INTO documents (id, title, content, owner_id, updated_by) VALUES (?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), "Bob's meeting notes", '<h2>Standup</h2><p>Nothing blocking this week.</p>', bob, bob);
  });
  return true;
}

// `npm run seed` seeds the default database file.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const created = seed(openDb());
  console.log(created ? 'Seeded demo users and documents.' : 'Database already has data; nothing to do.');
}
