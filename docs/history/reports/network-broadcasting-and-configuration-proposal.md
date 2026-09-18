# Network Broadcasting & Application Configuration Architecture Proposal

**Status:** Revised Proposal — Blocker Fixes Applied (Edge Identity, Token Lifetime, Host Precedence), Ready for Blueprint Sign-off
**Date:** 2026-09-17 UTC (revised)
**Scope:** Architecture for local network (LAN) broadcasting, mobile phone onboarding (terminal QR code, interface auto-discovery), Vite/Elysia dev/prod alignment, host security posture (Access PIN gate), and the host configuration system (evaluating SillyTavern's `config.yaml` vs FormaTavern's SQLite/TypeBox model).
**References:** 
- SillyTavern architecture (`S:\WorkSpace\Git Workspace\SillyTavern`: `default/config.yaml`, `src/config-init.js`, `src/command-line.js`, `src/server-startup.js`)
- FormaTavern architecture (`docs/architecture.md`, `ADR-004`, `ADR-006`, `docs/workflows/ui-ux-testing.md`)
- Peer Review Reports: Agent A review & Agent B review (`docs/history/reports/network-broadcasting-and-configuration-review.md`)

---

## §1 — Goals and Non-Goals

### Primary Goals
1. **Seamless Mobile Accessibility**: Allow mobile devices on the same local network (Wi-Fi/LAN) to connect directly to FormaTavern with zero manual IP searching.
2. **Instant Terminal Onboarding**: Automatically detect the host machine's active LAN IPv4 address and display a high-contrast ANSI half-block QR code in the terminal for one-tap mobile camera connection.
3. **Dev & Production Parity (Vite-Only LAN Dev Topology)**: Ensure both `bun run dev` and `bun run start` work across mobile devices without broken redirects or loopback traps.
4. **Principled Configuration System**: Establish a type-safe, human-friendly host configuration file (`config.yaml`) that configures network sockets, ports, and host security *before* process listen, without compromising FormaTavern's authoritative SQLite domain layer.
5. **Honest Security Posture (Access PIN Gate)**: Provide a lightweight, zero-friction access gate so that opening the server to the LAN does not leave personal chat logs and upstream LLM credentials exposed to anyone sharing the Wi-Fi.
6. **Future WAN / Tunnel Readiness**: Lay the architectural groundwork for external tunnels (Tailscale MagicDNS, Cloudflare Tunnels) without requiring custom SSL certificate generation inside application code.

### Non-Goals
- **Multi-user account subsystems**: No multi-tenant user databases, per-user passwords, or user directory management. FormaTavern remains a single-user private studio.
- **Relocating LLM/Studio settings into YAML**: LLM provider credentials, prompt presets, narrative envelope options, and UI themes remain strictly authoritative in SQLite (`settings` table), modified live via REST API and Web UI without requiring process restarts.
- **In-process TLS certificate generation**: We adhere to ADR-004 (TLS termination is an infrastructure concern handled by Tailscale or Cloudflare Tunnel, not Node/Bun crypto scripts).
- **Auto-downloading third-party binaries**: We explicitly avoid SillyTavern's `Remote-Link.cmd` pattern of curling binaries directly from GitHub releases during script execution.

---

## §2 — Comparative Study: SillyTavern vs. FormaTavern

### 2.1 How SillyTavern Solves Networking & Configuration
In SillyTavern (`S:\WorkSpace\Git Workspace\SillyTavern`):
1. **Configuration Pipeline**:
   - Keeps a canonical `default/config.yaml`.
   - On boot, `src/config-init.js` reads `config.yaml` (or creates it from default), runs `keyMigrationMap` to rename legacy keys, and merges missing keys using `lodash.defaultsDeep`.
   - Command-line arguments (`yargs` in `src/command-line.js`) override `config.yaml` values, which override environment variables.
2. **Network & Socket Management**:
   - Controlled by `listen: true/false`, `listenAddress: { ipv4: '0.0.0.0', ipv6: '[::]' }`, `port: 8000`, `protocol: { ipv4: true, ipv6: false }`.
   - Auto-detects protocol availability via `getHasIP()`.
   - Handles address-in-use errors and starts Node `http.createServer` or `https.createServer`.
3. **Security & Access Control**:
   - `whitelistMode: true` by default, allowing only `127.0.0.1` and `::1`.
   - `basicAuthMode: false` by default, but provides optional HTTP basic auth with brute-force rate-limiting (`rate-limiter-flexible`).
   - Host whitelist checking and private IP SSRF filtering.
4. **Remote Access / Tunnels**:
   - Ships a batch script `Remote-Link.cmd` that downloads `cloudflared.exe` from GitHub releases and runs `cloudflared tunnel --url localhost:8000`.

### 2.2 SillyTavern's Pitfalls & Anti-Patterns to Avoid
1. **The "Dual-State Trap" (Muddled Source of Truth)**:
   - SillyTavern places *everything* in `config.yaml`: socket binding, basic auth, prompt presets, backups, character card caching, thumbnail dimensions, tokenizer downloads, Gemini settings, Claude prompt caching, extension models, and DeepL formality.
   - Some settings are UI-editable, some only YAML-editable, and some are duplicated in user JSON files (`settings.json`). Users constantly struggle with which file takes precedence.
2. **In-Place File Mutation**:
   - `src/config-init.js` modifies and writes back to `config.yaml` on startup. This strips user comments, destroys custom indentation, and causes merge friction across git pulls.
3. **The Mobile Whitelist Trap**:
   - `whitelistMode: true` is on by default. When a user turns on `listen: true` to access the app from a smartphone, they are greeted by a `403 Forbidden` error page explaining they must manually edit the whitelist file on desktop.
4. **Untyped Config & Supply Chain Risk**:
   - Configuration is untyped JavaScript objects relying on imperative string parsing.
   - Scripts that automatically download executable binaries at runtime (`Remote-Link.cmd`) pose supply-chain risks.

### 2.3 FormaTavern's Current State & Verified Gaps
1. **Current Network Handling**:
   - `backend/src/index.ts` reads `FORMATAVERN_HOST ?? '127.0.0.1'` and `FORMATAVERN_PORT ?? 3000`.
   - If `HOST === '0.0.0.0'`, it prints an ADR-006 terminal warning.
   - `frontend/vite.config.ts` binds strictly to `127.0.0.1:5173`.
2. **Current Deficiencies for Mobile / LAN**:
   - **Dev Mode Divergence (Verified Bug)**: In `bun run dev`, the backend runs on port 3000 and redirects `GET /` to `http://127.0.0.1:5173/`. If a mobile device connects to `http://192.168.1.50:3000/`, it gets redirected to `127.0.0.1:5173` (the mobile phone's own loopback!), instantly failing. Furthermore, Vite binds strictly to `127.0.0.1`, rejecting external connections.
   - **No LAN IP Detection**: The server only logs `127.0.0.1`. Users must open a command prompt, run `ipconfig`, identify their Wi-Fi adapter IPv4, and type the port manually.
   - **No Terminal QR Code**: Manually typing IPv4 URLs on mobile keyboards is slow and error-prone.
   - **Open LAN Risk**: When bound to `0.0.0.0`, any device on the network can view conversations and consume upstream API credits.
   - **Mobile Insecure Context Constraints**: Five direct call sites of `navigator.clipboard.writeText` exist in the frontend (`PromptBlocks.svelte:11`, `TurnToolbar.svelte:38`, `CustomCssPanel.svelte:215,822`, `GalleryManager.svelte:53`). Mobile Chrome and Safari throw exceptions on non-localhost plain HTTP.

---

## §3 — Configuration Architecture: The Two Spheres

FormaTavern's configuration system adheres to strict **Separation of Concerns**:

```
┌─────────────────────────────────────────────────────────────────┐
│                 SPHERE 1: HOST / INFRASTRUCTURE                 │
│      (CLI Flags > Env Vars > config.yaml > Built-in Defaults)   │
│                                                                 │
│   • Socket Binding (mode: localhost | lan | custom, port)       │
│   • Terminal UX (qrCode: boolean, announceLan: boolean)         │
│   • Host Security Gate (authMode: none | pin, pin: string)      │
│   • Storage Overrides (dataPath, assetsPath)                    │
│   • Reverse Proxies (trustedProxies)                            │
│   • External Tunnel Configuration (provider: none | cloudflare  │
│     | tailscale)                                                │
└────────────────────────────────┬────────────────────────────────┘
                                 │ boots process & socket
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│             SPHERE 2: APPLICATION & STUDIO DOMAIN               │
│        (Authoritative in SQLite database: settings table)       │
│                                                                 │
│   • LLM Providers & API Keys (OpenRouter, Gemini, Custom, Mock) │
│   • Active Provider Configuration Pointer (activeConfigId)      │
│   • Generation Parameters (temp, maxTokens, topP, minP, penalties│
│   • Narrative Envelope & Preambles (modes, dialects, voicing)   │
│   • UI Themes, Layouts & Card Chameleon Stylings                │
└─────────────────────────────────────────────────────────────────┘
```

### Why This Division is Non-Negotiable
1. **Lifecycle & Timing**: Sphere 1 settings must be known *before* Bun can open a TCP listener or mount Elysia routes, and must be editable offline via a text editor if the web server fails to boot.
2. **Zero Runtime Server Restarts**: Sphere 2 settings are manipulated dynamically through the Web UI while chatting. Storing them in SQLite prevents file-sync races, dual-source-of-truth confusion, and process restart requirements.
3. **Respect for Monorepo Invariants**: Storing application domain state in SQLite preserves Invariant `I2` (Repositories are the only write path) and Invariant `I1` (TypeBox schemas govern every boundary).
4. **TLS Decoupling**: In accordance with ADR-004, TLS paths (`certPath`, `keyPath`) are omitted entirely from application config. TLS termination belongs to the infrastructure layer (Tailscale / Cloudflare).

---

## §4 — Host Configuration Schema & Precedence Hierarchy

### 4.1 Schema Placement & Boundary Purity (Invariant I5 & I6)

> [!IMPORTANT]
> **Package Boundary Rule:** `ServerConfigSchema` and the file loader live strictly in `backend/src/config/`. They are **never** exported from `@formatavern/shared`.

`@formatavern/shared` is reserved for isomorphic domain models shared with the browser. The frontend never parses `config.yaml` or reads host network interfaces. Only the client-facing auth contract (`AuthVerifyRequestSchema`, `AuthStatusResponseSchema`) lives in `shared/src/schemas/api.ts`.

### 4.2 Schema Definition (`backend/src/config/schema.ts`)

```typescript
import { Type, type Static } from '@sinclair/typebox';

export const ServerConfigSchema = Type.Object({
  network: Type.Object({
    mode: Type.Union([
      Type.Literal('localhost'),
      Type.Literal('lan'),
      Type.Literal('custom')
    ], { default: 'localhost' }),
    host: Type.Optional(Type.String({ default: '127.0.0.1' })),
    port: Type.Integer({ minimum: 1, maximum: 65535, default: 3000 }),
    qrCode: Type.Boolean({ default: true }),
    announceLan: Type.Boolean({ default: true })
  }, { default: {} }),

  security: Type.Object({
    authMode: Type.Union([
      Type.Literal('none'),
      Type.Literal('pin')
    ], { default: 'none' }),
    pin: Type.Optional(Type.String({ minLength: 4, maxLength: 64 })),
    trustedProxies: Type.Array(Type.String(), { default: ['127.0.0.1', '::1'] })
  }, { default: {} }),

  storage: Type.Object({
    dataPath: Type.Optional(Type.String()),
    assetsPath: Type.Optional(Type.String())
  }, { default: {} }),

  tunnel: Type.Object({
    provider: Type.Union([
      Type.Literal('none'),
      Type.Literal('cloudflare'),
      Type.Literal('tailscale')
    ], { default: 'none' })
  }, { default: {} })
}, { default: {} });

export type ServerConfig = Static<typeof ServerConfigSchema>;
```

**Cross-Field Validation Invariant**:
- If `security.authMode === 'pin'`, `security.pin` is strictly required and must contain 4–64 characters. If absent, the configuration loader throws a descriptive validation error on boot.
- If `security.authMode === 'none'`, any provided `pin` is ignored with a warning.

### 4.3 Precedence Hierarchy & Defaults

Configuration resolves via:
```
CLI Flags (Highest) ──► Environment Variables ──► config.yaml ──► Built-in Defaults (Lowest)
```

1. **Environment Mapping**:
    - `FORMATAVERN_NETWORK_MODE` (`localhost` | `lan` | `custom`)
    - `FORMATAVERN_HOST` (e.g. `0.0.0.0` or `127.0.0.1`)
    - `FORMATAVERN_PORT` (e.g. `3000`)
    - `FORMATAVERN_PIN` (maps to `security.pin`, sets `authMode: pin`)
    - `FORMATAVERN_DB_PATH` (maps to `storage.dataPath`)
    - `FORMATAVERN_ASSETS_DIR` (maps to `storage.assetsPath`)
2. **Mode-vs-Host Resolution (normative)**:
    - `mode: custom` requires an explicit `host` (config `network.host`, CLI `--host`, or `FORMATAVERN_HOST`); missing host is a boot error naming the Tailscale/VPN address expected.
    - `mode: lan` ignores `host` and binds per the `§7` dev/prod branch (`127.0.0.1` backend + `0.0.0.0` Vite in dev; `0.0.0.0` Elysia in prod). An explicitly set `FORMATAVERN_HOST` alongside `mode: lan` emits a warning and is ignored, so one knob owns the bind.
    - `mode: localhost` (default) binds `127.0.0.1` regardless of `host` unless `host` is explicitly set, in which case explicit host wins and a warning records the override. Legacy `FORMATAVERN_HOST=0.0.0.0` without `mode` is treated as `mode: custom, host: 0.0.0.0` for backward compatibility.
    - Resolved `storage.dataPath` / `assetsPath` are applied before `openDatabase()` and `ensureDataDirs()`, not just before `listen()` — the loader runs first in `index.ts` boot order.
2. **Non-Destructive Loading Guarantee**:
   - FormaTavern **never writes to or mutates `config.yaml`**.
   - Defaults are applied in memory via `Value.Default()`.
   - Unknown keys are detected via a pre-clean key diff and reported as non-fatal console warnings.
3. **Repository Hygiene (`.gitignore`)**:
   - `config.yaml` is added to `.gitignore` to prevent accidental credential commits.
   - `config.example.yaml` is tracked in version control as the documented template.

---

## §5 — Network Broadcasting & Interface Discovery

### 5.1 Host Resolution Modes
1. **`mode: localhost` (Default — Option A)**:
   - Sockets bind strictly to `127.0.0.1`.
   - Only reachable from the local machine. Zero Windows Defender / OS firewall prompts.
2. **`mode: lan`**:
   - In production, server binds to `0.0.0.0`.
   - The server inspects network interfaces via `os.networkInterfaces()`:
     - **Accurate Virtual Filtering**: Filters out loopbacks (`127.*`, `::1`), link-local (`169.254.*`), and virtual adapters by interface name (patterns matching `/^vEthernet/i`, `/^docker/i`, `/^wsl/i`, `/^br-/i`, `/^vbox/i`). Does **not** filter out valid RFC1918 `172.16.0.0/12` corporate/home subnets.
     - **Multi-Candidate Output**: If multiple active IPv4 physical interfaces exist (e.g. Wi-Fi and Ethernet), the server lists all candidate URLs in the console banner, encoding the primary route in the QR code.
3. **`mode: custom`**:
    - Binds to the explicit IP in `network.host` (e.g. a specific VPN or Tailscale interface `100.x.y.z`). Missing host is a boot error per `§4.3` — it never silently falls back to `0.0.0.0`.

### 5.2 Socket Error & Antivirus/Firewall Diagnostics (Avast, AVG, Windows Defender)

On Windows host machines, local network broadcasting is frequently obstructed by host security software and OS port exclusion policies. FormaTavern proactively catches and diagnoses these failure modes:

1. **Address In Use (`EADDRINUSE`)**:
   - **Diagnosis**: Another process is already bound to the requested port.
   - **Remedy Copy**: Names `bun run stop` (the house script in `scripts/stop.ts`) or changing `port` in `config.yaml`.
2. **Permission Denied / Port Blocked (`EACCES` / `WSAEACCES 10013`)**:
   - **Diagnosis**: The host OS or security software actively blocked socket creation on `0.0.0.0:3000`.
   - **Root Causes**:
     - **Third-Party Antivirus & Web Shields**: Antivirus suites with network inspection (notably **Avast Web Shield**, **AVG Network Inspector**, or **Bitdefender**) hook TCP sockets and block unknown binaries (`bun.exe`) from binding to `0.0.0.0` or accepting inbound LAN connections.
     - **Windows Hyper-V / WSL Port Exclusions**: Dynamic port exclusion ranges reserved by Windows NAT (`netsh interface ipv4 show excludedportrange protocol=tcp`).
   - **Remedy Copy**: Guides user to allow Bun through Avast/AVG/Windows Defender or switch to an open port range (e.g. 3005 or 8080).

### 5.3 Inbound Connection Feedback & Troubleshooting Hints
1. **Terminal Troubleshooting Footnote in LAN Mode**:
   Below the QR code, the terminal displays actionable diagnostics:
   ```text
   • Troubleshooting: Ensure phone & PC share the SAME Wi-Fi network.
   • If phone times out: Check if Windows Firewall or Antivirus (Avast/AVG Web Shield)
     is blocking inbound traffic. Ensure Wi-Fi profile is set to 'Private'.
   ```
2. **Inbound Connection Audit Logging**:
   When a remote device connects over LAN, the server logs a deduplicated, sampled audit line in dev/info mode (keyed per remote IP, not spamming per SSE chunk):
   ```text
   [network] Inbound connection from 192.168.1.45 (GET /api/health 200)
   ```

---

## §6 — Terminal Onboarding UX: The Scannable QR Code

When the server boots in `lan` or `custom` mode, it prints a clean, informative console banner:

```text
  FormaTavern — LLM Roleplay Studio
  ──────────────────────────────────────────────
  ➜ Local:    http://127.0.0.1:3000/
  ➜ Network:  http://192.168.1.15:3000/
  ➜ Security: PIN Protected [••••]
  
  Scan with your phone's camera to connect:

  ▄▄▄▄▄▄▄ ▄▄  ▄ ▄▄▄▄▄▄▄
  █ ▄▄▄ █ ▄▀▄▀█ █ ▄▄▄ █
  █ ███ █ ▄▀█ █ █ ███ █
  █▄▄▄▄▄█ █ █ █ █▄▄▄▄▄█
  █▄ ▄ ▄▄ ▄▀▄▀█ ▄ ▄ ▄ █
  █ ▄█▄▄▄▄█ ▄▀▄▄▄ ▄█▄ █
  ▄▄▄▄▄▄▄ █ ▄▀█ █▄▄▄█▄█
  █ ▄▄▄ █ █▄█ ▄ ▄  █ ▄█
  █ ███ █ ▄▀▄ ▄▄█▄▄▄█▀█
  █▄▄▄▄▄█ █ █ ▄▄ ▄ ▄▄▄█
  ──────────────────────────────────────────────
```

**Implementation Invariants**:
- **Pure Unicode Half-Blocks**: Rendered using UTF-8 half-block characters (`▄` / `▀` / `█`) at 2 modules per character cell (~15–18 terminal rows).
- **Never Encode the Secret**: The QR code **never** encodes the access PIN in the URL query string, preventing token leakage into browser histories, server access logs, and proxy logs.
- **Non-Interactive & Clean**: Suppresses interactive stdin toggles (avoiding race conditions with `bun --watch`), auto-disabling when stdout is not a TTY or `< 40` columns. Can be explicitly toggled via `--no-qr` CLI flag or `network.qrCode: false`.
- **Mode-Dependent Target**:
  - **In Dev Mode**: QR code encodes `http://<lan-ip>:5173/` (the Vite Web UI).
  - **In Production Mode**: QR code encodes `http://<lan-ip>:3000/` (the Elysia server).

---

## §7 — Dev vs. Production Alignment: The Vite-Only LAN Dev Topology

Rather than forcing both the backend and Vite to bind to `0.0.0.0` in dev mode, we adopt the **Vite-Only LAN Dev Topology**:

```
Dev Mode Architecture:

Smartphone Browser ──► Vite Dev Server (:5173 on 0.0.0.0)
                         ├── SvelteKit Pages + HMR
                         └── /api/*, /assets/* ──proxy──► Elysia Backend (:3000 on 127.0.0.1)
```

### Why Vite-Only LAN Exposure is Strictly Superior
1. **Zero Dev Redirection Bugs**: Mobile devices connect directly to Vite `:5173`. The broken redirect in `backend/src/index.ts:263` (`GET /` → `127.0.0.1:5173`) is unreachable from remote clients in this topology (backend binds loopback in dev, so only Vite is dialable). The redirect is retained for local desktop convenience only and must never trust the `Host` header for remote targets.
2. **Minimal Attack Surface**: The backend stays bound to localhost `127.0.0.1` during development; only Vite is exposed. Backend LAN binding (`0.0.0.0`) is a production/single-process concern only. The config loader branches explicitly: `mode: lan` + `NODE_ENV != production` → backend `127.0.0.1`, Vite `0.0.0.0`; `mode: lan` + `NODE_ENV == production` → Elysia `0.0.0.0`.
3. **SSE & Asset Streaming Preserved**: `frontend/vite.config.ts` already contains battle-tested unbuffered reverse proxying for `/api` and `/assets` with `Accept-Encoding: identity` and `X-Accel-Buffering: no`. The proxy `target` must derive from the resolved backend port (`http://127.0.0.1:${resolvedPort}`), never a hardcoded `:3000`, so custom `port` keeps working in dev.
4. **Vite 6 `server.allowedHosts` (scoped, never bare `true`)**: `allowedHosts: true` disables the Host check entirely and invites DNS rebinding. Instead configure `server.allowedHosts: ['.ts.net']` — Vite already permits IP literals for direct LAN access; the suffix entry covers Tailscale MagicDNS in dev. Bare `true` is rejected in review.
5. **Script Plumbing (cross-platform)**: `VAR=value` prefixes fail in Windows PowerShell, so we do not use `"dev:lan": "FORMATAVERN_NETWORK_MODE=lan bun run dev"`. Instead a cross-platform launcher sets the env for both children:
    ```json
    "dev:lan": "bun scripts/dev-lan.ts"
    ```
    where `scripts/dev-lan.ts` sets `process.env.FORMATAVERN_NETWORK_MODE = 'lan'` and spawns `dev:backend` + `dev:frontend` (replacing `bun run --parallel` for this path, which cannot forward CLI flags to both children). Both Vite and the backend read the unified `FORMATAVERN_NETWORK_MODE`. Free-form CLI flags remain supported only on the single-process `start` path where `process.argv` parsing is direct.

### Edge Identity: Vite Is Never Trusted Blindly (Normative)

In dev-LAN every mobile request arrives at Elysia with remote IP `127.0.0.1` (the Vite proxy). Naively checking `remoteAddr` would therefore treat every phone as localhost and silently disable `§8`. The rule is:

- Vite's proxy config sets `xfwd: true` (appends `X-Forwarded-For: <original-client-ip>`).
- The backend is the sole PIN authority in both modes. It computes `effectiveClientIp()` as: if the TCP remote address is in `security.trustedProxies` (default `['127.0.0.1', '::1']`, i.e. exactly the Vite proxy), use the leftmost entry of `X-Forwarded-For`; otherwise use the TCP remote address and ignore the header entirely.
- The `§8.2.5` localhost bypass and the `§8.2.3` rate-limit bucket both key on `effectiveClientIp()`, never on raw `remoteAddr`. All dev-LAN phones therefore rate-limit independently and are never bypassed; the desktop browser (direct loopback, no proxy header) still bypasses with zero friction.

---

## §8 — Security Posture: The Access PIN Gate

### 8.1 Honest Threat Model & Residual Risk Disclosure
- **Friction Gate, Not Cryptographic Secrecy**: Over unencrypted LAN HTTP (`http://192.168.x.x`), bearer tokens and chat content are technically visible to passive packet sniffers on an untrusted Wi-Fi network. The PIN gate is designed as an effective *access barrier* against casual household/office roommates, guest devices, and automated crawlers, preventing unauthorized reading of chats and consumption of LLM API credits. True confidentiality across untrusted networks requires TLS termination via Tailscale or Cloudflare Tunnel (ADR-004).

### 8.2 PIN Token Contract & Verification Lifecycle

```
Mobile Browser                     FormaTavern Backend (or Vite Proxy)
      │                                             │
      ├──── GET /api/chats (no token) ─────────────►│
      │                                             │ Checks Authorization header
      │◄─── 401 Unauthorized ───────────────────────┤
      │     { error: "auth_required" }              │
      │                                             │
      ├──── POST /api/auth/verify { pin: "1337" } ──►│
      │                                             │ Timing-safe HMAC check
      │                                             │ Rate-limit: 5 fails/min/IP
      │◄─── 200 OK { token: "<signed-token>" } ─────┤
      │                                             │
      │ (Stored in localStorage)                    │
      ├──── GET /api/chats (Bearer <token>) ───────►│ Authorized (200 OK)
```

**Contract Rules**:
1. **Signing Secret**: Generated ephemerally in memory at server boot (32 cryptographically secure random bytes via `crypto.getRandomValues`). Server restarts automatically invalidate tokens, requiring re-entry. Accepted dev cost: `bun --watch` restarts log mobile clients out; the desktop is unaffected via the localhost bypass, and mobile re-enters the PIN once per restart.
2. **Token Format & Lifetime**: Stateless `base64url(payload).base64url(HMAC-SHA256(secret, payload))` with `payload = { nonce: random-16B, exp: now + 30 days }`. Verification checks signature then `exp`; expired tokens get `401`. No server-side session table (stateless backend principle preserved). PIN change requires restart (host config), which rotates the secret and invalidates all tokens.
3. **Logout**: Client-side `localStorage.removeItem()` is the logout path (no server round-trip needed for a stateless token). The PIN screen exposes "Forget this device" clearing the token.
4. **Timing-Safe Verification**: PIN string comparison uses `crypto.timingSafeEqual` on SHA-256 digests (equal-length digests, so no length-throw path) to prevent timing side-channel attacks.
5. **Rate Limiting**: Sliding window in memory limiting failed attempts to 5 per minute per `effectiveClientIp()` (see `§7` Edge Identity — never raw `remoteAddr`), returning `429 Too Many Requests`.
6. **Protected Scope**:
    - **Gated**: All `/api/*` endpoints (characters, chats, messages, settings, provider configs, SSE streams) require the Bearer token.
    - **Public exceptions (exact list)**: `POST /api/auth/verify`, `GET /api/auth/status` (returns `{ authRequired: 'pin' | 'none' }` for shell boot), and `GET /api/health` in liveness-only form (`{ ok: true }` — counts and versions redacted while unauthenticated in PIN mode; full body only for authed or bypassed callers).
    - **Public shell**: Static assets (`/assets/*`, shell icons, PWA manifest, and `index.html`) remain accessible so the client shell can mount and display the themed PIN prompt. No chat or settings data is reachable through these paths.
7. **Localhost Bypass**: `effectiveClientIp()` (not raw socket IP) in `127.0.0.1` / `::1` bypasses the PIN gate by default, preserving zero-friction local desktop usage. In dev-LAN this never fires for phones because their effective IP is the forwarded LAN address.
8. **SSE Header Support**: Because FormaTavern's `readSse` is fetch-based (`frontend/src/lib/api/sse.ts:8`), `Authorization: Bearer <token>` passes seamlessly to streaming generation endpoints without query-string token leaks. `EventSource` is never used, so no query-token fallback exists.

---

## §9 — Mobile Browser Environment Adaptations

### 9.1 Centralized Clipboard Fallback (`src/lib/utils/clipboard.ts`)
To resolve insecure context exceptions across all five existing `navigator.clipboard.writeText` call sites:

```typescript
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy DOM copy
    }
  }

  // Fallback for LAN HTTP insecure context
  if (typeof document === 'undefined') return false;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  let success = false;
  try {
    success = document.execCommand('copy');
  } catch {
    success = false;
  }
  document.body.removeChild(textarea);
  return success;
}
```

### 9.2 Progressive Web App (PWA) Manifest
A minimal `manifest.webmanifest` will be added to `frontend/static/`:
- Enables "Add to Home Screen" on iOS Safari (`apple-mobile-web-app-capable: yes`) and Android Chrome.
- Sets `display: standalone` to strip browser chrome and maximize chat height.
- **Limitation Note**: Android WebAPK installation requires a registered Service Worker in a secure context (HTTPS / localhost). Over plain LAN HTTP, Android Chrome provides standard standalone home screen shortcuts; full WebAPK installability engages automatically when accessed via Tailscale HTTPS or Cloudflare Tunnel.

---

## §10 — WAN / Remote Tunnel Extensibility

1. **Tailscale (First-Class Integration)**:
    - When running on a device with Tailscale, FormaTavern detects the interface by **name** (`/^tailscale/i`, `tailscale0`) and falls back to the `100.64.0.0/10` prefix only as a hint — never as proof, since CGNAT uses the same range. It then displays the Tailscale MagicDNS URL (`<device>.<tailnet>.ts.net`) and a dedicated QR code.
    - Provides true end-to-end WireGuard encryption and Let's Encrypt HTTPS certificates without in-app cert management.
2. **Cloudflare Tunnel (`cloudflared`)**:
   - We provide a canonical script: `bun run tunnel`.
   - The script assumes a user-installed `cloudflared` binary (never auto-downloading untrusted executables) and launches `cloudflared tunnel --url http://127.0.0.1:3000`.
   - Instructions guide users to pair this with Cloudflare Access Zero-Trust rules.

---

## §11 — Architecture & Governance Alignment

1. **ADR-006 Amendment**:
   - ADR-006 §4 outlined a future single-password gate via `FORMATAVERN_PASSWORD`.
   - This proposal formalizes that gate into the `config.yaml` `security.pin` architecture, supported by `FORMATAVERN_PIN`. An amendment will be recorded in ADR-006 alongside this implementation.
2. **Invariant Check**:
   - `I1` (TypeBox Schemas): Preserved via `ServerConfigSchema`.
   - `I2` (Repositories Write Path): Preserved. `config.yaml` is read-only at runtime; SQLite is the only write path.
   - `I5` (Isomorphic Shared): Preserved. `ServerConfigSchema` lives in `backend/src/config/`, keeping `@formatavern/shared` free of server-only structures.
   - `I6` / `S7` (`app.ts` Bun-Free): Preserved. Resolved configuration is injected into `createApp({ options })`.
   - `S8` (Secrets Scrubbed): Preserved. The PIN is never logged or encoded in QR URLs.
