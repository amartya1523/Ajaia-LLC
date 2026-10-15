// Records the walkthrough against a fresh server, timed to the narration clips.
// Usage: ENGINE=say node record.cjs   (expects audio_<ENGINE>/durations.json and a server on BASE)
const fs = require('fs');
const path = require('path');
const { chromium, request } = require('playwright');

const ENGINE = process.env.ENGINE || 'say';
const BASE = process.env.BASE || 'http://localhost:4100';
const SAMPLES = '/Users/amartyavikramsingh/Desktop/project/Ajaia/samples';
const durations = JSON.parse(fs.readFileSync(`audio_${ENGINE}/durations.json`, 'utf8'));
const W = 1280, H = 800;
const PAD = 0.7; // seconds of breathing room after each clip

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CURSOR_JS = `
(() => {
  const install = () => {
    if (document.getElementById('__cursor')) return;
    const c = document.createElement('div');
    c.id = '__cursor';
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M3 2l7 19 2.5-7.5L20 11z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: 'fixed', left: 0, top: 0, zIndex: 2147483647, pointerEvents: 'none',
      transform: 'translate(' + (window.__cx || 640) + 'px,' + (window.__cy || 400) + 'px)', transition: 'none' });
    document.documentElement.appendChild(c);
    const pos = JSON.parse(sessionStorage.getItem('__cpos') || '[640,400]');
    c.style.transform = 'translate(' + pos[0] + 'px,' + pos[1] + 'px)';
    window.addEventListener('mousemove', (e) => {
      c.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)';
      sessionStorage.setItem('__cpos', JSON.stringify([e.clientX, e.clientY]));
    }, true);
    window.addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      Object.assign(r.style, { position: 'fixed', left: (e.clientX - 18) + 'px', top: (e.clientY - 18) + 'px', width: '36px', height: '36px',
        borderRadius: '50%', background: 'rgba(79,70,229,.35)', zIndex: 2147483646, pointerEvents: 'none',
        transition: 'transform .45s ease-out, opacity .45s ease-out' });
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'scale(1.8)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 500);
    }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();`;

function slide({ eyebrow, title, subtitle, bullets, footer, big }) {
  const items = (bullets || []).map((b) => `<li><span class="dot"></span><div>${b}</div></li>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box} body{margin:0;width:${W}px;height:${H}px;font-family:Inter,-apple-system,'Segoe UI',sans-serif;color:#1c1f2a;
  background:radial-gradient(900px 500px at 0% 0%,#e0e3ff 0%,transparent 60%),radial-gradient(800px 500px at 100% 100%,#d8f3ee 0%,transparent 60%),#f4f5f8;
  display:flex;align-items:center;justify-content:center}
  .card{width:1040px;background:#fff;border-radius:22px;box-shadow:0 30px 80px rgba(16,24,40,.16);padding:64px 72px;animation:in .6s ease-out}
  @keyframes in{from{opacity:0;transform:translateY(14px)}}
  .brand{display:flex;align-items:center;gap:12px;font-size:20px;margin-bottom:28px;color:#4b5064}
  .brand b{color:#4f46e5}
  .eyebrow{font-size:15px;letter-spacing:.12em;text-transform:uppercase;color:#4f46e5;font-weight:700;margin-bottom:12px}
  h1{font-size:${big ? 64 : 46}px;line-height:1.1;margin:0 0 14px;letter-spacing:-.02em}
  p.sub{font-size:22px;color:#5b6074;margin:0 0 8px;line-height:1.5}
  ul{list-style:none;padding:0;margin:26px 0 0;display:grid;gap:16px}
  @keyframes liin{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  li{display:flex;gap:16px;font-size:22px;line-height:1.45;opacity:0;animation:liin .5s ease-out forwards}
  ${(bullets || []).map((_, i) => `li:nth-child(${i + 1}){animation-delay:${0.5 + i * 0.9}s}`).join('')}
  li b{color:#1c1f2a} li div{color:#424759}
  .dot{flex:none;width:10px;height:10px;border-radius:50%;background:#4f46e5;margin-top:12px}
  .footer{margin-top:34px;padding-top:22px;border-top:1px solid #e3e5ec;font-size:17px;color:#6b7083;display:flex;justify-content:space-between}
  </style></head><body><div class="card">
  <div class="brand"><svg viewBox="0 0 32 32" width="34" height="34"><rect width="32" height="32" rx="7" fill="#4f46e5"/><path d="M10 9h9l4 4v10H10z" fill="white"/><path d="M13 16h7M13 19h7" stroke="#4f46e5" stroke-width="1.5"/></svg><span>Ajaia <b>Docs</b></span></div>
  ${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ''}
  <h1>${title}</h1>${subtitle ? `<p class="sub">${subtitle}</p>` : ''}<ul>${items}</ul>
  ${footer ? `<div class="footer">${footer}</div>` : ''}
  </div></body></html>`;
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: W, height: H }, recordVideo: { dir: 'raw', size: { width: W, height: H } },
  });
  await context.addInitScript(CURSOR_JS);
  const page = await context.newPage();
  const t0 = Date.now();
  const marks = [];
  const now = () => (Date.now() - t0) / 1000;

  const move = async (locator) => {
    await locator.scrollIntoViewIfNeeded();
    const b = await locator.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 25 });
    await sleep(250);
  };
  const click = async (locator) => {
    await move(locator);
    await page.mouse.down(); await sleep(60); await page.mouse.up();
    await sleep(400);
  };
  const type = async (text, delay = 45) => { await page.keyboard.type(text, { delay }); };
  const tb = (title) => page.locator(`.toolbar button[title^="${title}"]`);

  async function scene(id, fn) {
    const start = now();
    marks.push({ id, start });
    await fn(durations[id]);
    const remaining = start + durations[id] + PAD - now();
    if (remaining > 0) await sleep(remaining * 1000);
    else console.warn(`scene ${id} overran narration by ${(-remaining).toFixed(1)}s`);
    console.log(id, 'start', start.toFixed(2), 'end', now().toFixed(2));
  }

  // API client used to simulate Bob saving from another device.
  const bobApi = await request.newContext({ baseURL: BASE });
  await bobApi.post('/api/auth/login', { data: { email: 'bob@ajaia.dev' } });
  let docUrl;

  await scene('01_intro', async () => {
    await page.setContent(slide({
      big: true, eyebrow: 'Walkthrough', title: 'A lightweight collaborative<br>document editor',
      subtitle: 'Create · Edit · Import · Share — with persistence and access control',
      footer: '<span>Amartya Vikram Singh</span><span>AI-Native Full Stack Developer Assignment · Ajaia LLC</span>',
    }));
  });

  await scene('02_login', async (d) => {
    await page.goto(`${BASE}/login`);
    await sleep(2500);
    await move(page.locator('.demo-user').nth(2));
    await sleep(800);
    await move(page.locator('.demo-user').nth(1));
    await sleep(800);
    await move(page.locator('.demo-user').nth(0));
    await sleep(Math.max(0, (d - 9) * 1000));
    await click(page.locator('.demo-user').nth(0));
    await page.waitForURL(`${BASE}/`);
  });

  await scene('03_dashboard', async () => {
    await sleep(1500);
    await move(page.locator('.doc-row').first());
    await sleep(1200);
    await click(page.getByRole('tab', { name: /Owned by me/ }));
    await sleep(1200);
    await click(page.getByRole('tab', { name: /Shared with me/ }));
    await sleep(1200);
    await click(page.getByRole('tab', { name: /All documents/ }));
    await move(page.locator('.start-card').nth(0));
    await sleep(800);
    await move(page.locator('.start-card').nth(1));
  });

  await scene('04_create', async () => {
    await click(page.locator('.start-card').nth(0));
    await page.waitForURL(/\/d\//);
    docUrl = page.url();
    await sleep(700);
    await type('Launch Plan', 70);
    await page.keyboard.press('Enter');
    await click(page.locator('.ProseMirror'));
    await type('## Goals', 50); await page.keyboard.press('Enter');
    await type('We are launching the ');
    await click(tb('Bold')); await type('editor pilot'); await click(tb('Bold'));
    await type(' for ');
    await click(tb('Italic')); await type('internal teams'); await click(tb('Italic'));
    await type('. ');
    await click(tb('Underline')); await type('Feedback is due Friday.'); await click(tb('Underline'));
    await page.keyboard.press('Enter');
    await type('- Share drafts with teammates'); await page.keyboard.press('Enter');
    await type('Import existing notes'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
    await type('## Timeline'); await page.keyboard.press('Enter');
    await type('1. Pilot kickoff'); await page.keyboard.press('Enter');
    await type('Collect feedback'); await page.keyboard.press('Enter');
    await type('General availability');
    await move(page.locator('.save-status'));
    await page.locator('.save-status', { hasText: 'All changes saved' }).waitFor();
  });

  await scene('05_reload', async () => {
    await sleep(1200);
    await page.reload();
    await page.locator('.ProseMirror h2').first().waitFor();
    await sleep(1500);
    await move(page.locator('.ProseMirror strong').first());
    await sleep(1200);
    await move(page.locator('.ProseMirror ol'));
  });

  await scene('06_upload', async () => {
    await click(page.locator('.logo'));
    await page.waitForURL(`${BASE}/`);
    await move(page.locator('.start-card').nth(1));
    await sleep(1800);
    await page.locator('.dropzone input[type=file]').setInputFiles(path.join(SAMPLES, 'meeting-notes.md'));
    await page.waitForURL(/\/d\//);
    await sleep(4500);
    // Insert a .docx into the existing draft.
    await page.goto(docUrl);
    await page.locator('.ProseMirror ol').waitFor();
    await click(page.locator('.ProseMirror ol li').last());
    await page.keyboard.press('End');
    await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), click(page.locator('.toolbar .tb-text'))]);
    await chooser.setFiles(path.join(SAMPLES, 'project-brief.docx'));
    await page.locator('.toast', { hasText: 'Inserted' }).waitFor();
    await page.mouse.wheel(0, 500);
    await sleep(2500);
    const [chooser2] = await Promise.all([page.waitForEvent('filechooser'), click(page.locator('.toolbar .tb-text'))]);
    await chooser2.setFiles({ name: 'budget.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fake') });
    await page.locator('.toast-error').waitFor();
  });

  await scene('07_share', async () => {
    await page.mouse.wheel(0, -2000);
    await click(page.getByRole('button', { name: 'Share', exact: true }));
    await sleep(600);
    await type('bob@ajaia.dev', 55);
    await sleep(400);
    await click(page.locator('.share-form button'));
    await page.locator('.access-list li', { hasText: 'Bob Martinez' }).waitFor();
    await sleep(800);
    await click(page.locator('.chip', { hasText: 'Carol' }));
    await move(page.locator('.share-form select'));
    await page.locator('.share-form select').selectOption('viewer');
    await sleep(500);
    await click(page.locator('.share-form button'));
    await page.locator('.access-list li', { hasText: 'Carol Chen' }).waitFor();
    await sleep(1500);
    await move(page.locator('.access-list li select').first());
    await sleep(1500);
    await click(page.getByRole('button', { name: 'Done' }));
  });

  await scene('08_live', async () => {
    await page.locator('.save-status', { hasText: 'All changes saved' }).waitFor();
    await sleep(3500);
    const id = docUrl.split('/d/')[1];
    const { document } = await (await bobApi.get(`/api/documents/${id}`)).json();
    const res = await bobApi.patch(`/api/documents/${id}`, {
      data: {
        baseVersion: document.version,
        content: document.content.replace('<h2>Goals</h2>',
          '<h2>Goals</h2><blockquote><p><strong>Bob:</strong> Budget approved. Let\'s target the first week of November.</p></blockquote>'),
      },
    });
    if (!res.ok()) throw new Error(`Bob save failed ${res.status()}`);
    await page.locator('.toast', { hasText: 'Updated by Bob' }).waitFor({ timeout: 10000 });
    await move(page.locator('.ProseMirror blockquote').first());
  });

  async function signInAs(index) {
    await click(page.getByRole('button', { name: 'Sign out' }));
    await page.waitForURL(/login/);
    await sleep(500);
    await click(page.locator('.demo-user').nth(index));
    await page.waitForURL(`${BASE}/`);
    await sleep(700);
  }

  await scene('09_bob', async () => {
    await signInAs(1);
    await click(page.getByRole('tab', { name: /Shared with me/ }));
    await move(page.locator('.doc-row', { hasText: 'Launch Plan' }).locator('.badge'));
  });

  await scene('10_carol', async () => {
    await signInAs(2);
    await click(page.getByRole('tab', { name: /Shared with me/ }));
    await sleep(600);
    await click(page.locator('.doc-row', { hasText: 'Launch Plan' }).locator('.doc-link'));
    await page.locator('.banner-info').waitFor();
    await sleep(1200);
    await move(page.locator('.banner-info'));
    await sleep(1500);
    await move(page.locator('.title-meta .badge'));
  });

  await scene('11_export', async () => {
    await click(page.locator('.menu summary'));
    await sleep(700);
    for (const item of await page.locator('.menu-pop > *').all()) { await move(item); await sleep(500); }
    await sleep(800);
    await click(page.locator('.menu summary'));
  });

  await scene('12_decisions', async () => {
    await page.setContent(slide({
      eyebrow: 'Key decisions', title: 'Small, reliable, deployable',
      bullets: [
        '<b>One Node service</b> — Express + Node’s built-in SQLite serves the API and the React app. No paid dependencies.',
        '<b>One access-control function</b> — every document route resolves owner / editor / viewer in one place.',
        '<b>Autosave + version checks</b> — 409 on stale writes instead of silent overwrites; chosen over CRDTs for the timebox.',
        '<b>TipTap (ProseMirror)</b> — rich text stored as server-sanitized HTML.',
      ],
    }));
  });

  await scene('13_cuts', async () => {
    await page.setContent(slide({
      eyebrow: 'Intentionally deprioritized', title: 'What I cut, and what’s next',
      bullets: [
        '<b>Cut:</b> passwords / OAuth, live cursors & character-level co-editing, comments, images in documents.',
        '<b>Next 2–4 hours:</b> version history with restore, then presence indicators.',
        '<b>Production path:</b> Postgres, real identity provider, WebSocket push instead of polling.',
      ],
    }));
  });

  await scene('14_ai', async () => {
    await page.setContent(slide({
      eyebrow: 'Quality & AI workflow', title: 'Verified, not just generated',
      bullets: [
        '<b>9 automated API tests</b> — permissions, conflicts, sanitization, file import.',
        '<b>AI sped up</b> scaffolding, UI and tests; architecture and scope decisions stayed mine.',
        '<b>Browser verification caught a real bug</b> — an editor call caused phantom saves every 4s; fixed at the source.',
        '<b>Narration</b> generated with the ElevenLabs API.',
      ],
    }));
  });

  await scene('15_outro', async () => {
    await page.setContent(slide({
      big: true, eyebrow: 'Thanks for watching', title: 'Thank you!<br>— Amartya',
      subtitle: 'Live link, demo accounts and setup steps are in the README.',
      footer: '<span>alice@ajaia.dev · bob@ajaia.dev · carol@ajaia.dev</span><span>github.com/amartya1523/Ajaia-LLC</span>',
    }));
  });

  const videoPath = await page.video().path();
  await context.close();
  await browser.close();
  await bobApi.dispose();
  fs.writeFileSync(`marks_${ENGINE}.json`, JSON.stringify({ marks, video: videoPath, total: now() }, null, 1));
  console.log('video', videoPath);
})().catch((e) => { console.error(e); process.exit(1); });
