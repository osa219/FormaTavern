# Phase 2 Review → Approved

The evidence covers all nine criteria; the property suite numbers (50 seeded chunkings × every prefix, 31,695 assertions) and the surrogate-split token frames in the curl capture are exactly the artifacts I wanted. Five notes, none blocking — but the first two should be corrected in the docs before Phase 3 lands, because Phase 3 builds on them:

1. **"Incremental streaming … parser" wording.** E1 forbids incremental state; your property tests prove you don't have any, so this is vocabulary. Rename to "full-buffer reparse with streaming hold-back" wherever it appears — a future contributor reading "incremental" will try to add state for performance.
2. **Invariant numbering drift.** Your walkthrough relabels E6–E8 (state validation / agency / macros). The blueprint's E6 is builder purity, E7 shared isomorphism, E8 `app.ts` Bun-freedom — all three *are* verified (golden file, `shared/tsconfig`, `svelte-check`), but keep the canonical numbering in the repo docs; Phase 3 references E5/E8 by number.
3. **`{{persona}}`** as an alias of `{{user}}` is fine; add it to `spec-prompt-builder`.
4. **`o200k_base`**: the golden file and every `droppedTurns` assertion depend on the encoding. Make sure `cl100k_base` is the default and `o200k` is selected only by explicit option — never inferred from the model name inside `buildPrompt` (that would break E6 determinism against future model lists).
5. **Live smoke**: criterion 7 asked for an explicit "live smoke: not run" or its output; the walkthrough says only that the script skips cleanly. Record one or the other in the PR. (Also: "12-block" → there are 14 block ids.)

Proceed.

---

# FormaTavern — Phase 3 Blueprint: Elysia API Layer & Narrative State Machine

**Purpose:** Turn the three pure engines into a running product core: persisted chats and a message **tree** (swipes = siblings), a **generation engine** that streams from a provider into SQLite on a 500 ms throttle while fanning out SSE to any number of subscribers, and a typed REST/SSE surface consumed through Eden Treaty. The vertical slice grows into a real (still unstyled) conversation with Eldrin: create chat → send → stop → regenerate → swipe → continue → override state — all from the bare page and from curl.

**New dependencies:** none. **Schema:** migration **v3** (`chat_branching`). **`SHARED_VERSION`:** `0.3.0-phase3`.

---

## 1. Invariants for this phase

| # | Invariant | Enforced by |
|---|---|---|
| S1 | **Client disconnect never aborts generation.** The HTTP response is a *subscriber*; the generation is a detached task owned by the `GenerationHub`. Only `POST /api/messages/:id/stop` (or process shutdown) aborts. `request.signal` is never passed to a provider. | `engine.test.ts` "unsubscribe doesn't abort" |
| S2 | **At most one active generation per chat.** Check-and-register is synchronous (no `await` between the check and the row insert), so it is atomic on Bun's single thread. | `routes/generation.test.ts` 409 case |
| S3 | **Every assistant row created with `status='streaming'` reaches a terminal status exactly once** — `complete | aborted | error` — even if the engine itself throws (`finally` finalizes as `error`). On boot, leftover `streaming` rows become `aborted` with `metadata.recovered = true`. | `engine.test.ts` crash case; `recovery.test.ts` |
| S4 | **The DB row is authoritative; the SSE stream is advisory.** The terminal `done`/`error` event carries the final `MessageView`; clients replace their local buffer with it (this is how server-side agency truncation reconciles). | `routes` tests assert `done.message.content === row.content` |
| S5 | **Bounded write rate.** Per generation: ≤ ⌈duration / flushInterval⌉ + 1 `updateStreaming` calls + 1 `finalize`. No per-token writes. | `engine.test.ts` counts repo calls with a spy |
| S6 | **The active branch is derivable from `chats.active_leaf_id` + `messages.parent_id` alone.** No per-node "selected child" pointer, no ordering columns. `chats.metadata.currentState` is a *derived cache*, audited by `db:check`. | `messages.test.ts`; `db:check` |
| S7 | **`app.ts` stays Bun/SQLite-free.** Routes receive `Repositories`, `GenerationHub`, and `ProviderRegistry` through `AppDeps` interfaces declared in Bun-free `contracts` modules. | `svelte-check` over `App` |
| S8 | **Secrets never leave the process.** `GET /api/settings` masks keys; provider errors are already scrubbed (P7); no key is logged. | `settings.test.ts`; grep in CI is optional |
| S9 | **Wire contracts are byte-exact and version-agnostic:** SSE frames remain `data: <JSON>\n\n` produced by a hand-rolled `ReadableStream`; error bodies are always `{ error: { code, message, details? } }`. | Route tests parse frames with the Phase 0 reader |

---

## 2. Schema — Migration v3 (`chat_branching`)

```sql
-- one statement per db.run(), inside the v3 transaction
ALTER TABLE chats ADD COLUMN active_leaf_id TEXT REFERENCES messages(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_messages_streaming ON messages(status) WHERE status = 'streaming';
CREATE INDEX IF NOT EXISTS idx_messages_parent_id_id ON messages(parent_id, id);   -- sibling ordinal queries
```

- `ADD COLUMN … REFERENCES` is legal in SQLite because the default is `NULL`. This creates a **cycle** (`chats → messages → chats`). It is safe: deleting a chat cascades its messages; each message deletion fires `SET NULL` on any `chats.active_leaf_id` pointing at it — including the chat row being deleted — and SQLite resolves that within the same statement. A test proves it (§7.2). If a pinned SQLite ever misbehaves here, the fallback is to drop the `REFERENCES` clause and have `MessageRepository.remove` clear the pointer — same contract, weaker enforcement.
- `sender_id` remains polymorphic (character or persona) with no FK, as in v1.
- Backfill: `UPDATE chats SET active_leaf_id = (SELECT id FROM messages WHERE chat_id = chats.id ORDER BY id DESC LIMIT 1)` — newest message per chat. There are no real chats yet; the statement exists so the v2→v3 upgrade test has something to assert.

`runMigrations` semantics unchanged; `migrations.test.ts` gains: fresh → `{from:0,to:3}`; v2 DB with a chat + two messages → v3 sets `active_leaf_id` to the newest; `PRAGMA foreign_key_check` empty.

---

## 3. `@formatavern/shared` — DTOs and wire types

### 3.1 New schema modules

```
packages/shared/src/schemas/
├── chat.ts        # ChatCreateSchema, ChatPatchSchema, ChatViewSchema
├── message.ts     # MessageStatus, MessageMetricsSchema, MessageMetadataSchema, MessageViewSchema,
│                  # SendMessageBodySchema, MessagePatchSchema, StatePatchBodySchema, MessagesPageQuerySchema
├── settings.ts    # AppSettingsSchema (+DEFAULT_SETTINGS), SettingsPatchSchema, SettingsViewSchema
└── api.ts         # ApiErrorSchema, ApiErrorCode
packages/shared/src/types/chatStream.ts    # ChatStreamEvent
```

These are passed **directly** to Elysia `body:` / `query:` / `params:` (same TypeBox instance — this is why Phase 1 pinned the version). Response types come from handler return types; the `*ViewSchema`s exist so the repository → DTO mapping is validated in tests, and so Phase 4 can `Static<>` them.

### 3.2 Messages

```ts
export const MessageStatusSchema = Type.Union(['streaming','complete','aborted','error'].map(Type.Literal));
export const StateSourceSchema   = Type.Union(['initial','patch','inherited','override'].map(Type.Literal));

export const ParseReportSchema = Type.Object({
  dialect: Type.Union([...Dialects, 'none'].map(Type.Literal)),
  parserVersion: Type.Integer(),
  adherent: Type.Boolean(),
  warnings: Type.Array(Type.String()),               // ParseWarningCode[]
  truncatedAt: Type.Union([Type.Literal('persona'), Type.Null()])
});

export const MessageMetricsSchema = Type.Object({
  provider: Type.String(), model: Type.String(),
  promptTokensEstimated: Type.Integer(),            // builder estimate
  promptTokens: Type.Optional(Type.Integer()),      // authoritative, from usage
  completionTokens: Type.Optional(Type.Integer()),
  durationMs: Type.Integer(), ttftMs: Type.Optional(Type.Integer()),
  finishReason: Type.Optional(Type.Union(['stop','length','aborted'].map(Type.Literal))),
  droppedTurns: Type.Integer()
});

export const MessageMetadataSchema = Type.Object({
  directorNote: Type.Optional(Type.String()),        // user nodes only
  parse: Type.Optional(ParseReportSchema),           // assistant nodes
  stateSource: Type.Optional(StateSourceSchema),
  stateWarnings: Type.Optional(Type.Array(Type.String())),
  stateOverrides: Type.Optional(Type.Array(Type.Object({ at: UnixMs, patch: StateVectorSchema }))),
  reasoning: Type.Optional(Type.String()),
  error: Type.Optional(Type.Object({ message: Type.String(), recoverable: Type.Boolean() })),
  edited: Type.Optional(Type.Object({ at: UnixMs, count: Type.Integer() })),
  continuations: Type.Optional(Type.Integer()),
  recovered: Type.Optional(Type.Boolean())
});

export const MessageViewSchema = Type.Object({
  id: Id, chatId: Id, parentId: Type.Union([Id, Type.Null()]),
  role: MessageRole, narrativeRole: NarrativeRole,
  senderId: Type.Union([Type.String(), Type.Null()]), senderName: Type.Union([Type.String(), Type.Null()]),
  content: Type.String(), segments: Type.Array(SegmentSchema),
  state: Type.Union([StateVectorSchema, Type.Null()]), status: MessageStatusSchema,
  createdAt: UnixMs, metrics: Type.Union([MessageMetricsSchema, Type.Null()]), metadata: MessageMetadataSchema,
  siblingIndex: Type.Integer(), siblingCount: Type.Integer(), hasChildren: Type.Boolean()
});

export const SendMessageBodySchema = Type.Object({
  message: Type.Optional(Type.String({ maxLength: 32_000 })),
  directorNote: Type.Optional(Type.String({ maxLength: 4_000 })),
  narrativeRole: Type.Optional(Type.Union(['persona','narrator','npc','character'].map(Type.Literal))), // default persona
  senderName: Type.Optional(Type.String({ maxLength: 120 })),   // required when narrativeRole = 'npc'
  parentId: Type.Optional(Id),                                   // default: chat.activeLeafId
  generate: Type.Optional(Type.Boolean())                        // default true
});
export const MessagePatchSchema = Type.Union([
  Type.Object({ content: Type.String() }),
  Type.Object({ segments: Type.Array(SegmentSchema), statePatch: Type.Optional(Type.Union([StateVectorSchema, Type.Null()])) })
]);
export const StatePatchBodySchema  = Type.Object({ state: StateVectorSchema });
export const MessagesPageQuerySchema = Type.Object({ before: Type.Optional(Id), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })) });
```

### 3.3 Chats

```ts
export const ChatCreateSchema = Type.Object({
  characterId: Id, personaId: Type.Optional(Id),          // default: personas.getDefault()
  title: Type.Optional(Type.String({ maxLength: 200 })),  // default: character.name
  narrativeMode: Type.Optional(...), envelopeDialect: Type.Optional(...)   // default: settings.narrative.*
});
export const ChatPatchSchema = Type.Object({ title: Type.Optional(...), metadata: Type.Optional(Type.Partial(ChatMetadataSchema)) }); // metadata merged shallowly; currentState/npcs not patchable here
export const ChatViewSchema = Type.Object({
  id: Id, title: Type.String(), primaryCharacterId: Id, activePersonaId: Id,
  createdAt: UnixMs, updatedAt: UnixMs, metadata: ChatMetadataSchema,
  activeLeafId: Type.Union([Id, Type.Null()]),
  activeGenerationMessageId: Type.Union([Id, Type.Null()]),   // from the hub, not the DB
  messageCount: Type.Integer()
});
```

### 3.4 Settings

```ts
export const AppSettingsSchema = Type.Object({
  provider:   Type.Object({ id: Type.Union([Type.Literal('mock'), Type.Literal('openrouter')], { default: 'mock' }), model: Type.Optional(Type.String()) }),
  openrouter: Type.Object({ apiKey: Type.Optional(Type.String()) }),
  generation: Type.Object({
    temperature: Type.Number({ minimum: 0, maximum: 2, default: 0.8 }),
    maxTokens: Type.Integer({ minimum: 16, maximum: 32_000, default: 1024 }),
    contextLength: Type.Integer({ minimum: 1024, default: 16_384 }),
    topP: Type.Optional(Type.Number()), topK: Type.Optional(Type.Integer()), minP: Type.Optional(Type.Number()),
    repetitionPenalty: Type.Optional(Type.Number())
  }),
  narrative: Type.Object({
    defaultMode: Type.Union([Type.Literal('classic'), Type.Literal('narrative')], { default: 'narrative' }),
    defaultDialect: Type.Union(Dialects.map(Type.Literal), { default: 'directive' })
  }),
  preamble: Type.Optional(Type.String({ maxLength: 20_000 }))
});
export const DEFAULT_SETTINGS = Value.Default(AppSettingsSchema, {}) as AppSettings;

/** GET view: secret replaced by presence + hint. */
export const SettingsViewSchema = /* AppSettings with openrouter → { apiKeySet: boolean; apiKeyHint: string | null; source: 'settings'|'env'|'none' } */;
/** PATCH: deep-partial (explicit, like ThemeOverrides); openrouter.apiKey: string | null (null clears, omitted keeps). */
export const SettingsPatchSchema = …;
```
`reservedCompletion` for the builder budget is `generation.maxTokens` — one knob, not two.

### 3.5 API error envelope and stream events

```ts
export type ApiErrorCode =
  | 'not_found' | 'validation_failed' | 'generation_in_progress' | 'no_active_generation'
  | 'message_has_children' | 'invalid_parent' | 'not_assistant_message' | 'not_leaf'
  | 'provider_unconfigured' | 'prompt_budget_exceeded' | 'serialize_failed' | 'chat_has_active_generation'
  | 'internal';
export const ApiErrorSchema = Type.Object({ error: Type.Object({ code: …, message: Type.String(), details: Type.Optional(Type.Unknown()) }) });

// types/chatStream.ts
export type ChatStreamEvent =
  | { type: 'start'; messageId: string; chatId: string; parentId: string | null; userMessageId?: string; resumedFrom?: number }
  | { type: 'token'; text: string }
  | { type: 'usage'; promptTokens: number; completionTokens: number }
  | { type: 'done';  message: MessageView }                                            // terminal
  | { type: 'error'; message: MessageView; error: { message: string; recoverable: boolean } }; // terminal
```
`resumedFrom` = number of UTF-16 code units of content the client should already have (continue / reattach). Wire framing is unchanged: `data: <JSON>\n\n`, LF only, no `event:`/`id:` lines.

---

## 4. Backend — Repositories (`backend/src/db/`)

### 4.1 Contracts (Bun-free, `contracts.ts` additions)

```ts
export interface ChatRow    { /* snake→camel of the table incl. activeLeafId, metadata: ChatMetadata */ }
export interface MessageRow { /* camel of the table; segments: Segment[]; state: StateVector|null; metrics; metadata: MessageMetadata */ }
export interface MessageWithTree extends MessageRow { siblingIndex: number; siblingCount: number; hasChildren: boolean; }

export interface ChatRepository {
  create(input: { id: string; title: string; primaryCharacterId: string; activePersonaId: string; metadata: ChatMetadata }): ChatRow;
  get(id: string): ChatRow | null;
  list(): Array<ChatRow & { messageCount: number }>;          // ORDER BY updated_at DESC
  update(id: string, patch: { title?: string; metadata?: ChatMetadata; updatedAt?: number }): void;
  setActiveLeaf(id: string, leafId: string | null): void;
  remove(id: string): void;
  count(): number;
}

export interface MessageRepository {
  insert(row: Omit<MessageRow, 'createdAt'> & { createdAt?: number }): MessageRow;
  get(id: string): MessageWithTree | null;
  path(leafId: string): MessageRow[];                          // root → leaf, inclusive
  children(id: string): MessageRow[];                          // ORDER BY id ASC
  siblings(id: string): MessageRow[];                          // same parent_id (root: parent IS NULL, same chat), ORDER BY id ASC
  descendLatest(id: string): string;                           // follow newest child repeatedly; returns deepest id
  pageActiveBranch(chatId: string, leafId: string, opts: { before?: string; limit: number }): MessageWithTree[]; // ascending
  countInChat(chatId: string): number;
  updateStreaming(id: string, patch: { content: string; segments: Segment[] }): void;
  finalize(id: string, patch: { content: string; segments: Segment[]; state: StateVector | null; status: MessageStatus; metrics: MessageMetrics | null; metadata: MessageMetadata }): void;
  updateContent(id: string, patch: { content: string; segments: Segment[]; state?: StateVector | null; metadata: MessageMetadata }): void;
  updateState(id: string, state: StateVector, metadata: MessageMetadata): void;
  reopenForContinue(id: string, content: string): void;        // status → 'streaming', content := stripped prefix
  remove(id: string): void;                                    // FK cascades the subtree
  markStaleStreamingAsAborted(): string[];                     // returns ids; sets metadata.recovered = true, stateSource inherited
}

export interface SettingsRepository { getAll(): AppSettings; patch(p: SettingsPatch): AppSettings; getRaw(key: string): string | null; }

export interface Repositories { characters; personas; chats: ChatRepository; messages: MessageRepository; settings: SettingsRepository; schemaVersion(): number; transaction<T>(fn: () => T): T; }
```

### 4.2 Normative queries

- **`path(leaf)`** — recursive CTE walking `parent_id` upward, then `ORDER BY id ASC`:
  ```sql
  WITH RECURSIVE p(id) AS (SELECT :leaf UNION ALL SELECT m.parent_id FROM messages m JOIN p ON m.id = p.id WHERE m.parent_id IS NOT NULL)
  SELECT m.* FROM messages m WHERE m.id IN (SELECT id FROM p) ORDER BY m.id ASC;
  ```
- **`pageActiveBranch`** — same CTE, then `WHERE m.id IN p AND (:before IS NULL OR m.id < :before) ORDER BY m.id DESC LIMIT :limit`, reversed in JS. ULIDs compare lexicographically, so `id <` is chronological and the ancestor path is naturally newest-first. Tree decorations in one extra query over the page's `parent_id`s:
  ```sql
  SELECT id, parent_id, ROW_NUMBER() OVER (PARTITION BY chat_id, parent_id ORDER BY id) - 1 AS sibling_index,
         COUNT(*) OVER (PARTITION BY chat_id, parent_id) AS sibling_count,
         EXISTS(SELECT 1 FROM messages c WHERE c.parent_id = messages.id) AS has_children
  FROM messages WHERE chat_id = :chat AND (parent_id IN (…) OR (parent_id IS NULL AND :hasRoot))
  ```
  (SQLite ≥ 3.25 window functions; Bun's bundled SQLite is far newer.) Root siblings partition on `parent_id IS NULL` **within the chat** — note `PARTITION BY chat_id, parent_id` handles the NULL group correctly.
- **`descendLatest(id)`** — loop: `SELECT id FROM messages WHERE parent_id = ? ORDER BY id DESC LIMIT 1` until none. Bounded by tree depth; no CTE needed.
- **`siblings`** for a root: `WHERE chat_id = ? AND parent_id IS NULL` (never `parent_id = NULL`).
- **`markStaleStreamingAsAborted`** — `SELECT id, metadata FROM messages WHERE status='streaming'` (partial index), then per row `UPDATE … SET status='aborted', metadata=json(…)`. Runs inside one transaction.
- JSON columns: `segments`/`state`/`metrics`/`metadata` stringified on write, parsed on read, `metadata` never `null` in DTOs (`{}` when the column is NULL).
- `updated_at` on `chats` is bumped by `finalize` paths (via `chats.update`), `PATCH`, state override, delete — **not** by `updateStreaming` flushes.

### 4.3 Settings storage

One row per top-level key (`provider`, `openrouter`, `generation`, `narrative`, `preamble`), `value` = JSON. `getAll()` = `Value.Default(AppSettingsSchema, Value.Clean(merged rows))`. `patch()` deep-merges per top-level key and writes only the touched keys in one transaction; `openrouter.apiKey: null` deletes the key from the stored object. Plaintext per ADR-006 §3.

---

## 5. Backend — Generation Engine (`backend/src/engine/`)

### 5.1 Layout

```
backend/src/engine/
├── contracts.ts     # GenerationHub, ProviderRegistry, GenerationHandle interfaces — Bun-free
├── hub.ts           # GenerationHubImpl: Map<messageId, Active>, subscribe/snapshot/abort/abortAll
├── generation.ts    # runGeneration(): the state machine (the only place provider events are consumed)
├── context.ts       # assembleContext(): rows → PromptContext ; nearestState(); activeNpcs()
├── providers.ts     # ProviderRegistryImpl: resolve(settings) → { provider, model, capabilities }
└── errors.ts        # ApiError(code, status, message, details?)
```

### 5.2 Hub contract

```ts
export interface Active { messageId: string; chatId: string; startedAt: number; snapshot(): string; }
export interface GenerationHub {
  activeForChat(chatId: string): Active | null;
  get(messageId: string): Active | null;
  /** Synchronous registration. Throws ApiError('generation_in_progress') if chatId already has one. */
  register(input: { messageId: string; chatId: string }): { controller: AbortController /* structural */; emit(ev: ChatStreamEvent): void; close(): void };
  /** Late subscribers receive nothing retroactively — call snapshot() first, then subscribe. Returns unsubscribe. */
  subscribe(messageId: string, cb: (ev: ChatStreamEvent) => void): () => void;
  abort(messageId: string, reason: 'user' | 'agency' | 'shutdown'): boolean;   // false if not active
  abortAll(reason: 'shutdown'): Promise<void>;                               // resolves when all finalized (≤ 2 s)
}
```
`register` inserts into the map immediately; `close()` emits nothing itself — the engine emits the terminal event **then** calls `close()`, which removes the entry and clears subscribers. `snapshot()` returns the current in-memory buffer (post-truncation), so a reattaching client gets everything, not just what was flushed.

### 5.3 Provider resolution (`providers.ts`)

`resolve(settings)`:
- `provider.id === 'mock'` → the singleton `MockLLMProvider` (production `intervalMs` 40); model = `settings.provider.model ?? 'mock:envelope-directive'`.
- `'openrouter'` → key = `settings.openrouter.apiKey ?? process.env.OPENROUTER_API_KEY`; none → `ApiError('provider_unconfigured', 409)`. Instances are cached **by key** (a `Map<string, OpenRouterProvider>`, max 2 entries) so a key change takes effect on the next request without restart. Model = `settings.provider.model ?? 'anthropic/claude-3.5-haiku'`.
- Returns `{ provider, model, contextLength: settings.generation.contextLength }`. (Per-model `contextLength` via `listModels()` is deferred — the setting is the budget.)

### 5.4 Context assembly (`context.ts`) — normative

`assembleContext({ chat, character, persona, settings, triggerId, capabilities, continuation? })`:
1. `pathRows = messages.path(triggerId)` (trigger = the user node being answered; for `/continue`, the assistant node's parent chain *plus* the node itself handled in step 6).
2. `history = pathRows.map(rowToHistoryTurn)` — `directorNote` from `metadata.directorNote`; status as stored. The builder already skips `streaming`/`error`/director-only rows.
3. `directorNote = triggerRow.metadata.directorNote` (regenerate inherits it automatically — the trigger is the same user node).
4. `sceneState = nearestState(pathRows)` = `state` of the last row in the path with non-null state, else `defaultState(character)`. Only narrative mode passes it to the builder (Block 7b), but it is **always** computed because `resolveState` needs `previous` at finalize.
5. `activeNpcs` = names of `npc` segments in the last **6 assistant rows** of the path, de-duplicated by normalized key, joined with `chat.metadata.npcs[key]` for `displayName`/`voice` (unregistered names still appear, with no voice).
6. `continuation` (only `/continue`): `{ partial: node.content }`; history is the path **excluding** the node itself (the builder places the partial as prefill or as the last assistant turn per §4.3 of Phase 2).
7. `budget = { contextLength, reservedCompletion: settings.generation.maxTokens }`, `provider = { prefill: capabilities.prefill }`, `preamble = settings.preamble`, `chat = chat.metadata`, `lorebookEntries = []` (deferred).
8. `PromptContext` is returned; `buildPrompt` runs in the route (its `PromptBudgetError` → `ApiError('prompt_budget_exceeded', 413, …, report)`).

Normalized NPC key: `name.trim().toLowerCase().replace(/\s+/g,' ')`.

### 5.5 The state machine (`generation.ts`) — normative

```ts
export interface GenerationJob {
  chatId: string; assistantId: string; parentId: string | null; userMessageId?: string;
  provider: LLMProvider; model: string; request: LLMRequest; promptTokensEstimated: number; droppedTurns: number;
  parseOptions: ParseOptions;                       // primaryCharacter, dialect, knownNames (chat npcs + persona), personaName
  previousState: StateVector; stateSchema?: Record<string, StateField>;
  resume?: { content: string };                     // /continue: buffer starts with this
  flushIntervalMs?: number;                         // default 500; tests use 20
}
export function runGeneration(job: GenerationJob, deps: { repos: Repositories; hub: GenerationHub; now?: () => number }): Promise<void>;
```

```
register(hub) ─► emit start ─► for await ev of provider.generate(request, controller.signal)
   token  → buffer += text (or drop if truncatedUpstream)
            emit token (unless truncatedUpstream)
            if text includes '\n' → agencyCheck()
            scheduleFlush()
   usage  → record; emit usage
   done   → finishReason recorded
   error  → error recorded
 finally → cancel pending flush timer → finalize() → emit done|error → hub.close()
```

- **`scheduleFlush()`** (trailing-edge throttle): if no timer pending, `setTimeout(flush, max(0, flushIntervalMs − (now − lastFlushAt)))`. **`flush()`**: `parseEnvelope(buffer, { …parseOptions, streaming: true })` → `updateStreaming(id, { content: buffer, segments })`; `lastFlushAt = now`; also runs `agencyCheck()` on the parse result. Only when `dirty`.
- **`agencyCheck()`**: `parseEnvelope(buffer, {streaming:true})`; if `truncatedAt === 'persona'` and not already truncated: `buffer = truncate(buffer)` (the parser's retained text — expose `ParseResult.truncatedIndex` or recompute by re-serializing; simplest: add `truncatedIndex: number | null` to `ParseResult` in shared, **additive**, bump `PARSER_VERSION` to 2), set `truncatedUpstream = true`, `hub.abort(id, 'agency')`. Tokens that arrive after (the provider will yield `done{aborted}` next) are dropped. The recorded `finishReason` for an agency abort is **`'stop'`** and the status is **`complete`** — the turn ended where the model should have stopped; `metadata.parse.truncatedAt = 'persona'` records why.
- **`finalize()`** runs in `finally`, wrapped in its own `try` so a repo failure still reaches a terminal status:
  1. `result = parseEnvelope(buffer, { …parseOptions, streaming: false })`.
  2. Status: error recorded → `error`; `finishReason === 'aborted'` and not agency → `aborted`; else `complete`.
  3. State: `status === 'error'` → `{ state: previousState, source: 'inherited' }`; otherwise `resolveState(previousState, result.statePatch, stateSchema)` (for `aborted` this naturally yields `inherited` when the block was unclosed — Decision D3: a *closed* block in an aborted stream is applied, it is valid data).
  4. `metrics = { provider: provider.id, model, promptTokensEstimated, promptTokens?, completionTokens?, durationMs, ttftMs, finishReason, droppedTurns }`.
  5. `metadata = { ...existing, parse: { dialect, parserVersion, adherent, warnings: codes, truncatedAt }, stateSource, stateWarnings, reasoning?, error?, continuations? }`.
  6. Single transaction: `messages.finalize(...)`; register new NPC names (`result.segments` kind `npc` with a name whose key is absent from `chat.metadata.npcs`) into `chat.metadata.npcs`; `chat.metadata.currentState = state`; `chats.update(updatedAt)`.
  7. Build `MessageView` (via `messages.get`) → emit `done{message}` or `error{message, error}` → `hub.close()`.
  8. If step 6 throws: attempt `messages.finalize(id, { status:'error', metadata.error = { message: 'finalize failed: …', recoverable: false } })` once; log; still emit `error` and close. (S3.)
- The engine never `await`s between `register` and `emit start`, and the route never `await`s between `hub.activeForChat` check and row insertion (S2).
- **Shutdown**: `index.ts` SIGINT/SIGTERM → `await hub.abortAll('shutdown')` (each active generation finalizes as `aborted`), then `db.close()`.

### 5.6 The SSE response (route side, shared helper `sseResponse(hub, messageId)`)

```
ReadableStream.start(controller):
   snap = hub.get(id)?.snapshot()  ── if not active → emit start{resumedFrom:0} + token(content) + done{view} and close
   unsub = hub.subscribe(id, ev => enqueue(frame(ev)); if terminal → close())
   (for reattach) emit start{resumedFrom: snap.length} then token{text: snap}   ← only in GET /messages/:id/stream
ReadableStream.cancel(): unsub()   ── nothing else. Never hub.abort(). (S1)
```
For `POST` generation routes the route registers its subscriber **before** calling `runGeneration` (which emits `start` synchronously after `register`), so the very first event is never missed. Headers identical to Phase 0.

---

## 6. Routes (`backend/src/routes/`) and `app.ts`

### 6.1 Surface (Decision D2)

The request listed `stop/regenerate/continue` under `/api/chats/:id/…`. The spec (`spec-message-lifecycle-and-api` §4) scopes them to the message, and that is the correct grain — a chat can have many swipe targets; "regenerate the chat" is ambiguous once branching exists. Send and state-override are chat-scoped (they act on the active leaf); everything that targets a node is message-scoped. The spec's `/api/chat/send` becomes the RESTful `POST /api/chats/:id/messages`.

| Method & path | Body / query | Result | Errors |
|---|---|---|---|
| `GET /api/characters` · `GET /:id` · `PUT /:id` (upsert `CharacterCard`, path id must equal body id) · `DELETE /:id` | | `CharacterCard` / list | `not_found`; DELETE with chats → 409 `chat_references` (FK RESTRICT surfaced) |
| `GET /api/personas` · `GET /:id` · `PUT /:id` · `DELETE /:id` | | `Persona` | same |
| `GET /api/settings` | | `SettingsView` | |
| `PATCH /api/settings` | `SettingsPatch` | `SettingsView` | 422 |
| `POST /api/chats` | `ChatCreate` | `201 ChatView` — also inserts the character's `firstMessage` as root assistant node (`status complete`, `narrativeRole character`, `segments` via parse, `state = defaultState(card)`, `stateSource 'initial'`, `metrics null`) when non-blank; `activeLeafId` = that root or `null` | `not_found` (character/persona) |
| `GET /api/chats` · `GET /:id` · `PATCH /:id` · `DELETE /:id` | | `ChatView` | DELETE while generating → 409 `chat_has_active_generation` |
| `GET /api/chats/:id/messages?before&limit=50` | | `MessageWithTree[]` ascending, active branch | |
| `POST /api/chats/:id/messages` | `SendMessageBody` | **SSE** (or `201 { message }` when `generate:false`) | 409 `generation_in_progress` · 400 `invalid_parent` (not in chat) · 400 `validation_failed` (`npc` without `senderName`; neither `message` nor `directorNote`) · 409 `provider_unconfigured` · 413 `prompt_budget_exceeded` |
| `PATCH /api/chats/:id/state` | `{ state }` | `{ state, warnings, messageId | null }` | |
| `GET /api/messages/:id` | | `MessageWithTree` | |
| `GET /api/messages/:id/stream` | | **SSE** reattach (snapshot + live, or immediate replay + done) | |
| `POST /api/messages/:id/stop` | | `200 { stopped: boolean, status }` idempotent | |
| `POST /api/messages/:id/regenerate` | | **SSE**; new assistant sibling (same `parent_id`), becomes active leaf | 400 `not_assistant_message` · 409 `generation_in_progress` · 400 `invalid_parent` (root assistant = greeting has no user parent → cannot regenerate; use send) |
| `POST /api/messages/:id/continue` | | **SSE**; same row reopened (`start{resumedFrom}`) | 400 `not_assistant_message` · 409 `not_leaf` · 409 if `status === 'streaming'` |
| `POST /api/messages/:id/select` | | `{ activeLeafId }` = `descendLatest(id)`; `currentState` cache refreshed | |
| `PATCH /api/messages/:id` | `MessagePatch` | `MessageWithTree` | 400 `serialize_failed` (RangeError) · 409 if streaming |
| `DELETE /api/messages/:id` | | `{ deleted: number, activeLeafId }` — subtree cascades; if the active leaf was inside, `activeLeafId := parentId` (may be `null`) | 409 if streaming or any descendant streaming |

### 6.2 Send flow (normative order)

```
validate body → load chat, character, persona, settings → hub.activeForChat(chat) ⇒ 409
→ parent = body.parentId ?? chat.activeLeafId (validate belongs to chat)
→ resolve provider (may 409) 
→ repos.transaction:
     userRow  = messages.insert({ role:'user', narrativeRole, senderName, senderId: persona.id, content: message ?? '', status:'complete', metadata: { directorNote? } })
     if !generate: chats.setActiveLeaf(userRow.id); return 201
     assistantRow = messages.insert({ role:'assistant', narrativeRole:'character', senderId: character.id, senderName: character.name, content:'', segments:[], state:null, status:'streaming' })
     chats.setActiveLeaf(assistantRow.id)
→ ctx = assembleContext(triggerId = userRow.id) ; built = buildPrompt(ctx)  (budget error → mark assistantRow error, 413)
→ request = { model, systemPrompt, history, assistantPrefill, stop, temperature…, maxTokens }
→ response = sseResponse(hub, assistantRow.id)   [subscribes]
→ void runGeneration(job)                        [not awaited; errors are internal to the engine]
→ return response
```
`parseOptions.knownNames` = `[character.name, ...Object.values(chat.metadata.npcs).map(n => n.displayName)]`; `personaName = persona.name`; `dialect = chat.metadata.envelopeDialect ?? 'directive'` in narrative mode, `'auto'` in classic.

**Regenerate** = same from "assistantRow" onward with `parent = target.parentId`, trigger = that parent user node. **Continue** = `reopenForContinue(id, stripOutOfBand(content))`, `previousState = nearestState(path excluding node)`, `resume.content = stripped`, `metadata.continuations += 1`, `metrics` merged (completion tokens summed, `durationMs` summed).

### 6.3 `app.ts`

`createApp({ repos, hub, providers })` composes sub-routers (`characters`, `personas`, `settings`, `chats`, `messages`) under `prefix: '/api'`, plus:
- `.onError(({ code, error, set }) => …)`: `ApiError` → its status + envelope; Elysia `VALIDATION` → 422 `validation_failed` with `details: error.all`; `NOT_FOUND` under `/api/` → 404 `not_found` (moves the Phase 0 JSON-404 from `index.ts` here; `index.ts` keeps only the SPA fallback for non-`/api` paths); anything else → 500 `internal` with a generic message (log the stack server-side only).
- `/api/health` unchanged (`db` block stable; add `activeGenerations: number`).
- `/api/chat/test-stream` **stays** (the fixture pipe remains the fastest way to debug SSE plumbing) but is marked dev-only: disabled with 404 when `NODE_ENV=production`.

`AppDeps = { repos: Repositories; hub: GenerationHub; providers: ProviderRegistry }` — all interfaces from Bun-free modules (S7).

### 6.4 Frontend (bare canvas, still no styling)

`lib/api.ts`: Eden `treaty<App>` for all JSON routes; `readSse<ChatStreamEvent>(url, init, cb, signal)` (generalized Phase 0 reader) for the four SSE routes. Do **not** use Eden for SSE routes (they return raw `Response`; Eden types them as `unknown`).

`+page.svelte` gains, in this order: character `<select>` + "New chat" → `POST /api/chats`; chat `<select>` from `GET /api/chats`; message list (`<pre>` per message: `[siblingIndex+1/siblingCount] role/narrativeRole: content`, with `◀ ▶` buttons calling `/select` on siblings, `↻` regenerate, `⏵` continue on the last assistant, `✕` delete); input + director note + narrativeRole select + Send; Stop button (visible while streaming) → `/stop`; live parse panel from Phase 2 driven by the token buffer; on `done`/`error` → replace the streaming message with `event.message` and refetch the page; a settings `<details>` with provider select, model, and an API-key input (`PATCH /api/settings`, shows `apiKeyHint`). A "Reattach" button calls `/messages/:id/stream` for the streaming message (proves S1 after a page reload mid-generation).

---

## 7. Tricky Traps & Failure Modes

### 7.1 Engine & concurrency

| Trap | Symptom | Guard |
|---|---|---|
| Passing `request.signal` to the provider "like test-stream did" | Closing the tab kills the generation; row stuck until recovery marks it aborted | `runGeneration` receives the hub's controller only; test S1 |
| `await` between the 409 check and the row insert | Two tabs sending simultaneously both pass the check | Synchronous section; test fires two `app.handle` calls without awaiting the first |
| Emitting `start` before the route subscribed | First event lost; client never learns `messageId` | Route subscribes before `runGeneration`; engine emits `start` synchronously after `register` |
| Flush timer fires after finalize | `updateStreaming` overwrites finalized `segments` with a stale streaming parse | `clearTimeout` in `finally` **before** `finalize`; `updateStreaming` additionally has `WHERE status='streaming'` (no-op after finalize) |
| Per-token `UPDATE` "because it's tiny" | Event loop stalls with 3 tabs streaming | S5 spy test |
| Agency truncation applied only at finalize | 500 ms of puppeteered text reaches the DB and the model keeps generating | Check on `\n` tokens + flush; upstream aborted immediately; `done.message.content` reconciles the client (S4) |
| Treating agency abort as `status: 'aborted'` | UI shows the turn as user-stopped; `/continue` nudges the model to keep puppeteering | Agency → `complete` + `parse.truncatedAt`; test |
| Provider emits `done{aborted}` *late* after `hub.abort` (mock sleeps) | Finalize waits | Phase 2 P4 (`abortableSleep`) bounds it to one tick; the OpenRouter idle timeout bounds real providers |
| Engine crash (e.g. `JSON.stringify` on a cyclic warning) | Row stuck `streaming`, hub entry leaks, chat locked with 409 forever | `finally` → `finalize` with its own `try`; `hub.close()` in an outer `finally`; S3 crash test with a throwing repo spy |
| Shutdown with active timers | Bun waits on pending `setTimeout`; Ctrl+C hangs or kills mid-write | `abortAll` then `db.close()`; recovery on next boot as belt-and-braces |
| `snapshot()` returning flushed DB content instead of the buffer | Reattach loses up to 500 ms of tokens | Snapshot is the in-memory buffer |
| Reattach `token{snapshot}` then live tokens arriving during subscription setup | Duplicate or missing tokens | Take snapshot and subscribe in the same synchronous block; live tokens emitted after that point are strictly after the snapshot |
| `previousState` computed from the *streaming* row itself on `/continue` | State patch merged onto itself; `inherited` when it should carry the parent's | Path excludes the node for `nearestState` |

### 7.2 Tree & repositories

| Trap | Symptom | Guard |
|---|---|---|
| `parent_id = NULL` in SQL | Root siblings never found | `IS NULL` + `chat_id` filter; test |
| Sibling ordinal computed across chats | Wrong `1/3` badges | `PARTITION BY chat_id, parent_id` |
| Deleting the active leaf's ancestor | `active_leaf_id` dangles | FK `SET NULL` + route sets it to `parentId`; test asserts `GET /chats/:id` returns the parent |
| Deleting a chat whose `active_leaf_id` is set | FK cycle error | v3 test: delete chat → no throw, messages gone |
| `descendLatest` picking the *oldest* child | Swipe selection lands on the wrong branch | `ORDER BY id DESC`; test with three children |
| `before` cursor from a *different* branch | Empty page or wrong slice | Cursor is only ever an id from the current branch's page; route validates `before` is on the path (CTE membership) else 400 `invalid_parent`… (reuse code with message "cursor not on active branch") |
| Greeting root has `role='assistant'` and no user parent | `regenerate` on it has no trigger | 400 `invalid_parent`; the builder's `[Scene begins.]` covers the send path |
| `chats.metadata.currentState` drifting from the leaf | Phase 4 renders stale bindings | Refreshed on finalize/select/delete/override; `db:check` compares to `nearestState(path(active_leaf))` |
| `narrativeMode` read from settings at request time | Changing the global default silently changes old chats | Persisted into `chat.metadata` at creation |
| `senderName` for `npc` user rows missing | Header `:::npc` unnamed in history | 400 `validation_failed` |
| `PATCH /messages/:id { content }` on an assistant row without recomputing state | Stale `state` inherited by later turns | Reparse + `resolveState(previousState from ancestors)`; **descendants are not recomputed** (documented: editing history does not replay state downstream in v1) |

### 7.3 Elysia / Eden / HTTP

| Trap | Symptom | Guard |
|---|---|---|
| Elysia parses an empty POST body with `Content-Type: application/json` | 400/422 on `/stop`, `/regenerate` | Those routes declare no `body:` schema; frontend sends no body/headers (Phase 0 trap) |
| Using Elysia's generator/`sse()` for one route "for convenience" | Framing differs (`id:` lines), Eden types diverge | S9: all SSE via `sseResponse()`; a route test asserts frame bytes |
| Elysia `normalize` stripping unknown keys before our `validate()` | Fine — same policy as `Value.Clean` | No action; but don't set `additionalProperties: false` in shared schemas |
| Eden Treaty path params with `:id` containing URL-unsafe chars | Encoding mismatch | `Id` pattern forbids them |
| Eden on SSE routes | `data` typed `unknown`, body consumed as text | Use `readSse`; document in `api.ts` |
| `onError` in `app.ts` vs SPA fallback in `index.ts` | `/api/nope` served `index.html` or `/chat/x` served JSON 404 | `app.onError` handles only `/api/*` `NOT_FOUND`; `index.ts` handles the rest; Phase 0 curl checks re-run |
| Returning a `Response` skips `set.status` | 201 for `generate:false` ignored | Return `new Response(JSON, { status: 201 })` explicitly or use `set.status` on a plain object return (not both) |
| Error thrown *after* the SSE `Response` was returned | Cannot change status; client sees a dead stream | All validation and prompt building happen **before** `sseResponse()`; the engine reports failures as `error` events |
| `PromptBudgetError` after the assistant row exists | Row stuck `streaming` | Route finalizes it as `error` inside the same transaction rollback path, or creates the row *after* building — choose: **build first, then insert both rows** (the user row is needed for the path; use an in-memory `HistoryTurn` for it) — simpler: insert user row, build, then insert assistant row; on budget error the user row remains (it is valid input), no assistant row is created, 413 returned |

### 7.4 Settings & secrets

| Trap | Symptom | Guard |
|---|---|---|
| `GET /api/settings` returning the key "for the input's value attribute" | Key in browser memory, devtools, proxies | Mask; `apiKeySet`/`apiKeyHint` (last 4 chars) |
| `PATCH` with `apiKey: ''` | Key cleared accidentally, or empty string stored | `''` → 422; `null` clears; omitted keeps |
| Env key visible as "settings" | User thinks it's persisted | `source: 'env'` in the view |
| Provider instance cached forever | Key rotation needs restart | Cache by key |
| `error.message` from provider persisted to `metadata.error` | Would persist a key if P7 ever regressed | P7 test remains; route test with a fake OpenRouter body echoing the key asserts the stored row lacks it |

---

## 8. Definition of Done & Verification

### 8.1 Acceptance criteria

1. `bun run typecheck` 3/3 clean; `svelte-check` 0/0 with `App` now spanning ~25 routes and `AppDeps` carrying hub/providers via interfaces (S7).
2. `bun run test` green: shared (new DTO schema tests), backend (migrations v3, chats/messages/settings repositories, engine, context, recovery, routes).
3. **Fresh boot** logs `migrations: 2 → 3` (or `0 → 3`), `recovered 0 stale generations`, `[providers] mock ready, openrouter <ready|disabled>`; `db:check` passes with the new audits (no `streaming` rows, `active_leaf_id` in-chat, `currentState` ≡ leaf state).
4. **curl script §8.3 passes end-to-end** against the mock provider: create chat → greeting present as root → send streams (`start` first, tokens paced, exactly one `usage`, terminal `done` with `message.status='complete'`, `state` resolved, `parse.adherent=true`) → page shows 3 messages with `siblingCount` → regenerate produces a sibling (`2/2`), active leaf moves → `select` the first sibling → `activeLeafId` returns → continue on the leaf reopens it (`start.resumedFrom > 0`, `continuations: 1`) → stop mid-stream yields `status: 'aborted'`, `stateSource: 'inherited'` → `persona-violation` script yields `complete` with `parse.truncatedAt: 'persona'` and content free of persona text → `error` script yields `status: 'error'` and the chat is immediately sendable again → state override reflected in `GET /chats/:id` and in the next prompt's Block 7b (assert via `MockLLMProvider.calls` in the route test; via `smoke` output live).
5. **S1 demonstrated**: start a send with curl, kill curl at 0.3 s, `GET /api/messages/:id` after 3 s shows `complete` with full content; `GET /api/messages/:id/stream` on a *streaming* message (second terminal) replays the snapshot and continues live.
6. Two concurrent sends to one chat: second returns 409 `generation_in_progress`; two concurrent sends to two chats both stream.
7. `GET /api/settings` never contains the key; `PATCH` with a key then `provider.id='openrouter'` routes the next send to OpenRouter (live smoke, evidence-not-gate as in Phase 2; the offline route test with fake fetch is the gate).
8. Browser bare canvas performs the full loop (create, send, stop, regenerate, swipe, continue, override, reattach after reload) with no console errors; `done` reconciliation replaces streamed text with `message.content` (visible on the persona-violation script).
9. Production (`build && start`): everything above at `:3000`; `/api/chat/test-stream` returns 404 in production; Phase 0 checks (`/`, `/chat/abc`, `/api/nope`) still hold.

### 8.2 Required tests (normative list)

**`packages/shared/test/schemas-api.test.ts`** — `SendMessageBody` (npc requires senderName is a route rule, not schema — assert schema accepts it), `MessagePatch` union discrimination, `SettingsPatch` (`apiKey: null` valid, `''` invalid, unknown keys cleaned), `DEFAULT_SETTINGS` equals the documented defaults, `MessageViewSchema` accepts a hand-built view.

**`backend/test/migrations.test.ts`** (+) — 0→3; v2 with data →3 backfills `active_leaf_id`; cycle delete; `foreign_key_check` empty.

**`backend/test/repositories/chats.test.ts`** — create/get/list ordering by `updated_at`; `setActiveLeaf`; delete cascades messages; `messageCount`.

**`backend/test/repositories/messages.test.ts`** — build tree `G(root asst) → U1 → {A1, A2 → U2 → A3}` plus `A1 → U1b`: `path(A3)` = `[G,U1,A2,U2,A3]`; `siblings(A2)` = `[A1,A2]` with ordinals `0,1`; root siblings via `IS NULL`; `descendLatest(U1)` = `A3` (newest child chain), `descendLatest(A1)` = `U1b`; `pageActiveBranch(leaf=A3, limit 2)` → `[U2,A3]`, `before=U2` → `[U1,A2]`, `before=U1` → `[G]`, then `[]`; `hasChildren`; `updateStreaming` no-op when not streaming; `finalize` writes all columns; `markStaleStreamingAsAborted` returns ids and sets `recovered`; `remove(A2)` deletes `A2,U2,A3` only; `updated_at` untouched by `updateStreaming`.

**`backend/test/repositories/settings.test.ts`** — defaults on empty table; partial patch merges; `apiKey` set/keep/clear; `getAll` never returns invalid shape after a corrupt row (falls back to default for that key with a warning).

**`backend/test/engine/generation.test.ts`** (in-memory DB, `MockLLMProvider({ intervalMs: 5 })`, `flushIntervalMs: 20`, repo spy wrapper):
- Happy path per script: row lifecycle `streaming → terminal`; `content === script.text` (or truncated); `segments`/`state`/`metadata.parse` match `parseEnvelope(text)`; `metrics.promptTokens` from usage; exactly one terminal event; `done.message` deep-equals `messages.get(id)` (S4).
- S5: `updateStreaming` calls ≤ ⌈durationMs/20⌉ + 1; zero calls when the stream completes within one interval? (no — at least the finalize; assert `finalize` called once).
- `persona-violation`: `hub.abort` called with `'agency'` before the provider's last chunk; status `complete`; `parse.truncatedAt`; content lacks `"I draw my sword."`; no `token` event after truncation.
- `error` script: status `error`, `metadata.error`, state inherited, `error` event terminal.
- `truncated` script (`done{length}`): `state_unclosed` warning, `stateSource: 'inherited'`, `metrics.finishReason: 'length'`.
- Stop: abort at ~mid-stream → status `aborted`, `finishReason: 'aborted'`, next event after abort is terminal.
- S1: subscribe, unsubscribe after 2 tokens → generation completes, row `complete`.
- Late subscriber: `snapshot()` + subscribe after 3 tokens → concatenation of snapshot + received tokens equals final content.
- S3 crash: repo spy makes `finalize` throw once → second attempt marks `error`, hub entry removed, terminal `error` event emitted; repo spy makes `updateStreaming` throw → generation continues, finalize succeeds (flush errors are logged, not fatal).
- NPC registration: after `envelope-directive`, `chat.metadata.npcs['apprentice'].displayName === 'Apprentice'`; second run doesn't duplicate.
- Continue: `resume.content` prefix preserved; `resumedFrom` equals its length; final content starts with the prefix.

**`backend/test/engine/context.test.ts`** — history from path (branch isolation: A1's branch never sees A2); `nearestState` skips user rows and error rows; `defaultState` when none; `activeNpcs` from last 6 assistant rows with voice from registry; `directorNote` from trigger only; regenerate context ≡ original send context (byte-equal `buildPrompt` output except nothing); continuation excludes the node from history.

**`backend/test/recovery.test.ts`** — insert two `streaming` rows, boot sequence function → both `aborted` with `recovered: true`, `stateSource: 'inherited'`, log count.

**`backend/test/routes/*.test.ts`** (via `app.handle(new Request(...))`, in-memory DB, mock provider `intervalMs: 5`; SSE parsed with a copy of the Phase 0 reader):
- Error envelope shape for 404, 422 (schema), 409, 413, 500 (inject a throwing repo) — and that 500 bodies contain no stack.
- Chats: create with greeting → root exists, `activeLeafId` set; create with blank `firstMessage` → no root; unknown character → 404; `narrativeMode` persisted from settings default; PATCH title; DELETE while generating → 409; DELETE ok → messages gone.
- Send: full SSE sequence assertions from §8.1 #4; `generate:false` → 201, no assistant row, leaf = user row; `directorNote` only → user row `content ''`, generation runs (builder gets `[Continue the scene.]` — assert via `MockLLMProvider.calls[0].history` last user content); `npc` without `senderName` → 400; `parentId` from another chat → 400; concurrent → 409 (fire two `handle` calls, await both); budget: settings `contextLength: 1024`, `maxTokens: 1000` → 413, no assistant row, user row present.
- Stop: idempotent 200 on non-streaming; streaming → `aborted`.
- Regenerate: sibling `2/2`, leaf moved, `directorNote` inherited (assert `calls[n].history` bottom block contains it), greeting root → 400, user id → 400, streaming sibling → 409.
- Continue: prefill provider → `calls[n].assistantPrefill === stripped`; `MockLLMProvider({ prefill: false })` → nudge in history; non-leaf → 409; `resumedFrom`.
- Select: three siblings, select first → `activeLeafId === descendLatest(first)`; page reflects new branch; `currentState` cache updated.
- PATCH message: `content` on assistant → reparsed segments and `state` recomputed from ancestors; `segments` → serialized in chat dialect and round-trips; header-in-text → 400 `serialize_failed`; `edited.count` increments.
- DELETE message: subtree count; active leaf → parent; streaming descendant → 409.
- State override: `resolveState` applied (alias `angry` → `furious`, clamp), `stateOverrides` appended, `GET /chats/:id.metadata.currentState`, next send's system prompt contains `[Scene state: mood=furious…` (via `calls`).
- Pagination: 7-message branch, `limit=3` twice with `before` → correct windows, ascending order, `siblingIndex/Count` decorated; cursor off-branch → 400.
- Settings: GET masks; PATCH key → `apiKeySet: true`, hint = last 4; `null` clears; `provider.id='openrouter'` with no key → send 409 `provider_unconfigured`; with key and fake fetch (inject via `ProviderRegistry` test hook) → OpenRouter request body has `stream:true`; fake error body echoing the key → stored `metadata.error.message` lacks it.
- Reattach: `GET /messages/:id/stream` during generation → `start{resumedFrom}`, `token{snapshot}`, then live tokens, terminal; after completion → replay + `done` immediately.
- Production gate: with `NODE_ENV=production` injected into `createApp` options, `/api/chat/test-stream` → 404.
- Frame bytes: one SSE response's raw bytes match `/^(data: .+\n\n)+$/` with no `event:`/`id:` lines.

### 8.3 Step-by-step verification

```bash
bun install && bun run typecheck && bun run test
bun run db:reset --yes; bun run dev
#   log: migrations: 0 → 3 · seeded … · recovered 0 stale generations · [providers] mock ready, openrouter disabled (no key)

B=http://127.0.0.1:5173/api
CHAT=$(curl -s -X POST $B/chats -H 'content-type: application/json' -d '{"characterId":"eldrin-the-mage"}' | jq -r .id)
curl -s "$B/chats/$CHAT/messages" | jq '.[] | {role, narrativeRole, status, siblingCount, state}'        # greeting root, state = defaultState

# send (mock envelope-directive by default)
curl -sN -X POST "$B/chats/$CHAT/messages" -H 'content-type: application/json' -d '{"message":"Hello?"}' \
  | while IFS= read -r l; do printf '%s  %s\n' "$(date +%T.%3N)" "$l"; done
#   start{messageId,userMessageId} → paced tokens → usage → done{message.status:"complete", message.state.mood:"calm", message.metadata.parse.adherent:true}
ASST=$(curl -s "$B/chats/$CHAT/messages" | jq -r '.[-1].id')

# swipes
curl -sN -X POST "$B/messages/$ASST/regenerate" > /dev/null
curl -s "$B/chats/$CHAT/messages" | jq '.[-1] | {siblingIndex, siblingCount}'                             # {1, 2}
curl -s -X POST "$B/messages/$ASST/select" | jq .                                                          # activeLeafId = $ASST
curl -sN -X POST "$B/messages/$ASST/continue" | head -1                                                    # start{resumedFrom: >0}

# S1: disconnect does not abort
curl -sN -X POST "$B/chats/$CHAT/messages" -H 'content-type: application/json' -d '{"message":"again"}' & sleep 0.3; kill %1
sleep 3; curl -s "$B/chats/$CHAT" | jq '{activeLeafId, activeGenerationMessageId}'; curl -s "$B/chats/$CHAT/messages" | jq '.[-1].status'   # "complete"

# stop + agency + error via mock model selection
curl -s -X PATCH $B/settings -H 'content-type: application/json' -d '{"provider":{"model":"mock:persona-violation"}}' > /dev/null
curl -sN -X POST "$B/chats/$CHAT/messages" -H 'content-type: application/json' -d '{"message":"go"}' | tail -1 | jq '.message | {status, content, parse: .metadata.parse.truncatedAt}'
curl -s -X PATCH $B/settings -H 'content-type: application/json' -d '{"provider":{"model":"mock:error"}}' > /dev/null
curl -sN -X POST "$B/chats/$CHAT/messages" -H 'content-type: application/json' -d '{"message":"go"}' | tail -1 | jq '.type, .message.status'   # "error", "error"
curl -s -X PATCH $B/settings -H 'content-type: application/json' -d '{"provider":{"model":"mock:envelope-directive"}}' > /dev/null

# state override + concurrency + secrets
curl -s -X PATCH "$B/chats/$CHAT/state" -H 'content-type: application/json' -d '{"state":{"mood":"angry","affinity":99}}' | jq .   # mood furious, affinity 10, warnings
curl -sN -X POST "$B/chats/$CHAT/messages" -H 'content-type: application/json' -d '{"message":"a"}' > /dev/null &
sleep 0.1; curl -si -X POST "$B/chats/$CHAT/messages" -H 'content-type: application/json' -d '{"message":"b"}' | head -1   # 409
wait
curl -s -X PATCH $B/settings -H 'content-type: application/json' -d '{"openrouter":{"apiKey":"sk-or-test-1234"}}' | jq .openrouter   # apiKeySet true, hint "1234", no key
curl -s $B/settings | grep -c 'sk-or' ; echo "(expect 0)"

bun run db:check          # + no streaming rows · active_leaf in-chat · currentState ≡ leaf
# browser: full loop per §8.1 #8 (reload mid-stream, Reattach)
# prod: bun run build && bun run start → repeat send/regenerate at :3000; /api/chat/test-stream → 404
```

### 8.4 Explicit scope boundaries — deferred

Do **not** introduce in Phase 3:
- **Phase 4 (UI):** Tailwind, `<MessageTurn />`, `/chat/[chatId]` route, theme injection, state-binding evaluation, markdown/DOMPurify, virtualized list, `BroadcastChannel` settings sync, rAF parse throttling. The page remains `<pre>`s, `<select>`s and `<button>`s.
- **Later:** character import/export (JSON/PNG) and the PNG parser; lorebook matching; example-dialogue dialect conversion; downstream state replay on edits; per-model `contextLength` from `listModels`; `delta.reasoning` mapping; local providers; the optional `FORMATAVERN_PASSWORD` gate; backup/checkpoint tooling; multi-persona per chat; WebSockets.

What Phase 3 hands to Phase 4: `MessageView` rows already carrying `segments`, `state`, and `parse` so `<MessageTurn />` never parses persisted messages; a `ChatStreamEvent` stream whose `done` is self-reconciling; `chats.metadata.currentState` for the state-binding cascade; sibling ordinals for swipe UI; and a Bun-free `App` type for Eden across every JSON route.

---

## 9. Execution Order

1. **shared**: DTO schemas (`message`, `chat`, `settings`, `api`), `ChatStreamEvent`, additive `ParseResult.truncatedIndex` (+ `PARSER_VERSION = 2`, re-run the Phase 2 suites), bump `SHARED_VERSION`.
2. **backend db**: migration v3 + tests; `chats`/`messages`/`settings` repositories + tests (tree tests first — they define the CTEs).
3. **engine**: `hub.ts` → `generation.ts` → `engine.test.ts` (S1–S5 before any route exists); `context.ts` + tests; `providers.ts`; `recovery` wired into `index.ts`.
4. **routes**: `errors.ts` + `onError` envelope → `settings` → `characters/personas` → `chats` → `messages` (send → stop → regenerate → continue → select → patch → delete → stream). Route tests as each lands.
5. **`index.ts`**: boot order `openDatabase → runMigrations → recover → seedIfEmpty → createProviders → hub → createApp → static → listen`; shutdown `abortAll → close`. `bun run typecheck` — the S7 check.
6. **frontend** bare canvas; `db:check` audits; §8.3 end-to-end; attach the curl transcript (send, S1 disconnect proof, persona-violation `done` payload, 409 race) and the browser reattach screenshot to the PR.