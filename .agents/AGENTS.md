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
