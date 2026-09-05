# FormaTavern — Troubleshooting Runbook

Format: **Symptom → Likely cause → Fix / Diagnostic.** Commands are bash-flavoured; on Windows PowerShell use `curl.exe`.

---

## 1. Install & workspace

**`Cannot find module '@formatavern/shared'` (tsc) but Bun runs fine**
→ `moduleResolution` not `bundler` in some tsconfig, or `bun install` was run inside a sub-package.
→ Run `bun install` from the repo root; `ls -la node_modules/@formatavern/` must show three links; check every `tsconfig.json` extends `tsconfig.base.json`.

**Two copies of `@sinclair/typebox` / `TSchema` type mismatch when passing shared schemas to Elysia**
→ `bun pm ls --all | grep -i typebox` shows two versions.
→ Align `packages/shared/package.json` with Elysia's range; if needed add root `"overrides"`; reinstall.

**Vite: "The request … is outside of Vite serving allow list" for `packages/shared/src/...`**
→ `server.fs.allow` missing the workspace root. → Keep `fs.allow: [searchForWorkspaceRoot(process.cwd())]` in `vite.config.ts`.

**"new dependencies optimized, reloading" loop in Vite**
→ Linked package dep discovered late. → Add to `optimizeDeps.include` (`@sinclair/typebox`, `@sinclair/typebox/value`, `jsonrepair`).

**`EBUSY` / `EPERM` during `bun install`, `clean`, `db:reset` (Windows)**
→ `bun --watch`, Vite, or an SQLite viewer holds files. → Stop `bun run dev` and any DB tools, retry. If `frontend/.svelte-kit` was deleted while Vite ran, restart Vite.

---

## 2. Typecheck & svelte-check

**`svelte-check` errors mention `Bun`, `bun:sqlite`, `Database`**
→ Purity leak: something reachable from `import type { App }` imports Bun types (S7/I6).
→ Find the import chain from `backend/src/app.ts`; move Bun-specific code to `index.ts`/`repositories/*`; inject via `contracts.ts` interfaces.

**`tsc` in `packages/shared` complains about `window`, `structuredClone`, `AbortSignal`, `setTimeout` types**
→ Non-isomorphic code in `shared` (I5). → Use `Value.Clone`, `AbortSignalLike`, plain promises; keep `lib: ["ES2022"]`, `types: []`.

**`Cannot find module 'bun:test'` in a shared test file**
→ Test tsconfig missing. → `packages/shared/test/tsconfig.json` with `"types": ["bun"]`.

**Svelte `a11y-*` warnings**
→ Not allowed to suppress (U8). Add labels, roles, keyboard handlers; use native `<button>`/`<dialog>`.

---

## 3. Dev servers & proxy

**Vite proxy returns 502/`ECONNREFUSED` for `/api`**
→ Backend not up, or proxy target uses `localhost` (resolves to `::1` while Elysia binds IPv4).
→ Proxy target must be `http://127.0.0.1:3000`; confirm backend log `→ http://127.0.0.1:3000`; `curl -si http://127.0.0.1:3000/api/health`.

**Port 5173/3000 in use**
→ Stale process. → `strictPort` fails fast on Vite by design; kill the old process (`Get-Process bun | Stop-Process` / `lsof -i :3000`), restart. `bun --watch` normally rebinds cleanly.

**`/api/nope` returns `index.html`, or `/chat/x` returns JSON 404**
→ Fallback precedence broken. → `app.onError` handles only `/api/*` `NOT_FOUND`; `index.ts` SPA fallback excludes `/api/` and `/assets/`. Re-run the Phase 0 curl checks.

**`/assets/...` 404 in dev**
→ Missing proxy entry. → `vite.config.ts` must proxy `/assets` to the backend too; file must exist under `data/assets/<subdir>/`.

**Windows Defender firewall prompt on start**
→ Bound to `0.0.0.0`. → Use the default `127.0.0.1` unless LAN exposure is intended (and then prefer Tailscale).

---

## 4. SSE streaming

**Diagnostic: is the stream paced or buffered?**
```bash
curl -sN -X POST 'http://127.0.0.1:5173/api/chat/test-stream?script=envelope-directive' \
  | while IFS= read -r l; do printf '%s  %s\n' "$(date +%T.%3N)" "$l"; done
```
Expect `data:` frames ~40 ms apart (mock) and one `usage` + one `done`. A single burst = buffering.

**All frames arrive at once**
→ Server built the body in memory, `Content-Length` present, compression in the path, or PowerShell `curl` alias.
→ Use `curl.exe -N`; response must be `Response(new ReadableStream)` with `text/event-stream`; never add compression middleware in front of `/api`; keep `Accept-Encoding: identity` on the proxy request.

**Stream stalls then closes / "no `done` event"**
→ Provider terminal missing (E5) or idle timeout hit.
→ Check backend log for `[test-stream] client disconnected` vs provider errors; for OpenRouter, `error{recoverable:true, message:'upstream idle timeout …'}` after 60 s of silence is expected behaviour — check network/keys.

**Client sees garbled JSON / `Unexpected end of JSON`**
→ Client splits on `\n` instead of `\n\n`, or decodes without `{ stream: true }`.
→ Use `lib/api/sse.ts` (`readSse`); never hand-roll a second reader.

**Empty POST to `/stop`/`/regenerate` returns 400/422**
→ Client sent `Content-Type: application/json` with an empty body. → Send no body and no content-type for bodiless POSTs.

**Closing the tab stops generation**
→ S1 violation: `request.signal` passed to a provider or `ReadableStream.cancel()` calls `hub.abort`.
→ `sseResponse.cancel` must only unsubscribe; providers receive the hub controller's signal only.

---

## 5. Database & WAL

**`SQLITE_BUSY` / `database is locked`**
→ An external tool holds a write lock, or `busy_timeout` not applied on that connection.
→ All connections must go through `openDatabase()` (sets `busy_timeout = 5000`). Close external SQLite GUIs while the server writes. Read-only inspections should open with `{ readonly: true }`.

**FK constraints not enforced (orphans appear, RESTRICT doesn't fire)**
→ `PRAGMA foreign_keys` was set inside a transaction or on a different connection.
→ `openDatabase()` asserts it reads back `1`; any `new Database(...)` outside it is a bug.

**Boot fails: "Database is schema vN; this build supports up to vM"**
→ DB written by a newer build. → Use the newer build or restore a backup; never downgrade migrations.

**Boot fails inside a migration**
→ The migration's transaction rolled back; `user_version` unchanged. Fix the migration (if unshipped) or add a corrective v(N+1); reproduce with `bun test --cwd backend test/migrations.test.ts`.

**`db:check` reports `current_state_integrity` or `active_leaf_integrity` failures**
→ Cache drift (S6) after a manual DB edit or a bug in select/delete/override paths.
→ Identify the chat ids printed; recompute by `POST /api/messages/<leaf>/select` (refreshes the cache); file a bug with the sequence that caused drift.

**`db:check` reports streaming rows on a running server**
→ Normal if a generation is active; run again after it finishes. On a fresh boot it must be 0 (recovery marks leftovers `aborted` with `metadata.recovered`).

**Copied `formatavern.db` and lost recent chats**
→ WAL sidecar not included. → Stop the server (clean shutdown checkpoints) or run `PRAGMA wal_checkpoint(TRUNCATE)` before copying; copy all three files if the server is running.

**Seeds missing after deleting a character**
→ Seed-if-empty semantics. → `bun run db:seed --force` restores the seed rows (overwrites edits to them).

---

## 6. Generation engine

**409 `generation_in_progress` but nothing is streaming**
→ Hub entry leaked (engine crash without `close()`), or the row is still `streaming`.
→ `GET /api/chats/:id` → `activeGenerationMessageId`; `GET /api/messages/:id` → status. If the row is terminal but the hub still reports active, that is an S3 bug — capture logs. Restarting the process clears the hub; recovery marks stale rows `aborted`.

**Reply ends with `status: complete` but text is cut off**
→ Agency truncation (`metadata.parse.truncatedAt = 'persona'`): the model started writing for the user. Expected. Tune the persona name/stop sequences or the model.

**`stateSource: inherited` every turn**
→ The model isn't emitting a closed state block (`parse.warnings` shows `state_unclosed`/`state_unparseable`), or narrative mode is off for the chat.
→ Check `chat.metadata.narrativeMode`; try `mock:envelope-directive` to confirm the pipeline; for real models check `maxTokens` (a `length` finish truncates the block).

**413 `prompt_budget_exceeded`**
→ `contextLength − maxTokens` too small for the trigger + static blocks. → Raise `generation.contextLength` or lower `maxTokens`; `details.report` shows token accounting.

**Golden test fails after an unrelated change**
→ Templates, tokenizer encoding, or block order changed (E6). → Diff the golden; if intentional, `UPDATE_GOLDEN=1` and explain in the PR; if not, look for `Date.now()`/env reads or an `o200k` default slipping in.

**OpenRouter: 401/402/403 → `recoverable:false`; 429/5xx → `recoverable:true`; 200 with HTML → `unexpected content-type`**
→ Key/credit/permission vs. rate limit vs. Cloudflare interstitial. Messages never contain the key; check `GET /api/settings` → `openrouter.source` to see whether the key came from settings or env.

---

## 7. Frontend

**Neutral flash then swoosh when opening a chat**
→ Theme applied after mount, or transitions enabled on first paint.
→ Theme must derive from `load` data synchronously; `data-transitions="off"` until after the first frame.

**Theme changes snap instead of animating**
→ Browser lacks `@property`, `prefers-reduced-motion` is on, or the token is unregistered (font family, padding, image) — all expected. Colors and radius should animate on Chromium/Safari/Firefox ≥ 128.

**A token from a card is ignored (falls back to default)**
→ Value not a valid `<color>`/`<length>` for the registered `@property` (browser drops it). → Use `#hex`/`rgb()`/`rgba()`/`hsl()`; the value still passes `CssToken` (which only guards injection).

**Bubble styles missing in production but fine in dev**
→ Dynamic Tailwind class string purged (U2). → Use static utilities; `boundaries.test.ts` should have caught it — extend the grep.

**Streaming feels janky / long tasks in DevTools**
→ Tokens written to `$state`, `$effect` on the buffer, or `{#each}` keyed by text.
→ `StreamController` buffer + one commit per rAF; index-keyed segments; check `?dev=1` max frame cost.

**Viewport yanks to the bottom while reading during a stream**
→ Follow re-engaged programmatically or `content` growth treated as a gesture (U5). → Only `user` causes change `stuck`; verify with `scrollPolicy.test.ts`.

**Loading older messages jumps the scroll position**
→ Browser scroll anchoring fighting `prependAdjust`. → `overflow-anchor: none` on the log; measure before/after in the same tick.

**iOS: composer hidden behind the keyboard / log unscrollable**
→ Missing `interactive-widget=resizes-content` or `100dvh`. → Check `app.html` viewport meta and the `visualViewport` resize re-pin.

**Text disappears / duplicates after `done`**
→ Reconciliation replaced the turn with authoritative content (agency truncation) — expected. Duplication means `resumedFrom` seeding failed on continue/reattach: confirm `start.resumedFrom` equals the seeded length.

**`[object Object]` in toasts**
→ Eden error not normalized. → Route through `toUiError()`.

**Settings don't sync between tabs / thrash**
→ `BroadcastChannel` echo or missing `tabId`. → Ignore own messages; apply responses only for the latest `seq`.

**Raw HTML or markdown markers visible in a bubble**
→ Expected for unterminated `*`/`"` mid-stream and for escaped raw HTML (by design). Persisted turns showing `:::` markers indicate a parser regression — run `shared` property tests.

---

## 8. Production

**`Production build missing: …/frontend/build`**
→ `bun run build` not run, or build dir resolved from `cwd`. → Build first; path is resolved from `import.meta.dir`.

**`/api/chat/test-stream` returns 404 in production**
→ Intentional dev-only gate.

**Start prints `[SECURITY WARNING]`**
→ `FORMATAVERN_HOST=0.0.0.0`. Intentional; use Tailscale/Cloudflare rather than exposing directly.

**Ctrl+C hangs**
→ Active generations finalizing (`abortAll`, ≤ 2 s) or a pending timer. Second Ctrl+C force-kills; next boot recovers `streaming` rows as `aborted`.

---

## 9. Debugging techniques

- **Health**: `curl -s http://127.0.0.1:3000/api/health | jq` — `sharedVersion`, `db.schemaVersion`, `activeGenerations`.
- **Reproduce a stream deterministically**: set model `mock:<script>`; every script has fixed chunk boundaries.
- **Reattach test**: `curl -sN http://127.0.0.1:3000/api/messages/<id>/stream` during a generation → `start{resumedFrom}` + snapshot + live.
- **Concurrency test**: fire two sends to one chat with `&`; second must be 409.
- **Row inspection**: `curl -s http://127.0.0.1:3000/api/messages/<id> | jq '{status, state, parse: .metadata.parse, metrics}'`.
- **Frame parser sanity**: raw bytes must match `/^(data: .+\n\n)+$/` — `curl -sN … | od -c | head`.
- **Parser triage**: paste the raw `content` into a `bun -e` script calling `parseEnvelope(text, { primaryCharacter, dialect, streaming:false })` from `@formatavern/shared`; property failures print a PRNG seed — pin it in the test to reproduce.
- **Frontend**: `?dev=1` overlay; DevTools ▸ Network ▸ EventStream tab for frame timing; Performance ▸ screenshots for theme transitions; Rendering ▸ "Layout Shift Regions" for CLS; Elements ▸ theme root `style` attribute for resolved tokens.
- **Logs**: backend prefixes `[db]`, `[providers]`, `[engine]`, `[test-stream]`, `[SECURITY WARNING]`; keys are never logged — if you see one, that is a P7/S8 bug.
