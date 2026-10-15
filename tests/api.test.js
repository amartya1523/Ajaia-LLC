import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';

let app;

async function login(email) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email }).expect(200);
  return agent;
}

beforeEach(() => {
  const db = openDb(':memory:');
  seed(db);
  app = createApp(db);
});

describe('auth', () => {
  it('rejects unauthenticated requests and unknown users', async () => {
    await request(app).get('/api/documents').expect(401);
    await request(app).post('/api/auth/login').send({ email: 'nobody@x.dev' }).expect(401);
  });
});

describe('documents', () => {
  it('creates, renames, saves and reopens a document with formatting intact', async () => {
    const alice = await login('alice@ajaia.dev');
    const { body: created } = await alice.post('/api/documents').send({}).expect(201);
    expect(created.document.title).toBe('Untitled document');
    const id = created.document.id;

    const html = '<h2>Plan</h2><p><strong>bold</strong> <em>it</em> <u>under</u></p><ul><li><p>one</p></li></ul>';
    await alice.patch(`/api/documents/${id}`)
      .send({ title: 'Roadmap', content: html, baseVersion: 1 }).expect(200);

    const { body } = await alice.get(`/api/documents/${id}`).expect(200);
    expect(body.document.title).toBe('Roadmap');
    expect(body.document.content).toBe(html);
    expect(body.document.version).toBe(2);
  });

  it('strips scripts and event handlers from saved content', async () => {
    const alice = await login('alice@ajaia.dev');
    const { body } = await alice.post('/api/documents')
      .send({ content: '<p onclick="steal()">hi</p><script>alert(1)</script><img src=x onerror=alert(1)>' }).expect(201);
    expect(body.document.content).toBe('<p>hi</p>');
  });

  it('validates titles', async () => {
    const alice = await login('alice@ajaia.dev');
    await alice.post('/api/documents').send({ title: '   ' }).expect(400);
    await alice.post('/api/documents').send({ title: 'x'.repeat(201) }).expect(400);
  });

  it('returns 409 instead of overwriting a newer version', async () => {
    const alice = await login('alice@ajaia.dev');
    const { body } = await alice.post('/api/documents').send({}).expect(201);
    const id = body.document.id;
    await alice.patch(`/api/documents/${id}`).send({ content: '<p>first</p>', baseVersion: 1 }).expect(200);
    const conflict = await alice.patch(`/api/documents/${id}`).send({ content: '<p>stale</p>', baseVersion: 1 }).expect(409);
    expect(conflict.body.document.content).toBe('<p>first</p>');
    await alice.patch(`/api/documents/${id}`).send({ content: '<p>mine</p>', baseVersion: 1, force: true }).expect(200);
  });
});

describe('sharing', () => {
  it('enforces owner / editor / viewer / no-access rules end to end', async () => {
    const alice = await login('alice@ajaia.dev');
    const bob = await login('bob@ajaia.dev');
    const carol = await login('carol@ajaia.dev');

    const { body } = await alice.post('/api/documents').send({ title: 'Secret plan' }).expect(201);
    const id = body.document.id;

    // Before sharing, nobody else can see it (and existence is not leaked).
    await bob.get(`/api/documents/${id}`).expect(404);

    await alice.post(`/api/documents/${id}/shares`).send({ email: 'bob@ajaia.dev', role: 'editor' }).expect(201);
    await alice.post(`/api/documents/${id}/shares`).send({ email: 'carol@ajaia.dev', role: 'viewer' }).expect(201);

    // Owned vs shared lists.
    const aliceList = (await alice.get('/api/documents')).body;
    expect(aliceList.owned.map((d) => d.title)).toContain('Secret plan');
    const bobList = (await bob.get('/api/documents')).body;
    const sharedWithBob = bobList.shared.find((d) => d.id === id);
    expect(sharedWithBob).toMatchObject({ role: 'editor', ownerName: 'Alice Johnson' });
    expect(bobList.owned.find((d) => d.id === id)).toBeUndefined();

    // Editor can edit; viewer can read but not edit; neither can manage sharing or delete.
    await bob.patch(`/api/documents/${id}`).send({ content: '<p>bob was here</p>' }).expect(200);
    const asCarol = await carol.get(`/api/documents/${id}`).expect(200);
    expect(asCarol.body.document.role).toBe('viewer');
    expect(asCarol.body.document.content).toBe('<p>bob was here</p>');
    await carol.patch(`/api/documents/${id}`).send({ content: '<p>nope</p>' }).expect(403);
    await bob.post(`/api/documents/${id}/shares`).send({ email: 'carol@ajaia.dev', role: 'editor' }).expect(403);
    await bob.delete(`/api/documents/${id}`).expect(403);

    // Revoking access takes effect immediately.
    const bobId = asCarol.body.document.shares.find((s) => s.email === 'bob@ajaia.dev').id;
    await alice.delete(`/api/documents/${id}/shares/${bobId}`).expect(200);
    await bob.get(`/api/documents/${id}`).expect(404);
  });

  it('rejects sharing with unknown users or the owner', async () => {
    const alice = await login('alice@ajaia.dev');
    const { body } = await alice.post('/api/documents').send({}).expect(201);
    await alice.post(`/api/documents/${body.document.id}/shares`).send({ email: 'ghost@ajaia.dev' }).expect(404);
    await alice.post(`/api/documents/${body.document.id}/shares`).send({ email: 'alice@ajaia.dev' }).expect(400);
    await alice.post(`/api/documents/${body.document.id}/shares`).send({ email: 'bob@ajaia.dev', role: 'admin' }).expect(400);
  });
});

describe('file import', () => {
  it('turns a markdown upload into a new formatted document', async () => {
    const alice = await login('alice@ajaia.dev');
    const md = '# Launch\n\nThis is **important**.\n\n- one\n- two\n';
    const { body } = await alice.post('/api/documents/import')
      .attach('file', Buffer.from(md), 'launch-notes.md').expect(201);
    expect(body.document.title).toBe('launch-notes');
    expect(body.document.content).toContain('<h1>Launch</h1>');
    expect(body.document.content).toContain('<strong>important</strong>');
    expect(body.document.content).toContain('<li>one</li>');
  });

  it('escapes plain text and rejects unsupported types', async () => {
    const alice = await login('alice@ajaia.dev');
    const { body } = await alice.post('/api/documents/import')
      .attach('file', Buffer.from('a <b>tag</b>\n\nsecond'), 'notes.txt').expect(201);
    expect(body.document.content).toBe('<p>a &lt;b&gt;tag&lt;/b&gt;</p><p>second</p>');
    const bad = await alice.post('/api/documents/import').attach('file', Buffer.from('x'), 'evil.exe').expect(415);
    expect(bad.body.error).toMatch(/Unsupported file type/);
  });
});
