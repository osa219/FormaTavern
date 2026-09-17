# Walkthrough: Monorepo Developer Experience, Watcher Boundary Scoping, and Zero-Leak Dev Observability

**Document:** `walkthroughs/terminal_dx_and_observability_walkthrough.md`  
**Status:** Completed & Verified  
**Related Report:** [`reports/terminal_dx_and_observability_proposal.md`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/reports/terminal_dx_and_observability_proposal.md)  
**Invariants Enforced:** `I6 / S7` (Purity Boundary), `S8` (Zero Secret Exposure), `S9` (Byte-Exact SSE Integrity)  

---

## 1. Problem Overview & Cold Diagnosis

When starting FormaTavern with `bun run dev`, developers encountered two frustrating issues:

1. **36 Lines of File Watcher Warnings & Broken Hot-Reload:**
   ```text
   @formatavern/backend:dev  | warn: File S:\WorkSpace\Git Workspace\FormaTavern\packages\shared\src\index.ts is not in the project directory and will not be watched
   ... (35 more lines for shared schemas, envelope parser, text tags) ...
   ```
   *Impact:* Aside from massive console noise, Bun's watcher strictly ignored all changes inside `packages/shared/src/`. Editing a shared schema or tag parser failed to trigger backend reload, causing developers to unknowingly test stale code.

2. **Total Console Silence & "Is It Working?" Ambiguity:**
   After printing the Vite and Elysia ports, stdout halted completely:
   ```text
   @formatavern/frontend:dev | ➜ Local: http://127.0.0.1:5173/
   ```
   Because Elysia has no request logger by default and Vite's proxy does not log proxied traffic, every subsequent interaction (`GET /api/characters`, `POST /api/chats`, streaming completions) succeeded in total silence. Developers were left wondering if the server hung, crashed, or was failing to receive requests.

---

## 2. Competitive Audit: SillyTavern Insights

An audit of SillyTavern (`S:\WorkSpace\Git Workspace\SillyTavern`) identified several console UX strengths adopted here:
- **Visual Startup Framing:** Clear ASCII delimiters around the user-clickable launch URL (`http://127.0.0.1:5173/`).
- **High-Signal Action Logging:** Distinguishing important events (stream start, token completion stats, aborts) from noisy static asset requests.
- **Color Formatting & Scannability:** Clean ANSI codes for status and method tags without pulling external npm logging dependencies.

---

## 3. Changes Implemented

### A. Root Watcher Scoping (`package.json`)
- **File:** [`package.json`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/package.json)
- **Change:**
  ```json
  "scripts": {
    "dev": "bun run --parallel dev:backend dev:frontend",
    "dev:backend": "bun --watch backend/src/index.ts",
    "dev:frontend": "bun run --cwd frontend dev",
    ...
  }
  ```
- **Rationale:** When `bun --watch` runs from the monorepo root rather than inside `backend/`, Bun's project directory encompasses both `backend/` and `packages/shared/`. This eliminated all 36 warning lines and restored instant hot-reloading across shared domain packages.

---

### B. High-Contrast Dev Startup Banner & 302 Redirect (`backend/src/index.ts`)
- **File:** [`backend/src/index.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/index.ts)
- **Features:**
  - **Clickable Banner:** Clearly highlights `http://127.0.0.1:5173/` as the Web UI and `http://127.0.0.1:3000/` as the backend API. If bound to `0.0.0.0`, it displays `127.0.0.1` for terminal link convenience while noting the host binding.
  - **Dev 302 Redirect:** If a user clicks `http://127.0.0.1:3000/` directly in their browser, Elysia immediately redirects them to the Vite frontend (`http://127.0.0.1:5173/`).

---

### C. Zero-Leak Dev Request Logger (`backend/src/index.ts`)
- **File:** [`backend/src/index.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/index.ts)
- **Features:**
  - **WeakMap Request Isolation:** Eliminates the concurrency race condition present in Elysia's singleton `store`. Concurrent parallel requests (e.g. initial frontend boots) measure accurate, non-conflicting durations.
  - **Lifecycle Hook Ordering:** Registered on `server` before `.use(app)` so all child API routes inherit request timing hooks.
  - **Safe Status Normalization (`parseStatusCode`):** Normalizes string statuses (`"OK"`, `"Not Found"`) to numeric codes to prevent `NaN` in terminal color formatters.
  - **Noise Suppression:** Automatically suppresses polling pings to `/assets`, `/favicon.ico`, and `/api/health`.
  - **Secret Redaction & Security (Invariant S8):** Only logs `method`, `url.pathname`, `status`, and `durationMs`. Query strings, headers, and request bodies are strictly excluded.
  - **Silent Escape Hatch:** Controlled by `!PROD && process.env.FORMATAVERN_LOG !== 'silent'`.

---

### D. Generation Hub Observability (`backend/src/index.ts`)
- **File:** [`backend/src/index.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/index.ts)
- **Features:**
  - In dev mode, decorates `hub.register` and `hub.abort` directly at the server launcher level:
    ```text
      [generation] Chat ..01HXYZ12 → registered
      [generation] Chat ..01HXYZ12 → completed in 1.82s (320 tokens)
      [generation] Message ..01HXYZ34 → aborted (user)
    ```
  - **Invariant I6 / S7 Preserved:** Zero modifications to `engine/contracts.ts`, `engine/hub.ts`, or route files. `backend/src/app.ts` remains 100% Bun/Node type-free.
  - **Test Runner Hygiene:** `bun test` instantiates `createApp()` with its own undisrupted hub, keeping test runs 100% quiet.

---

## 4. Verification Results

### 1. Watcher Scoping, Terminal Banner, and Provider Config Detection
Running `bun --watch backend/src/index.ts` from root produces:
```text
[db] formatavern.db  migrations: 8 → 8  recovered 0 stale generations
[providers] active: "OpenRouter 1" (openrouter/openrouter/free) | openrouter ready, custom disabled (no base URL), gemini disabled (no key)

  FormaTavern — LLM Roleplay Studio
  ──────────────────────────────────────────────
  ➜ Web UI:   http://127.0.0.1:5173/  (Vite dev server)
  ➜ API:      http://127.0.0.1:3000/    (Elysia backend)
  ──────────────────────────────────────────────
```
- **Warnings:** 0 warnings emitted (all 36 `warn: File ... is not in the project directory` lines eliminated).
- **Provider Detection:** Correctly inspects `repos.providerConfigs` to report active provider configurations and API key readiness instead of querying obsolete legacy settings.

### 2. Request Logging & Redirect Verification
Sending requests to `http://127.0.0.1:3000/` and `http://127.0.0.1:3000/api/characters` confirmed:
```text
  [api] GET    / 302 (0.8ms)
  [api] GET    /api/characters 200 (1.8ms)
```
- `GET /` correctly issued `302 Found` with `Location: http://127.0.0.1:5173/`.
- Requests to `/assets/*` and `/favicon.ico` were cleanly suppressed from the log.
- Testing with `FORMATAVERN_LOG=silent` confirmed complete console silence.

### 3. Automated Suite Integrity
- **`bun run typecheck`**: Passed with 0 errors and 0 warnings across all packages (`@formatavern/shared`, `@formatavern/backend`, `@formatavern/frontend`).
- **`bun run test`**: 231/231 tests passed across 33 files with 0 failures and zero stdout pollution.
- **`bun run db:check`**: Passed with schema `user_version = 8`, clean WAL, and zero integrity violations.
