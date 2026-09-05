# FormaTavern — Development Guide

---

## 1. Prerequisites
- **Bun ≥ 1.2** (`bun --version`). Bun is the runtime, package manager, bundler entry, and test runner. Node is required only implicitly by Vite tooling.
- Git. A modern Chromium/Firefox for UI work. Optional: `jq` and `curl` (on Windows use `curl.exe`; the PowerShell alias buffers streams).
- Windows notes: run from PowerShell or Git Bash; stop dev servers before install/clean/reset; avoid paths with trailing spaces.

## 2. First run
```bash
git clone <repo> formatavern && cd formatavern
bun install                       # root only — creates workspace links under node_modules/@formatavern/
bun run typecheck                 # expect 3/3 clean, svelte-check 0 errors 0 warnings
bun run test                      # expect all suites green (259 at Phase 4 completion)
bun run dev                       # backend :3000 (--watch) + Vite :5173
```
Open the URL Vite prints (e.g. `http://localhost:5173`). First boot creates `formatavern.db`, runs migrations 0→3, seeds Eldrin, Alice, and the default persona, and logs `[providers] mock ready, openrouter disabled (no key)`. The Foyer shows two character cards; "New chat" → Eldrin greets you; send a message — the mock provider streams a scripted narrative reply.

## 3. Environment variables
| Var | Default | Purpose |
|---|---|---|
| `FORMATAVERN_HOST` | `127.0.0.1` | Bind address. `0.0.0.0` exposes the app on the LAN and prints the ADR-006 warning. |
| `FORMATAVERN_PORT` | `3000` | Backend port (Vite proxy targets `127.0.0.1:3000`). |
| `FORMATAVERN_DB_PATH` | `<repo>/formatavern.db` | SQLite file. |
| `FORMATAVERN_ASSETS_DIR` | `<repo>/data/assets` | Served at `/assets`. |
| `OPENROUTER_API_KEY` | — | Fallback key when none is stored in settings; used by the live smoke script. |
| `NODE_ENV` | — | `production` enables static SPA serving and disables `/api/chat/test-stream`. |

`.env` files are not loaded automatically by design; export variables in the shell or CI.

## 4. Scripts (root `package.json`)
| Script | Does |
|---|---|
| `dev` / `dev:backend` / `dev:frontend` | Development servers. |
| `typecheck` | `tsc --noEmit` in `packages/shared` and `backend`; `svelte-kit sync && svelte-check` in `frontend`. |
| `test` | `bun test` in `packages/shared`, `backend`, and `frontend` (unit harness). |
| `build` | SvelteKit static build → `frontend/build/`. |
| `start` | `NODE_ENV=production bun backend/src/index.ts` — single-process production server. |
| `db:migrate` / `db:seed [--force]` / `db:check` / `db:reset [--yes]` | Database utilities (see §5). |
| `clean` | Removes `node_modules`, `frontend/.svelte-kit`, `frontend/build`. |

Package-local extras: `bun run --cwd backend smoke:openrouter`, `bun run --cwd backend seed:long-chat` (200-turn chat for scroll/perf checks), `UPDATE_GOLDEN=1 bun test --cwd backend test/prompt`.

## 5. Database workflows
- **Boot** = `openDatabase → runMigrations → recover stale streaming rows → seedIfEmpty`. Seeding only runs on an empty `characters` table (deleting a seed character does not resurrect it). `db:seed --force` re-upserts seeds.
- **Inspect** without external tools: `bun run db:check` prints pragmas, `user_version`, integrity, FK check, `messages` columns, streaming-row/leaf/state audits, counts, and validates every character/persona row. For ad-hoc queries:
  ```bash
  bun -e "const {Database}=require('bun:sqlite');const db=new Database('formatavern.db',{readonly:true});console.log(db.query('select id,status,length(content) c from messages order by id desc limit 5').all())"
  ```
- **Reset**: stop servers → `bun run db:reset --yes` → restart. Never delete only `formatavern.db` while `-wal` exists.
- **Adding a migration**: append to `backend/src/db/migrate.ts` with the next contiguous version; one statement per `db.run`; add tests (fresh, upgrade-with-data, rollback-on-throw); extend `scripts/check.ts` if an audit is needed; document in `docs/architecture.md` §5. Never edit a shipped migration.
- **Backups**: with the server stopped, copy `formatavern.db` (sidecars are empty after a clean shutdown). With it running: `PRAGMA wal_checkpoint(TRUNCATE)` via a bun one-liner first, then copy.

## 6. Testing standards

### 6.1 Where tests live
| Suite | Location | Runner notes |
|---|---|---|
| Shared | `packages/shared/test/**` | own `tsconfig.json` with `types: ["bun"]`; `src` stays `types: []` |
| Backend | `backend/test/**` | in-memory SQLite via `test/helpers.ts`; temp files only for WAL/multi-connection cases (`db.close()` before unlink) |
| Frontend | `frontend/unit/**` | happy-dom registered in `unit/setup.ts` via `bunfig.toml` preload; outside `src` so `svelte-check` ignores it |

Run filtered: `bun test --cwd backend test/routes`, `bun test --cwd packages/shared -t "E1"`, `bun test --cwd frontend unit/markdown.test.ts`.

### 6.2 What is normative
The per-phase blueprints list **required tests by name**; a PR that removes or weakens one must justify it. Categories:
- **Property tests** (`shared/test/envelope/properties.test.ts`): E1 over 50 seeded random chunkings per fixture (+ the fixture's own chunks), E3 round-trip in all dialects, E4 over every prefix. The PRNG seed is printed; reproduce a failure by pinning it.
- **Contract tests** (`backend/test/providers/contract.ts`): `assertStreamContract` (E5) must run over every provider path — including new providers.
- **Golden file** (`backend/test/prompt/__golden__/`): the exact PromptBuilder output for the Eldrin narrative context. Regenerate only intentionally with `UPDATE_GOLDEN=1` and review the diff in the PR.
- **Static boundary scans** (`frontend/unit/boundaries.test.ts`): U2/U3/U6 grep rules over `src/`. Extend the rules when a new anti-pattern is agreed.
- **Route tests**: `app.handle(new Request(...))` against `createApp` with in-memory repos, `GenerationHubImpl`, and `MockLLMProvider({ intervalMs: 5 })`; SSE responses parsed with the frame reader; assert error envelopes and frame bytes.
- **Engine tests**: `flushIntervalMs: 20`, repo spy wrappers counting `updateStreaming`/`finalize` (S5), crash injection (S3), unsubscribe (S1).

### 6.3 Invariant → test index
| Invariant | Pinned by |
|---|---|
| I3/I4 | `backend/test/migrations.test.ts`, `integrity.test.ts` |
| E1/E3/E4 | `shared/test/envelope/properties.test.ts` |
| E2 | `shared/test/envelope/parser.test.ts` (`classic`) |
| E5 | `backend/test/providers/contract.test.ts` (+ mock, openrouter suites) |
| E6 | `backend/test/prompt/builder.test.ts` (purity + golden) |
| I5/E7/E8/S7/U10 | `bun run typecheck` (shared tsconfig; `svelte-check` over `App`) |
| S1–S5 | `backend/test/engine/generation.test.ts`, `routes/messages.test.ts` |
| S6 | `backend/test/repositories/messages.test.ts`, `db:check` |
| S8 | `backend/test/routes/settings.test.ts`, `providers/openrouter.test.ts` |
| S9 | route tests (frame bytes, error envelope) |
| U1 | `shared/test/theme/cascade.test.ts` |
| U2/U3/U6 | `frontend/unit/boundaries.test.ts` |
| U4 | `frontend/unit/streamBuffer.test.ts` |
| U5 | `frontend/unit/scrollPolicy.test.ts` |
| U7/U9 | `frontend/unit/session.test.ts` |
| U8 | manual evidence set (§9) + Svelte `a11y-*` = 0 |

### 6.4 Writing tests
- Prefer table-driven cases over prose-heavy ones; assert on codes/paths (`/style/colors/accent`, `state_unclosed`), not message text.
- Never sleep for timing; inject `now`, `flushIntervalMs`, `intervalMs`, fake `fetch`, fake rAF.
- Fixtures come from `@formatavern/shared/fixtures`; do not fork them locally.

## 7. Type checking and purity
`bun run typecheck` must report 0 errors **and 0 warnings**. Typical failure sources and their meaning:
- `svelte-check` mentions `Bun`/`bun:sqlite`/`Database` → a purity leak into `app.ts`/`contracts.ts` (S7). Fix the import, not the frontend config.
- `tsc` in `shared` complains about `window`, `structuredClone`, `setTimeout` typings → non-isomorphic code in `shared` (I5).
- Svelte `a11y-*` warnings → fix the markup (labels, roles, keyboard handlers); do not `<!-- svelte-ignore -->`.

## 8. Providers during development
- **Mock** is the default. Choose the scenario via Settings → Provider → Model (`mock:<script>`) or `PATCH /api/settings {"provider":{"model":"mock:persona-violation"}}`. Scripts exercise: happy path, XML/prefix dialects, classic prose, sloppy syntax, agency truncation, truncated state, reasoning tags, upstream error.
- **OpenRouter**: Settings → API key (write-only; the view shows only a hint) → Provider `openrouter` → model id. Or export `OPENROUTER_API_KEY` and run `bun run --cwd backend smoke:openrouter` to stream a real reply and print the parse/state summary. The live smoke is evidence, never a CI gate; record "run"/"not run" in the PR.
- `/dev` (Vite dev only) is the fixture workbench: raw stream + live parse panel for any script via `/api/chat/test-stream`.

## 9. Frontend development
- **Dev overlay**: append `?dev=1` to a chat URL to see per-turn parse warnings, raw content, live state patch, max frame cost, and commit counts.
- **Evidence set for UI changes** (attach to the PR when touching theming, streaming, scrolling, or a11y):
  1. Theme transition trace/video (Eldrin → Alice chat: ~600 ms, no neutral frame, fonts switch).
  2. `?dev=1` frame-cost capture on `mock:envelope-directive` (max < 8 ms).
  3. Reconciliation clip on `mock:persona-violation` (streamed text replaced at `done`).
  4. Lighthouse on a 200-turn chat (`seed:long-chat`): Performance ≥ 90, Accessibility ≥ 95, CLS ≤ 0.02.
  5. axe DevTools summary (0 critical/serious) on Foyer and chat; keyboard-only pass notes (`.agents/AGENTS.md` shortcut map); reduced-motion check; 390 px mobile check with keyboard open.
- **Fonts**: curated variable fonts via `@fontsource-variable/*` in `app.css`; other families fall through the author's CSS stack.
- **Tailwind**: v4, config-less; tokens bridged in `app.css` `@theme inline`. Do not add `tailwind.config.*`.

## 10. Building and running production
```bash
bun run build          # frontend/build/
bun run start          # http://127.0.0.1:3000 — serves SPA + API + /assets from one process
curl -si http://127.0.0.1:3000/ | head -1                 # 200 text/html
curl -si http://127.0.0.1:3000/chat/anything | head -1    # 200 text/html (SPA fallback)
curl -si http://127.0.0.1:3000/api/nope | head -1         # 404 application/json
curl -si http://127.0.0.1:3000/api/chat/test-stream -X POST | head -1   # 404 in production
```
Remote access: run behind Tailscale (LAN/multi-device) or Cloudflare Tunnel + Access (public). Keep `FORMATAVERN_HOST=127.0.0.1` and let the tunnel terminate TLS.

## 11. Conventions checklist (quick)
Schemas in `shared` first · validate at boundaries · monotonic ULIDs · `ApiError` codes in `shared/schemas/api.ts` · paths via `import.meta.dir` · runes only · static Tailwind utilities · no secrets in logs · update `.agents/AGENTS.md`/`docs/` in the same PR.

## 12. Definition of "done" for a change
Typecheck clean → tests green (with new tests for new behaviour) → `db:check` passes on a fresh boot → curl/UI evidence per the touched area → docs updated → PR description lists: invariants touched (by id), spec deltas, test count delta, and the evidence artifacts.

## 13. Change recipes
- **Add a migration** — append `{ version: N+1, name, up }` to `db/migrate.ts` (one statement per `db.run`); add a test to `migrations.test.ts` (fresh → N+1; vN data upgrades; rollback on throw); extend `db:check` if a new invariant needs auditing; update `docs/architecture.md` §5.
- **Add a route** — schema in `shared/schemas`; handler in `routes/<group>.ts` using injected deps only; error codes in `ApiErrorCode`; route test via `app.handle(new Request(...))` with in-memory DB + `MockLLMProvider({ intervalMs: 5 })`; if SSE, use `sseResponse()` and assert frame bytes; frontend: Eden call in `lib/api/client.ts` (or `readSse` for SSE); update the surface table in `docs/architecture.md` §10.
- **Add a provider** — implement `LLMProvider` from `shared/types/llm.ts` in `backend/src/providers/`; run `assertStreamContract` (E5) over every path including abort, HTTP error, idle timeout, key scrubbing; register in `engine/providers.ts` and `AppSettingsSchema.provider.id`; add a fake-fetch test suite modelled on `openrouter.test.ts`.
- **Add a theme token** — `shared/schemas/theme.ts` (as `CssToken`) → `THEME_PATHS` in `theme/cascade.ts` → `CSS_VAR_NAMES` + fallback in `frontend/lib/theme/cssVars.ts` → `@property` registration + `:root` neutral + `@theme inline` bridge in `app.css` → consume via static utility. Update `cssVars.test.ts` (exact list) and `cascade.test.ts`.
- **Add a parse warning / lenience** — grammar in `shared/envelope/grammar.ts`; add a case to the lenience table in `parser.test.ts`; if it changes output for existing fixtures, bump `PARSER_VERSION` and re-run `properties.test.ts`; consider a new fixture in `fixtures/envelope.ts` (chunks must satisfy the authoring rules and `chunks.join('') === text`).
- **Add a mock script** — `fixtures/envelope.ts` with `expect` block and adversarial chunks; it automatically appears in `listModels()`, the `/dev` workbench select, and the contract/property suites.

