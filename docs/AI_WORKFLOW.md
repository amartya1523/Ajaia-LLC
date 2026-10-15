# AI Workflow Note

## Tools used

- **Claude Code** (agentic coding assistant in the terminal/desktop app): scaffolding, implementation, tests, browser verification, documentation drafts.
- **Text‑to‑speech for the walkthrough narration:** ElevenLabs API (narration pipeline in `scripts/walkthrough/`), with a macOS system voice as fallback when the API quota ran out. The narration script was written for this project; the voice is AI‑generated.
- **Playwright + ffmpeg** (driven by scripts the assistant wrote) to record the walkthrough as a scripted end‑to‑end run against a fresh database.

## Where AI materially sped things up

- **Boilerplate at volume:** Express routes, SQLite schema, React pages, and roughly 400 lines of CSS. Hours of typing reduced to minutes, which let the timebox go into behavior instead of setup.
- **Test writing:** the API test suite (permission matrix, conflicts, sanitization, import) was drafted quickly and then tightened.
- **Glue work:** `.docx`/Markdown conversion, export to Markdown, the deployment files, and the video pipeline (TTS → timed browser recording → mux).

## What I changed or rejected

- **Rejected real‑time CRDT collaboration** (Yjs + WebSockets) as the default "Google Docs" answer. Not reliable inside the timebox; chose autosave + version checks (`409` on stale writes) + polling instead, and documented the upgrade path.
- **Rejected `better-sqlite3`** in favor of Node's built‑in `node:sqlite` to avoid native compilation failures on deploy.
- **Rejected "upload = attachment storage"**: uploads convert into editable documents, which is more useful and avoids blob storage on an ephemeral host.
- **Fixed generated code that was subtly wrong:**
  - The editor's polling loop called TipTap's `setEditable()`, which emits an *update* event by default. Every 4 seconds that marked the document dirty and sent a save, inflating versions and risking false conflicts. Found by watching network requests on an idle page; fixed by passing `emitUpdate=false` and only toggling when the role actually changes.
  - The share dialog received an inline `onClose` callback that was a dependency of its effect, so it re‑fetched users and stole focus on every parent render. Stabilized with `useCallback`.
  - `node:sqlite` failed to load under Vitest (the bundler stripped the `node:` prefix); switched to `createRequire` so tests run against the same DB code as production.
  - Removed dead exports and kept the permission logic in a single `loadDoc()` function rather than per‑route checks.

## How I verified correctness, UX and reliability

- **Automated tests:** `npm test`, 9 API integration tests covering the owner/editor/viewer/no‑access rules (including revocation), conflict handling, sanitization of script/event‑handler payloads, validation, and file import.
- **Manual browser verification:** drove the built app in a browser: create → format → autosave → reload persistence, inspected the stored HTML, checked console errors and network traffic (which is how the phantom‑save bug was caught).
- **Scripted end‑to‑end run:** the walkthrough video is a Playwright script against a fresh database that signs in as all three users, imports `.md` and `.docx` files, shares with editor/viewer roles, simulates a concurrent save from another user, and confirms the viewer is read‑only. If any step fails, the recording fails.
- **Review of every AI change** before keeping it, with particular attention to access control and sanitization, since those are the places where "looks right" isn't good enough.
