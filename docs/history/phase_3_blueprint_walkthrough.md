# Phase 3 Walkthrough: Elysia API Layer & Narrative State Machine

FormaTavern Phase 3 is fully implemented, verified, and passing all tests across the monorepo.

---

## 1. Executive Summary & Verification Highlights

| Check | Target | Result |
|---|---|---|
| **TypeScript Monorepo Typecheck** | 3 packages (`packages/shared`, `backend`, `frontend`) | **0 errors, 0 warnings** across all 3 packages |
| **Monorepo Test Suite** | Shared DTOs, migrations v3, repositories, engine, routes | **202 / 202 tests passing** (75 shared + 127 backend) |
| **Production Build** | `bun run build` (SvelteKit static adapter) | **Clean production build** (`build/` generated in 10.4s) |
| **Database Audits** | `bun run db:check` | **WAL, FK=1, v3 schema, no stale streaming rows, active_leaf in-chat, currentState ≡ leaf** |
| **Live Curl Sequence (§8.3)** | Mock provider end-to-end against `:3000` | **All steps verified**: create chat → greeting root → streaming send → regenerate (1/2, 2/2) → select sibling → continue (`resumedFrom: 327`) → agency truncation → state override (`mood: furious, affinity: 10`) → 409 concurrency lock → secret masking |

---

## 2. Invariants Enforced & Verified

| Invariant | Description | Verification Evidence |
|---|---|---|
| **S1: Disconnect Immunity** | Client disconnect never aborts generation. Generation is detached and owned by `GenerationHub`. `request.signal` is never passed to provider. | Verified in `test/engine/generation.test.ts` ("unsubscribe doesn't abort") and live server execution. |
| **S2: Single Active Generation per Chat** | Synchronous check-and-register atomic on single thread; second send returns 409. | Verified in `test/routes/messages.test.ts` and live concurrent `Promise.all` (`r1: 409, r2: 200`). |
| **S3: Terminal Status Guarantee** | Every streaming assistant row reaches terminal status (`complete \| aborted \| error`). Leftovers recovered on boot. | Verified in `test/recovery.test.ts` and `test/engine/generation.test.ts` crash test. |
| **S4: DB Authoritative, SSE Advisory** | Final `done`/`error` carries authoritative `MessageView`; agency truncation reconciles server-side. | Verified in `test/engine/generation.test.ts` and live curl against `mock:persona-violation` (`truncatedAt: "persona"`). |
| **S5: Bounded Write Rate** | 500ms trailing-edge throttle; no per-token SQLite writes. | Verified in `test/engine/generation.test.ts` with repository call-counting spy. |
| **S6: Branch Derivability** | Active branch derivable from `chats.active_leaf_id` + `messages.parent_id` alone. | Verified in `test/repositories/messages.test.ts` (recursive CTEs) and `db:check`. |
| **S7: Pure Contracts (`app.ts` Bun-Free)** | Routes receive Repositories, Hub, and Providers through Bun-free contracts. | Verified via `svelte-check` over `treaty<App>`. |
| **S8: Secret Protection** | `GET /api/settings` masks keys; provider errors scrub keys. | Verified in `test/routes/settings.test.ts` and live curl (`grep -c sk-or` returns 0). |
| **S9: Byte-Exact Wire Contracts** | SSE frames are strictly `data: <JSON>\n\n`, LF only, no `event:` or `id:` lines. | Verified in `test/routes/messages.test.ts` with frame parser. |

---

## 3. Implemented Components

### 3.1 `@formatavern/shared`
- `envelope/types.ts` & `envelope/index.ts`: Added additive `truncatedIndex: number | null` to `ParseResult`, `PARSER_VERSION = 2`, exported `serializeEnvelope`.
- `schemas/chat.ts`: `ChatCreateSchema`, `ChatPatchSchema`, `ChatViewSchema`.
- `schemas/message.ts`: `MessageStatusSchema`, `StateSourceSchema`, `ParseReportSchema`, `MessageMetricsSchema`, `MessageMetadataSchema`, `MessageViewSchema`, `SendMessageBodySchema`, `MessagePatchSchema`, `StatePatchBodySchema`, `MessagesPageQuerySchema`, `MessageWithTree`.
- `schemas/settings.ts`: `AppSettingsSchema`, `DEFAULT_SETTINGS`, `SettingsViewSchema`, `SettingsPatchSchema`.
- `schemas/narrative.ts`: `StateOverrideSchema`, `StateOverride`, added `stateOverrides` to `ChatMetadataSchema`.
- `schemas/api.ts`: `ApiErrorSchema`, `ApiErrorCode`.
- `types/chatStream.ts`: `ChatStreamEvent` (types: `start`, `token`, `usage`, `done`, `error`).
- Version bumped to `0.3.0-phase3`.

### 3.2 Backend Database & Migration v3 (`chat_branching`)
- `db/migrate.ts`: Migration 3:
  - `ALTER TABLE chats ADD COLUMN active_leaf_id TEXT REFERENCES messages(id) ON DELETE SET NULL;`
  - `CREATE INDEX IF NOT EXISTS idx_messages_streaming ON messages(status) WHERE status = 'streaming';`
  - `CREATE INDEX IF NOT EXISTS idx_messages_parent_id_id ON messages(parent_id, id);`
  - Backfill query: newest message per chat sets initial `active_leaf_id`.
- `db/contracts.ts`: Added `ChatRow`, `MessageRow`, `MessageWithTree`, `ChatRepository`, `MessageRepository`, `SettingsRepository`, `Repositories`.
- `db/repositories/chats.ts`: SQLite repository for chats with atomic update and active leaf selection.
- `db/repositories/messages.ts`: SQLite message tree repository:
  - Recursive CTE for `path(leafId)`
  - Window-function query for `pageActiveBranch` with `ROW_NUMBER()` and `COUNT()` over partitions
  - Bounded-loop `descendLatest(id)`
  - Safe cascade deletion
  - `updateStreaming` guarded by `WHERE status = 'streaming'`
  - Crash recovery `markStaleStreamingAsAborted`

### 3.3 Engine & Providers
- `src/engine/errors.ts`: Centralized `ApiError`.
- `src/engine/hub.ts`: `GenerationHubImpl` with in-memory snapshot, synchronous register, multi-subscriber fanout, and signal-checked active tracking.
- `src/engine/providers.ts`: `ProviderRegistryImpl` with LRU-2 cache for `OpenRouterProvider` and singleton `MockLLMProvider`.
- `src/engine/context.ts`: Pure context assembly (`assembleContext`, `nearestState`, `normalizeNpcKey`).
- `src/engine/generation.ts`: `runGeneration` state machine consuming LLM events with 500ms trailing throttle, agency check on newline, authoritative DB finalization, and `hub.close()`.
- `src/engine/recovery.ts`: Boot-time recovery for leftover streaming messages.

### 3.4 Elysia API Layer
- `src/routes/sse.ts`: Byte-exact `sseResponse` helper.
- `src/routes/settings.ts`: Settings router with secret masking (`apiKeyHint`).
- `src/routes/characters.ts`: Character CRUD with FK RESTRICT guard.
- `src/routes/personas.ts`: Persona CRUD.
- `src/routes/chats.ts`: Chat CRUD, send message, state override, active branch pagination.
- `src/routes/messages.ts`: Message tree lifecycle (stop, regenerate, continue, select, patch, delete, stream reattach, siblings query).
- `src/app.ts`: Elysia app with `.onError` error envelopes, `/api/health` with `activeGenerations`, production gate for test-stream.
- `src/index.ts`: Boot order with recovery, graceful shutdown.

### 3.5 Frontend Bare Canvas (`frontend/src/routes/+page.svelte`)
- Character dropdown + "New chat" creation.
- Chat dropdown + delete chat button.
- Message tree display with:
  - `[siblingIndex+1/siblingCount]` indicators
  - Swipe buttons (`◀ ▶`) calling `/select` on siblings
  - Regenerate button (`↻`)
  - Continue button (`⏵`) on active leaf assistant turns
  - Delete button (`✕`)
- Live generation display with token counter, streaming text buffer, live isomorphic parser preview, and `⏹ Stop` button.
- Send turn input form with director's note, narrative role selector, and NPC name input.
- Reattach button calling `GET /messages/:id/stream` via `readSse`.
- State override panel (`PATCH /api/chats/:id/state`).
- Settings drawer (`<details>`) with provider selector, model, API key hint, and generation knobs.
- Preserved diagnostic fixture stream (`/api/chat/test-stream`).

---

## 4. Verification Evidence

### 4.1 Typecheck
```
$ bun run typecheck
$ tsc --noEmit -p . (packages/shared)
$ tsc --noEmit -p . (backend)
$ svelte-kit sync && svelte-check --tsconfig ./tsconfig.json (frontend)
Loading svelte-check in workspace: s:\WorkSpace\Git Workspace\FormaTavern\frontend
Getting Svelte diagnostics...

svelte-check found 0 errors and 0 warnings
```

### 4.2 Test Suite (202 / 202 passing)
```
Ran 75 tests across 8 files in packages/shared. [183.00ms]
Ran 127 tests across 20 files in backend. [3.11s]
Total: 202 pass, 0 fail.
```

### 4.3 Database Check
```
$ bun scripts/check.ts
journal_mode=wal
foreign_keys=1
user_version=3
integrity_check=ok
foreign_key_check=empty
messages columns: id, chat_id, parent_id, sender_id, role, content, status, created_at, metrics, metadata, narrative_role, sender_name, segments, state
no_streaming_rows=ok
active_leaf_integrity=ok
current_state_integrity=ok
counts: 2 characters, 1 personas
2/2 characters valid, 1/1 personas valid
```
