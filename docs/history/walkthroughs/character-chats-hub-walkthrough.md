# Character Chats Hub (`/chats`) — Walkthrough

This walkthrough documents the design, implementation, and verification of the dedicated **Character Chats Hub** (`/chats`). The hub provides a first-class, scalable conversation management surface with keyset pagination, zero-latency character accordions, high-performance SQLite aggregations, and primary navigation integration.

---

## 1. Architectural Summary & Invariant Compliance

| Requirement / Invariant | Implementation Mechanism |
|---|---|
| **Invariant P1 (Keyset Pagination)** | Keyset pagination using `(sort_value, id)` with opaque base64url cursor (`[sortVal, id]`), `limit + 1` lookahead, and deterministic `id ASC` secondary tiebreak. |
| **Invariant P4 & U4 (Showcase Containment & DOM Budget)** | The accordion renders only a lightweight excerpt (banner/avatar, tagline, 2–3 line description snippet, action buttons). Full `ShowcaseBody` rendering with author CSS remains strictly on `/character/:id`. |
| **Zero-Latency Accordions** | `GET /api/chats/hub` bundles the top 3 most recent chat summaries per character in the initial payload. Expanding an accordion requires 0ms and zero network requests. Overflow chats are lazily loaded via `GET /api/chats?characterId=:id`. |
| **Route Precedence & Pre-Matching** | In `backend/src/routes/chats.ts`, both `GET /hub` and `DELETE /by-character/:characterId` precede generic parametric `/:id` handlers to prevent Elysia capturing static segments as IDs. |
| **Bulk Clear Active Generation Guard** | `DELETE /by-character/:characterId` scans `hub.activeForChat()` across all character chats, rejecting with `409 chat_has_active_generation` if any stream is active, and cascades message deletion via foreign keys. |
| **Search Scoping** | Character attributes (`name`, `tagline`, `description`, `creator`, `tags`) match via `characters_fts` (FTS5) when available; conversation titles match via parameterized `LIKE ... ESCAPE '\'` with escaped `%_\` wildcards. |
| **Invariant C14 (Surface Completeness)** | Rooted in bare `<ShellSurface>` (the component takes no `surfaceId` prop; same usage as the foyer), utilizing `--chrome-*` tokens for neutral styling and containing all dialogs within surface bounds. |

---

## 2. Changes Made

### 2.1 Shared Domain Package (`packages/shared`)
- **File:** [`packages/shared/src/schemas/chat.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/schemas/chat.ts)
  - Added `ChatHubRecentItemSchema`: `id`, `title`, `messageCount`, `updatedAt`, `activeGenerationMessageId`.
  - Added `ChatHubCharacterSchema`: composite of `CharacterSummarySchema` and optional `description`.
  - Added `ChatHubGroupSchema`: `character`, `chatCount`, `lastChatAt`, `recentChats`.
  - Added `ChatHubSortSchema`: `'recent' | 'chats' | 'name'`.
  - Added `ChatHubQuerySchema`: `limit` (clamped 1..50, default 20), `cursor`, `q`, `sort`.
  - Added `ChatHubResponseSchema`: `items`, `nextCursor`, `totalCharacters`, `totalChats`.

### 2.2 Backend Storage & Route Handlers (`backend`)
- **File:** [`backend/src/db/contracts.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/db/contracts.ts)
  - Extended `ChatRepository` with:
    - `hub(opts?: ChatHubQuery): ChatHubResponse`
    - `removeByCharacter(characterId: string): { deleted: number }`
- **File:** [`backend/src/db/repositories/chats.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/db/repositories/chats.ts)
  - Implemented `hub()` on `SQLiteChatRepository`:
    - Global totals: `COUNT(DISTINCT primary_character_id)` and `COUNT(*)` from `chats`.
    - CTE `char_stats` querying `chats` grouped by `primary_character_id` with `COUNT(*)` and `MAX(updated_at)`.
    - Keyset sorting and base64url cursor encoding/decoding.
    - FTS5 character matching joined with chat title `LIKE ... ESCAPE '\'`.
    - Window function `ROW_NUMBER() OVER (PARTITION BY primary_character_id ORDER BY updated_at DESC)` retrieving top 3 chats per character in a single query.
  - Implemented `removeByCharacter()`:
    - Atomically deletes all chats for a character within a transaction; message rows cascade via SQLite foreign key `ON DELETE CASCADE`.
- **File:** [`backend/src/routes/chats.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/routes/chats.ts)
  - Registered `GET /hub` before `GET /:id`, dynamically annotating `activeGenerationMessageId` from `hub.activeForChat(chat.id)`.
  - Registered `DELETE /by-character/:characterId` before `DELETE /:id`, verifying that no active generation is in progress before executing deletion.

### 2.3 Backend Test Suite
- **File:** [`backend/test/routes/chatsHub.test.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/test/routes/chatsHub.test.ts)
  - 9 automated test suites covering:
    - Empty state when 0 chats exist.
    - Character grouping with eager top-3 recent chats and global totals.
    - Keyset cursor pagination and limit clamping (1..50).
    - Malformed and corrupt cursor recovery.
    - Sorting by `recent`, `chats`, and `name`.
    - Search filtering across character fields and chat titles with wildcard escaping (`100%`, `_`).
    - Dynamic annotation of `activeGenerationMessageId` on streaming chats.
    - Bulk deletion with active generation guarding (`409 chat_has_active_generation`).
    - Route precedence ensuring `/hub` and `/by-character/:id` are not captured as `/:id`.

### 2.4 Frontend Application (`frontend`)
- **File:** [`frontend/src/lib/state/chatsHub.svelte.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/state/chatsHub.svelte.ts)
  - Svelte 5 runes store (`ChatsHubStore`): manages `items`, `totalCharacters`, `totalChats`, `cursor`, `loading`, `loadingMore`, `sort`, `query`, `expandedIds`, and `overflowChats`.
- **File:** [`frontend/src/lib/components/chats/ChatHubCharacterRow.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/chats/ChatHubCharacterRow.svelte)
  - Accordion item component with collapsed header row and expanded interior.
  - Collapsed state: avatar, accent dot, character name, tagline snippet, total chat count, relative timestamp, and chevron.
  - Expanded interior: mini-showcase (tagline, line-clamped 3-line description snippet, tag pills, profile link, new chat button, clear button) and recent chat cards.
  - Overflow button: *"View all X conversations"* triggers lazy retrieval of full chat list.
- **File:** [`frontend/src/lib/components/ui/Icon.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/ui/Icon.svelte)
  - Added `chevron-down` and `chevron-up` SVG icons.
- **File:** [`frontend/src/routes/chats/+page.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/routes/chats/+page.svelte)
  - Dedicated hub page under `<ShellSurface>`.
  - Sticky top bar with breadcrumb (`FormaTavern / Chats Hub`), Personas link, New Character button, and Settings button.
  - Controls bar: debounced search box and sort dropdown.
  - Feed with `IntersectionObserver` sentinel for infinite scroll.
  - `ConfirmDialog` integration for both single-chat deletion and bulk character clearing.
- **Navigation Integration:**
  - [`frontend/src/routes/+page.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/routes/+page.svelte): Added direct `Chats` link in foyer top bar.
  - [`frontend/src/lib/components/nav/NavDrawer.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/nav/NavDrawer.svelte): Added *"All Chats Hub"* shortcut link at top of conversation drawer.
  - [`frontend/src/routes/character/[id]/+page.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/routes/character/%5Bid%5D/+page.svelte): Added `Chats` link in character page header.

---

## 3. Verification & Test Results

### 3.1 Automated Test Suites
1. **Backend Tests:**
   ```bash
   bun test backend/test/routes/chatsHub.test.ts
   ```
   - **Result:** 9 pass, 0 fail (56 assertions, 355ms).
   - Entire backend suite: 350 pass, 0 fail across 46 files.
2. **Frontend Tests:**
   ```bash
   bun run --cwd frontend test
   ```
   - **Result:** 248 pass, 0 fail across 36 files (including 11/11 surface tests in `surfaces.test.ts`).

### 3.2 Typecheck Audit
```bash
bun run typecheck
```
- `packages/shared`: `tsc --noEmit` clean.
- `backend`: `tsc --noEmit` clean.
- `frontend`: `svelte-check --tsconfig ./tsconfig.json` found **0 errors and 0 warnings**.

### 3.3 Database Integrity Audit
```bash
bun run db:check
```
- WAL mode, foreign keys, user_version (v8), column layout, integrity checks, and search backend (fts5): **ok**.

### 3.4 Production Bundle Build
```bash
bun run build
```
- Built production bundles cleanly; static site pre-rendered into `build/` with `@sveltejs/adapter-static`.
