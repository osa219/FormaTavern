# AGENTS.md — FormaTavern Codebase Guide

**Audience:** AI coding agents working in this repository.
**Status:** Living document. Update in the same PR as any change to boundaries, invariants, or commands.
**Navigation:** Read this file first → [`docs/architecture.md`](../docs/architecture.md) → [`docs/development.md`](../docs/development.md) → task-relevant spec in Tolaria Vault (`S:\WorkSpace\Markdown Workspace\FormaTavern`).

FormaTavern is a lightweight, design-centric LLM roleplay client: Bun + Elysia backend, SvelteKit (Svelte 5 runes) frontend, SQLite (WAL), shared isomorphic domain package, and a single-request Narrative Envelope protocol.

---

## 1. Environment & Tools

- **OS:** Windows (PowerShell / Git Bash). Prefer `curl.exe -N` and `bun run --cwd <pkg> <script>`.
- **Bun ≥ 1.2** (`S:\Program Files\bun\bin\bun.exe`): Sole runtime, package manager, and test runner.
- **Node.js** (`S:\Program Files\nodejs\node.exe`): Needed by Vite tooling only; never invoke directly.
- **Root execution:** Always run `bun install` from the repo root (workspace symlinks).
- **File locks:** Stop `bun run dev` before `bun install`, `bun run clean`, or `bun run db:reset`.

---

## 2. Monorepo Map & Boundaries

| Package | Role | May Import | Must Never Import |
|---|---|---|---|
| `packages/shared` (`@formatavern/shared`) | Isomorphic domain: schemas, envelope parser, state engine, theme cascade. | `@sinclair/typebox`, `jsonrepair` | `bun:*`, `node:*`, DOM, `elysia`, `svelte`, `backend/*`, `frontend/*` |
| `backend` (`@formatavern/backend`) | Elysia API, SQLite WAL, providers, prompt builder, generation engine. | `shared`, `elysia`, `@elysiajs/static`, `bun:*`, `node:*`, `ulid`, `gpt-tokenizer` | `frontend/src/*` |
| `frontend` (`@formatavern/frontend`) | SvelteKit SPA (adapter-static, runes), Tailwind v4. | `shared`, UI deps, `@elysiajs/eden`, `import type { App }` (**type-only**) | Backend *values* |

**Purity Boundary:** `backend/src/app.ts` and all modules imported for types (`db/contracts.ts`, `engine/contracts.ts`) MUST remain strictly free of `Bun.*`, `bun:*`, and `Database` types. `svelte-check` type-checks everything reachable via `type App`.

---

## 3. Canonical Commands (Repo Root)

| Command | Purpose |
|---|---|
| `bun run dev` | Backend (`--watch`, :3000) + Vite (:5173, reverse proxy). |
| `bun run typecheck` | `tsc` (shared, backend) + `svelte-check` (frontend). Must be 0 errors / 0 warnings. |
| `bun run test` | All suites across monorepo (`shared`, `backend`, `frontend/unit`). |
| `bun run db:check` | Audit WAL, FK, `user_version`, columns, active leaf, and state integrity. |
| `bun run db:reindex` | Rebuild FTS5 full-text search index from SQLite `characters` table. |
| `bun run db:reset --yes` | Clean slate reset for `formatavern.db*`. |
| `bun run build && bun run start` | Static bundle build + production single-process serving on :3000. |

---

## 4. Invariant Cheat Sheet (Cite by ID)

Detailed invariants & test mappings are indexed in [`docs/development.md §6.3`](../docs/development.md#63-invariant--test-index).

- **Phase 1 (Foundation):** **I1** One TypeBox schema per boundary; **I2** Repositories are the only write path; **I3** Schema state owned by `PRAGMA user_version` (idempotent); **I4** `foreign_keys = ON` on all connections; **I5** `shared` is isomorphic; **I6** `app.ts` is Bun-free.
- **Phase 2 (Engine):** **E1** `parseEnvelope` is pure function of full buffer; **E2** Raw prose parses to `character[primary]`; **E3** Parse/serialize round-trip identity; **E4** Streaming mode never leaks partial markers; **E5** Provider stream contract (1 terminal event, usage ≤ 1, keys scrubbed); **E6** `buildPrompt` is pure and deterministic; **E7** `gpt-tokenizer` backend-only; **E8** Providers reach `app.ts` only via `LLMProvider` interface.
- **Phase 3 (State & API):** **S1** Disconnect immunity (`request.signal` NEVER passed to provider); **S2** ≤ 1 active generation per chat (synchronous check-and-insert); **S3** Every streaming row reaches terminal status; **S4** DB row authoritative, SSE advisory; **S5** 500 ms trailing throttle on SQLite writes; **S6** Active branch derivable from leaf + parent; **S7** `app.ts` Bun/SQLite-free; **S8** Secrets never logged or exposed; **S9** Byte-exact SSE (`data: <JSON>\n\n`).
- **Phase 4 (UI):** **U1** Pure theme cascade order (`NEUTRAL → character → bindings → persona → a11y`); **U2** Zero runtime CSS injection (`--theme-*` custom properties only, static Tailwind utilities; Amendment A-U2 permits safe inline styles on author showcase markdown via `rebuildStyle`); **U3** Persisted rows never parsed client-side (`parseEnvelope` only in `stream.svelte.ts`; Amendment A-U3 permits `parseGreeting` in studio live preview); **U4** Frame budget (rAF buffer, ≤ 1 commit/frame); **U5** Scroll auto-follow only while stuck (≤ 48 px); **U6** Reserved layout stability (no `transition-all`, CLS ≤ 0.02); **U7** Terminal event replaces turn wholesale; **U8** High-contrast neutral chrome, 0 ms motion on preference, zero axe violations; **U9** Route-scoped `ChatSession` under `{#key chatId}`; **U10** Monorepo purity boundaries maintained (`svelte-check` clean).
- **Phase 5 (Companion Platform):** **P1** Keyset pagination on `(sort_value, id)` with opaque base64 cursor; **P2** Optimistic Concurrency Control via `expectedUpdatedAt` (409 stale write); **P3** Zero remote asset fetches (`/assets/*` or `data:image/*` only, allowlist validated); **P4** Safe Author Showcase markdown (`renderShowcaseMarkdown` with DOMPurify & style allowlist, Amendment A-U2); **P5** Live studio greeting preview via `parseGreeting` (Amendment A-U3); **P6** FTS5 feature detection with graceful LIKE fallback (`search_backend` in `settings`); **P7** Atomic persona default switching (at most 1 default).
- **Customization Series (C):** **C1** Manifest sole source of `ft-*` strings; **C2** Single style outlet (`CustomStyleOutlet.svelte`, A-U2b); **C3** Sanitizer is pure & deterministic fixed-point; **C4** Scope containment under `[data-ft-surface]`; **C5** Keyframes namespaced `ftkf-<scope>-<n>-<name>`; **C6** URL policy (`/assets/`, `data:image/`, fonts); **C7** Per-scope profiles are data (`policy.ts`); **C8** Viewer supremacy (`hideCustomStyling`); **C9** Reduced motion guard appended by outlet; **C10** 128 KiB sheet cap; **C11** Import/export symmetry; **C12** SPA style lifecycle cleanup; **C13** Performance budget (≤1 sheet/page, dynamic `css-tree`); **C14** Surface completeness & dialog containment (all routes rooted in a surface; dialogs/sheets never placed outside surface boundaries; accent buttons use `text-accent-contrast`).

---

## 5. Anti-Patterns (Hard "NO" — Reviewers Will Reject)

### Backend & Engine
- ❌ **Passing `request.signal` into `provider.generate()`** — breaks S1. Use only the hub's controller.
- ❌ **Any `await` between `hub.activeForChat()` and row insert** — breaks S2.
- ❌ **Per-token SQLite writes** — breaks S5. Must use 500 ms trailing-edge throttle.
- ❌ **Elysia `sse()` helpers or adding `event:`/`id:` lines** — breaks S9. Use `routes/sse.ts`.
- ❌ **Throwing after SSE response returned** — validate and build prompts before `sseResponse()`.
- ❌ **`PRAGMA foreign_keys` inside a transaction**; `new Database()` outside `openDatabase()`.
- ❌ **Editing an existing migration** — append v(N+1). Never rely on `IF NOT EXISTS`.
- ❌ **Logging or exposing API keys**; leaking `Bun`/`Database` types into `app.ts` or contracts.
- ❌ **Inferring tokenizer or behavior from model name in PromptBuilder** (E6).
- ❌ **Unbounded `OFFSET` pagination** — breaks P1. Must use keyset pagination `(sort_value, id)`.
- ❌ **Blind overwrites on character updates** — breaks P2. Must supply `expectedUpdatedAt`.
- ❌ **Allowing remote `http(s)://` assets** — breaks P3. Reject non-local image URLs.

### Shared Domain & Parser
- ❌ **Instance or module state in the parser** — breaks E1.
- ❌ **Merging adjacent segments in the parser** — breaks E3. Visual merging is a UI concern.
- ❌ **Repairing unclosed state blocks with `jsonrepair`** — must yield `null` + `state_unclosed`.
- ❌ **Altering parse sequence** (normalize → hold-back → reasoning → agency → state → scan).
- ❌ **Importing `node:*`, `bun:*`, or DOM globals in `packages/shared`** (I5).

### Frontend UI
- ❌ **`document.createElement('style')`, `insertRule`, or dynamic class templates (`bg-${x}`)** — breaks U2 (Amendment A-U2 applies strictly to `ShowcaseBody.svelte` with `rebuildStyle`).
- ❌ **Importing `parseEnvelope` anywhere except `stream.svelte.ts` and `greetingPreview.ts`** — breaks U3 (Amendment A-U3).
- ❌ **Writing streaming tokens directly to `$state`** — breaks U4.
- ❌ **Using `transition-all` or transitioning layout/font properties** — breaks U6.
- ❌ **Using `{@html}` outside `Markdown.svelte` and `ShowcaseBody.svelte`** or loosening DOMPurify sanitization.
- ❌ **Smooth scrolling during streaming** or programmatically re-engaging scroll follow — breaks U5.
- ❌ **Prefilling API key inputs from settings** (S8); storing a11y preferences on server.
- ❌ **Eden Treaty on SSE routes** (use `readSse`); Eden value imports from backend.
- ❌ **Constructing `ChatSession` in `$derived`** or `setContext` after `await`.
- ❌ **Suppressing Svelte `a11y-*` warnings** instead of fixing semantic markup.
- ❌ **Rendering dialogs outside surface boundaries or hardcoding dark text on `bg-accent`** — breaks C14.

---

## 6. Development Reference Links

- **Step-by-Step Change Recipes:** [`docs/development.md §13`](../docs/development.md#13-change-recipes) (Migrations, Routes, Providers, Tokens, Fixtures).
- **Architecture & Schema Deep Dive:** [`docs/architecture.md`](../docs/architecture.md).
- **Troubleshooting Runbook:** [`docs/troubleshooting.md`](../docs/troubleshooting.md).
- **Definition of Done (PR Checklist):**
  1. `bun run typecheck` → 3/3 clean, `svelte-check` 0 errors, 0 warnings.
  2. `bun run test` → 100% green.
  3. `bun run db:check` → clean integrity.
  4. Evidence set gathered per [`docs/development.md §9`](../docs/development.md#9-frontend-development) for UI changes.
