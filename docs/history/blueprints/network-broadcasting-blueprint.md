# FormaTavern — Network Broadcasting & Host Configuration Blueprint

**Purpose:** Make the studio reachable from a phone on the same Wi-Fi with one scan, without repeating SillyTavern's configuration mistakes and without opening the LAN without a gate. This blueprint turns the revised proposal (`docs/history/reports/network-broadcasting-and-configuration-proposal.md`) into buildable work: a read-only host config file resolved before `listen()`, Vite-only LAN exposure in dev, a stateless Access PIN gate with exact public/gated scope, a mode-dependent terminal QR banner, and the small mobile-environment fixes that make LAN HTTP usable.

Nothing in the domain changes. No migration. No engine, parser, prompt, theme, or SQLite shape work. Every feature here is **plumbing around existing contracts**: `createApp({ options })` injection as `nodeEnv` is today, the `/api/*` error envelope, fetch-based `readSse`, and the `validate()` pipeline. The two genuinely new capabilities — host config resolution and PIN verification — are quarantined in `backend/src/config/` and `backend/src/routes/auth.ts` and can never write to `config.yaml` or to SQLite.

**New dependencies:** `yaml` (backend only — file parsing; never reaches `shared` or `frontend`), `qrcode-generator` (pure-JS QR matrix encoder, no native code; half-block rendering is a ~40-line pure module). No new frontend runtime deps. **`SHARED_VERSION`:** bump patch (`0.7.1-network-auth`) — only additive auth-contract schemas. **Migration:** none.

---

## 0. Carry-forward & governance

No existing invariant changes meaning. One ADR amendment ships in the same PR:

| Item | Change | Why |
|---|---|---|
| **ADR-006 amendment (§5 or revised §4)** | `FORMATAVERN_PASSWORD`-env sketch superseded by `config.yaml` `security.pin` + `FORMATAVERN_PIN` override, LAN-only scope, friction-gate (not confidentiality) disclosure. | ADR-006 §4 anticipated an in-app gate that never landed; Accepted ADRs change by amendment, not silence. House rule: docs move with the invariants they describe. |
| **A-S8 (extension, not weakening)** | `GET /api/health` returns liveness-only `{ ok: true }` to unauthenticated callers while `authMode: pin`; full body (counts, versions) only to authed or bypassed callers. | Counts are enumeration-worthy under a gate; the endpoint stays pingable for uptime checks. |
| **New invariant series N1–N10** (`§1`) | Registered in `.agents/AGENTS.md` + `docs/development.md §6.3` test index alongside I/E/S/U/P/C/L. | This feature's contracts (read-only config, effective-IP, token shape, QR rules) need citable IDs like every other subsystem. |

Everything else (I1–I6, E1–E8, S1–S9, U1–U10, P1–P7, C1–C15, L1–L8) holds verbatim and is re-verified by the existing suites.

---

## 1. Invariants for this work

| # | Invariant | Enforced by |
|---|---|---|
| **N1** | **Two spheres, one write path.** `config.yaml` is read-only at runtime (never created, mutated, or reformatted); SQLite remains the only write path (I2). Host settings resolve before `openDatabase()`; domain settings resolve live via API. | `backend/test/config/loader.test.ts` (fixture file byte-identical after boot); `boundaries.test.ts` (no `writeFile`/`writeTextFile` under `backend/src/config/`) |
| **N2** | **One precedence, one resolution rule.** CLI > env > file > built-in defaults. Mode-vs-host conflicts resolve per `§3.3` (custom requires host; lan ignores host with warning; explicit host overrides localhost default with warning; legacy `HOST=0.0.0.0` ⇒ custom). No silent fallback to `0.0.0.0`. | `loader.test.ts` matrix (every layer wins over the one below; each conflict case asserts warning + result) |
| **N3** | **Defaults are explicit and warned.** Missing keys come from an explicit `DEFAULT_SERVER_CONFIG` object (mirroring `DEFAULT_SETTINGS`), verified through `validate()` (Clone → Clean → Default → Check). Unknown keys emit a non-fatal warning via a pre-`Clean` key diff — never stripped silently, never written back. | `loader.test.ts` (empty / partial / unknown-key fixtures); snapshot of `config.example.yaml` parity |
| **N4** | **Vite-only LAN in dev.** `mode: lan` + non-production ⇒ backend stays `127.0.0.1`, Vite binds `0.0.0.0`. Backend `0.0.0.0` happens only in production. The `GET / → :5173` redirect is local-desktop convenience only and never reflects the `Host` header. | `vite.config.ts` review + `backend/test/config/resolveBind.test.ts`; manual `Get-NetTCPConnection` check in `§10.3` |
| **N5** | **Effective IP, never raw socket IP.** Bypass and rate-limit key on `effectiveClientIp()`: leftmost `X-Forwarded-For` entry iff TCP remote ∈ `trustedProxies`, else TCP remote, header ignored. `trustedProxies` defaults to loopback only. | `backend/test/routes/auth.test.ts` (spoofed-header cases); `boundaries.test.ts` (no `X-Forwarded-For` read outside `auth/ip.ts`) |
| **N6** | **Exact gate scope.** Gated: all `/api/*` incl. SSE. Public: `POST /api/auth/verify`, `GET /api/auth/status`, liveness-only `GET /api/health`, static shell + `/assets/*` + manifest + `index.html`. Nothing else is public; adding a route defaults to gated. | route tests (each new route asserts 401-without-token); `auth.test.ts` public-exception list test |
| **N7** | **Stateless PIN tokens.** `base64url(payload).base64url(HMAC-SHA256(secret, payload))`, `payload = { nonce, exp: now+30d }`. Secret is 32 boot-ephemeral bytes; restart invalidates all tokens. PIN compare is `timingSafeEqual(SHA256(a), SHA256(b))`. Failures: 5/min per effective IP ⇒ `429`. | `auth.test.ts` (forge / expiry / timing-shape / 429 sequence); no session table exists by construction |
| **N8** | **QR discipline.** QR encodes a URL only — never a PIN, token, or query secret. Target is mode-dependent (dev `:5173`, prod `:3000`). Suppressed when stdout is not a TTY, width `< 40`, or `qrCode: false` / `--no-qr`. Renders only in `lan`/`custom`. | `backend/test/config/qr.test.ts` (matrix → half-block golden; secret-absence scan); TTY/width unit tests |
| **N9** | **Localhost by default.** Fresh checkout with no config binds `127.0.0.1`, prints no QR, triggers no firewall prompt. LAN exposure is always an explicit act (`mode` / `dev:lan` / `--lan`). | `resolveBind.test.ts` default case; first-run manual check in `§10.3` |
| **N10** | **Purity boundaries unchanged.** `backend/src/app.ts` and `db/contracts.ts` / `engine/contracts.ts` stay free of `Bun.*`, `bun:*`, `Database`, `node:*`, and socket APIs. Remote-IP extraction is injected via `options.resolveIp`, exactly as `nodeEnv` is today. `shared` gains only the auth-contract schemas. | `bun run typecheck` 3/3; `boundaries.test.ts` import scans |

---

## 2. Config system (normative)

### 2.1 Files

```
backend/src/config/
├── schema.ts    # ServerConfigSchema + DEFAULT_SERVER_CONFIG + cross-field check (pure, testable — no fs/net)
├── loader.ts    # locate → parse → overlay (env, CLI) → resolve mode/host → validate() → { config, warnings }
├── sources.ts   # env-var mapping + argv parsing (--lan, --host, --port, --pin, --no-qr) — pure over String[]
├── network.ts   # listLanCandidates(), pickPrimary(), detectTailscale() — node:os only, no Elysia
├── qr.ts        # renderQrHalfBlocks(url): string[] — pure, no stdout
└── banner.ts    # formatBanner(resolved, candidates): string — pure, no console
scripts/dev-lan.ts   # cross-platform launcher (sets FORMATAVERN_NETWORK_MODE=lan, spawns both dev children)
config.example.yaml  # tracked template (parity-tested against DEFAULT_SERVER_CONFIG)
```

`ServerConfigSchema` lives here, **never in `@formatavern/shared`** (I5). Shared gains only (§6.1):

```ts
// packages/shared/src/schemas/api.ts — additive
export const AuthVerifyRequestSchema = Type.Object({ pin: Type.String({ minLength: 1, maxLength: 64 }) });
export const AuthStatusResponseSchema = Type.Object({ authRequired: Type.Union([Type.Literal('pin'), Type.Literal('none')]) });
export const AuthVerifyResponseSchema = Type.Object({ token: Type.String({ minLength: 16 }) });
// ApiErrorCode += 'auth_required' | 'invalid_pin' | 'too_many_requests' (401 / 401 / 429)
```

### 2.2 Schema + explicit defaults

```ts
// backend/src/config/schema.ts
import { Type, type Static } from '@sinclair/typebox';

export const ServerConfigSchema = Type.Object({
  network: Type.Object({
    mode: Type.Union([Type.Literal('localhost'), Type.Literal('lan'), Type.Literal('custom')], { default: 'localhost' }),
    host: Type.Optional(Type.String({ minLength: 1, maxLength: 253 })),
    port: Type.Integer({ minimum: 1, maximum: 65535, default: 3000 }),
    qrCode: Type.Boolean({ default: true }),
    announceLan: Type.Boolean({ default: true })
  }, { default: {} }),
  security: Type.Object({
    authMode: Type.Union([Type.Literal('none'), Type.Literal('pin')], { default: 'none' }),
    pin: Type.Optional(Type.String({ minLength: 4, maxLength: 64 })),
    trustedProxies: Type.Array(Type.String(), { default: ['127.0.0.1', '::1'] })
  }, { default: {} }),
  storage: Type.Object({
    dataPath: Type.Optional(Type.String()),
    assetsPath: Type.Optional(Type.String())
  }, { default: {} }),
  tunnel: Type.Object({
    provider: Type.Union([Type.Literal('none'), Type.Literal('cloudflare'), Type.Literal('tailscale')], { default: 'none' })
  }, { default: {} })
}, { default: {} });
export type ServerConfig = Static<typeof ServerConfigSchema>;

// Explicit defaults — the loader deep-merges these UNDER file/env/CLI values BEFORE validate().
// Rationale (peer-review C-R5): Value.Default recursion into nested { default: {} } objects is
// library-version-sensitive; the explicit object makes defaults greppable and snapshot-testable.
export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  network: { mode: 'localhost', port: 3000, qrCode: true, announceLan: true },
  security: { authMode: 'none', trustedProxies: ['127.0.0.1', '::1'] },
  storage: {},
  tunnel: { provider: 'none' }
};

export function checkCrossField(c: ServerConfig): string[]; // returns fatal errors; pin-required-when-pin-mode lives here, not in TypeBox
```

`config.example.yaml` documents `network.mode/port/qrCode`, `security.authMode/pin`, storage overrides, and the `FORMATAVERN_PIN` alternative. A test asserts every key in the example parses into the schema and every default in `DEFAULT_SERVER_CONFIG` appears commented in the example (parity both directions).

### 2.3 Loader algorithm (normative order)

```
1. locate: <repo-root>/config.yaml if exists (missing ⇒ {} — never auto-created, N1).
2. parse with `yaml` (backend dep only); syntax error ⇒ fatal boot error printing path + line.
3. unknown-key diff BEFORE Clean: walk input keys vs schema properties at each level; each unknown ⇒ one warning line. Then validate(): Clone → Clean → Default → Check over (defaults ⨯ file).
4. env overlay (only when set): FORMATAVERN_NETWORK_MODE → network.mode; FORMATAVERN_HOST → network.host;
   FORMATAVERN_PORT → network.port (non-numeric ⇒ fatal naming the var); FORMATAVERN_PIN → security.pin + authMode='pin';
   FORMATAVERN_DB_PATH → storage.dataPath; FORMATAVERN_ASSETS_DIR → storage.assetsPath.
5. CLI overlay (start path argv; dev:lan path uses env, never argv): --lan ⇒ mode lan; --host <ip> ⇒ custom+host;
   --port <n> ⇒ port; --pin <s> ⇒ pin+authMode; --no-qr ⇒ qrCode false.
6. mode-vs-host resolution (§4.3 proposal, pinned): custom w/o host ⇒ fatal (names Tailscale/VPN expectation);
   lan + explicit host ⇒ warn + ignore host; localhost + explicit host ⇒ warn + host wins;
   legacy HOST=0.0.0.0 w/o mode ⇒ custom/host 0.0.0.0 + warning.
7. cross-field: authMode pin w/o pin ⇒ fatal (names security.pin / FORMATAVERN_PIN / --pin, never prints the value);
   authMode none + pin present ⇒ warn + ignore pin.
8. return { config, warnings, sourceMap } — sourceMap records per-leaf winner (cli|env|file|default) for the banner `--verbose` line and tests.
```

Boot order in `index.ts`: `loadServerConfig()` runs **first** — before `ensureDataDirs()`, `openDatabase()`, and `server.listen()`. Resolved `storage.*` feeds `DB_PATH`/`ASSETS_DIR` overrides; resolved `network.*` feeds bind + banner; resolved config object is injected as `createApp({ options: { nodeEnv, auth, resolveIp } })`. `app.ts` never imports the loader (N10).

### 2.4 `config.example.yaml` (tracked) + `.gitignore`

Real `config.yaml` is gitignored (new line); the example ships annotated defaults. `PORT`/`HOST` legacy names keep working as aliases per the mapping above — two names for one knob is documented once in `docs/development.md §3`, not twice.

---

## 3. Bind resolution & interface discovery (normative)

```ts
// backend/src/config/network.ts
export interface LanCandidate { address: string; iface: string; kind: 'wifi' | 'ethernet' | 'other' | 'tailscale'; url(port: number): string; }
export function listLanCandidates(port: number): LanCandidate[]; // os.networkInterfaces(), IPv4 only (limitation stated, not implied)
export function pickPrimary(c: LanCandidate[]): LanCandidate | null;
export function detectTailscale(c: LanCandidate[]): LanCandidate | null;
```

- **Filter:** drop internal, `127.*`, `::1`, `169.254.*`. Drop virtual adapters by interface **name** (`/^vEthernet/i`, `/^docker/i`, `/^wsl/i`, `/^br-/i`, `/^vbox/i`, `/^vmware/i`, `/^hyper-v/i`) — never by `172.16.0.0/12` range (real corporate LANs live there).
- **Tailscale:** interface name `/^tailscale/i` first; `100.64.0.0/10` prefix is a hint only (CGNAT shares the range). When found, banner shows the MagicDNS hint line; QR still encodes the LAN URL unless `mode: custom` points at the tail address.
- **Primary:** prefer the interface holding the default route when cheaply known; else Wi-Fi/Ethernet over `other`; first stable sort wins. Ties don't matter — **all** candidates print (N8 support: a wrong-guess QR is the #1 future support ticket, so humans always get alternates).
- **Bind:** dev `lan` ⇒ backend `127.0.0.1:${port}` + Vite `0.0.0.0:5173`; prod `lan` ⇒ Elysia `0.0.0.0:${port}`; `custom` ⇒ explicit host in both modes. `listen()` failures are caught and mapped to the `§5` diagnostic copy (never an unhandled stack).

---

## 4. Terminal banner, QR, diagnostics (normative)

### 4.1 Banner contract

Printed in `lan`/`custom` only (`localhost` prints today's single-line form — a `127.0.0.1` QR is noise). Contents: `Local:` (always loopback + effective port), `Network:` (all candidates), Tailscale line when detected, `Security:` (`PIN Protected [••••]` vs `OPEN — anyone on Wi-Fi can read chats` loud marker when `authMode: none` in lan), QR block (`§4.2`), troubleshooting footnote, `config.yaml` source line when a file contributed.

```
  FormaTavern — LLM Roleplay Studio
  ──────────────────────────────────────────────
  ➜ Local:    http://127.0.0.1:3000/
  ➜ Network:  http://192.168.1.15:3000/
  ➜ Security: PIN Protected [••••]
  ➜ Config:   config.yaml (mode lan) + FORMATAVERN_PIN

  Scan with your phone's camera to connect:
  <half-block matrix, 2 modules/cell, ~15–18 rows>
  ──────────────────────────────────────────────
  • Troubleshooting: phone & PC on the SAME Wi-Fi; Wi-Fi profile 'Private'.
  • If the phone times out: Windows Firewall / Avast-AVG Web Shield on port 3000.
```

### 4.2 QR rules (N8)

- Encoder: `qrcode-generator` (auto version, ECC-M) over the URL bytes; renderer maps modules to `▄/▀/█ + space` pairs. Pure function `renderQrHalfBlocks(url): string[]` with a golden test (fixture URL ⇒ exact rows).
- Target: dev ⇒ `http://<primary-lan-ip>:5173/`; prod ⇒ `http://<primary-lan-ip>:<port>/`. Custom mode uses the custom host. **Never** appends `?pin=` / `?token=` (proposal fix, pinned by a secret-absence scan test over `['pin', 'token', 'auth']` case-insensitively).
- Suppression: `network.qrCode false`, `--no-qr`, non-TTY stdout, or columns `< 40` ⇒ URLs print, matrix doesn't. No stdin listeners (`bun --watch` owns stdin).

### 4.3 Socket-error copy (exact behavior)

`server.listen()` wrapped in try/catch mapping `code`:

| `code` | Copy |
|---|---|
| `EADDRINUSE` | `[ERROR] Port ${port} is already in use. → bun run stop, or port: in config.yaml / --port.` |
| `EACCES` / `WSAEACCES` | `[ERROR] Access denied binding ${host}:${port}. → allow bun.exe in Defender/Avast-AVG Web Shield (Private networks); or --port 3005/8080 (Hyper-V exclusion range: netsh interface ipv4 show excludedportrange protocol=tcp).` |

### 4.4 Inbound audit (sampled, not chatty)

One line per **new** effective IP per process (Map with 10-min re-log), dev/info only, no UA parsing, no secrets: `[network] Inbound connection from 192.168.1.45 (GET /api/health 200)`. Per-request logging stays in the existing `[api]` logger.

---

## 5. Vite-only dev topology (normative)

```ts
// frontend/vite.config.ts
const lan = process.env.FORMATAVERN_NETWORK_MODE === 'lan' || process.env.FORMATAVERN_NETWORK_MODE === 'custom';
const backendPort = Number(process.env.FORMATAVERN_PORT ?? 3000); // resolved port flows to BOTH children via dev-lan launcher
export default defineConfig({
  server: {
    host: lan ? '0.0.0.0' : '127.0.0.1',
    port: 5173, strictPort: true,
    allowedHosts: ['.ts.net'],            // IP literals already pass; suffix covers MagicDNS; bare true REJECTED (N4)
    proxy: {
      '/api':    { target: `http://127.0.0.1:${backendPort}`, changeOrigin: true, xfwd: true, ws: false, ...sseNoBufferHooks },
      '/assets': { target: `http://127.0.0.1:${backendPort}`, changeOrigin: true, xfwd: true }
    }
  }
});
```

- `xfwd: true` is load-bearing for `§7` (N5) — review must confirm its presence; without it dev-LAN auth silently bypasses.
- `strictPort: true` retained: if `:5173` is taken the dev server fails loudly instead of drifting to a port the QR didn't encode.
- `scripts/dev-lan.ts` (Bun, cross-platform): sets `FORMATAVERN_NETWORK_MODE=lan`, spawns `bun --watch backend/src/index.ts` and `bun run --cwd frontend dev` with inherited stdio, forwards `SIGINT/SIGTERM`, exits non-zero if either child exits. Replaces `--parallel --lan` flag-forwarding, which cannot work through `bun run --parallel`.
- The legacy `GET / → 127.0.0.1:5173` redirect in `index.ts` stays **local-only**: reachable solely via loopback in dev (backend never binds LAN there), so remote clients can't hit it. It must not interpolate any request header.

---

## 6. PIN gate (normative)

### 6.1 Shared contract (only shared touchpoint)

`AuthVerifyRequestSchema`, `AuthStatusResponseSchema`, `AuthVerifyResponseSchema` + three `ApiErrorCode`s in `packages/shared/src/schemas/api.ts`. `SHARED_VERSION` patch bump. No other shared file changes.

### 6.2 Backend: `backend/src/routes/auth.ts` + `backend/src/routes/ip.ts`

```ts
// ip.ts — the ONLY module reading X-Forwarded-For (N5). No Bun APIs: takes remoteAddr as string arg.
export function effectiveClientIp(remoteAddr: string | null, xff: string | null, trustedProxies: string[]): string;
// leftmost XFF entry trimmed iff remoteAddr ∈ trustedProxies, else remoteAddr ?? 'unknown'.

// auth.ts — Elysia plugin, mounted BEFORE all /api routers in createApp (N6, N10)
export interface AuthOptions {
  enabled: boolean;                       // security.authMode === 'pin'
  verifyPin: (candidate: string) => boolean;   // injected: timingSafeEqual over SHA-256 (node:crypto), PIN never logged
  sign: (nonce: Uint8Array) => string;    // injected from index.ts (ephemeral secret lives there, not in app.ts)
  verifyToken: (token: string) => boolean;// injected: split → HMAC verify → exp check
  rateLimit: { windowMs: 60_000; maxFails: 5 }; // Map<effectiveIp, number[]> + lazy sweep
}
```

- **Secret lifecycle:** 32 bytes from `crypto.getRandomValues` in `index.ts` at boot; passed as closures via `options`. Restart (incl. `--watch`) rotates ⇒ all tokens die ⇒ mobile re-enters PIN (documented dev cost; desktop unaffected via bypass).
- **Token:** `b64url(JSON { nonce: b64url(16B), exp: now+30d }).b64url(HMAC-SHA256(secret, payload-b64))`. Constant-time signature compare; `exp` checked second; failures ⇒ `401 { code: 'auth_required' }` (missing/expired/forged indistinguishable).
- **Verify route:** `POST /api/auth/verify { pin }` ⇒ `200 { token }` or `401 { code: 'invalid_pin' }`; counts toward the same 5/min bucket; `429 { code: 'too_many_requests' }` with `Retry-After: 60`. PIN comparison is `timingSafeEqual(sha256(a), sha256(b))` (equal-length digests — no length-throw branch).
- **Middleware order in `createApp`:** error handler → auth plugin (`onBeforeHandle`, skips exact public list) → `/api/health` (branching redaction per N6/A-S8) → remaining routers. Static `/assets` + SPA fallback in `index.ts` stay outside the gate (public shell, N6). A test asserts every `/api` route file is mounted *after* the plugin.
- **Health redaction:** unauthenticated + PIN mode ⇒ `{ ok: true }` only. Authed (valid Bearer) or bypassed (effective loopback) ⇒ today's full body.
- **Purity (N10):** `app.ts` receives `resolveIp?: (req: Request) => string | null` via `options` — the Bun-specific `server.requestIP()` call lives in `index.ts` and is passed in. `auth.ts`/`ip.ts` import `node:crypto` only (allowed: backend-only modules; the ban covers `app.ts`/contracts).

### 6.3 Frontend auth

- `lib/auth/store.svelte.ts`: `{ status: 'unknown'|'none'|'pin-locked'|'authed', token }`; boot calls `GET /api/auth/status` (public); token in `localStorage('formatavern_auth_token')`; `authHeaders()` helper returns `{ Authorization: 'Bearer …' }` or `{}`.
- **All** Eden calls and `readSse(url, { headers: authHeaders(), … })` carry the header (fetch-based SSE needs no protocol change — verified). `401 auth_required` anywhere ⇒ store transitions to `pin-locked`, token cleared, PIN screen shown; terminal SSE turns are preserved (U7 untouched).
- **PIN screen:** full-screen themed card on the **shell surface** (`data-ft-surface="shell"`, C14 — never outside surface boundaries), `input[type=password][inputmode=numeric][autocomplete=off]`, failure shake uses opacity/transform utilities only (U6), "Forget this device" clears storage. No PIN value in logs, URLs, or error toasts (S8).
- **Bypass transparency:** desktop on loopback never sees the screen (server bypasses); a small lock icon in TopBar signals `pin-locked` state on mobile.

---

## 7. Mobile environment fixes (normative)

### 7.1 `lib/utils/clipboard.ts` (single helper, five call-site migration)

Proposal's snippet verbatim, plus: returns `false` (not throw) when both paths fail so callers toast uniformly; `textarea` gets `aria-hidden`, `readonly`, off-viewport positioning (`top: 0; left: 0`), and synchronous remove in `finally`. Migrate `PromptBlocks.svelte:11`, `TurnToolbar.svelte:38`, `CustomCssPanel.svelte:215,822`, `GalleryManager.svelte:53` to it; `boundaries.test.ts` forbids direct `navigator.clipboard.writeText` outside the helper thereafter.

### 7.2 PWA manifest

`frontend/static/manifest.webmanifest` (`name`, `short_name`, `display: standalone`, `start_url: /`, `theme_color`/`background_color` from chrome tokens, 192/512 maskable icons reusing the existing favicon art) + `app.html` `<link rel="manifest">` and `apple-mobile-web-app-capable` meta. **Stated limitation** (ships in the docs, not discovered in QA): no service worker ⇒ Android WebAPK installability only under Tailscale/Cloudflare HTTPS; plain-LAN HTTP gets a standalone home-screen shortcut, which is the feature being promised.

### 7.3 Safe-area

Audit (don't assume): composer + bottom nav + PIN screen honor `padding-bottom: env(safe-area-inset-bottom, 0px)`; `app.html` viewport already carries `viewport-fit=cover` — verified, no change needed there.

---

## 8. Tunnel readiness (normative, minimal)

- `bun run tunnel` script: checks for user-installed `cloudflared` on PATH (`--version` probe); missing ⇒ prints install link and exits 2 (never downloads). Present ⇒ execs `cloudflared tunnel --url http://127.0.0.1:${port}` with stdio inherited; user pastes the `trycloudflare.com` URL (no stdout scraping — fragile). Docs pair it with Cloudflare Access.
- `tunnel.provider: tailscale` means **announce/detect** (system service we never manage); `cloudflare` means **spawnable via the script**. The schema docblock says so verbatim to prevent a future "manage tailscaled" implementation.

---

## 9. Tricky traps & failure modes

### 9.1 Config

| Trap | Symptom | Guard |
|---|---|---|
| Loader writes `config.yaml` (helpful normalization) | Comments destroyed; git churn; PIN committed in a "cleanup" | N1: no `writeFile` in `config/` (boundary test); byte-identical fixture test |
| `Value.Default` recursion gap on nested `{ default: {} }` | `network` undefined at runtime despite schema defaults | Explicit `DEFAULT_SERVER_CONFIG` merged under file values; empty-file test asserts full defaults |
| Unknown keys stripped silently | Typo `netwrok:` ⇒ user thinks LAN is on, binds loopback | Pre-`Clean` key diff ⇒ warning naming the path; test with `netwrok.mode` fixture |
| `FORMATAVERN_PORT=abc` | `NaN` port ⇒ listen on random/throw deep in Bun | Numeric parse at overlay step; fatal naming the var |
| `custom` without host | Binds `0.0.0.0` "helpfully" ⇒ silent exposure | Fatal boot error (N2); test asserts throw |
| `pin` in git | Credential in history | `.gitignore` line + `config.example.yaml` without secrets + docs warning; review checks `git status` |
| `storage.dataPath` applied after `openDatabase()` | DB opens at old path, then config "moves" it ⇒ split-brain | Loader-first boot order pinned; test asserts override path used for open |
| Two env names for one knob | `FORMATAVERN_DB_PATH` vs `storage.dataPath` drift | Single mapping table in loader; `development.md §3` updated once |

### 9.2 Network & QR

| Trap | Symptom | Guard |
|---|---|---|
| Filtering `172.16/12` as "virtual" | Corporate LAN invisible; "no network found" | Name-based filter only; fixture with `172.20.5.4/eth0` must survive |
| Single-candidate guess wrong (Wi-Fi vs Ethernet vs VPN) | QR encodes the VPN address; phone can't route | Print all candidates; QR = primary + alternates listed; Tailscale shown separately |
| QR encodes `:3000` in dev | Phone hits API + redirect ⇒ loopback trap again | Mode-dependent target rule (N8); dev-banner test asserts `:5173` |
| QR encodes PIN/token | Secret in camera roll, logs, proxy history | Renderer takes URL string only (no secret param exists); secret-absence scan test |
| Non-TTY / narrow terminal | Escape soup in CI logs | Suppression rule (N8); test with `columns=30` |
| `localhost` QR | `127.0.0.1` matrix scanned by a phone | Render only in lan/custom |
| Hyper-V exclusion / AV block | `WSAEACCES` misread as "FormaTavern bug" | Exact copy + `netsh` pointer (§4.3); EADDRINUSE names `bun run stop` |

### 9.3 Auth

| Trap | Symptom | Guard |
|---|---|---|
| Raw `remoteAddr` check in dev | Every phone bypasses PIN (the blocker this blueprint exists to close) | N5: `effectiveClientIp()`; spoofed-XFF-from-WAN test (header ignored ⇒ not bypassed); XFF-from-Vite test (honored) |
| `allowedHosts: true` | DNS rebinding in dev | Scoped `['.ts.net']`; review rejects bare `true` |
| New `/api` route mounted before plugin | Ungated endpoint ships silently | Mount-order test: all routers applied after auth plugin; default-gated convention |
| `GET /api/health` full body public | DB counts enumerable behind the gate | Redaction branch (A-S8); test asserts `{ ok: true }`-only while locked |
| Token in URL (EventSource fallback) | Token in logs/history | Fetch-only SSE (already true); no query-token code path exists; boundary scan forbids `access_token=` |
| 4-char PIN brute force | 10k space over weeks | 5/min/IP ⇒ ~33h worst case + sniffability disclosed as friction-gate (proposal §8.1); docs recommend 6+ chars without enforcing (schema stays 4–64) |
| `--watch` restart logs phones out | "PIN broken" reports during dev | Documented accepted cost; desktop bypass unaffected; mobile re-auth once per restart |
| localStorage XSS theft | Token readable by injected script | Same XSS bar as the rest of the app (DOMPurify allow-lists unchanged); no elevation: token grants only what the LAN attacker already sniffs over HTTP — TLS via Tailscale is the confidentiality answer, stated |
| `timingSafeEqual` length throw | 500 on mismatched lengths | Compare SHA-256 digests (fixed 32B), never raw PINs |

### 9.4 Dev plumbing & frontend

| Trap | Symptom | Guard |
|---|---|---|
| `VAR=value` in `dev:lan` | Dead on PowerShell; "lan mode does nothing" on Windows | `scripts/dev-lan.ts` launcher; CI matrix runs it on Windows |
| Hardcoded proxy `:3000` | Custom port works in prod, broken in dev | Proxy target from resolved port; test asserts template contains `${backendPort}` not `:3000` |
| `strictPort` off | Vite drifts to `:5174`; QR lies | `strictPort: true` retained |
| Direct `navigator.clipboard` survivors | Copy throws on LAN HTTP in one forgotten panel | Migrate all five sites; boundary scan bans new direct uses |
| PIN dialog outside surface | Theming/`--theme-*` cascade breaks; C14 violation | Screen mounts in shell surface; `surfaces.test.ts` covers the route |
| `transition-all` on PIN shake | Layout jank (U6) | Opacity/transform only |

---

## 10. Definition of Done & verification

### 10.1 Acceptance criteria

1. `bun run typecheck` 3/3 clean (0 errors/0 warnings); `bun run test` fully green incl. new suites; `bun run build` succeeds.
2. **Config proof:** missing file boots with full defaults + banner line `defaults`; partial file fills the rest; unknown-key file warns naming the path; file on disk byte-identical after boot (N1). `config.yaml` untracked by git; example parity test passes.
3. **Bind proof:** default checkout listens `127.0.0.1` only (no QR, no firewall prompt). `dev:lan` ⇒ Vite `0.0.0.0:5173` + backend `127.0.0.1:3000` (`Get-NetTCPConnection` shows one listener per port); prod `mode: lan` ⇒ Elysia `0.0.0.0:${port}`.
4. **QR proof:** dev banner QR decodes to `http://<lan-ip>:5173/`; prod to `http://<lan-ip>:<port>/`; never contains `pin|token|auth`; suppressed with `--no-qr` / piped stdout / narrow terminal.
5. **Auth proof:** with `authMode: pin`, `GET /api/chats` w/o token ⇒ `401 auth_required`; wrong PIN ×6 in 60s from one IP ⇒ `429 too_many_requests`; correct PIN ⇒ `200 { token }`; token reaches gated routes + SSE streams via `Authorization` header; forged/expiry-tampered token ⇒ `401`; spoofed `X-Forwarded-For` from non-proxy remote ⇒ not bypassed; phone-through-Vite ⇒ independently rate-limited, never bypassed. `GET /api/health` locked ⇒ `{ ok: true }` only.
6. **Mobile proof:** phone on same Wi-Fi scans QR ⇒ PIN screen (themed, shell surface) ⇒ chat loads, streams, copies via fallback path; desktop on loopback never sees PIN. Manifest served with correct content-type; home-screen shortcut works; clipboard fallback verified with `window.isSecureContext === false` harness.
7. **Diagnostics proof:** occupied port ⇒ EADDRINUSE copy naming `bun run stop`; blocked bind ⇒ EACCES copy naming Defender/AV + `netsh` line. New-IP audit logs once per IP, not per SSE chunk.
8. **Docs:** `docs/architecture.md` (§2 topology, §12 posture), `docs/development.md` (§3 env table + precedence), ADR-006 amendment, and `.agents/AGENTS.md` (N1–N10) land in the same PR.

### 10.2 Required tests (normative)

**`backend/test/config/`** — `loader.test.ts` (empty/partial/unknown-key/env-wins/file-wins/CLI-wins matrices, NaN port fatal, custom-without-host fatal, pin-without-pin fatal, none-with-pin warns, legacy HOST mapping, sourceMap winners); `exampleParity.test.ts`; `resolveBind.test.ts` (default lan/dev/prod/custom matrix incl. Vite-vs-backend split); `network.test.ts` (name-filter fixtures incl. `172.20/12` survival, multi-candidate, Tailscale name-vs-prefix); `qr.test.ts` (golden rows, secret-absence scan, suppression cases).
**`backend/test/routes/auth.test.ts`** — public-exception list; 401/429/200 sequences; token forge/expiry/nonce-tamper; XFF trusted/untrusted matrix; health redaction locked vs authed vs bypassed; SSE route with Bearer header succeeds; mount-order assertion.
**`frontend/unit/`** — `clipboard.test.ts` (secure path, insecure fallback via `execCommand` spy, `document` undefined, failure-false); `authStore.test.ts` (status boot, 401 ⇒ pin-locked + token clear, forget-device); `boundaries.test.ts` additions (no direct clipboard, no `writeFile` in config, no XFF outside `ip.ts`, `{@html}`/surface rules unchanged); `surfaces.test.ts` (PIN screen inside shell surface).

### 10.3 Step-by-step verification

```bash
bun install && bun run typecheck && bun run test
bun run db:check                                   # clean, untouched by this work (no migration)

# 1. Defaults: localhost only, no QR
bun run start &
Get-NetTCPConnection -LocalPort 3000 -State Listen # 127.0.0.1 only
curl -s http://127.0.0.1:3000/api/health           # full body (bypassed, authMode none)

# 2. Prod LAN + PIN (config.yaml: network.mode lan, security.authMode pin + pin)
NODE_ENV=production bun backend/src/index.ts &     # banner: Network URLs + QR + PIN Protected
curl -s http://127.0.0.1:3000/api/chats            # bypassed locally ⇒ 200 (desktop zero-friction)
curl -s http://<lan-ip>:3000/api/chats             # 401 { code: auth_required }
curl -s http://<lan-ip>:3000/api/health            # { ok: true } only (redacted)
curl -s -X POST http://<lan-ip>:3000/api/auth/verify -H 'Content-Type: application/json' -d '{"pin":"0000"}'  # 401 invalid_pin ×6 ⇒ 429
curl -s -X POST http://<lan-ip>:3000/api/auth/verify -H 'Content-Type: application/json' -d '{"pin":"<real>"}' # 200 { token }
TOKEN=<token>; curl -s http://<lan-ip>:3000/api/chats -H "Authorization: Bearer $TOKEN"  # 200
curl -s http://<lan-ip>:3000/api/chats -H "Authorization: Bearer forged"                 # 401

# 3. Dev LAN via Vite
bun run dev:lan &                                  # Vite 0.0.0.0:5173, backend 127.0.0.1:3000
curl -s http://<lan-ip>:5173/ | head -c 100        # 200 HTML (no redirect trap)
curl -s http://<lan-ip>:5173/api/health            # proxied liveness (xfwd path exercised)

# 4. Phone pass: scan QR → PIN screen → chat streams → copy works → Add to Home Screen
# 5. Errors: occupy :3000 then boot (EADDRINUSE copy); blocked bind (EACCES copy)
# 6. Mobile + desktop captures per docs/workflows/ui-ux-testing.md; axe on PIN screen; 390px + keyboard-open check
```

Artifacts for the PR: banner+QR screenshots (dev + prod, PIN + open-marker), curl transcript above, phone photo/scan clip, axe summary (PIN screen), `git status` showing `config.yaml` untracked, ADR-006 diff.

---

## 11. Explicit scope boundaries — deferred

Not in this work: IPv6 announce/QR (IPv4-only stated limitation); mDNS/`.local` names; multi-user accounts/sessions/roles; OAuth/OIDC; in-app TLS/cert generation (ADR-004 stands); service workers / offline / WebAPK beyond the shortcut; auto-downloading `cloudflared` (explicit non-goal); managing `tailscaled`; UPnP/NAT-PMP port forwarding; per-route or per-device PINs; token revocation lists (restart rotation is the revocation); changing any SQLite shape, prompt, parser, theme, or asset behavior; `allowedOrigins`/CORS (same-origin stands — the field was cut, not postponed).

What this hands forward: a host-config seam every future infra knob (log levels, bind families, tunnel auto-launch) reuses; an `effectiveClientIp()` + `trustedProxies` primitive any future proxy-aware feature inherits; a stateless auth-middleware pattern per-device keys could extend; and a QR/banner channel Tailscale/Cloudflare URLs ride for free.

---

## 12. Execution order

1. **shared**: auth-contract schemas + error codes + `SHARED_VERSION` bump; tests.
2. **backend config**: `schema.ts` (+ explicit defaults, cross-field) → `sources.ts`/`loader.ts` (overlay order, unknown-key diff, fatals) → `network.ts` (filters, candidates, Tailscale) → `qr.ts`/`banner.ts` (pure, golden tests); `loader.test.ts` + parity tests first (N1–N3 locked before any socket code).
3. **backend boot**: `index.ts` loader-first reorder + `resolveIp` injection + `listen()` error mapping + banner print + audit log; `resolveBind` tests.
4. **backend auth**: `ip.ts` → `auth.ts` plugin → `app.ts` mount order + health redaction; `auth.test.ts` (N5–N7 incl. XFF matrix, 429, forge/expiry).
5. **dev plumbing**: `vite.config.ts` (host/allowedHosts/xfwd/dynamic port) + `scripts/dev-lan.ts` + `bun run tunnel` + `config.example.yaml` + `.gitignore`; `§10.3` steps 1–3 green.
6. **frontend**: `clipboard.ts` + five-site migration → auth store + header injection (Eden + `readSse`) + PIN screen (shell surface) → manifest + safe-area audit; unit + boundary + surface tests.
7. **polish & §10.3**: phone pass, diagnostics copies, axe/mobile captures, artifacts; update `architecture.md`, `development.md §3/§6.3`, `.agents/AGENTS.md` (N1–N10), ADR-006 amendment — same PR.
