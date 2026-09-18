# Architectural Report & Proposal: Monorepo Developer Experience, Watcher Boundary Scoping, and Zero-Leak Dev Observability

**Document ID:** `FT-PROP-DX-OBSERVABILITY-01` (Amended Revision 3 — Dual Review Consensus)  
**Status:** Approved by Dual Subagent Architecture & Invariant Reviewers  
**Scope:** Monorepo Watcher Scoping, Terminal Startup Banner, Dev HTTP/SSE Request Observability, Invariant Purity Boundaries  
**Target Environments:** FormaTavern Bun Monorepo, Elysia Backend (:3000), Vite SvelteKit Frontend (:5173)  

---

## 1. Executive Summary & Cold Context

When launching FormaTavern in development mode via `bun run dev`, developers encounter two acute developer-experience (DX) deficiencies:
1. **Terminal Watcher Warning Flood & Broken Hot-Reload:** Bun outputs ~36 consecutive warning lines stating that files in `packages/shared/src/` are "not in the project directory and will not be watched". Crucially, this means **changes to shared schemas, envelope parsers, and text utilities do not trigger hot reload in the backend**.
2. **Post-Launch Terminal Silence & "Is It Working?" Ambiguity:** After printing the initial Vite and Elysia ports, the terminal goes completely silent. Navigating the UI, clicking characters, or triggering generations produces 0 lines of feedback, creating the false impression that the server is unresponsive or frozen.

This proposal audits both issues cold, incorporates findings from two independent parallel architectural reviews, compares FormaTavern against **SillyTavern** (`S:\WorkSpace\Git Workspace\SillyTavern`), and specifies a zero-dependency, invariant-hardened resolution covering:
- CWD-scoped watcher boundaries in `package.json`.
- A high-contrast, informative dev startup banner with 302 auto-redirect for browser visitors on port 3000.
- A lightweight, zero-leak dev request & generation lifecycle logger in `backend/src/index.ts` using `WeakMap` request isolation.
- Elysia hook compilation ordering (hooks registered before `.use(app)`).
- Complete adherence to Invariants **I6/S7** (purity boundary), **S8** (secret protection), and **S9** (SSE stream integrity).

---

## 2. Problem Diagnosis & Root Cause Analysis

### 2.1 Issue 1: Watcher Directory Boundary Scoping (~36 Warning Lines)

#### Observed Output
```text
PS S:\WorkSpace\Git Workspace\FormaTavern> bun run dev
$ bun run --parallel --filter @formatavern/backend --filter @formatavern/frontend dev
@formatavern/backend:dev  | warn: File S:\WorkSpace\Git Workspace\FormaTavern\packages\shared\src\index.ts is not in the project directory and will not be watched
@formatavern/backend:dev  | warn: File S:\WorkSpace\Git Workspace\FormaTavern\packages\shared\src\schemas\persona.ts is not in the project directory and will not be watched
@formatavern/backend:dev  | warn: File S:\WorkSpace\Git Workspace\FormaTavern\packages\shared\src\schemas\theme.ts is not in the project directory and will not be watched
@formatavern/backend:dev  | warn: File S:\WorkSpace\Git Workspace\FormaTavern\packages\shared\src\text\tags.ts is not in the project directory and will not be watched
... (32 more lines) ...
```

#### Root Cause Mechanics
1. Root `package.json` specifies:
   ```json
   "dev": "bun run --parallel --filter @formatavern/backend --filter @formatavern/frontend dev"
   ```
2. In `backend/package.json`, the `dev` script is defined as:
   ```json
   "dev": "bun --watch src/index.ts"
   ```
3. When Bun runs with `--filter @formatavern/backend`, it sets the child process Current Working Directory (CWD) to `backend/`.
4. Bun's native file watcher (`bun --watch`) defines its project watch boundary strictly as the process's working directory (`CWD`).
5. In `backend/src/index.ts`, modules import from `@formatavern/shared`. The workspace symlink resolves to physical files at `packages/shared/src/*`.
6. Because `packages/shared/src/` is outside `backend/`, Bun explicitly warns that each shared file is outside the project directory and will not be watched.
7. **Severe Consequence:** If an engineer edits any file in `packages/shared` (e.g. adding a new schema field or tweaking envelope parsing), the backend *fails to reload*. The developer tests stale code without realizing it.

#### Verification of Fix
Running `bun --watch backend/src/index.ts` directly from the **monorepo root** sets the CWD to `FormaTavern/`. Both `backend/` and `packages/shared/` are contained within this root.
**Empirical test result:** 0 warnings emitted, and changes in `packages/shared/src/` immediately trigger backend reload.

---

### 2.2 Issue 2: Post-Launch Terminal Silence

#### Observed Behavior
After startup:
```text
@formatavern/backend:dev  | [db] formatavern.db  migrations: 8 → 8  recovered 0 stale generations
@formatavern/backend:dev  | [providers] mock ready, openrouter disabled (no key), custom disabled (no base URL), gemini disabled (no key)
@formatavern/backend:dev  | [formatavern] dev backend → http://127.0.0.1:3000
@formatavern/frontend:dev | VITE v6.3.5 ready in 157 ms
@formatavern/frontend:dev | 
@formatavern/frontend:dev | ➜ Local: http://127.0.0.1:5173/
@formatavern/frontend:dev | ➜ Network: use --host to expose
@formatavern/frontend:dev | ➜ press h + enter to show help
```
Following this output, the terminal halts all logging.

#### Root Cause Mechanics
1. **Frontend Proxy Layer:** `frontend/vite.config.ts` runs Vite on port 5173. It proxies `/api/*` and `/assets/*` to `http://127.0.0.1:3000`. By default, Vite's proxy does not log proxied traffic.
2. **Backend API Layer:** Elysia in `backend/src/index.ts` is configured with `.use(app)` and `.use(staticPlugin(...))`. Neither Elysia core nor `createApp()` includes any request logging middleware.
3. When the browser requests `/api/characters`, `/api/settings`, or initiates message generation (`POST /api/chats/:id/messages`), the requests succeed silently with 0 stdout lines.
4. Developers have no visibility into:
   - What endpoints are being hit.
   - Response status codes and query execution latencies.
   - Generation lifecycle (start, terminal completion, durations, aborts).

---

## 3. Comparative Audit: SillyTavern Analysis

An inspection of SillyTavern (`S:\WorkSpace\Git Workspace\SillyTavern`) reveals how a mature local LLM frontend handles console UX:

| Feature / Concern | SillyTavern Implementation | FormaTavern Assessment & Learning |
|---|---|---|
| **Startup Banner** | In `src/server-main.js:420-446`, builds a prominent, delimited console box: <br>`SillyTavern is listening on IPv4: 127.0.0.1:8000`<br>`--------------------------------------------------`<br>`Go to: http://127.0.0.1:8000 to open SillyTavern`<br>`--------------------------------------------------` | FormaTavern has two servers in dev mode (Vite :5173 and Elysia :3000). A clear banner must state that **`http://127.0.0.1:5173` is the interactive Web UI**, while `:3000` is the backend API. |
| **Connection Feedback** | In `src/middleware/accessLogWriter.js:33-58`, logs `New connection from 127.0.0.1; User Agent: ...` when an IP connects for the first time. | Confirms to the user the exact second their browser establishes contact. |
| **Action & Stream Lifecycle** | In `src/endpoints/backends/chat-completions.js:2593` and `text-completions.js:60`, logs `Streaming request in progress`, `Streaming request finished`, and `Aborting generation...`. | High-signal event logging provides peace of mind without flooding stdout with static file requests. FormaTavern should log message generation registration, completion duration, and aborts. |
| **Log Levels & Color** | Uses `color` (Chalk) and semantic tags (`[info]`, `[error]`). | Clean ANSI colors improve scannability in Windows PowerShell without requiring external dependencies. |

---

## 4. FormaTavern Architectural Constraints & Invariants

Logging cannot be casually sprinkled into this codebase. Any solution must comply with FormaTavern's strict invariant suite:

### 4.1 Invariant I6 & S7 — The Purity Boundary
- **Rule:** `backend/src/app.ts` and all modules imported for types (`db/contracts.ts`, `engine/contracts.ts`) MUST remain strictly free of `Bun.*`, `bun:*`, and `Database` types. `svelte-check` type-checks everything reachable via `import type { App } from '@formatavern/backend'`.
- **Constraint:** We must **NOT** insert Bun-specific logging, un-typed middleware, or heavy external modules into `app.ts` or routes.
- **Resolution:** The dev request logger and generation observability belong strictly in `backend/src/index.ts` (the standalone server launcher) outside `app.ts`.

### 4.2 Invariant S8 — Zero Secret Exposure
- **Rule:** Secrets (API keys, passwords, bearer tokens) must never be logged or exposed.
- **Constraint:** Endpoints like `PUT /api/settings`, `POST /api/provider-configs`, and headers (`Authorization`) carry sensitive LLM keys. In addition, upstream LLM provider error messages can occasionally echo API keys.
- **Resolution:** The logger must strictly record:
  $$\text{Log Entry} = \{\text{method}, \text{pathname}, \text{status}, \text{durationMs}\}$$
  Query parameters, headers, and request bodies must be strictly excluded from logging. Any error logging must redact keys matching known provider config values.

### 4.3 Invariant S9 — Byte-Exact SSE Integrity
- **Rule:** SSE stream must deliver byte-exact `data: <JSON>\n\n` chunks without tampering.
- **Constraint:** Middleware that wraps the response object or inspects stream buffers can accidentally buffer chunks, disable HTTP chunked transfer, or mangle chunk boundaries.
- **Resolution:** Uses Elysia's `onAfterResponse` (which executes asynchronously *after* the `Response` stream is handed off to Bun's native HTTP layer) and does not touch stream bodies. Generation progress is observed via `GenerationHub` lifecycle events.

### 4.4 Invariant Test Runner Hygiene
- **Rule:** `bun test` must run clean without terminal pollution.
- **Constraint:** Unit and integration tests instantiate `createApp()` directly.
- **Resolution:** Dev logging is placed strictly in `backend/src/index.ts`, which is never imported by test suites. Tests remain 100% quiet.

### 4.5 Zero Dependency Mandate
- **Rule:** Avoid heavy external logging packages (Pino, Winston, Morgan).
- **Resolution:** Implement using native Bun/Elysia lifecycle hooks, Web standard `WeakMap` / `performance.now()`, and ANSI formatting in fewer than 45 lines of code.

---

## 5. Implementation Specification (Consolidated Post-Review Design)

### 5.1 Step 1: Root `package.json` Watcher Fix

Refactor the root scripts so that `dev:backend` runs `bun --watch backend/src/index.ts` from the repo root:

```json
{
  "scripts": {
    "dev": "bun run --parallel dev:backend dev:frontend",
    "dev:backend": "bun --watch backend/src/index.ts",
    "dev:frontend": "bun run --cwd frontend dev",
    ...
  }
}
```

---

### 5.2 Step 2: High-Contrast Dev Startup Banner & 302 Redirect (`backend/src/index.ts`)

Replace the single line on startup with an informative, formatted banner:

```ts
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

if (!PROD) {
  // If bound to 0.0.0.0, display 127.0.0.1 in the clickable console link for terminal convenience
  const displayHost = HOST === '0.0.0.0' ? '127.0.0.1' : HOST;

  console.log(`
  ${bold('FormaTavern')} ${dim('— LLM Roleplay Studio')}
  ${dim('──────────────────────────────────────────────')}
  ➜ ${bold('Web UI:')}   ${cyan('http://127.0.0.1:5173/')}  ${dim('(Vite dev server)')}
  ➜ ${bold('API:')}      ${green(`http://${displayHost}:${PORT}/`)}    ${dim(`(Elysia backend${HOST === '0.0.0.0' ? ' [0.0.0.0]' : ''})`)}
  ${dim('──────────────────────────────────────────────')}
`);
}
```

In dev mode, if a developer clicks `http://127.0.0.1:3000/` in their browser, redirect them to Vite:
```ts
if (!PROD) {
  server.get('/', ({ set }) => {
    set.redirect = 'http://127.0.0.1:5173/';
  });
}
```

---

### 5.3 Step 3: Zero-Leak Dev Request Logger (`backend/src/index.ts`)

#### Crucial Compilation Order & Status Parsing (Dual Review Amendment)
- **Hook Compilation Order:** Hooks `.onRequest` and `.onAfterResponse` MUST be declared on `server` **before** `.use(app)`. If registered after, Elysia's route compilation may bypass child routes.
- **WeakMap Request Isolation:** Eliminates the concurrency race condition inherent to Elysia's singleton `store`.
- **Safe Status Code Normalization:** Safely converts string statuses (e.g. `"OK"`, `"Not Found"`) to numeric codes to prevent `NaN` in color formatters.
- **Defensive Error Handling:** `new URL(request.url)` is guarded inside `try/catch` against malformed URIs.
- **High-Signal Suppression:** Suppresses `/assets`, `/favicon.ico`, and `/api/health`.

```ts
const requestStartTimes = new WeakMap<Request, number>();

const parseStatusCode = (status: unknown): number => {
  if (typeof status === 'number') return status;
  if (typeof status === 'string') {
    const parsed = parseInt(status, 10);
    if (!isNaN(parsed)) return parsed;
    const statusMap: Record<string, number> = {
      OK: 200,
      Created: 201,
      'No Content': 204,
      'Bad Request': 400,
      Unauthorized: 401,
      Forbidden: 403,
      'Not Found': 404,
      Conflict: 409,
      'Internal Server Error': 500
    };
    return statusMap[status] ?? 200;
  }
  return 200;
};

const statusColor = (status: number) => {
  if (status >= 500) return `\x1b[31m${status}\x1b[0m`;
  if (status >= 400) return `\x1b[33m${status}\x1b[0m`;
  if (status >= 300) return `\x1b[36m${status}\x1b[0m`;
  return `\x1b[32m${status}\x1b[0m`;
};

const server = new Elysia();

if (!PROD && process.env.FORMATAVERN_LOG !== 'silent') {
  server
    .onRequest(({ request }) => {
      requestStartTimes.set(request, performance.now());
    })
    .onAfterResponse(({ request, set, responseValue }) => {
      try {
        const url = new URL(request.url);
        // Suppress asset polling, icons, and health check pings
        if (
          url.pathname.startsWith('/assets') ||
          url.pathname === '/favicon.ico' ||
          url.pathname === '/api/health'
        ) {
          return;
        }

        const startTime = requestStartTimes.get(request);
        requestStartTimes.delete(request);
        const duration = startTime ? (performance.now() - startTime).toFixed(1) : '?';

        const rawStatus = (responseValue as Response | undefined)?.status ?? set.status ?? 200;
        const statusCode = parseStatusCode(rawStatus);
        const method = request.method.padEnd(6);

        console.log(`  \x1b[2m[api]\x1b[0m ${method} ${url.pathname} ${statusColor(statusCode)} \x1b[2m(${duration}ms)\x1b[0m`);
      } catch {
        // Defensive: malformed URLs or unexpected exceptions do not disrupt the server
      }
    });
}

// Chain app AFTER lifecycle hooks so all child routes inherit request timing
server.use(app);
```

---

### 5.4 Step 4: Concrete Generation Lifecycle Observability (`backend/src/index.ts`)

To avoid touching `engine/contracts.ts` or `app.ts` (keeping `bun test` 100% quiet and preserving Invariant **I6/S7**), decorate `hub` directly in `backend/src/index.ts`:

```ts
if (!PROD && process.env.FORMATAVERN_LOG !== 'silent') {
  const origRegister = hub.register.bind(hub);
  hub.register = (input) => {
    const started = performance.now();
    const shortChat = input.chatId.length > 8 ? input.chatId.slice(-8) : input.chatId;
    console.log(`  \x1b[35m[generation]\x1b[0m Chat ..${shortChat} → registered`);

    const reg = origRegister(input);
    const origEmit = reg.emit;
    reg.emit = (ev) => {
      if (ev.type === 'terminal') {
        const elapsed = ((performance.now() - started) / 1000).toFixed(2);
        const statusStr = ev.status === 'completed' 
          ? `\x1b[32m${ev.status}\x1b[0m` 
          : `\x1b[33m${ev.status}\x1b[0m`;
        console.log(`  \x1b[35m[generation]\x1b[0m Chat ..${shortChat} → ${statusStr} in ${elapsed}s`);
      }
      origEmit(ev);
    };
    return reg;
  };

  const origAbort = hub.abort.bind(hub);
  hub.abort = (messageId, reason) => {
    const res = origAbort(messageId, reason);
    if (res) {
      const shortMsg = messageId.length > 8 ? messageId.slice(-8) : messageId;
      console.log(`  \x1b[33m[generation]\x1b[0m Message ..${shortMsg} → aborted (${reason})`);
    }
    return res;
  };
}
```

---

## 6. Invariant Compliance Matrix

| Invariant | Requirement | Proposal Compliance |
|---|---|---|
| **I6 / S7** | `app.ts` Bun-free & pure type contract | ✅ 100% compliant. All logging and hub decoration logic resides in `backend/src/index.ts`. `app.ts` and routes are untouched. |
| **S8** | Secrets never logged or exposed | ✅ 100% compliant. Headers, request bodies, and query strings are stripped. Only `url.pathname`, `method`, `status`, and `duration` are logged. |
| **S9** | Byte-exact SSE integrity | ✅ 100% compliant. `onAfterResponse` does not touch or buffer the SSE stream. Generation stats hook into `reg.emit(ev)`. |
| **C13/C14** | Surface & CSS invariants | ✅ N/A (no CSS changes). |
| **Tests** | Clean test execution | ✅ 100% compliant. `bun test` bypasses `index.ts` entirely. |

---

## 7. Verification Plan

1. **Watcher Scoping Verification:**
   - Run `bun run dev`. Verify 0 `warn: File ... is not in the project directory` lines appear.
   - Edit `packages/shared/src/schemas/theme.ts`. Verify the backend watcher detects the change and reloads.
2. **Request Logger Verification:**
   - Open `http://127.0.0.1:5173/` in the browser.
   - Verify terminal prints formatted `[api] GET /api/characters 200 (3.2ms)`.
   - Update settings with a dummy API key; verify the API key is not printed anywhere in stdout.
3. **Automated Suite Regression:**
   - Run `bun run typecheck` → 0 errors, 0 warnings.
   - Run `bun run test` → 231/231 tests pass with zero stdout noise.
   - Run `bun run db:check` → clean integrity.
