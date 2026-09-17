# FormaTavern — Technical Architecture

**Scope:** the system as built through Phase 5 (Companion Platform & Foyer v2). Normative details live in `docs/blueprints/`; this document is the map. Cross-references to invariants use the canonical ids in `.agents/AGENTS.md` §4.

---

## 1. Principles

1. **Stateless backend, authoritative database.** No session state in memory; every request names its `chatId`/`messageId`. The only in-memory state is ephemeral generation coordination (`GenerationHub`), recoverable on restart (S1–S3).
2. **One shared domain.** TypeBox schemas, the envelope parser, the state engine, and the theme cascade live in `@formatavern/shared` and execute identically in Bun and the browser (I1, I5, E1–E4, U1).
3. **Styling as data.** A character's look is a `CharacterTheme` of pure CSS values; the UI is driven by `--theme-*` custom properties with author showcase chameleon adaptations (U1, U2, A-U2).
4. **Single-request narrative.** Narrator, character, NPCs, and a state vector arrive in one completion; the parser is a pure function of the full buffer (E1, E2).
5. **Byte-exact, version-agnostic wire contracts** (S9).
6. **Self-contained companion ecosystem.** Complete author showcase, companion studio with OCC, persona roster with atomic defaults, FTS5 discovery catalog, and local SHA-256 asset store (P1–P7).
7. **Neutral layout as data.** The chat log is neutral by default (uniform-left, row container, plain names, zero avatars, dimmed narrator in flow). Layout is owned strictly by the character card (`CharacterLayout`), resolved purely via `resolveLayout`, and expressed through DOM data attributes rather than role conditionals (L1–L8).
8. **The co-author paradigm (collaborative narrative studio).** FormaTavern treats the LLM as an expressive creative writing partner in a shared writer's room rather than an adversarial 1st-person chatbot. The human user acts as lead author and creative director; the model contributes multi-track dialogue, environmental narration, and scene progression. Conversational boundaries (such as "never speak for the user") are creator-owned stylistic options, not immutable engine dogma.

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

> For full DDL, column-level data dictionary, JSON schemas, and tree branching query patterns, see [`docs/schema.md`](schema.md).

### 5.1 Connection (`backend/src/db/connection.ts`)
```sql
PRAGMA journal_mode = WAL;     -- asserted 'wal' on file DBs (memory DBs skip)
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;      -- asserted = 1 (I4); per connection; never inside a transaction
PRAGMA busy_timeout = 5000;
```
`new Database(path, { strict: true })`: missing named bind parameters throw instead of binding NULL. All connections (server, scripts, tests) go through `openDatabase()`.

**WAL model:** unlimited readers + one writer; Bun is single-threaded and `bun:sqlite` is synchronous, so writes must be tiny and batched (S5). Sidecar files `-wal`/`-shm` are part of the database while a process is attached; backups must checkpoint first.

### 5.2 Schema (current `user_version = 4`)

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

**v4 `companion_platform`** — Full author showcase, discovery catalog, studio, and persona support:
- `characters`: adds `tagline TEXT`, `creator TEXT`, `showcase TEXT`; composite index `(updated_at DESC, id DESC)`, `(name ASC, id ASC)`.
- `character_tags` junction table: `(character_id FK→characters CASCADE, tag TEXT, PRIMARY KEY (character_id, tag))` with indexes `(tag, character_id)` and `(character_id)`.
- `characters_fts` virtual table: FTS5 full-text search with `unicode61` tokenizer over `(name, tagline, description, personality, scenario, tags)`. Automatic feature-detection probe fallback to LIKE if SQLite lacks FTS5; records `search_backend` in `settings`.
- `personas`: adds `avatar TEXT`.
- `chats`: adds index on `updated_at DESC`.

### 5.3 Keyset Pagination & Tree Model (S6, P1)
- Keyset cursor pagination on `(sort_value, id)` with opaque base64 cursor (`recent`, `name`, `stories`); no offset scanning.
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

### 5.5 Filesystem & Asset Pipeline (`FsAssetStore`)
- **Storage:** `data/assets/` (env `FORMATAVERN_ASSETS_DIR`), served via `/assets/:filename` or Elysia static plugin.
- **Addressing:** SHA-256 content addressing `<hash>.<ext>` ensures deduplication.
- **Safety checks:** Magic byte validation (`sniffImageMime`: PNG, JPEG, WebP, GIF only; SVGs/executables rejected), image header dimension bounds ($\le 4096 \times 4096$), single-file limit 10 MiB, total asset store quota 64 MiB.
- **Atomicity & containment:** Written via temporary files (`*.tmp`) with atomic rename; strict path containment assertion prevents path traversal (`..`).
- **Lifecycle & GC:** Provisional uploads use `ownerId = draft-*`; on companion creation/patch, draft owner is promoted. Stale unpromoted drafts (> 24 hours) are reclaimed by `backend/scripts/assets-gc.ts`. Seeds are imageless with ambient fallback.

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
| 1b | Narrative response format (dialect grammar, clean structural template, state field list) | narrative mode |
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
| `GET /characters?q&tags&sort&cursor&limit` | Keyset pagination, FTS5 match / LIKE fallback, tag AND filtering |
| `POST /characters` | Validated creation; promotes draft asset owner |
| `GET/PATCH/DELETE /characters/:id` | `PATCH` with OCC `expectedUpdatedAt` (409 stale); `DELETE ?cascade=chats` |
| `POST /characters/:id/duplicate` | Deep clone with slug collision resolution `(copy)` |
| `GET /characters/:id/usage` | Active chat / story count |
| `GET /tags` | Aggregated tag frequency counts |
| `GET /personas`, `POST /personas` | List personas, create persona (atomic default switch) |
| `PATCH/DELETE /personas/:id` | Update persona; delete with reassignment (`?reassignTo=`) |
| `POST /assets/upload` | Multipart upload with magic byte sniffing, dimension checks, SHA-256 storage |
| `GET /assets/:filename` | Asset streaming with path containment guard |
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

### 11.2 Chameleon design-token & custom CSS pipeline
```
ShellTheme (global) ──┐
CharacterCard.style ──┤
stateBindings + currentState ─┼─ resolveTheme() (shared, pure; order: NEUTRAL → global → character → bindings → persona → a11y) [A-U1, U1]
Persona.styleOverrides ───────┤   │
prefs.disableCharacterThemes ──┘   ▼
                               themeToCssVars() (frontend, pure; CSS_VAR_NAMES, fixed order, url() escaping, font fallbacks, --theme-scheme)
                                   ▼
                               <div class="theme-root" style="--theme-…:…" data-transitions="on|off" data-theme-scheme="dark|light">
                                   ▼
                               app.css: @property registrations (<color>/<length>) → the custom properties themselves interpolate
                                        over --motion-theme (600 ms, 0 under reduced motion);  @theme inline bridges them to
                                        Tailwind utilities (bg-char-bg, text-narrator, rounded-bubble, font-narrative …)  [U2, U6]
```
- **Unified Cascade (Amendment A-U1):** `NEUTRAL → global(shell) → character → bindings → persona → a11y`. Shell theme provides base typography and background below companion styles; `disableCharacterThemes` forces `NEUTRAL_A11Y_THEME`.
- **Token ↔ CSS Bridge:** Sheets read every `--theme-*` and `--chrome-*` variable; author custom CSS cannot dethrone root cascade values because inline style mechanics win over stylesheets.
- **Single Style Outlet (Amendment A-U2b, Invariants C2, C8, C9):** `CustomStyleOutlet.svelte` is the only component permitted to inject `<style>` tags at runtime. It runs client-side `sanitizeCss` with cached dynamic loading of `css-tree` (C13), appends the reduced-motion guard (C9), and unmounts completely when `prefs.hideCustomStyling = true` (C8).
- Bindings evaluate against the **committed** `currentState` (updated at terminal events), not the live patch, to avoid flapping.
- First paint is themed with transitions off (`data-transitions="off"` until after the first frame), so route entry never strobes.
- Chrome (drawers, composer shell, toolbars, focus rings, toasts) uses `--chrome-*` tokens with solid vs. frosted glass reactive toggles (`prefs.forceSolidChrome`).
- Backdrop: A/B image layers with blur + overlay; no image → ambient accent gradient.

### 11.3 Components & Non-Nesting Surfaces (Invariant §2.1)
Surfaces never nest; exactly one `<CustomStyleOutlet>` is ever active on a page:
- **Chat Surface (`data-ft-surface="chat"`):** `ChatViewport` root (theme root, 100dvh grid) with `<CustomStyleOutlet scope="chat" css={session.character?.customCss} />` enforcing the chat-conservative profile (blocking `position: fixed/sticky`, `z-index > 10`, `scroll-behavior`, and scroll container manipulation) → `Backdrop`, `DecorLayers` (fixed scenery pins / page dolls capped at $\le 2$ layers per C13), `TopBar`, `LoreDrawer`, `MessageLog` (windowed, `content-visibility:auto`, `JumpToLatest`) → `MessageTurn` (index-keyed segments → `NarratorBlock` | `SpeechBubble` with `StreamCaret` and `data-fx` presets; `TurnToolbar`, `SwipeCarousel`, `ErrorSlate`), `Composer`, `NavDrawer`, `SettingsSheet`, dialogs.
- **Character Surface (`data-ft-surface="character"`):** Author Showcase (`/character/:id`) root with `<CustomStyleOutlet scope="character" css={character.customCss} />` under the permissive profile → `ShowcaseHero`, `DecorLayers`, `ActionHub`, `ShowcaseBody` rendering sanitized showcase markdown with safe inline styles (A-U2), and `ResumeMenu`.
- **Shell Surface (`data-ft-surface="shell"`):** Outermost container of Foyer `/`, Personas `/personas`, and Studio routes wrapped by `<ShellSurface>`, setting inline `--chrome-*` tokens and mounting `<CustomStyleOutlet scope="shell" css={shellTheme.theme.customCss} />`. Shared components (`TopBar`, `NavDrawer`, dialogs) adopt hooks (`.ft-topbar`, `.ft-dialog`) that render inside whichever surface hosts them.
- **Surface Completeness & Dialog Scoping (Invariant C14):** Every route in the application MUST establish or delegate to an authorized surface root (`data-ft-surface="shell"`, `character`, or `chat`). Modals, dialogs (`ConfirmDialog`, `SettingsSheet`), and interactive overlays MUST render inside the active surface boundary so that CSS custom properties (`--theme-*`, `--chrome-*`, `--theme-accent-contrast`) cascade downwards into dialog content. Buttons and components pairing with `bg-accent` must use `text-accent-contrast` rather than hardcoded neutral text to ensure accessibility across light and dark accent selections. Statically audited by `frontend/unit/surfaces.test.ts`.
- **Virtual Surface Partitioning (Invariant C15):** A character's `customCss` is one stored document, virtually partitioned by deterministic delimiters (`/* === @formatavern/surface: showcase === */`, `/* === @formatavern/surface: chat === */`) via pure `splitCustomCss` / `joinCustomCss` (`@formatavern/shared/customCss/partition.ts`). The showcase route injects only the showcase partition (scope `character`); `ChatViewport` injects only the chat partition (scope `chat`). Legacy unmarked sheets are classified by surface-hook heuristics with a full-sheet fallback preserving pre-partition rendering. Containment itself is still guaranteed by C4 scope-prefixing; the partition layer exists for diagnostics precision (per-scope lint in the Studio subtabs), payload hygiene, and author mental model — not as a security boundary. Studio edits one partition at a time and roundtrips delimiters; the parser is total and never throws. Audited by `packages/shared/test/customCss/partition.test.ts`.

### 11.4 Markdown pipelines (`lib/render/`)
1. **Roleplay prose:** `renderRoleplayMarkdown` via `marked` + speech quotes (`<q class="speech">`) sanitized through strict DOMPurify allow-list (`Markdown.svelte`).
2. **Author showcase:** `renderShowcaseMarkdown` via `marked` + headings, tables, lists, images (local `/assets/` and `data:image/` only; remote URLs strictly rejected per P3) + safe inline style allowlist (`rebuildStyle` preserving typography, colors, layout, and borders per Amendment A-U2). Rendered exclusively in `ShowcaseBody.svelte`.

### 11.5 Chat Message Layout Architecture (Invariants L1–L8)
Message rendering in `/chat/[chatId]` decouples structure from role styling:
- **Per-voice row primitive (Invariant L1):** `article.ft-turn[data-role]` contains $N$ `div.ft-row[data-kind]` rows (`TurnRow.svelte`), each exposing a header slot (avatar + name label) and a body slot (`ft-turn-body`). Single-header turn presentation is a collapsed view over these rows, not a divergent data structure.
- **Zero role-branched layout in components (Invariant L2):** Component code contains zero conditional alignment (`justify-end` / `justify-start`), tails, or backgrounds based on message role. All alignment, container boundaries, speech tails, and narrator geometries are driven strictly by DOM data attributes (`data-align`, `data-container`, `data-headers`, `data-narrator`, `data-tails`).
- **Pure resolveLayout (Invariant L3):** `resolveLayout(card?.layout, mode): ResolvedLayout` in `@formatavern/shared` is a pure deterministic mapping. Blank card or `NULL` layout yields `NEUTRAL_LAYOUT_DOC` (uniform-left, row container, dim narrator, plain names, 0 avatars, no tails). In classic chats, headers are forced to `single` and NPC/narrator controls are marked inert.
- **NULL = neutral, backfill = classic (Invariant L4):** Existing pre-v7 cards were backfilled with `CLASSIC_LAYOUT` (honoring `charTail: 'none'` intent), while new characters default to the neutral baseline.
- **Classic preset layout-only (Invariant L5):** `CLASSIC_LAYOUT` contains strictly 0 style/color keys.
- **Single owner (Invariant L6):** Layout configuration is owned exclusively by the character card (`CharacterLayout`). It is absent from `ThemeOverridesSchema` and persona configurations.
- **Measure stability (Invariant L7):** `--msg-measure: 72ch` is a stylesheet constant in `app.css`. Container widths do not shrink-wrap or jump between turns.
- **Honesty in collapsed headers (Invariant L8):** When `headers === 'single'`, non-owner segments (NPC or switched voices) retain inline voice tags (`span.ft-turn-name.inline`) to prevent voice misattribution.
- **Two-Track System:** Track 1 provides easy controls in Studio (`LayoutPanel.svelte`); Track 2 provides expressive CSS control via stable hooks (`.ft-row`, `.ft-turn-body`, `.ft-avatar`, `.ft-turn-name`) with starter sheets (`UNIFORM_ROWS_PRESET`, `SPLIT_BUBBLES_PRESET`, `CENTERED_NARRATOR_PRESET`).

---

## 12. Security posture (summary)
Bound to localhost by default; no in-app auth in v1 (perimeter via Tailscale/Cloudflare Access); API keys stored plaintext in `settings` (OS file permissions), never returned by the API or logged (S8); character `CssToken`/`AssetPath` schemas prevent style/URL breakout from imported cards; markdown output sanitized; SPA only fetches relative paths.

---

## 13. Known limitations
No virtual scroller (window capped at 240 turns with `content-visibility`); state edits do not replay downstream turns; example dialogue is not dialect-converted; headers inside generic code fences are still recognized; a persona literally named `{{char}}` is unsupported; same-chat live sync across tabs is out of scope (each tab reattaches to the authoritative row).
