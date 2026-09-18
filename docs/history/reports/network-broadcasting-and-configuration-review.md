# Network Broadcasting & Application Configuration — Proposal Review

**Status:** Review complete. Agree with the direction, the two-sphere configuration model, the non-destructive loader, and the honest security posture; five conditions proposed as entry criteria for the blueprint round; one factual error and one internal contradiction in the proposal found during verification (§2, §4), plus one significant completeness gap in the dev-mode story (C-R2).
**Date:** 2026-09-17 UTC
**Reviewed:** `docs/history/reports/network-broadcasting-and-configuration-proposal.md` (hereafter "the proposal")
**Method:** Every current-state claim was verified against source — FormaTavern (`backend/src/index.ts`, `frontend/vite.config.ts`, `frontend/src/lib/api/*`, `packages/shared/src/validate.ts`, `.gitignore`, `package.json`) and the SillyTavern reference checkout (`default/config.yaml`, `src/config-init.js`, `src/command-line.js`, `Remote-Link.cmd`) — before any opinion was formed. ADR-004 and ADR-006 were read in full from the Tolaria Vault (`S:\WorkSpace\Markdown Workspace\FormaTavern\adr-004-*.md`, `adr-006-*.md`). Invariants cited by ID per `.agents/AGENTS.md` §4.

---

## §1 — Verdict

**Agree, conditionally.** The proposal is approved to proceed to the blueprint round, subject to the five conditions in §5 being resolved there. In summary:

- The diagnosis of the dev-mode mobile breakage is factually correct and verified (§2.1) — the redirect at `backend/src/index.ts:263` sends any remote device to its own loopback.
- The two-sphere split (host/infra config file vs. authoritative SQLite domain) is the correct architecture, and it is the right *repudiation* of SillyTavern's dual-state trap (verified §2.2).
- The LAN threat model (§8.1) restates ADR-006's context accurately, and the Access PIN gate is the natural completion of ADR-006 §4's never-landed roadmap item.
- The mobile environment adaptations (§9) target real constraints: five `navigator.clipboard` call sites with no insecure-context fallback exist today (§2.1).

The conditions are not objections to the direction; they are places where implementing the proposal *as literally written* would produce a broken feature (the dev-mode LAN story), an unsafe default (the Host-header redirect), or a governance inconsistency (ADR-006 amendment). Each is argued in §5.

---

## §2 — Claim audit (proposal claims vs. actual code)

### 2.1 FormaTavern current state (proposal §2.3, §7, §9.3)

| # | Proposal claim | Verified evidence | Verdict |
|---|---|---|---|
| 1 | `backend/src/index.ts` reads `FORMATAVERN_HOST ?? '127.0.0.1'` and `FORMATAVERN_PORT ?? 3000` | `index.ts:17-18` | Accurate |
| 2 | `0.0.0.0` prints the ADR-006 warning | `index.ts:24-28`; text matches ADR-006 §1 verbatim | Accurate |
| 3 | Dev redirect `GET /` → `http://127.0.0.1:5173/`, so a phone hitting `192.168.x.x:3000` is redirected to the phone's own loopback | `index.ts:261-264` — redirect target is a string literal; any non-local client is redirected to its own loopback | Accurate — correctly diagnosed real bug |
| 4 | Vite binds strictly `127.0.0.1:5173` | `vite.config.ts:8-10` (`host: '127.0.0.1'`, `strictPort: true`) | Accurate |
| 5 | No LAN IP detection; server logs only `127.0.0.1` | `index.ts:314,324` — banner prints `displayHost` (`0.0.0.0` is masked to `127.0.0.1`); no `os.networkInterfaces()` anywhere in `backend/src` | Accurate |
| 6 | `app.html` already defines `viewport-fit=cover` and `interactive-widget=resizes-content` | `frontend/src/app.html:5` | Accurate |
| 7 | Clipboard APIs are restricted on non-localhost HTTP origins, requiring fallback | Five direct `navigator.clipboard.writeText` call sites with no fallback: `PromptBlocks.svelte:11`, `TurnToolbar.svelte:38`, `CustomCssPanel.svelte:215,822`, `GalleryManager.svelte:53` | Accurate — §9.2 is a genuine need, not hypothetical |
| 8 | (Implicit) Frontend uses relative routing per ADR-004 rule 1 | `frontend/src/lib/api/client.ts:5` — treaty at `window.location.origin`; `sse.ts`/`testStream.ts` use relative fetch URLs | Accurate — the frontend is already LAN-ready in prod; every gap is server-side or dev-side |

### 2.2 SillyTavern comparative study (proposal §2.1–2.2)

| # | Proposal claim | Verified evidence | Verdict |
|---|---|---|---|
| 1 | `config.yaml` canonical default; `config-init.js` renames legacy keys (`keyMigrationMap`) and merges via `defaultsDeep` | `config-init.js:9` (keyMigrationMap), `:178` (migration loop), `:219` (`_.defaultsDeep`) | Accurate |
| 2 | Config is rewritten in place on startup, stripping comments | `config-init.js:239` — `fs.writeFileSync(configPath, yaml.stringify(config))` | Accurate — the non-destructive guarantee in proposal §4.2 is the correct counter-design |
| 3 | `listen`, `listenAddress { ipv4: '0.0.0.0', ipv6: '[::]' }`, `port: 8000`, `protocol { ipv4: true, ipv6: false }` | `default/config.yaml:6,8-16,40` | Accurate |
| 4 | `whitelistMode: true` by default, allowing only `127.0.0.1`/`::1` — the mobile whitelist trap | `default/config.yaml:60,64-66` (`whitelist: ::1, 127.0.0.1`) | Accurate |
| 5 | **"`basicAuthMode: true` by default"** | `default/config.yaml:70` — **`basicAuthMode: false`** | **Inaccurate.** Basic auth ships off by default; whitelist mode is the actual default gate. The pitfall narrative survives (whitelist trap is real, verified #4), but this fact must be corrected before the study is cited again |
| 6 | Brute-force rate limiting via `rate-limiter-flexible` | `src/express-common.js:3`, `src/endpoints/users-public.js:5` | Accurate |
| 7 | Untyped config requiring `stringToBool` parsing helpers | `command-line.js:7,307-308`; `util.js:1104` | Accurate |
| 8 | CLI (yargs) overrides config.yaml | `command-line.js:3-4,110` | Accurate |
| 9 | `Remote-Link.cmd` downloads `cloudflared.exe` from GitHub releases and runs the tunnel | `Remote-Link.cmd:17-18` — `curl -Lo cloudflared.exe https://github.com/cloudflare/cloudflared/releases/...` then `cloudflared.exe tunnel --url localhost:8000` | Accurate — good precedent for the proposal's `bun run tunnel` |
| 10 | Protocol auto-detection via `getHasIP()` | `server-startup.js:4,407` | Accurate |

### 2.3 ADR alignment

- **ADR-004** (TLS termination is infrastructure's job; relative paths; no in-app TLS): the proposal's Non-Goals §1 cites it correctly — with one internal contradiction elsewhere (see §4.1).
- **ADR-006** (delegated perimeter security; default `127.0.0.1`; `0.0.0.0` warning; §4 sketches an optional `FORMATAVERN_PASSWORD` env-var gate "in Phase 3"): the proposal's Access PIN gate is the revival of that roadmap item — but it changes the mechanism (config.yaml `security.pin` + `--pin` flag, not an env var) and ADR-006 is **Accepted**, not superseded. The proposal never mentions §4. See C-R4.

---

## §3 — Why the review agrees

1. **The two-sphere separation is the right architecture, not just tidiness.** Socket binding must be knowable before `listen()` and editable with a text editor when the server won't boot; studio domain state must be mutable at runtime without restarts. The proposal's lifecycle argument (§3, "Why This Division is Non-Negotiable") is sound, and the SQLite side is already built: `repos.settings` + `repos.providerConfigs` are live-editable today (`index.ts:117-118`). Keeping the split also protects **I1** (one TypeBox schema per boundary) and **I2** (repositories are the only write path) by *not* adding a second write path into a YAML file.
2. **The non-destructive loader is the correct counter-design to a verified anti-pattern.** SillyTavern rewrites `config.yaml` on boot (`config-init.js:239`), destroying comments — the proposal's memory-defaults + warn-don't-strip approach fits the existing `validate()` pipeline (`packages/shared/src/validate.ts:14-21`: Clone → Clean → Default → Check, never mutating input).
3. **The dev-mode diagnosis is exactly right.** `index.ts:263` redirects every non-local visitor to the visitor's own loopback; `vite.config.ts:8` refuses remote connections. No nuance changes the conclusion: `bun run dev` is unusable from a phone today.
4. **The threat model is honest.** §8.1 restates ADR-006's context precisely (chats, DB writes, upstream credit consumption). The PIN gate is proportionate: it is a *friction gate* against casual LAN access, not a claim of cryptographic security — the right ambition for a single-user studio that has explicitly rejected multi-user accounts (ADR-006 "Zero Bloat in Core Engine").
5. **The auth design is feasible against the actual transport code.** This was the review's biggest pre-verification concern: SSE + Bearer headers usually conflict with `EventSource`. But FormaTavern's `readSse` is fetch-based and accepts `RequestInit` (`frontend/src/lib/api/sse.ts:8-14`) — an `Authorization` header can flow to `/api/*` streams with zero protocol changes. Eden treaty requests carry headers natively. The proposal didn't cite this; the review confirms it.
6. **Dev/prod parity via the Vite proxy is the minimal correct fix.** The proxy already targets `127.0.0.1:3000` and already handles SSE flushing (`vite.config.ts:12-33`) — meaning the *phone never needs to reach the backend directly in dev at all*. This enables a strictly better variant of the proposal's §7 (see C-R2).
7. **The diagnostics program (§5.2) addresses real Windows failure modes.** Hyper-V dynamic port exclusions producing `WSAEACCES` on innocent ports, and AV web shields blocking unknown binaries, are genuine support vectors for this feature's target audience. Advice text cannot *detect* Avast, but actionable triage copy is the correct fallback.
8. **PWA manifest + clipboard fallback + safe-area (§9) are small, correct, and needed.** Verified: the viewport meta already exists (`app.html:5`); the clipboard gap is real (five unguarded call sites); `data:`/HTTPS nuance is respected (P3's allowlist is untouched by a manifest).

---

## §4 — Defects found in the proposal as written

### 4.1 Internal contradiction: TLS paths in the §3 diagram

The Sphere 1 diagram lists "TLS / SSL Paths (`certPath`, `keyPath`)" — but §1 Non-Goals disclaim in-process TLS per ADR-004, and the §4.1 schema (correctly) contains no such fields. This is a leftover from the SillyTavern study (`default/config.yaml:48-57` ships `ssl.certPath/keyPath`). It must be deleted, not merely omitted from the schema: leaving it in the architecture diagram invites a future "just add the two fields" implementation that violates ADR-004's central decision and drags cert-file management into the app.

### 4.2 Factual error in the comparative study

`basicAuthMode` defaults to **false** in SillyTavern (`default/config.yaml:70`), not `true` (proposal §2.1 item 3). The surrounding argument (whitelist trap, rate limiting) survives on its own, but a comparative study that future decisions will cite should not carry a wrong fact.

### 4.3 The dev-mode story is incomplete as written (the significant one)

Three linked gaps; details and the fix direction are C-R2:

1. **Config doesn't propagate.** §7's Vite fix keys off `process.env.FORMATAVERN_HOST` — but the proposal's primary configuration surface is `config.yaml` (`network.mode: lan`) and a `--lan` CLI flag. As written, `mode: lan` in config.yaml binds the *backend*, while Vite (a separate process, spawned by `bun run --parallel dev:backend dev:frontend`) never learns about it and stays loopback-only. The phone still fails. The proposal specifies no mechanism that carries one resolved config to both processes.
2. **`bun run dev --lan` doesn't work as sketched.** The root `dev` script is `bun run --parallel dev:backend dev:frontend` (`package.json:6`); extra CLI args are not forwarded to both children by that construction. Arg plumbing must be designed (env-based or dedicated scripts), not assumed.
3. **The dev QR code would encode the wrong port.** §6's banner shows the Network URL on `:3000` — in dev that is the API server plus a redirect; the actual UI is Vite `:5173`. Which URL the QR encodes must be a stated, mode-dependent rule, or the headline feature (scan → phone connects) ships broken in the very mode developers demo it in.

### 4.4 Host-header open redirect in §7's fix

`redirect(\`http://${hostname}:5173/\`)` trusts the request's `Host` header — attacker-controlled input. Dev-only and low severity, but a trivially avoidable open-redirect primitive: validate that `hostname` is an IPv4 literal (or the configured host) before reflecting it, or eliminate the redirect entirely by keeping the backend loopback in dev (C-R2) so remote clients never hit `:3000` at all.

### 4.5 Missing `.gitignore` entry

`config.yaml` will hold the access PIN in plaintext; the current `.gitignore` covers `.env` and DB files but **not** `config.yaml`. The proposal ships a `config.example.yaml` and never says the real file must be untracked. One line, must be explicit.

### 4.6 Unstated residual risk in the PIN gate

Over plain HTTP on LAN, the bearer token and all chat traffic are sniffable/replayable by anyone on the Wi-Fi. The PIN gate is access *friction*, not confidentiality — consistent with ADR-004 (delegated TLS) and ADR-006 (plaintext-at-rest threat model), but the proposal should state it as plainly as its other honest-posture sections, so nobody reads "PIN protected" as "encrypted".

---

## §5 — Conditions for the blueprint round (must-resolve before build)

### C-R1 — Delete the TLS line from the Sphere 1 diagram
Mechanical (§4.1). The schema and Non-Goals already agree with ADR-004; the diagram must too. If cert paths are ever wanted, that is an ADR-004 amendment, not a config field.

### C-R2 — Specify the dev-mode LAN chain end-to-end, and prefer "Vite-only exposure"

The blueprint must specify, as one mechanism:

- **One resolver, both processes.** Resolve `config.yaml` + env + CLI once (in a `backend/src/config.ts`-style module or a dev orchestrator), then export the resolved values as env vars to *both* dev children. `config.yaml` in `mode: lan` must reach Vite.
- **Recommended topology: only Vite binds LAN in dev.** Vite already proxies `/api` and `/assets` to `127.0.0.1:3000` with SSE-safe headers (`vite.config.ts:12-37`) — the phone gets full functionality through Vite alone, and the backend stays loopback (dev), which is a strictly smaller attack surface than the proposal's both-bind design and makes the §7 redirect moot. Backend LAN binding remains a prod/single-process concern.
- **Mode-dependent QR/banner rule.** Dev: announce + QR → `http://<lan-ip>:5173/` (the existing banner already prints a Web UI line, `index.ts:323` — extend it). Prod: → `http://<lan-ip>:3000/`. State it as a rule, not an example.
- **Arg plumbing.** Prefer a dedicated `dev:lan` root script (env-var based; bun's script shell supports cross-platform `VAR=value cmd` prefixes) over `bun run dev --lan` forwarding through `--parallel`; keep free-form CLI flags for the single-process `start` path where `process.argv` parsing is direct.
- **Vite `allowedHosts`.** Vite 6 (`frontend/package.json:38`) validates `Host` by default; IP literals are allowed, but hostname access (Tailscale MagicDNS, §10's own recommendation) will be refused in dev unless `server.allowedHosts` is configured alongside `host`. The proposal's Vite snippet handles only `host`.

### C-R3 — Specify the PIN token contract before any middleware is written

The blueprint must pin down: the signing secret's source and persistence (boot-generated in-memory is acceptable *if* stated — tokens then die on restart; a persisted secret file is a new artifact class that needs its own decision); token lifetime; what is gated (`/api/*` — including SSE, which is header-capable per §3.5) vs. public (static shell and `/assets/*` — acceptable, but say so); the localhost-bypass interacting correctly with `trustedProxies` (don't honor `X-Forwarded-For` from non-trusted sources when deciding "is this loopback"); timing-safe PIN comparison; and the plaintext-at-rest + sniffable-token residual risk stated in the docs (§4.6). Also reconcile the PIN schema (`minLength: 4, maxLength: 64`, §4.1) with the UX copy ("4-8 digit", §4.3) — pick one (recommendation: keep the schema loose, document numeric-4–8 as the *recommended* form and enforce nothing the UI doesn't model).

### C-R4 — Propose the ADR-006 amendment explicitly

The PIN gate supersedes ADR-006 §4's `FORMATAVERN_PASSWORD`-env sketch and softens §2's "delegate to Tailscale/Cloudflare" posture with an in-app option. That is a defensible evolution — ADR-006 §4 itself anticipated an in-app gate — but Accepted ADRs change by amendment, not silence. The blueprint should include the ADR-006 update (new §5 or revised §4: config.yaml `security.pin` as the mechanism, env var as override, LAN-only scope) per the house rule that docs move in the same PR as the invariants they describe (`.agents/AGENTS.md` header).

### C-R5 — Pin the config-defaulting semantics and the file contract with tests

- **Named tests first:** empty file, partial file, and unknown-key file through the loader must yield a fully-defaulted, warning-emitting, never-disk-writing result. This exercises `Value.Default` recursion into object-with-default schemas and `Type.Optional` properties (§4.1's `network: { default: {} }`, `host: Optional(String({default}))`) — behavior the repo's existing `validate()` pipeline (built for fully-specified API bodies) has never needed to prove. If recursion disappoints, flatten defaults explicitly (a `DEFAULT_SERVER_CONFIG` object, mirroring `DEFAULT_SETTINGS`) rather than fighting the library.
- **Unknown-key warnings** need a pre-`Clean` key diff — `validate()`'s `Value.Clean` strips silently (`validate.ts:15`); warning is new behavior on this path.
- **Repo hygiene:** `config.yaml` in `.gitignore` (§4.5); `storage.dataPath`/`assetsPath` mapped to (or renamed to) the existing `FORMATAVERN_DB_PATH`/`FORMATAVERN_ASSETS_DIR` env names (documented in `docs/development.md` §3 — two names for one knob is a mini dual-state trap); `docs/development.md` §3's env table updated with the new variables and precedence.
- **Purity placement:** schema in `@formatavern/shared` (pure, isomorphic — I5-safe); the loader (fs/YAML/networkInterfaces) in the backend entry path only, with resolved values injected via `createApp({ options })` exactly as `nodeEnv` is today (`index.ts:188-190`) — `app.ts` must stay free of file/network concerns (I6/S7). The proposal implies this but never says it; the blueprint must, or `app.ts` purity will erode one import at a time.

---

## §6 — Minor notes for the blueprint

- **Interface selection heuristics (§5.1):** filtering `172.17.*–172.31.*` will misfire on corporate LANs that legitimately use the RFC1918 `172.16.0.0/12` block; prefer "the interface holding the default IPv4 route" as the primary heuristic, and print *all* candidate LAN URLs in the banner (the QR encodes the best guess; humans get the alternates). A wrong-interface QR is this feature's #1 future support ticket.
- **`tunnel.provider: 'tailscale'` semantics:** Tailscale is a system service FormaTavern can detect and announce, never manage. Name the field's meaning "announce/detect" in the schema docblock, or split it from `cloudflare` (which *is* spawned — ST's `Remote-Link.cmd` is good precedent, §2.2 #9).
- **`security.allowedOrigins`:** the app is same-origin by design (ADR-004 rule 1; `client.ts:5`) — CORS allowlists have no obvious consumer. Either justify (future embedding?) or cut. Every knob that doesn't earn its place is the ST config-bloat lesson applied to ourselves.
- **`qrCode`/`announceLan` gating:** render only in `lan`/`custom` modes; a `localhost` QR of `127.0.0.1` is noise. The "press 'q' to toggle" interaction implies a raw-stdin listener in the server process — cheap to defer; the QR should also self-suppress when stdout is not a TTY (proposal §6 already says this — keep it).
- **EADDRINUSE copy (§5.2):** the orphaned-instance case should name the existing remedy: `bun run stop` (`scripts/stop.ts` is already the house tool for this).
- **Inbound connection logging (§5.3):** once per *new* remote IP, not per request — the existing request log (`index.ts:229-258`) shows how chatty per-request lines get. S8 is not engaged (no secrets), but log spam is its own denial of service.
- **YAML dependency:** a parser (e.g. `yaml`) enters backend deps only — allowed by the boundary table; note it in the blueprint's dependency delta. QR encoding likewise needs a small pure-JS encoder; half-block rendering at ~2 modules/cell for a ≤30-char URL fits the proposal's 15–18 line estimate.
- **PWA over plain HTTP:** add-to-home-screen and `display: standalone` work, but no service worker on insecure origins — fine, since none is proposed; note that §9.2's clipboard fallback remains mandatory *because* of this, and both become moot (in the good way) under Tailscale HTTPS.
- **"12-Factor" label (§4.2):** the stated cascade (CLI > env > file > defaults) is the *self-hosted-app* convention, not 12-factor (which disfavors files). The design is right; the label is cosmetic — drop it rather than defend it.
- **IPv6:** QR/announce is IPv4-only as proposed. Acceptable; state it as a limitation instead of leaving it implied by `listenAddress`'s absence.

---

## §7 — Answers to the proposal's §11 open questions

| # | Question | This review's answer |
|---|---|---|
| 1 | Default network mode — Option A (`localhost`) vs Option B (`lan` + printed PIN) | **Option A, strongly.** It preserves ADR-006's default binding and zero-firewall-prompt first-run, and exposure stays an intentional act. Option B optimizes the demo path at the cost of silent exposure for anyone who never reads the console — the opposite of the proposal's own "honest posture" principle. |
| 2 | PIN gate phased with LAN broadcast, or later? | **Same phase.** The QR code exists to make exposure one tap away; broadcasting without a gate turns the ADR-006 warning into wallpaper precisely when it matters most. The gate is small (one middleware, one verify route, one screen) and `readSse`'s fetch design (§3.5) removes the usual SSE-auth obstacle. If schedule forces a split, Phase 1 must keep `lan` gated behind an explicit config.yaml edit — which Option A already is — with a loud "unprotected" banner marker in `authMode: none`. |
| 3 | `config.yaml` vs `formatavern.config.yaml` | **`config.yaml`.** A single-app checkout has no realistic collision; the SillyTavern-familiar name lowers the community's switch cost; and since the file is never auto-created or mutated (§4.2), ambiguity has no window to arise. Add the `.gitignore` entry (C-R5) and ship the example file as proposed. |

---

## §8 — Entry criteria summary

The blueprint round may open with the proposal as its basis, with these items resolved or explicitly decided in it:

1. TLS line removed from the Sphere 1 diagram (C-R1).
2. Dev-mode LAN chain specified end-to-end — resolver → both processes, Vite-only exposure preferred, mode-dependent QR port, arg plumbing, `allowedHosts` (C-R2).
3. PIN token contract specified — secret, lifetime, gating scope, SSE path, bypass rules, residual-risk statement (C-R3).
4. ADR-006 amendment proposed alongside (C-R4).
5. Config-defaulting tests named first; `.gitignore`, env-name mapping, and `app.ts` purity placement locked (C-R5).
6. Corrected in the proposal text before it is cited again: `basicAuthMode` default (§4.2).

**Bottom line:** the proposal's diagnosis is verified accurate, its architecture is consistent with the app's invariants and ADRs, and its security posture is proportionate and honest. The disagreement is not with the direction but with five under-specified decisions — the largest being the dev-mode propagation story, which as literally written would ship the headline feature broken in the mode it will be demoed in. Resolve those at the blueprint round and this becomes the rare networking feature that is both friendlier *and* safer than the reference implementation it studied.
