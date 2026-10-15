# Submission: Ajaia Docs

**Candidate:** Amartya Vikram Singh (amartyasingh556@gmail.com)
**Assignment:** AI-Native Full Stack Developer, Ajaia LLC

## Links

- **Live product URL:** LIVE_URL_PLACEHOLDER
- **Walkthrough video:** https://drive.google.com/file/d/1xrYKcF4SgEHFb2ON5023OKuqjVjcpWG0/view?usp=sharing
- **Submission folder (Google Drive):** https://drive.google.com/drive/folders/1RZqpQvz2jbQ_8LMnaT5QlWhg93tagQBm?usp=sharing
- **Source repository:** https://github.com/amartya1523/Ajaia-LLC

## Test accounts (no passwords; choose on the login screen)

- `alice@ajaia.dev`: owns "Q4 Product Planning" (shared with Bob as editor)
- `bob@ajaia.dev`: editor on Alice's document; owns "Bob's meeting notes"
- `carol@ajaia.dev`: no shares yet; use for viewer / no-access checks

## What is included

| Item | Location |
|---|---|
| Source code (backend) | `server/` |
| Source code (frontend) | `src/`, `index.html`, `vite.config.js` |
| Automated tests | `tests/api.test.js` (`npm test`) |
| README with local setup and run instructions | `README.md` |
| Architecture note | `docs/ARCHITECTURE.md` |
| AI workflow note | `docs/AI_WORKFLOW.md` |
| Walkthrough video URL | `VIDEO_URL.txt` |
| Walkthrough video (local copy) | `Ajaia-Docs-Walkthrough.mp4` |
| Screenshots | `docs/screenshots/` |
| Sample upload files | `samples/` (`.md`, `.txt`, `.docx`) |
| Deployment config | `render.yaml`, `Dockerfile`, `.node-version` |
| Video recording scripts | `scripts/walkthrough/` |

## Status

**Working end to end:** create, rename, edit with rich text (headings, bold, italic, underline, lists, quotes, alignment), autosave and reopen; file import (`.txt`, `.md`, `.docx`) as a new document or inserted into a draft; sharing with owner / editor / viewer roles enforced server-side; owned vs. shared views; conflict detection; near-live updates via polling; export to Markdown, HTML and PDF (print).

**Incomplete / out of scope:** real authentication, true real-time co-editing (CRDT, live cursors), comments, version history, images in documents. Free-tier hosting storage is ephemeral (the demo data re-seeds on restart).

**Next with 2–4 more hours:** version history with restore; presence indicators over WebSockets; Playwright UI smoke test in CI.
