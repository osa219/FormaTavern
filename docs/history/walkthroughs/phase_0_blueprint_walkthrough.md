# FormaTavern — Phase 0: The Walking Skeleton Walkthrough

All deliverables and acceptance criteria specified in [phase_0_blueprint.md](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/docs/blueprints/phase_0_blueprint.md) have been implemented and verified.

---

## 1. Monorepo Topology & Boundaries

```
formatavern/
├── package.json                 # Bun workspace root with --parallel orchestration scripts
├── tsconfig.base.json           # Shared strict defaults (ES2022, bundler module resolution)
├── .gitignore                   # Ignores node_modules, build artifacts, and SQLite databases
├── backend/                     # @formatavern/backend (Elysia 1.x)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── app.ts               # Pure route definitions (zero Bun globals, exports type App)
│       └── index.ts             # Process entry (env, ADR-006 warning, static & SPA fallback)
├── frontend/                    # @formatavern/frontend (SvelteKit 2 + Svelte 5 + Vite 6)
│   ├── package.json
│   ├── svelte.config.js         # adapter-static SPA configuration
│   ├── vite.config.ts           # /api reverse proxy with SSE unbuffered stream headers
│   ├── tsconfig.json
│   └── src/
│       ├── app.html
│       ├── app.d.ts
│       ├── lib/api.ts           # Eden Treaty client + raw ReadableStream SSE reader
│       └── routes/
│           ├── +layout.ts       # ssr = false (SPA mode)
│           └── +page.svelte     # Bare canvas with live buffering detector telemetry
└── packages/
    └── shared/                  # @formatavern/shared
        ├── package.json         # Direct TypeScript source export (zero build step)
        ├── tsconfig.json        # Isomorphism guard: lib ES2022, types []
        └── src/index.ts         # Wire contracts, StreamEvent union, and test fixtures
```

---

## 2. Verification Results Against Acceptance Criteria

### Criterion 1: Workspace Installation & Linking
- `bun install` completed at workspace root.
- Directory junctions verified in [node_modules/@formatavern](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/node_modules/@formatavern):
  - `@formatavern/backend` $\rightarrow$ `backend`
  - `@formatavern/frontend` $\rightarrow$ `frontend`
  - `@formatavern/shared` $\rightarrow$ `packages/shared`

### Criterion 2: TypeScript & Svelte Diagnostics
Ran `bun run typecheck`:
```
$ bun run --cwd packages/shared typecheck && bun run --cwd backend typecheck && bun run --cwd frontend check
$ tsc --noEmit -p .
$ tsc --noEmit -p .
$ svelte-kit sync && svelte-check --tsconfig ./tsconfig.json
Loading svelte-check in workspace: s:\WorkSpace\Git Workspace\FormaTavern\frontend
Getting Svelte diagnostics...

svelte-check found 0 errors and 0 warnings
```
Zero type errors across all three packages (including `svelte-check` inspecting `import type { App }` without dragging Elysia into browser scope).

### Criteria 3 & 4: Health Check (Direct & Proxied)
- **Direct (`127.0.0.1:3000/api/health`):**
  ```json
  HTTP/1.1 200 OK
  Content-Type: application/json;charset=utf-8
  {"ok":true,"service":"formatavern-backend","sharedVersion":"0.0.1-phase0","timestamp":1788560446563}
  ```
- **Proxied (`127.0.0.1:5173/api/health`):**
  ```json
  HTTP/1.1 200 OK
  content-type: application/json;charset=utf-8
  {"ok":true,"service":"formatavern-backend","sharedVersion":"0.0.1-phase0","timestamp":1788560446595}
  ```

### Criterion 5: Direct Stream Pacing (:3000)
Captured wall-clock arrival timestamps:
```
01:20:55.522 [direct]  data: {"type":"token","text":"Forma"}
01:20:55.852 [direct]  data: {"type":"token","text":" Tavern"}     (+330ms)
01:20:56.253 [direct]  data: {"type":"token","text":" walking"}    (+401ms)
01:20:56.653 [direct]  data: {"type":"token","text":" skeleton"}   (+400ms)
01:20:57.054 [direct]  data: {"type":"token","text":" online"}     (+401ms)
01:20:57.055 [direct]  data: {"type":"done","finishReason":"stop"} (+1ms)
```

### Criterion 6: Proxied Stream Buffering Oracle (:5173)
Captured wall-clock arrival timestamps across Vite dev proxy:
```
01:20:57.089 [proxy]   data: {"type":"token","text":"Forma"}
01:20:57.487 [proxy]   data: {"type":"token","text":" Tavern"}     (+398ms)
01:20:57.888 [proxy]   data: {"type":"token","text":" walking"}    (+401ms)
01:20:58.289 [proxy]   data: {"type":"token","text":" skeleton"}   (+401ms)
01:20:58.690 [proxy]   data: {"type":"token","text":" online"}     (+401ms)
01:20:58.691 [proxy]   data: {"type":"done","finishReason":"stop"} (+1ms)
```
- **Observed Frontend Chunk Deltas:** `[1, 400, 401, 401, 401]` ms.
- Meets the buffering oracle: all 4 inter-chunk intervals are in the 250–600 ms window (not a burst $<50$ ms).
- Assembled string: `Forma Tavern walking skeleton online` (matches shared contract).

### Criterion 8: Disconnect Hygiene
Client abort test executed:
- Mid-stream abort logged server-side:
  ```
  @formatavern/backend:dev  | [test-stream] client disconnected
  ```
- Subsequent `GET /api/health` responded immediately with `200 OK`.

### Criterion 9: Production Single-Process Serving
1. Built SPA: `bun run build` $\rightarrow$ `frontend/build/index.html` produced.
2. Started production backend: `bun run start` (listening on `127.0.0.1:3000`).
3. Endpoint verification:
   - `GET /` $\rightarrow$ `HTTP/1.1 200 OK`, `Content-Type: text/html; charset=utf-8` (SPA HTML).
   - `GET /chat/abc123` $\rightarrow$ `HTTP/1.1 200 OK`, `Content-Type: text/html; charset=utf-8` (SPA deep-link fallback).
   - `GET /api/health` $\rightarrow$ `HTTP/1.1 200 OK`, `Content-Type: application/json;charset=utf-8`.
   - `GET /api/nope` $\rightarrow$ `HTTP/1.1 404 Not Found`, `Content-Type: application/json;charset=utf-8`, body `{"error":"Not Found"}` (JSON 404, never HTML).
   - Stream test on `:3000` completed with paced arrival in production mode.

### Criterion 10: Security Posture (ADR-006)
Tested `FORMATAVERN_HOST=0.0.0.0 bun run start`:
```
[formatavern] prod backend → http://0.0.0.0:3000
[SECURITY WARNING] Server is bound to 0.0.0.0 without in-app authentication.
Any device on your local network can access chats and API keys.
Use Tailscale or Cloudflare Tunnel for secure remote access.
```
Default startup on `127.0.0.1` cleanly omits the warning.

---

## 3. Scope Boundary Check

| Scope Item | Status |
|---|---|
| Persistence (`bun:sqlite`, `formatavern.db`) | **Deferred** to Phase 1 |
| TypeBox / CharacterCard / Narrative Schemas | **Deferred** to Phase 1 |
| LLM Providers / PromptBuilder / Macros | **Deferred** to Phase 2 |
| Streaming state machine (500ms SQLite flush, stop maps) | **Deferred** to Phase 3 |
| Chameleon UI / Tailwind / Theme Tokens | **Deferred** to Phase 4 |
