# Phase 4 Review → Approved

The walkthrough evidences the gates (259/259, `svelte-check` 0/0, boundaries scan, prod serving, bundle size). Four notes — the first one matters for the documentation you're about to adopt:

1. **Invariant numbering drift, third occurrence.** Your U1 ("zero neutral flash") is the blueprint's first-paint rule under U1/U8 territory; the blueprint's U1 is *cascade order*, U8 is the *accessibility floor*, U10 is *purity boundaries*. All ten are verified by the tests you list — but since `AGENTS.md` will now carry these tables permanently, the docs below use the **blueprint numbering** as canonical. Reconcile your walkthrough to it once and the drift stops.
2. **Theme variable count** appears as 20 (`@property`) and 21 (`cssVars`) — presumably the unregistered `--theme-font-family`/`--theme-bg-img`/`--theme-scheme`. Fine, but make `CSS_VAR_NAMES` the single source and have `cssVars.test.ts` pin the exact list; docs reference the constant, not a number.
3. **Artifacts requested in §9.3 not in the walkthrough:** theme-transition trace/video, `?dev=1` frame-cost capture, persona-violation reconciliation clip, Lighthouse report (CLS ≤ 0.02 on the 200-turn chat), axe summary, keyboard-only notes, mobile check. Attach to the PR; the docs below list them as the "evidence set" for future UI changes.
4. `ChatContainer.svelte` under `{#key}` is a good extraction — keep `+page.svelte` free of session construction so the split-view grid can reuse the container later.

Approved. Documentation follows — four complete files.

---

# File 1 — `.agents/AGENTS.md`

```markdown
# AGENTS.md — FormaTavern Codebase Guide

**Audience:** AI coding agents and developers working in this repository.
**Status:** Living document. Update it in the same PR as any change to boundaries, invariants, commands, or scripts.
**Read first:** this file → `docs/architecture.md` → the spec relevant to your task (§1).

FormaTavern is a lightweight, design-centric LLM roleplay client: Bun + Elysia backend, SvelteKit (Svelte 5 runes) frontend, SQLite (WAL), a shared isomorphic domain package, and a single-request **Narrative Envelope** protocol. Phases 0–4 of the roadmap are complete; the codebase is in feature-extension mode.

---

## 1. Sources of truth (in precedence order)

1. **Code + tests in this repo.** If docs and tests disagree, tests win; fix the docs in the same PR.
2. **`docs/`** — `architecture.md`, `development.md`, `troubleshooting.md`, and `docs/blueprints/phase_{0..4}_blueprint.md` (+ `_walkthrough.md`). Blueprints are the *normative* design for each phase; walkthroughs are the evidence.
3. **Tolaria Knowledge Vault** (product specs, ADRs, concepts) — outside this repo:
   📍 `S:\WorkSpace\Markdown Workspace\FormaTavern`
   Key notes: `formatavern.md`, `adr-001…006`, `spec-data-schemas-and-storage.md`, `spec-narrative-envelope.md`, `spec-llm-provider-adapter-and-streaming.md`, `spec-prompt-builder.md`, `spec-message-lifecycle-and-api.md`, `ui-ux-theme-schema-and-component-binding.md`, `styling-as-data-philosophy.md`, `ethos-and-chameleon-ui.md`.
   Known spec deltas already accepted (do not "fix" the code to match the older spec): `exampleDialogue` on `CharacterCard`; `stateSchema/stateBindings/initialState` stored in `characters.metadata`; `messages.metadata` is a v1 column; state-override log lives in `chats.metadata.stateOverrides` with the leaf's `messages.state` also written; `{{persona}}` is an alias of `{{user}}`; node-scoped routes (`/api/messages/:id/…`) instead of `/api/chat/send`.

If you change behaviour that a vault note describes, say so explicitly in the PR description so the vault can be updated.

---

## 2. Environment (this machine)

- **OS:** Windows. Shell examples in docs are bash-flavoured; in PowerShell use `curl.exe -N` (the `curl` alias buffers streams), and prefer `bun run --cwd <pkg> <script>` over `cd … &&`.
- **Bun** ≥ 1.2 (installed 1.4.1): `S:\Program Files\bun\bin\bun.exe` — the only runtime, package manager, and test runner used.
- **Node.js/npm:** `S:\Program Files\nodejs\node.exe` — needed by Vite tooling only; never invoke `node`/`npm` scripts directly.
- Always run `bun install` from the **repo root** (workspace symlinks/junctions).
- Stop `bun run dev` before `bun run clean`, `bun run db:reset`, or `bun install` (Windows file locks).

---

## 3. Monorepo map

```
formatavern/
├── package.json  tsconfig.base.json  bun.lock  bunfig? (none at root)
├── packages/shared/        @formatavern/shared   — isomorphic domain: TypeBox schemas, envelope parser,
│   ├── src/{schemas,envelope,state,text,theme,types,fixtures,validate.ts,index.ts}   state engine, theme cascade,
│   └── test/               (bun test; own tsconfig with types:["bun"])              macros, fixtures. NO Bun/Node/DOM.
├── backend/                @formatavern/backend  — Elysia API, SQLite, providers, prompt builder, generation engine
│   ├── src/app.ts          createApp(deps): routes only. Bun-free. Exports `type App`.
│   ├── src/index.ts        process entry: env, DB open, migrate, recover, seed, providers, hub, static, listen, shutdown
│   ├── src/db/             paths, connection, ids, migrate (v1–v3), contracts (Bun-free), repositories/, seeds/
│   ├── src/providers/      sse.ts, utils.ts, mock.ts, openrouter.ts, index.ts
│   ├── src/prompt/         templates, blocks, history, budget, builder, types
│   ├── src/engine/         contracts (Bun-free), hub, generation, context, providers, recovery, errors
│   ├── src/routes/         sse.ts, settings, characters, personas, chats, messages
│   ├── scripts/            migrate, seed, check, reset, smoke-openrouter, seed-long-chat
│   └── test/               migrations, integrity, repositories/, engine/, routes/, prompt/ (+ __golden__), providers/
├── frontend/               @formatavern/frontend — SvelteKit SPA (adapter-static, ssr=false), Svelte 5 runes, Tailwind v4
│   ├── src/app.css         Tailwind entry, @property registrations, @theme bridge, chrome palette, motion
│   ├── src/lib/{api,state,theme,render,scroll,actions,components}
│   ├── src/routes/         +layout, +page (Foyer), chat/[chatId]/ (+ChatContainer), dev/ (DEV-only workbench)
│   └── unit/               bun tests with happy-dom (OUTSIDE src so svelte-check ignores them)
├── data/assets/{characters,backgrounds,fonts}   user media, served at /assets
└── formatavern.db(-wal,-shm)                    SQLite, created on first boot (gitignored)
```

### 3.1 Dependency rules (hard)

| Package | May import | Must never import |
|---|---|---|
| `shared` | `@sinclair/typebox`, `jsonrepair` | `bun:*`, `node:*`, DOM globals, `elysia`, `svelte`, anything from `backend/` or `frontend/` |
| `backend` | `shared`, `elysia`, `@elysiajs/static`, `bun:*`, `node:*`, `ulid`, `gpt-tokenizer` | anything from `frontend/src` |
| `frontend` | `shared` (runtime), `@formatavern/backend` **type-only** (`import type { App }`), `@elysiajs/eden`, UI deps | backend *values* |

- `shared/tsconfig.json` (`lib: ["ES2022"]`, `types: []`) makes DOM/Bun references a compile error. Keep it that way.
- `shared` is source-exported (`exports` → `src/index.ts`); no build step. Adding a dependency to `shared` requires it to be pure JS and to run identically in Bun and browsers.
- `@sinclair/typebox` must resolve to **one** copy (matched to Elysia's range). Check with `bun pm ls --all | grep -i typebox`.

### 3.2 Purity boundary: `backend/src/app.ts`
`app.ts` and every module it imports for **types** (`db/contracts.ts`, `engine/contracts.ts`) must be free of `Bun.*`, `bun:*`, and `Database` types. Reason: `svelte-check` type-checks everything reachable through `import type { App }`. Dependencies are injected via `AppDeps = { repos, hub, providers }` interfaces. A purity leak shows up as `svelte-check` errors mentioning `Bun` or `bun:sqlite`.

---

## 4. Invariants (canonical numbering — cite by id in PRs and tests)

### Phase 1 — Foundation (I)
| Id | Invariant |
|---|---|
| I1 | One TypeBox schema per boundary shape in `shared`; types via `Static<>`, never hand-written twins. |
| I2 | No write to `characters`/`personas` without `assertValid()`; repositories are the only write path. |
| I3 | Schema state is owned by `PRAGMA user_version`; running migrations N times ≡ once. Idempotence is **not** by `IF NOT EXISTS`. |
| I4 | `foreign_keys = ON` on every connection (asserted in `openDatabase()`); RESTRICT/CASCADE topology is tested. |
| I5 | `shared` is isomorphic. |
| I6 | `app.ts` is Bun-free; the DB never appears in `type App`. |

### Phase 2 — Engine (E)
| Id | Invariant |
|---|---|
| E1 | `parseEnvelope` is a pure function of the **full buffer**; no incremental parser state. `parse(concat(chunks)) ≡ parse(full)`. |
| E2 | Marker-free text parses to one `character[primary]` segment (superset invariant); raw prose is never an error. |
| E3 | `parse(serialize(segments, patch, d)) ≡ {segments, patch}` for normalized segments in all three dialects. |
| E4 | Streaming mode never leaks a partial marker into segment text for any prefix. |
| E5 | Provider streams: exactly one terminal event (`done`\|`error`), nothing after it, never throw to the consumer, abort honoured within one tick, `usage` ≤ 1, no empty tokens, no secrets in messages. |
| E6 | `buildPrompt` is pure and deterministic (no clock/random/env/model-name inference); golden file guarded. |
| E7 | `shared` stays isomorphic; `gpt-tokenizer` is backend-only. |
| E8 | Providers reach `app.ts` only as the `LLMProvider` interface. |

### Phase 3 — API & state machine (S)
| Id | Invariant |
|---|---|
| S1 | Client disconnect never aborts generation. `request.signal` is **never** passed to a provider; only `/stop`, agency truncation, or shutdown abort. |
| S2 | ≤ 1 active generation per chat; check-and-register is synchronous (no `await` between check and row insert). |
| S3 | Every `status='streaming'` row reaches a terminal status exactly once (`finally` finalizes as `error` on crash); boot recovery marks leftovers `aborted` + `metadata.recovered`. |
| S4 | DB row is authoritative; SSE is advisory. Terminal event carries the final `MessageView`; clients replace their buffer with it. |
| S5 | Bounded write rate: trailing-edge 500 ms throttle; never per-token SQLite writes. |
| S6 | Active branch is derivable from `chats.active_leaf_id` + `messages.parent_id` alone; `chats.metadata.currentState` is a derived cache audited by `db:check`. |
| S7 | `app.ts` stays Bun/SQLite-free (hub/providers/repos via interfaces). |
| S8 | Secrets never leave the process: settings GET masks keys; provider errors are scrubbed; keys are never logged. |
| S9 | Wire contracts are byte-exact: SSE frames are `data: <JSON>\n\n` (LF, no `event:`/`id:`) from a hand-rolled `ReadableStream`; errors are `{ error: { code, message, details? } }`. |

### Phase 4 — UI (U)
| Id | Invariant |
|---|---|
| U1 | Theme cascade order is fixed and pure (`shared/theme/cascade.ts`): `NEUTRAL → character.style → stateBindings (array order) → persona.styleOverrides → accessibility`. |
| U2 | Zero runtime CSS injection; tokens reach the DOM only via the theme root's `style` attribute (`--theme-*`); no data-built class strings (`p-(--theme-bubble-padding)` is the only sanctioned data-driven utility). |
| U3 | Persisted rows are never parsed client-side; `parseEnvelope` is imported only by `lib/state/stream.svelte.ts`. |
| U4 | Frame budget: per frame per stream ≤ 1 parse, ≤ 1 reactive commit, ≤ 1 markdown render (last segment). Tokens never touch `$state` directly. |
| U5 | Scroll ownership: auto-follow only while `stuck` (≤ 48 px from bottom); only user gestures change ownership. |
| U6 | Layout stability: reserved toolbar space, absolute caret, transitions on paint properties only (never `transition-all`); CLS ≤ 0.02. |
| U7 | Terminal `done`/`error` replaces the streamed turn wholesale (S4 mirror). |
| U8 | Accessibility floor under every theme: chrome palette for controls/focus, `disableCharacterThemes` → neutral AA theme, `prefers-reduced-motion` → 0 ms, keyboard-complete, `aria-busy` + one announcement per generation. |
| U9 | Route-scoped `ChatSession` under `{#key chatId}`; leaving a chat aborts the SSE reader only, then re-attaches on return. |
| U10 | Purity boundaries unchanged (`svelte-check` 0/0 over `treaty<App>`; `shared` gains only pure modules). |

Tests that pin each invariant are listed in `docs/development.md` §6.3.

---

## 5. Canonical commands (run from repo root)

| Command | Purpose |
|---|---|
| `bun install` | Install + link workspaces (root only). |
| `bun run dev` | Backend (`--watch`, :3000) + Vite (:5173, proxies `/api`, `/assets`). |
| `bun run dev:backend` / `bun run dev:frontend` | Individually. |
| `bun run typecheck` | `tsc` (shared, backend) + `svelte-check` (frontend). Must be 0 errors / 0 warnings. |
| `bun run test` | All suites: `packages/shared`, `backend`, `frontend/unit`. |
| `bun run --cwd backend test test/engine` · `bun test --cwd packages/shared test/envelope` · `bun test -t "S1"` | Filtered runs (path or `-t` name pattern). |
| `bun run build` | SvelteKit static build → `frontend/build/`. |
| `bun run start` | Production single process (`NODE_ENV=production`), serves SPA + API at :3000. |
| `bun run db:check` | Audit: WAL, FK, `user_version`, integrity, columns, no streaming rows, leaf/state consistency, row validation. Exit 1 on failure. |
| `bun run db:reset --yes` | Delete `formatavern.db(-wal,-shm)`. Refuses in production without `--yes`. |
| `bun run db:migrate` · `bun run db:seed [--force]` | Manual migration / seeding (boot does both automatically). |
| `bun run --cwd backend smoke:openrouter` | Live OpenRouter smoke (needs `OPENROUTER_API_KEY`); evidence, not a gate. |
| `UPDATE_GOLDEN=1 bun test --cwd backend test/prompt` | Regenerate the PromptBuilder golden file (review the diff!). |

Environment variables: `FORMATAVERN_HOST` (default `127.0.0.1`; `0.0.0.0` prints the ADR-006 warning), `FORMATAVERN_PORT` (3000), `FORMATAVERN_DB_PATH`, `FORMATAVERN_ASSETS_DIR`, `OPENROUTER_API_KEY` (fallback when no key is stored in settings), `NODE_ENV`.

---

## 6. Anti-patterns (hard NO — reviewers will reject)

**Backend / engine**
- ❌ Passing `request.signal` (or any HTTP-scoped signal) into `provider.generate()` — breaks S1. Only the hub's controller.
- ❌ Any `await` between `hub.activeForChat()` and the assistant row insert — breaks S2.
- ❌ Per-token `UPDATE messages` — breaks S5. Use the flush throttle.
- ❌ Emitting SSE via Elysia generators/`sse()` helpers, or adding `event:`/`id:` lines — breaks S9. Use `routes/sse.ts`.
- ❌ Throwing after an SSE `Response` has been returned; validate and build the prompt **before** `sseResponse()`.
- ❌ `PRAGMA foreign_keys` inside a transaction; `new Database()` anywhere except `openDatabase()`.
- ❌ Editing an existing migration; add v(N+1). Never rely on `IF NOT EXISTS` for idempotence.
- ❌ Reading `narrativeMode`/dialect from global settings at request time — they are persisted per chat at creation.
- ❌ Logging or returning API keys; putting `Database`/`Bun` types into `app.ts` or the `contracts.ts` files.
- ❌ Inferring encoding or behaviour from the model name inside `buildPrompt` (E6). `cl100k_base` is default; `o200k` only by explicit option.

**Shared / parser**
- ❌ Module-level or instance state in the parser ("incremental for performance") — E1.
- ❌ Merging adjacent segments in the parser (E3); visual merging is a UI concern.
- ❌ Repairing an **unclosed** state block with `jsonrepair` — must yield `null` + `state_unclosed`.
- ❌ Reordering the parse steps (normalize → hold-back → reasoning → agency → state → scan). Reasoning before agency; agency before state.
- ❌ `structuredClone`, `window`, `Bun`, `node:*` in `shared`.
- ❌ Setting `additionalProperties: false` on schemas (unknown keys are stripped by `Value.Clean`, not rejected).

**Frontend**
- ❌ `document.createElement('style')`, `insertRule`, dynamic `class={\`bg-${x}\`}` — U2 (policed by `unit/boundaries.test.ts`).
- ❌ Importing `parseEnvelope` anywhere but `stream.svelte.ts`; parsing persisted `MessageView.content` — U3.
- ❌ Appending tokens to `$state`, or `$effect`s that read the live buffer and scroll — U4/U5.
- ❌ `transition-all` / `transition: all`, transitioning size/font/layout props — U6.
- ❌ `{@html}` outside `Markdown.svelte`; loosening the DOMPurify allow-list; allowing `class` values other than `speech`.
- ❌ Smooth scrolling while streaming; re-engaging follow programmatically; trimming the window while the reader is scrolled up.
- ❌ Prefilling the API-key field from the settings view (S8); storing a11y prefs server-side (they are device-local).
- ❌ Eden Treaty for SSE routes (use `readSse`); Eden value-imports from backend.
- ❌ Constructing `ChatSession`/`ThemeEngine` in `$derived`, or `setContext` after an `await`.
- ❌ Suppressing Svelte `a11y-*` warnings instead of fixing them.

---

## 7. Conventions

- **Schemas first.** New boundary shapes → `packages/shared/src/schemas/*.ts` (TypeBox) → `Static<>` type → `validate()/assertValid()` at the boundary → Elysia `body:/query:/params:` receive the same schema object.
- **IDs:** fixed slugs for seeds (`eldrin-the-mage`, `alice`, `persona-default`); monotonic ULIDs (`db/ids.ts`) for everything user-created. ULID lexical order = chronological order and the message index relies on it.
- **JSON columns** (`style`, `metadata`, `segments`, `state`, `metrics`, `style_overrides`) are stringified in repositories only; DTOs never expose `null` metadata (use `{}`).
- **Errors:** throw `ApiError(code, status, message, details?)` from routes/engine; `app.onError` renders the envelope. Codes are the `ApiErrorCode` union in `shared/schemas/api.ts` — add there first.
- **Paths:** resolve from `import.meta.dir`, never `cwd`; join with `node:path`.
- **Tests:** `bun:test`; backend tests use in-memory DB via `test/helpers.ts` (temp files only for WAL/multi-connection cases; close before unlink). Frontend pure-module tests live in `frontend/unit/` with happy-dom. Property tests log their PRNG seed.
- **Determinism:** no `Date.now()`/`Math.random()` in shared logic or the builder; inject `now` where needed.
- **Svelte 5 only:** runes (`$state`, `$state.raw` for large immutable arrays, `$derived`, `$props`, `$effect`), snippets (`{@render}`); no legacy stores in new code except `BroadcastChannel`-backed settings which is already a runes class.
- **Styling:** Tailwind utilities + the `@theme inline` bridge; character tokens only through `--theme-*`; chrome uses the neutral palette (`--chrome-*` may borrow ≤ 8 % accent via `color-mix`).
- **Naming:** files kebab or camel as already present in each folder; Svelte components PascalCase; one component per file; `*.svelte.ts` for runes-bearing modules.

---

## 8. Change recipes

**Add a migration** — append `{ version: N+1, name, up }` to `db/migrate.ts` (one statement per `db.run`); add a test to `migrations.test.ts` (fresh → N+1; vN data upgrades; rollback on throw); extend `db:check` if a new invariant needs auditing; update `docs/architecture.md` §5.

**Add a route** — schema in `shared/schemas`; handler in `routes/<group>.ts` using injected deps only; error codes in `ApiErrorCode`; route test via `app.handle(new Request(...))` with in-memory DB + `MockLLMProvider({ intervalMs: 5 })`; if SSE, use `sseResponse()` and assert frame bytes; frontend: Eden call in `lib/api/client.ts` (or `readSse` for SSE); update the surface table in `docs/architecture.md` §10.

**Add a provider** — implement `LLMProvider` from `shared/types/llm.ts` in `backend/src/providers/`; run `assertStreamContract` (E5) over every path including abort, HTTP error, idle timeout, key scrubbing; register in `engine/providers.ts` and `AppSettingsSchema.provider.id`; add a fake-fetch test suite modelled on `openrouter.test.ts`.

**Add a theme token** — `shared/schemas/theme.ts` (as `CssToken`) → `THEME_PATHS` in `theme/cascade.ts` → `CSS_VAR_NAMES` + fallback in `frontend/lib/theme/cssVars.ts` → `@property` registration + `:root` neutral + `@theme inline` bridge in `app.css` → consume via static utility. Update `cssVars.test.ts` (exact list) and `cascade.test.ts`.

**Add a parse warning / lenience** — grammar in `shared/envelope/grammar.ts`; add a case to the lenience table in `parser.test.ts`; if it changes output for existing fixtures, bump `PARSER_VERSION` and re-run `properties.test.ts`; consider a new fixture in `fixtures/envelope.ts` (chunks must satisfy the authoring rules and `chunks.join('') === text`).

**Add a mock script** — `fixtures/envelope.ts` with `expect` block and adversarial chunks; it automatically appears in `listModels()`, the `/dev` workbench select, and the contract/property suites.

---

## 9. Before opening a PR

1. `bun run typecheck` → 3/3 clean, `svelte-check` 0 errors **0 warnings**.
2. `bun run test` → all green; note new test count in the PR.
3. `bun run db:reset --yes && bun run dev` → boot log shows `migrations`, `recovered 0`, `[providers]`; `bun run db:check` exits 0.
4. If you touched SSE/proxy: curl the stream through `:5173` with timestamps and confirm pacing (see `docs/troubleshooting.md` §4).
5. If you touched UI: run the `docs/development.md` §9 evidence set (theme transition, `?dev=1` frame cost, reconciliation, Lighthouse CLS, axe, keyboard pass).
6. `bun run build && bun run start` → `/`, `/chat/x`, `/api/nope`, `/assets/nope` behave (200 html, 200 html, 404 json, 404 json).
7. Update this file / `docs/` for any boundary, command, invariant, or endpoint change. State any vault-spec delta explicitly.

---

## 10. Deferred backlog (do not sneak in without a blueprint)

Character/persona/theme editors; JSON/PNG import-export and the PNG card parser; lorebook matching engine; example-dialogue dialect conversion; downstream state replay on edits; per-model `contextLength` from `listModels`; `delta.reasoning` mapping; local providers (Ollama/Kobold/LM Studio); `FORMATAVERN_PASSWORD` gate; backup/checkpoint tooling; multi-chat split view; virtual scroller; touch swipe gestures; TTS; i18n; PWA; WebSockets; `bun build --compile` single binary; fence-aware header suppression.
```

---

# File 2 — `docs/architecture.md`

```markdown
# FormaTavern — Technical Architecture

**Scope:** the system as built through Phase 4. Normative details live in `docs/blueprints/`; this document is the map. Cross-references to invariants use the canonical ids in `.agents/AGENTS.md` §4.

---

## 1. Principles

1. **Stateless backend, authoritative database.** No session state in memory; every request names its `chatId`/`messageId`. The only in-memory state is ephemeral generation coordination (`GenerationHub`), recoverable on restart (S1–S3).
2. **One shared domain.** TypeBox schemas, the envelope parser, the state engine, and the theme cascade live in `@formatavern/shared` and execute identically in Bun and the browser (I1, I5, E1–E4, U1).
3. **Styling as data.** A character's look is a `CharacterTheme` of pure CSS values; the UI is one message component and one theme root driven by `--theme-*` custom properties (U1, U2).
4. **Single-request narrative.** Narrator, character, NPCs, and a state vector arrive in one completion; the parser is a pure function of the full buffer (E1, E2).
5. **Byte-exact, version-agnostic wire contracts** (S9).

---

## 2. Topology

### 2.1 Development
```
Browser ──► Vite dev server  http://localhost:5173
              ├── /api/*, /assets/* ──proxy──► Elysia http://127.0.0.1:3000 (IPv4 literal; SSE unbuffered)
              └── SvelteKit routes + HMR
```
### 2.2 Production (single Bun process)
```
Browser ──► Elysia :3000
              ├── /api/*          JSON / SSE routes           (unknown → 404 JSON, never index.html)
              ├── /assets/*       data/assets (traversal-guarded, max-age=3600; missing → 404 JSON)
              ├── /<built file>   frontend/build (immutable hashed assets)
              └── /<anything>     frontend/build/index.html (SPA fallback, 200)
Outbound: Elysia → OpenRouter (HTTPS). The browser never talks to an LLM API directly (ADR-004).
```
TLS and auth are delegated to the perimeter (Tailscale / Cloudflare Access, ADR-004/006). The server binds `127.0.0.1` by default; binding `0.0.0.0` prints a security warning.

### 2.3 Workspace dependency graph
```
frontend ──runtime+types──► shared ◄──runtime+types── backend
    └──── import type { App } (type-only) ─────────────┘
```
`shared` is source-exported (no build); `moduleResolution: "bundler"` everywhere; one `@sinclair/typebox` copy.

---

## 3. End-to-end data flow: sending a message

```
Composer.send()
 │ optimistic user turn + live={connecting}         (ChatSession, sync)
 ▼
POST /api/chats/:id/messages  { message, directorNote?, narrativeRole?, senderName?, parentId?, generate? }
 │ validate (TypeBox) → load chat/character/persona/settings
 │ hub.activeForChat(chat) → 409 generation_in_progress            (S2, synchronous section)
 │ resolve provider from settings (mock | openrouter[key]) → 409 provider_unconfigured
 │ tx: insert user row (complete) ; [generate:false → set leaf, 201]
 │ assembleContext(trigger=user row) → buildPrompt(ctx) → 413 prompt_budget_exceeded (no assistant row)
 │ tx: insert assistant row (status=streaming), chats.active_leaf_id := it
 │ response = sseResponse(hub, assistantId)   [subscribes BEFORE run]
 │ void runGeneration(job)                     [detached; S1]
 ▼
runGeneration
 │ hub.register → emit start{messageId,userMessageId,parentId}
 │ for await ev of provider.generate(request, hub.controller.signal)
 │    token  → buffer += ; emit token ; on '\n' agencyCheck() ; scheduleFlush()   (500 ms trailing throttle, S5)
 │    usage  → record ; emit usage
 │    done/error → record
 │ finally: cancel flush timer → finalize():
 │    parseEnvelope(buffer, streaming:false) → segments, statePatch, parse report
 │    resolveState(previousState, statePatch, stateSchema) → state, stateSource
 │    tx: messages.finalize(...) ; register NPCs into chat.metadata.npcs ; chat.metadata.currentState := state
 │    emit done{message: MessageView} | error{message, error} → hub.close()               (S3, S4)
 ▼
Client: terminal event → live=null → refetch window + chat → replace optimistic/streamed turns (U7)
        → ThemeEngine re-resolves with new currentState → @property transition (600 ms)
```

Agency truncation (`:::persona`, `Traveler:` …) detected mid-stream truncates the buffer, aborts upstream, and finalizes as **`complete`** with `metadata.parse.truncatedAt = 'persona'`; the client's longer streamed text is replaced by the terminal payload.

---

## 4. `@formatavern/shared` — the domain package

| Module | Contents |
|---|---|
| `schemas/primitives.ts` | `Id` (slug/ULID), `UnixMs`, `CssToken` (no `; { } < >`), `AssetPath` (`/assets/...` only) |
| `schemas/theme.ts` | `CharacterThemeSchema` (font/colors/bubble/background), `ThemeOverridesSchema` (deep-partial) |
| `schemas/state.ts` | `StateFieldSchema` (enum/int/string), `StateBindingSchema` (`when` → dotted `set`), `StateVectorSchema` |
| `schemas/character.ts` / `persona.ts` | `CharacterCardSchema` (+`exampleDialogue`, `stateSchema`, `stateBindings`, `initialState`, tags/creator/version), `CharacterMetadataSchema` (the JSON column shape), `PersonaSchema` |
| `schemas/narrative.ts` | `SegmentSchema`, `ChatMetadataSchema` (narrativeMode, envelopeDialect, standingDirection, npcs{displayName,voice,accent}, currentState, stateOverrides) |
| `schemas/chat.ts`, `message.ts`, `settings.ts`, `api.ts` | DTOs and request bodies for the API; `ApiErrorCode`; `DEFAULT_SETTINGS` |
| `validate.ts` | `validate()`: Clone → Clean (strip unknown keys) → Default → Check; `assertValid()`; `ValidationError` with JSON-pointer issues |
| `envelope/` | `parseEnvelope`, `serializeSegments` (alias `serializeEnvelope`, deprecated), `stripOutOfBand`, `computeHoldBack`, grammar, `PARSER_VERSION = 2` |
| `state/engine.ts` | `defaultState(card)`, `resolveState(previous, patch, schema)` |
| `text/` | `applyMacros` (`{{char}}`, `{{user}}`, `{{persona}}`, `<BOT>`, `<USER>`; single pass), `buildStopSequences` (≤ 4) |
| `theme/` | `resolveTheme` (cascade), `matchesWhen`, `THEME_PATHS`, `DEFAULT_CHARACTER_THEME`, `NEUTRAL_A11Y_THEME` |
| `types/` | `StreamEvent`, `LLMRequest`, `LLMProvider`, `AbortSignalLike`, `ChatStreamEvent`, `HealthResponse` |
| `fixtures/` | `ENVELOPE_SCRIPTS` (9 normative scripts with adversarial chunks), `TEST_STREAM_*` |

`SHARED_VERSION` is echoed by `/api/health` and displayed in the UI; bump it with each shape change.

---

## 5. Storage

### 5.1 Connection (`backend/src/db/connection.ts`)
```sql
PRAGMA journal_mode = WAL;     -- asserted 'wal' on file DBs (memory DBs skip)
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;      -- asserted = 1 (I4); per connection; never inside a transaction
PRAGMA busy_timeout = 5000;
```
`new Database(path, { strict: true })`: missing named bind parameters throw instead of binding NULL. All connections (server, scripts, tests) go through `openDatabase()`.

**WAL model:** unlimited readers + one writer; Bun is single-threaded and `bun:sqlite` is synchronous, so writes must be tiny and batched (S5). Sidecar files `-wal`/`-shm` are part of the database while a process is attached; backups must checkpoint first.

### 5.2 Schema (current `user_version = 3`)

Migrations (`db/migrate.ts`) run once per version inside a transaction; `PRAGMA user_version` is written in the same transaction (I3). A DB newer than the build refuses to open.

**v1 `initial_schema`**
```
characters (id PK, name, avatar, description, personality, scenario, first_message, style JSON NOT NULL,
            created_at, updated_at, metadata JSON)                       idx: updated_at DESC
personas   (id PK, name, avatar, description, is_default CHECK 0|1, style_overrides JSON, created_at, updated_at)
            partial UNIQUE (is_default) WHERE is_default = 1             -- at most one default
chats      (id PK, title, primary_character_id FK→characters RESTRICT, active_persona_id FK→personas RESTRICT,
            created_at, updated_at, metadata JSON)                       idx: updated_at DESC
messages   (id PK ULID, chat_id FK→chats CASCADE, parent_id FK→messages CASCADE, sender_id (polymorphic, no FK),
            role CHECK user|assistant|system, content NOT NULL, status CHECK streaming|complete|aborted|error,
            created_at, metrics JSON, metadata JSON)                     idx: (chat_id, id), (parent_id)
settings   (key PK, value JSON, updated_at)
```
**v2 `narrative_envelope`** — `messages` + `narrative_role` (CHECK character|persona|npc|narrator, default character; backfilled `persona` for user rows), `sender_name`, `segments JSON`, `state JSON`.

**v3 `chat_branching`** — `chats.active_leaf_id TEXT REFERENCES messages(id) ON DELETE SET NULL` (cycle is safe; tested), partial index on `status='streaming'`, index `(parent_id, id)`; backfill leaf = newest message per chat.

### 5.3 Tree model (S6)
- One row per generation turn. **Swipes are siblings** (same `parent_id`); branches are subtrees.
- The active branch is `path(chats.active_leaf_id)` = recursive CTE up `parent_id`, ordered by `id`.
- Pagination: `pageActiveBranch(chatId, leafId, { before, limit })` — CTE membership + `id < before`, decorated with window functions for `siblingIndex`, `siblingCount`, `hasChildren` (`PARTITION BY chat_id, parent_id`; root siblings via `parent_id IS NULL`).
- `descendLatest(id)` follows the newest child repeatedly (used by `/select`).
- Deleting a node cascades its subtree; if the active leaf was inside, the leaf moves to the node's parent.
- `chats.metadata.currentState` caches the leaf's resolved state; `db:check` asserts equality.

### 5.4 JSON column shapes
| Column | Shape |
|---|---|
| `characters.style` | `CharacterTheme` |
| `characters.metadata` | `CharacterMetadata` (`exampleDialogue`, `stateSchema`, `stateBindings`, `initialState`, `tags`, `creator`, `version`) |
| `chats.metadata` | `ChatMetadata` |
| `messages.segments` | `Segment[]` (authoritative parse) |
| `messages.state` | resolved `StateVector` after this turn |
| `messages.metrics` | `{ provider, model, promptTokensEstimated, promptTokens?, completionTokens?, durationMs, ttftMs?, finishReason?, droppedTurns }` |
| `messages.metadata` | `{ directorNote?, parse?: {dialect, parserVersion, adherent, warnings, truncatedAt}, stateSource?, stateWarnings?, reasoning?, error?, edited?, continuations?, recovered? }` |
| `settings.value` | one top-level key of `AppSettings` per row (`provider`, `openrouter`, `generation`, `narrative`, `preamble`) |

### 5.5 Filesystem
`data/assets/{characters,backgrounds,fonts}` (env `FORMATAVERN_ASSETS_DIR`), served at `/assets`. Seeds are imageless; the UI renders an ambient gradient when no background image is set.

---

## 6. The Narrative Envelope (three tracks, one request)

**Track 1 — segmented prose:** `narrator`, `character[Name]`, `npc[Name]`, (`persona` only when user-authored). Three interchangeable dialects are accepted regardless of what was requested:

| Dialect | Header | Notes |
|---|---|---|
| `directive` (default) | `:::narrator`, `:::character[Alice]`, `::: npc Guard` | lenient: `char`≡`character`, 3+ colons, bare names ≤ 40 chars, inline body after `]`; closers `:::` optional |
| `xml` | `<narrator>`, `<character name="Alice">`, single-line `<npc name="G">…</npc>` | closers optional |
| `prefix` | `Alice: …`, `Narrator: …` | gated by `knownNames` (auto) or Capitalized ≤ 3 words + stoplist (explicit) |

**Track 2 — director steering:** one-shot `directorNote` on the user node (prompt Block 9b; inherited by regenerate; never serialized into later history) and `standingDirection` on the chat (Block 9a).

**Track 3 — state vector:** trailing ```` ```state {…} ``` ```` (also `~~~state`, `<state>`, `<!--state -->`), repaired with `jsonrepair`, treated as a **patch** merged onto the previous turn's state by `resolveState` (enum aliases, int clamp, unknown keys dropped). Unclosed block → `null` + inherited state.

**Parse algorithm (normative order):** normalize newlines/BOM → streaming hold-back cut → extract reasoning (`<think>`) → agency truncation (`:::persona|user`, `<persona>`, `{{user}}:`, `<PersonaName>:`) → extract state (last closed block wins) → line scan (headers open blocks, closers are noise, EOF closes) → normalize segments (trim, drop empty, no merging) → result `{ segments, statePatch, reasoning, truncatedAt, truncatedIndex, dialect, adherent, warnings, heldBack, parserVersion }`.

**Hold-back (streaming):** withhold an open `<think>`/state block from its opening line, else the last line if it starts with `: < \` ~` or is a prefix of a known speaker name. Bounded to one line unless an out-of-band block is open (E4).

The same parser runs in the browser on the live buffer (once per frame) and on the backend at each flush and at finalize; persisted `segments` are never re-parsed on the client (U3).

---

## 7. Provider layer (`backend/src/providers/`)

`LLMProvider.generate(req, signal): AsyncIterable<StreamEvent>` with `StreamEvent = token | usage | error | done{stop|length|aborted}`. Contract E5 is enforced by `assertStreamContract` over every provider path.

- **`MockLLMProvider`** — replays `ENVELOPE_SCRIPTS[model.slice('mock:'.length)]` with adversarial chunk boundaries at `intervalMs` (40 ms prod, 0–5 ms tests), then `usage` and the script's terminal. Records `calls` for integration tests. Model ids: `mock:envelope-directive` (default), `mock:envelope-xml`, `mock:envelope-prefix`, `mock:classic`, `mock:sloppy`, `mock:persona-violation`, `mock:truncated`, `mock:reasoning`, `mock:error`.
- **`OpenRouterProvider`** — injected `fetch`; body `{ model, messages, stream:true, usage:{include:true}, sampling…, stop ≤ 4, max_tokens }`; messages = `[system] + history → ensureUserFirst → + assistantPrefill → coalesceConsecutiveRoles`; byte-level SSE parsing (`sse.ts`) with streaming UTF-8 decode, comment-line skipping, empty-delta filtering; finish reason recorded, terminate on `[DONE]`/EOF; idle timeout 60 s; HTTP status → `recoverable` mapping; API key scrubbed from all messages (P7/S8); instances cached per key (LRU-2) in `engine/providers.ts`.

Provider selection: `settings.provider.id` (`mock` | `openrouter`), key from settings or `OPENROUTER_API_KEY`, model from `settings.provider.model`.

---

## 8. PromptBuilder (`backend/src/prompt/`)

Pure `buildPrompt(PromptContext) → BuiltPrompt` (E6). Fourteen ordered block ids compiled into `systemPrompt` (1–7b) and `history` (8 + bottom blocks 9a/9b/9c appended to the **last user message**):

| Id | Block | When |
|---|---|---|
| 1 | System preamble | always |
| 1b | Narrative format directive (dialect syntax, agency clause, state field list from `stateSchema`) | narrative mode |
| 2 / 3 / 4 | Description / Personality / Scenario | non-blank |
| 5 | Example dialogue (verbatim; dialect conversion deferred) | non-blank |
| 6 | Lorebook entries (pre-matched; engine deferred) | provided |
| 6b | NPC voice cards (npcs seen in last 6 assistant turns + `chat.metadata.npcs[].voice`) | narrative |
| 7 | User persona | always |
| 7b | `[Scene state: k=v…]` in schema key order | narrative + state |
| 8 | History: assistant rows via `stripOutOfBand` (fences kept, state/reasoning removed); user rows verbatim (`persona`) or serialized with a header (`narrator`/`npc`/`character`); skips `error`/`streaming`/director-only rows; past director notes never serialized | always |
| 9a / 9b / 9c | Standing direction / one-shot director note / format reminder | as set / narrative |

Also: macros applied to every outbound string; `[Scene begins.]` prepended when history starts with assistant; `[Continue the scene.]` synthetic user turn when history ends on assistant; continuation via `assistantPrefill` (providers with `prefill`) or a nudge; budgeting with `gpt-tokenizer` (`cl100k_base`, 0.9 safety factor) dropping oldest turns whole, never the trigger (`PromptBudgetError` → 413). Golden file: `backend/test/prompt/__golden__/eldrin-narrative-directive.txt`.

---

## 9. Generation engine (`backend/src/engine/`)

- **`GenerationHub`** — `Map<messageId, Active>`; synchronous `register` (throws `generation_in_progress`), multi-subscriber fan-out, `snapshot()` of the in-memory buffer (for reattach), `abort(id, 'user'|'agency'|'shutdown')`, `abortAll` on shutdown.
- **`runGeneration(job)`** — the state machine of §3; the only consumer of provider events. Flushes `content`+streaming `segments` on a 500 ms trailing-edge throttle (`updateStreaming … WHERE status='streaming'`), checks agency on newline tokens, finalizes in `finally` with its own try (S3), registers NPCs, refreshes `currentState`.
- **`assembleContext`** — builds `PromptContext` from `messages.path(trigger)`, nearest ancestor state (or `defaultState`), active NPCs, director note from the trigger, chat metadata, settings budget, provider capabilities; continuation excludes the node itself from history.
- **`recovery.ts`** — on boot, `markStaleStreamingAsAborted()` → `aborted`, `metadata.recovered = true`, `stateSource = 'inherited'`.
- **Shutdown** — SIGINT/SIGTERM → `hub.abortAll('shutdown')` → `db.close()` (WAL checkpoint).

Status semantics: `complete` (incl. agency-truncated), `aborted` (user stop / shutdown), `error` (provider or finalize failure, `metadata.error` set, state inherited).

---

## 10. API surface (`prefix /api`)

Errors: `{ error: { code: ApiErrorCode, message, details? } }` — 404 `not_found`, 422 `validation_failed` (TypeBox), 409 `generation_in_progress` / `provider_unconfigured` / `not_leaf` / `chat_has_active_generation`, 400 `invalid_parent` / `not_assistant_message` / `serialize_failed`, 413 `prompt_budget_exceeded`, 500 `internal` (no stack).

| Method & path | Notes |
|---|---|
| `GET /health` | `{ ok, service, sharedVersion, timestamp, db:{schemaVersion, characters, personas}, activeGenerations }` |
| `GET/PUT/DELETE /characters[/:id]`, `/personas[/:id]` | validated upserts; DELETE blocked by FK RESTRICT when chats reference |
| `GET/PATCH /settings` | GET masks key (`apiKeySet`, `apiKeyHint`, `source`); PATCH deep-partial, `apiKey: null` clears |
| `POST /chats` → 201 | inserts the character's `firstMessage` as root assistant node; persists narrative mode/dialect |
| `GET /chats`, `GET/PATCH/DELETE /chats/:id` | `ChatView` incl. `activeLeafId`, `activeGenerationMessageId`, `messageCount` |
| `GET /chats/:id/messages?before&limit` | active branch page, ascending, sibling decorations |
| `POST /chats/:id/messages` | **SSE** (or 201 when `generate:false`) |
| `PATCH /chats/:id/state` | manual override via `resolveState`; writes leaf state + cache + override log |
| `GET /messages/:id`, `GET /messages/:id/siblings` | |
| `GET /messages/:id/stream` | **SSE** reattach: `start{resumedFrom}` + snapshot token + live, or replay + done |
| `POST /messages/:id/stop` | idempotent |
| `POST /messages/:id/regenerate` | **SSE**; new sibling becomes leaf; inherits director note |
| `POST /messages/:id/continue` | **SSE**; same row reopened; `resumedFrom`; prefill or nudge |
| `POST /messages/:id/select` | leaf := `descendLatest(id)` |
| `PATCH /messages/:id` | `{content}` or `{segments, statePatch}`; reparse; state recomputed from ancestors (descendants not replayed) |
| `DELETE /messages/:id` | subtree cascade; leaf moves to parent |
| `POST /chat/test-stream?script=` | dev-only fixture pipe (404 in production) |

**SSE wire contract (S9):** `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`; body from a hand-rolled `ReadableStream`; frames `data: <JSON ChatStreamEvent>\n\n`; `ChatStreamEvent = start | token | usage | done{message} | error{message, error}`. Cancelling the response unsubscribes only (S1).

---

## 11. Frontend (`frontend/src/`)

### 11.1 Runtime architecture
- SvelteKit **SPA** (`ssr=false`, adapter-static, `fallback: index.html`), Svelte 5 runes, Tailwind v4 via `@tailwindcss/vite`.
- `lib/api/client.ts` — `treaty<App>(window.location.origin)` for JSON routes; `toUiError()` normalizes envelopes. `lib/api/sse.ts` — `readSse<ChatStreamEvent>()` (frame parser on `\n\n`, streaming `TextDecoder`) for the four SSE routes.
- **`ChatSession`** (`lib/state/session.svelte.ts`) — route-scoped under `{#key chatId}` in `ChatContainer.svelte` (U9): `chat`, `character`, `persona`, `messages` (`$state.raw`, immutable replacement), `live: LiveTurn|null`, `currentState`, commands (`send/stop/regenerate/continueTurn/select/edit/remove/overrideState/loadOlder/reattach/destroy`). Optimistic user turn; terminal → refetch window + chat (U7). `destroy()` aborts the reader only.
- **`StreamController`** (`lib/state/stream.svelte.ts`) — non-reactive buffer; `push()` schedules one rAF; `tick()` parses once and commits once (U4); the only importer of `parseEnvelope` (U3).
- **`ScrollController`** + pure `scroll/policy.ts` — `stuck` ownership (48 px), gesture vs. program scroll attribution, instant pin while streaming, `prependAdjust` anchoring on `loadOlder`, `ResizeObserver`/`visualViewport` re-pin (U5).
- `settings.svelte.ts` (server settings + `BroadcastChannel('formatavern_sync')`, in-flight sequencing), `prefs.svelte.ts` (device-local a11y/behaviour prefs), `media.svelte.ts` (reduced motion/transparency, coarse pointer), `toasts.svelte.ts`.

### 11.2 Chameleon design-token pipeline
```
CharacterCard.style ─┐
stateBindings + currentState ─┤ resolveTheme() (shared, pure; order: NEUTRAL → character → bindings → persona → a11y)  [U1]
Persona.styleOverrides ─┤          │
prefs.disableCharacterThemes/ReactiveTheming ─┘          ▼
                          themeToCssVars() (frontend, pure; CSS_VAR_NAMES, fixed order, url() escaping, font fallbacks, --theme-scheme)
                                                         ▼
                          <div class="theme-root" style="--theme-…:…" data-transitions="on|off" data-theme-scheme="dark|light">
                                                         ▼
                          app.css: @property registrations (<color>/<length>) → the custom properties themselves interpolate
                                   over --motion-theme (600 ms, 0 under reduced motion);  @theme inline bridges them to
                                   Tailwind utilities (bg-char-bg, text-narrator, rounded-bubble, font-narrative …)  [U2, U6]
```
- Bindings evaluate against the **committed** `currentState` (updated at terminal events), not the live patch, to avoid flapping.
- First paint is themed with transitions off (`data-transitions="off"` until after the first frame), so route entry never strobes.
- Chrome (drawers, composer shell, toolbars, focus rings, toasts) uses a fixed neutral OKLCH palette and may borrow ≤ 8 % accent via `color-mix()` (U8).
- Backdrop: A/B image layers with blur + overlay; no image → ambient accent gradient.

### 11.3 Components
`ChatViewport` (theme root, 100dvh grid) → `Backdrop`, `TopBar` (`StateHud` → `StateOverridePopover`), `MessageLog` (windowed, `content-visibility:auto`, `JumpToLatest`) → `MessageTurn` (index-keyed segments → `NarratorBlock` | `SpeechBubble` with `StreamCaret`; `TurnToolbar`, `SwipeCarousel`, `ErrorSlate`), `Composer` (`VoiceSelect`, `DirectorDrawer`, Send⇄Stop), `NavDrawer`, `SettingsSheet`, `EditTurnDialog`, `ConfirmDialog` (native `<dialog>`). Foyer (`/`) renders live theme swatches per character. `/dev` hosts the fixture workbench (DEV only).

### 11.4 Markdown pipeline (`lib/render/`)
`marked` (gfm, breaks; raw HTML escaped; images/tables/headings disabled; links `https?:` only) + speech extension (`"…"`/`“…”` on one line → `<q class="speech">`) → DOMPurify allow-list (`p br em strong q code pre blockquote ul ol li hr a span del s`; `class` only `speech`; `href` only `https?:`). `Markdown.svelte` is the only `{@html}` site; `$derived` memoizes per segment.

---

## 12. Security posture (summary)
Bound to localhost by default; no in-app auth in v1 (perimeter via Tailscale/Cloudflare Access); API keys stored plaintext in `settings` (OS file permissions), never returned by the API or logged (S8); character `CssToken`/`AssetPath` schemas prevent style/URL breakout from imported cards; markdown output sanitized; SPA only fetches relative paths.

---

## 13. Known limitations
No virtual scroller (window capped at 240 turns with `content-visibility`); state edits do not replay downstream turns; example dialogue is not dialect-converted; headers inside generic code fences are still recognized; a persona literally named `{{char}}` is unsupported; same-chat live sync across tabs is out of scope (each tab reattaches to the authoritative row).
```

---

# File 3 — `docs/development.md`

```markdown
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
```

---

# File 4 — `docs/troubleshooting.md`

```markdown
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
```