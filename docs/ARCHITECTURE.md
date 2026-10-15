# Architecture Note

## Goal and framing

Ship the strongest *working* slice of a Google‑Docs‑like tool inside a 4–6 hour box. I optimized for: a coherent editing experience, sharing rules that are actually enforced, and a build reviewers can open without setup. Breadth (comments, history, real‑time cursors) was cut in favor of depth in those areas.

## Shape of the system

```
Browser (React + TipTap)  ──fetch /api──▶  Express (Node 22)  ──▶  SQLite (node:sqlite)
        ▲                                        │
        └──────── static dist/ served by the same process
```

- **One deployable unit.** The Express server serves both the JSON API and the built React app. One process, one port, one Render service, no CORS.
- **SQLite via Node's built‑in `node:sqlite`.** Zero external services and no native module compilation (which is a common source of deploy failures with `better-sqlite3`). The schema is four tables: `users`, `sessions`, `documents`, `document_shares`.
- **TipTap (ProseMirror)** for the editor: robust selection/undo/list behavior and Markdown‑style input rules for free. Content is stored as HTML, which TipTap round‑trips exactly, and which mammoth (`.docx`) and marked (`.md`) produce natively.

## Key decisions

1. **Access control lives in one function.** `loadDoc(req, minRole)` in `server/app.js` resolves the caller's role (`owner` / `editor` / `viewer` / none) and every document route goes through it. "No access" and "doesn't exist" both return `404` so IDs don't leak; insufficient role returns `403`. The UI hides controls by role, but the server is the source of truth, and tests cover each case.
2. **Server‑side sanitization.** All content (typed, imported, or sent directly to the API) passes through an allow‑list (`sanitize-html`) matching what the editor can render. Scripts, event handlers and arbitrary styles are dropped. This matters because documents are shared between users.
3. **Autosave + optimistic concurrency instead of real‑time CRDTs.** The client debounces saves (800 ms), keeps one request in flight, and sends `baseVersion`. If someone else saved first the server returns `409` with the latest version and the user picks *load theirs* or *overwrite*. Open documents poll every 4 s and pull remote changes when the user has nothing unsaved. That gives honest, demonstrable multi‑user behavior without the complexity of Yjs + WebSockets + persistence of CRDT state, which would not fit the timebox reliably.
4. **Simulated auth, real sessions.** Seeded users and a one‑click login keep sharing easy to review, but the mechanism is real: random session tokens stored server‑side, in an `httpOnly`, `SameSite=Lax` cookie. Swapping in a real identity provider only changes the login route.
5. **File upload produces documents, not blobs.** Uploading converts `.txt` / `.md` / `.docx` into editable rich text (new document, or inserted at the cursor). That is more product‑relevant than storing attachments, and avoids blob storage on an ephemeral host. Limits (types, 2 MB) are stated in the UI and enforced server‑side.

## Validation and error handling

- Title: trimmed, non‑empty, ≤ 200 chars. Content: string, ≤ 1 MB. Role: `viewer` | `editor`. Sharing: target must exist and can't be the owner.
- Upload: extension allow‑list, size limit (`413`), binary‑in‑text detection, corrupt `.docx` → `415` with a readable message.
- Central error handler: client errors return their message; unexpected errors are logged and return a generic `500`.
- Client: every API error surfaces as a toast or inline message; save failures auto‑retry; unsaved changes trigger a leave‑page warning; revoked access mid‑session sends the user back to the dashboard.

## Testing

`tests/api.test.js` (Vitest + Supertest, in‑memory SQLite per test) covers: create/rename/save/reopen with formatting preserved, sanitization, title validation, `409` conflict + force overwrite, the full owner/editor/viewer/no‑access matrix including revocation, owned vs. shared listings, Markdown and text import, and rejection of unsupported types. The UI flows were verified in a real browser; the walkthrough video is itself a scripted end‑to‑end run against a fresh database.

## Tradeoffs and what I'd change for production

| Today | Production |
|---|---|
| SQLite file (ephemeral on free tier) | Postgres (managed), migrations |
| Seeded users, email login | SSO / OAuth, invitations for users who don't exist yet |
| Polling every 4 s + version checks | WebSocket push; Yjs CRDT for true co‑editing and presence |
| HTML stored per document | Same, plus snapshots table for version history |
| Single process | Same shape scales fine initially; add rate limiting and audit log of share changes |
