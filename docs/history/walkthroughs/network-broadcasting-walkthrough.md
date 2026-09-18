# Walkthrough — Local Network (LAN) Broadcasting & Mobile Phone Accessibility

**Target:** Local network broadcasting and mobile phone accessibility for FormaTavern per [`docs/history/blueprints/network-broadcasting-blueprint.md`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/docs/history/blueprints/network-broadcasting-blueprint.md).

---

## 1. Summary of Architecture & Invariants

| ID | Principle | Implementation |
|---|---|---|
| **N1** | Two spheres, one write path | `config.yaml` is read-only at runtime; SQLite is the only write path. No `writeFile` in `config/`. |
| **N2** | Precedence cascade | CLI flags > Environment variables > `config.yaml` > System Defaults. |
| **N3** | Non-destructive memory defaulting | `Value.Default` + pre-clean key diff to warn user of typos rather than silently dropping them. |
| **N4** | Vite-only LAN exposure in dev | In dev mode, only Vite binds `0.0.0.0:5173`; backend remains bound to loopback `127.0.0.1:3000`. |
| **N5** | Effective client IP resolution | `effectiveClientIp()` only trusts `X-Forwarded-For` when remote connection is from `trustedProxies`. |
| **N6** | Exact public vs. gated boundary | Gating all `/api/*` and SSE streams before parsing body, keeping shell and `/health` public (`{ ok: true }` redacted). |
| **N7** | Stateless Access PIN tokens | 32-byte boot-ephemeral HMAC-SHA256 secret, 30-day expiry, constant-time compare, 5 fails/min sliding window rate limit. |
| **N8** | Target-only QR code | Half-block ANSI QR code matrix targeting URL only (:5173 in dev, :3000 in prod). Never encodes secrets. |
| **N9** | Localhost default | Default configuration binds strictly to loopback (`127.0.0.1`). |
| **N10** | Monorepo purity | `app.ts` strictly free of `Bun.*` and socket types; `shared` package remains isomorphic. |

---

## 2. Changes Made by Package

### Shared Domain (`@formatavern/shared`)
- [`packages/shared/src/schemas/api.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/schemas/api.ts):
  - Added `auth_required`, `invalid_pin`, `too_many_requests` to `ApiErrorCodeSchema`.
  - Added `AuthVerifyRequestSchema`, `AuthStatusResponseSchema`, `AuthVerifyResponseSchema`.
- [`packages/shared/src/index.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/index.ts): Bumped `SHARED_VERSION` to `'0.7.1-network-auth'`.
- [`packages/shared/src/validate.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/validate.ts): Re-exported TypeBox primitives (`Type, Value, Static, TSchema`).

### Backend (`@formatavern/backend`)
- **Configuration Engine (`backend/src/config/`):**
  - `schema.ts`: TypeBox schema with defaults and cross-field validation (`checkCrossField`).
  - `sources.ts`: Pure parsers for CLI flags (`parseCliArgs`) and environment variables (`parseEnvArgs`).
  - `loader.ts`: Multi-source non-destructive loader (`loadServerConfig`) with unknown key diff warning.
  - `network.ts`: LAN candidate discovery (`listLanCandidates`), interface filtering preserving RFC1918 `172.16/12`, Tailscale detection (`detectTailscale`), and backend bind resolution (`resolveBackendBind`, Invariant N4).
  - `qr.ts`: ANSI half-block 2:1 terminal QR code matrix generator (`renderQrHalfBlocks`).
  - `banner.ts`: Startup banner formatting (`formatBanner`) with network URLs, Tailscale, security status, and troubleshooting copy.
- **Network Security & Auth Gate (`backend/src/routes/`):**
  - `ip.ts`: `effectiveClientIp()` (resolves client IP with trusted proxy check) and `isLoopbackIp()`.
  - `auth.ts`: `createAuthRouter` (`/auth/status`, `/auth/verify`), HMAC token generation/verification, constant-time PIN comparison, `RateLimiter` (5 fails/min sliding window), and `InboundAuditor` (10-min interval sampled logger).
  - `backend/src/app.ts`: Injected `onRequest` pre-parse authentication gate protecting all `/api` routes wholesale while keeping public endpoints accessible and redacting `/health` to `{ ok: true }` when unauthenticated.
  - `backend/src/index.ts`: Config-first boot sequence, dynamic storage path resolution, ephemeral HMAC secret generation, socket error diagnostics (`EADDRINUSE`, `EACCES`/`WSAEACCES`), and terminal banner output.
  - `backend/src/db/paths.ts`: Added `resolveStoragePath()` and customized target directories.

### Root Configuration & Launch Scripts
- [`config.example.yaml`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/config.example.yaml): Template config documented with safe defaults.
- [`.gitignore`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/.gitignore): Added `config.yaml` to ensure secrets are never tracked.
- [`scripts/dev-lan.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/scripts/dev-lan.ts): Cross-platform launcher running backend and frontend in LAN dev mode.
- [`scripts/tunnel.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/scripts/tunnel.ts): Cloudflare Tunnel runner probing system PATH for `cloudflared` (never auto-downloads).
- [`package.json`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/package.json): Added `"dev:lan"` and `"tunnel"` scripts.

### Frontend (`@formatavern/frontend`)
- [`frontend/vite.config.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/vite.config.ts):
  - `host: lan ? '0.0.0.0' : '127.0.0.1'`
  - `allowedHosts: ['.ts.net']`
  - `xfwd: true` (load-bearing for client IP forwarding to backend)
  - Dynamic backend port resolution.
- [`frontend/src/lib/utils/clipboard.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/utils/clipboard.ts): `copyToClipboard()` utility supporting modern Clipboard API with fallback to `document.execCommand('copy')` on insecure HTTP LAN contexts.
- Migrated 5 clipboard call sites:
  - `PromptBlocks.svelte`
  - `TurnToolbar.svelte`
  - `CustomCssPanel.svelte` (2 call sites)
  - `GalleryManager.svelte`
- [`frontend/src/lib/auth/store.svelte.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/auth/store.svelte.ts): Svelte 5 runes auth store managing status (`'unknown' | 'none' | 'pin-locked' | 'authed'`), token persistence in `localStorage`, and header injection.
- [`frontend/src/lib/api/client.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/api/client.ts): Eden client interceptor injecting `authHeaders()` and handling 401 responses.
- [`frontend/src/lib/api/sse.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/api/sse.ts): `readSse()` helper injecting `authHeaders()` and handling 401 responses.
- [`frontend/src/lib/components/ui/Icon.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/ui/Icon.svelte): Added `lock` icon.
- [`frontend/src/lib/components/auth/PinPromptModal.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/auth/PinPromptModal.svelte): Full-screen PIN entry card with numeric inputmode, failure shake animation, and "Forget this device" option.
- [`frontend/src/lib/components/nav/TopBar.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/nav/TopBar.svelte): Added lock status button before settings sheet trigger.
- [`frontend/static/manifest.webmanifest`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/static/manifest.webmanifest) and [`frontend/static/icon.svg`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/static/icon.svg): PWA standalone web app manifest and high-contrast SVG icon.
- [`frontend/src/app.html`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/app.html): Linked manifest and added `apple-mobile-web-app-capable` meta tags.
- Safe area padding: Updated `ChatViewport.svelte` composer footer and `NavDrawer.svelte` with `pb-[env(safe-area-inset-bottom)]`.
- [`frontend/src/routes/+layout.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/routes/+layout.svelte): Mounted `PinPromptModal` and initialized auth check on boot.

---

## 3. Test & Verification Progress

- **Configuration Suites:**
  - `backend/test/config/loader.test.ts`: 8/8 tests passed (including `FORMATAVERN_CONFIG_PATH` lookup).
  - `backend/test/config/banner.test.ts`: 6/6 tests passed (covering `announceLan` suppression, QR targets, open/pin security markers).
  - `backend/test/config/exampleParity.test.ts`: 3/3 tests passed.
  - `backend/test/config/network.test.ts`: 4/4 tests passed (including CGNAT adapter name detection).
  - `backend/test/config/qr.test.ts`: 2/2 tests passed.
  - `backend/test/config/resolveBind.test.ts`: 8/8 tests passed.
- **Route & Security Suites:**
  - `backend/test/routes/ip.test.ts`: 6/6 tests passed.
  - `backend/test/routes/auth.test.ts`: 8/8 tests passed.
- **Frontend Suites:**
  - `frontend/unit/clipboard.test.ts`: 4/4 tests passed.
  - `frontend/unit/authStore.test.ts`: 6/6 tests passed.
  - `frontend/unit/surfaces.test.ts`: 11/11 tests passed (Invariant C14 surface audit with modal shell host allowlist).
- **Monorepo Verification Gates:**
  - `bun run typecheck`: 0 errors, 0 warnings across `packages/shared`, `backend`, and `frontend` (`svelte-check`).
  - `bun run test`: 100% green across all packages (325/325 backend tests, 241/241 frontend tests, 215/215 shared tests).
  - `bun run db:check`: Clean database and table integrity.

---

## 4. Documentation & Architectural Alignment

- Updated [`docs/architecture.md`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/docs/architecture.md):
  - Documented LAN dev proxy topology (Invariant N4) with `xfwd: true`.
  - Documented production single Bun process binding options (`mode: localhost` vs `lan` vs `all`).
  - Documented Security Posture summary with pre-parse PIN authentication gate (N6), HMAC-SHA256 bearer tokens (N7), and trusted proxy enforcement (N5).
  - Added Section 14 detailing the Configuration & Network Subsystem (Invariants N1–N10).
- Updated [`docs/development.md`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/docs/development.md):
  - Documented new environment variables (`FORMATAVERN_NETWORK_MODE`, `FORMATAVERN_PIN`, `FORMATAVERN_CONFIG_PATH`).
  - Added `dev:lan` and `tunnel` to the root script reference table.
  - Indexed Invariants N1 through N10 in the Invariant test mapping table.
  - Added the "Add a shared or dynamic frontend dependency" warm-boot recipe to §13.
- Updated [`.agents/AGENTS.md`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/.agents/AGENTS.md):
  - Added Invariants N1–N10 to Section 4.
  - Added network, proxy, and mobile anti-patterns to Section 5 with user approval.

---

## 5. Post-Blueprint Fixes & Hardening

Following peer review, 7 targeted hardening fixes and 1 DX optimization were applied and verified:

1. **Config Lookup Anchored on `import.meta.dir` (`loader.ts`):**
   - Anchored repository root to `resolve(import.meta.dir, '../../..')` rather than `process.cwd()`.
   - Ensures `bun run start` (which runs with `cwd=backend/`) reliably locates `config.yaml` at the repo root.
   - Wired `FORMATAVERN_CONFIG_PATH` lookup with explicit config options retaining precedence.
2. **Post-Unlock Page Reload (`PinPromptModal.svelte`):**
   - Added `window.location.reload()` upon successful PIN verification.
   - Prevents unauthenticated error slates from persisting behind the modal when routes mount before unlock.
3. **Surface Containment for Security Modal (`+layout.svelte` & `surfaces.test.ts`):**
   - Enclosed `PinPromptModal` inside an explicit `<div data-ft-surface="shell" style="display: contents">` sibling to satisfy Invariant **C14** (no dialogs outside surfaces).
   - Preserves viewport-relative geometry without layout shifts and retains neutral chrome for security UI.
   - Updated `surfaces.test.ts` static scanner with a precise 1-occurrence allowlist for layout.
4. **`announceLan` Wiring in Terminal Output (`banner.ts`):**
   - Wired `config.network.announceLan !== false` check in `banner.ts`.
   - Suppresses routable LAN addresses, Tailscale URLs, and terminal QR matrix when set to `false`, while keeping the network listener open.
   - Backed by 6 unit tests in `backend/test/config/banner.test.ts`.
5. **Tailscale Name-Only Interface Detection (`network.ts`):**
   - Removed `100.64.0.0/10` prefix classifier; restricted detection to adapter name pattern (`/^tailscale/i`).
   - Prevents real-world false positives on ISPs and enterprise networks utilizing RFC 6598 Carrier-Grade NAT.
6. **Tailwind Dead Class Fix (`TopBar.svelte`):**
   - Replaced invalid `bg-neutral-850` with standard Tailwind v4 palette `bg-neutral-900` on the lock status button.
7. **Warm-Boot Dependency Pre-bundling (`frontend/vite.config.ts`):**
   - Added `optimizeDeps.include` for shared and dynamic dependencies (`@sinclair/typebox`, `@elysiajs/eden`, `jsonrepair`, `marked`, `dompurify`, `css-tree`, `gpt-tokenizer`).
   - Pre-bundles these at dev-server boot so late-discovered imports no longer trigger Vite's mid-session "optimized dependencies changed, reloading page" hard refresh — most relevant to the lazily-imported `gpt-tokenizer` (Studio Voice tab) and to phone clients under `dev:lan`, where a surprise full reload is most disruptive. Dev-only setting; production builds ignore it. (Efficacy note: expected from Vite's documented pre-bundling behavior; no before/after timing was captured — treat as DX hygiene, not a measured perf win.)
8. **Safe-Area Insets Restricted to Zero-Fallback `env()` (`ChatViewport.svelte`, `NavDrawer.svelte`, `PinPromptModal.svelte`):**
   - Root cause (found via a user-reported composer regression on the chat page): safe-area padding was placed on the wrong box — the `ChatViewport` footer, which never had padding, gained `px-3 pt-3` plus `padding-bottom: max(0.75rem, …)` on top of Composer's own `p-3` box. Since `env()` is never negative, the `max()` never bit: it was an unconditional desktop inset (unthemed gutters, doubled bottom band) disguised as responsive code.
   - Restored the footer's original class; the only permitted addition is `padding-bottom: env(safe-area-inset-bottom, 0px)` (zero on desktop, notch height on phones). Same reduction applied to the `NavDrawer` dialog appendage; the `PinPromptModal` card's redundant `max()` was simplified to `calc()` with identical behavior.
   - Added a `boundaries.test.ts` guard banning the `max(<fixed>, calc(<fixed> + env(…)))` shape repo-wide plus a footer-specific assertion (no fixed `px-/pt-/pb-` utilities, `env()` present) — negative-controlled against the regressed markup. Theming pipeline, hooks, and turn rendering were verified unaffected throughout.
9. **Scoping Diagnostics Strictly to Runtime Errors & Removing Static Banner Boilerplate (`banner.ts`, `resolveBind.test.ts`):**
   - Removed hardcoded troubleshooting lines (`• Troubleshooting: phone & PC on the SAME Wi-Fi...`, `• If the phone times out: Windows Firewall / Avast-AVG Web Shield...`) from `formatBanner()`.
   - Printing static troubleshooting advice on every successful server boot was misleading and cluttered the console.
   - Real dynamic diagnostics remain cleanly scoped to actual runtime socket failures in `index.ts` (intercepting `EACCES` / `WSAEACCES 10013` to guide the user when Windows Firewall, Hyper-V port exclusions, or antivirus web shields actively deny port binding).
   - Removed obsolete static string assertions from `resolveBind.test.ts`.
