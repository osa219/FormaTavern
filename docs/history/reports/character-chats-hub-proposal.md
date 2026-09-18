# Proposal: Dedicated Character Chats Hub (`/chats`)

**Status:** Proposed / Discussion Draft  
**Audience:** FormaTavern Architects, AI Peer Agents, and Core Contributors  
**Scope:** Introducing a dedicated, hierarchical conversation management page (`/chats`) with infinite scroll, keyset pagination, and character-scoped showcase accordions.  
**Invariants Touchpoints:** P1 (Keyset pagination), P4 (Safe showcase markdown), C14 (Surface completeness), U1/U2 (Theme cascade and zero runtime CSS injection).

---

## 1. Executive Summary & Problem Statement

### 1.1 The Scaling Dilemma
In conversational LLM clients, users quickly transition from casual experimentation (3–5 characters, 10 chats) to power usage (50–200+ characters, 500+ chats). Currently, FormaTavern offers two primary discovery surfaces for conversations:

1. **Main Page (`/+page.svelte`) Bottom Shelf:** Displays a flat list of up to 30 recent chats across all characters. While adequate for jumping back into the immediately preceding turn, it collapses under scale. Finding an older conversation with a specific character requires typing into the global search bar or scrolling through dozens of disconnected turns.
2. **Left Navigation Drawer (`NavDrawer.svelte`):** Groups conversations by character, but is designed as a quick-switch slide-over accessible primarily from within the active `/chat/:id` workspace. It lacks space for character context, scenario review, search filtering, or bulk management.
3. **Character Profile Page (`/character/:id`):** Displays a character's full showcase and lists chats *only* for that single character, requiring the user to navigate back to the main foyer, search for the character, and open their profile.

### 1.2 The Goal
Create a dedicated **Chats Hub** (`/chats`) that acts as a first-class, scalable conversation manager. It groups conversations **hierarchically by character**, allows smooth **infinite scrolling** across hundreds of characters via Invariant P1 keyset pagination, and features **truncated mini-showcase accordions** that let users review a character's visual lore and scenario before resuming an existing chat or launching a new one. Full `ShowcaseBody` rendering stays on `/character/:id`; the hub mounts only a tagline plus a 2–3 line description excerpt to keep per-row DOM cheap. Observed JanitorAI reference behavior is recorded in the local-only study `docs/history/reports/janitorai-behavior/my-chats-hub/REPORT.md` (facts restated inline here since that directory is git-ignored).

---

## 2. Product & UX Design (Inspired by Janitor AI, Elevated for FormaTavern)

### 2.1 Navigation & Placement
JanitorAI exposes My Chats through three paths: the account avatar dropdown (`Home → avatar O → My Chats`), the dedicated `/my_chats` page, and a `My Chats` horizontal `Continue` carousel on the homepage. The dropdown path is buried, but the carousel is first-screen. In FormaTavern, conversation management is a core daily activity and deserves primary navigation placement (better than all three):

- **Top Bar Integration:** Add a dedicated **`Chats`** link in the top navigation bar alongside `Personas`:
  ```
  ◈ SANCTUARY  |  Chats  |  Personas  |  + New Character  |  Settings
  ```
- **Left Nav Drawer Shortcut:** A dedicated *"All Chats Hub"* button at the top of `NavDrawer.svelte`.
- **Keyboard Shortcut:** Standardize `Alt+C` or `G C` (Go to Chats).

### 2.2 Hub Page Anatomy (`/chats`)

```
┌────────────────────────────────────────────────────────────────────────┐
│  ◈ FORMA TAVERN       Chats   Personas   + New Character     [⚙]       │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Conversation Hub                                                      │
│  Manage and resume conversations across your character roster.         │
│                                                                        │
│  ┌──────────────────────────────────────────────┐  ┌────────────────┐  │
│  │ 🔍 Search characters or chat titles...       │  │ Sort: Recent ▾ │  │
│  └──────────────────────────────────────────────┘  └────────────────┘  │
│                                                                        │
│  [ 42 characters · 128 chats ]                                         │
│                                                                        │
│  ▼ ┌────────────────────────────────────────────────────────────────┐  │
│    │ [Avatar]  Eldrin the Mage · 5 chats              [Latest: 2h]  ▲│  │
│    ├────────────────────────────────────────────────────────────────┤  │
│    │  ┌─ Character Mini-Showcase ─────────────────────────────────┐ │  │
│    │  │ "An eccentric chronomancer exiled from the Grand Spire..."│ │  │
│    │  │ [View Character Profile]   [+ Start New Chat]             │ │  │
│    │  └───────────────────────────────────────────────────────────┘ │  │
│    │                                                                │  │
│    │  Recent Chats:                                                 │  │
│    │  ┌───────────────────────────────────────────────────────────┐ │  │
│    │  │ "The Clocktower Anomaly"            42 turns · 2h ago [🗑] │ │  │
│    │  ├───────────────────────────────────────────────────────────┤ │  │
│    │  │ "First meeting in the tavern"       15 turns · 3d ago [🗑] │ │  │
│    │  └───────────────────────────────────────────────────────────┘ │  │
│    └────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ▶ [Avatar]  Alice the Alchemist · 12 chats           [Latest: 1d]  ▼  │
│                                                                        │
│  ▶ [Avatar]  John · 2 chats                           [Latest: 5d]  ▼  │
│                                                                        │
│                         [ 🌀 Loading more characters... ]              │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Interactive Accordion Behavior
1. **Collapsed State (Ultra-Compact):**
   - High-density row displaying the character's avatar, theme accent dot, name, total chat count, and timestamp of the most recent turn.
   - Chevron icon indicating expansion.
   - Keyboard accessible (`Enter` / `Space` toggles accordion).
2. **Expanded State (Mini-Showcase & Workspace):**
    - **Showcase & Actions Pane:** Renders a truncated excerpt only — avatar banner, tagline, and a 2–3 line description snippet (never the full `ShowcaseBody` with author styles; measured JanitorAI expanded headers show a banner plus a short styled lore part such as `Get booped! Hah, gotcha.`), and action buttons:
      - `[ View Character Page ]` (navigates to `/character/:id`)
      - `[ + Start New Chat ]` (triggers persona picker and creates a fresh branch)
      - No `Creator Profile` counterpart: FormaTavern is single-user local and has no creator graph.
    - **Conversation Branch List:** Date-grouped list of chats for that character (JanitorAI groups under dividers such as `TODAY`), displaying:
      - Chat title (or *"Untitled Chat"* / `no summary :(` fallback with first-turn preview)
      - Turn/message count badge
      - Relative time (*"ABOUT 21 HOURS AGO"*, *"2h ago"*, *"3d ago"*)
      - Active generation pulse if the character is currently streaming in the background
      - Individual delete action button with confirmation
      - Clicking anywhere on the chat card immediately enters `/chat/:id`.

---

## 3. Technical Architecture & Data Strategy

### 3.1 SQLite Query & Keyset Pagination (Invariant P1)
Loading all characters and chats into memory at once is an anti-pattern that degrades performance as the database grows. In compliance with **Invariant P1** (`Keyset pagination on (sort_value, id) with opaque base64 cursor; no unbounded OFFSET`), the endpoint must paginate character groups efficiently.

#### Database Strategy:
Characters with at least one conversation are aggregated using SQLite WAL indices.
The draft below is illustrative only: tuple comparison over `MAX(ch.updated_at)`
in `HAVING` plus `ORDER BY MAX(...)` will not use an index as written, breaks on
duplicate timestamps, and cannot serve `sort=chats|name` from one cursor. The
implementation plan must replace it with per-sort keysets (e.g. a latest-chat
subquery or indexed view) and FTS/subquery matching when `q` covers chat titles:
```sql
SELECT 
  c.id AS character_id,
  c.name AS character_name,
  c.tagline AS character_tagline,
  c.avatar AS character_avatar,
  c.style AS character_style,
  COUNT(ch.id) AS chat_count,
  MAX(ch.updated_at) AS last_chat_at
FROM characters c
JOIN chats ch ON ch.primary_character_id = c.id
WHERE (:q IS NULL OR c.name LIKE :q_like OR c.tagline LIKE :q_like)
GROUP BY c.id
HAVING (:cursor_val IS NULL OR (MAX(ch.updated_at), c.id) < (:cursor_val, :cursor_id))
ORDER BY MAX(ch.updated_at) DESC, c.id DESC
LIMIT :limit;
```

### 3.2 Endpoint Design (`backend/src/routes/chats.ts`)

- **Route:** `GET /api/chats/hub`
- **Query Parameters:**
  - `limit`: Integer (default `20`, max `50`)
  - `cursor`: Opaque base64 string `(last_chat_at:character_id)`
  - `q`: Optional search query string
  - `sort`: `'recent' | 'chats' | 'name'`
- **Response Payload (`ChatHubResponseSchema`):**
  ```typescript
  {
    items: Array<{
      character: CharacterSummary;
      chatCount: number;
      lastChatAt: number;
      recentChats: Array<{
        id: string;
        title: string | null;
        messageCount: number;
        updatedAt: number;
        activeGenerationMessageId: string | null;
      }>;
    }>;
    nextCursor: string | null;
    totalCharacters: number;
    totalChats: number;
  }
  ```

> [!NOTE]
> **Eager vs. Lazy Chat Loading:**
> By default, `GET /api/chats/hub` includes the top 3 most recent chats for each character in the returned batch. If a character has more than 3 chats, clicking "View all X chats" inside the expanded accordion lazy-loads the full chat list via the existing `GET /api/characters/:id/chats` endpoint. This guarantees minimal payload size while keeping the initial expansion instant.

### 3.3 Frontend Infinite Scroll & Progressive Svelte Store

The frontend state will be managed by a dedicated rune-based store:
`frontend/src/lib/state/chatsHub.svelte.ts`:

- **State Runes:**
  - `items = $state<ChatHubGroup[]>([])`
  - `loading = $state(false)`
  - `loadingMore = $state(false)`
  - `hasMore = $state(true)`
  - `cursor = $state<string | null>(null)`
  - `expandedCharacterIds = $state<Set<string>>(new Set())`
  - `searchQuery = $state('')`
- **IntersectionObserver Sentinel:**
  An unstyled sentinel element at the bottom of the feed:
  ```svelte
  <div bind:this={sentinelEl} class="h-4 w-full" aria-hidden="true"></div>
  ```
  An `IntersectionObserver` observing `sentinelEl` automatically invokes `store.loadMore()` when within `200px` of the viewport bottom. If the user scrolls rapidly, it shows a subtle skeleton/spinner until the next keyset batch arrives, preventing layout shifts (CLS ≤ 0.02, Invariant U6).

### 3.4 Surface Completeness & Theme Isolation (Invariant C14 & U1)
The `/chats` route establishes an authorized surface root:
```svelte
<ShellSurface surfaceId="chats">
  <!-- Content here -->
</ShellSurface>
```
All accordion headers and expanded containers strictly utilize semantic chrome tokens:
- Background: `bg-(--chrome-surface)` and `bg-(--chrome-bg)`
- Lines & Dividers: `border-(--chrome-line)`
- Typography: `text-(--chrome-text)`
- High-contrast neutral chrome without hardcoded dark palette leaks.

---

## 4. Comparison: Janitor AI vs. FormaTavern Chats Hub

| Capability | Janitor AI (measured 2026-09-18, 1,647 chars / 2,837 chats) | FormaTavern Proposed Hub |
|---|---|---|
| **Access Path** | Three paths: avatar `O → My Chats` (buried), dedicated `/my_chats` (`Chats / Published Chats` tabs), homepage `My Chats` carousel with `Continue` | Direct top-bar link (`/chats`) + NavDrawer shortcut — first-class, not buried |
| **Styling & Theming** | Fixed dark purple palette | Dynamic surface theme cascade (`--theme-*`, `--chrome-*`) |
| **Character Showcase** | Banner + truncated styled lore part (e.g. `Get booped! Hah, gotcha.`), `Character Page / Creator Profile` buttons | Truncated mini-showcase only (tagline + 2–3 lines); full `ShowcaseBody` stays on `/character/:id` (P4) |
| **Quick Action** | Hub accordions have per-branch cards (`TODAY / ABOUT 21 HOURS AGO / no summary :(` + count + trash + lock); `Continue` is homepage-carousel-only | `Start New Chat` + direct branch selection; no creator graph |
| **Data Protocol** | `GET /hamptor/chats/character-chats?page=N&sortBy=latest` over XHR, 10 character groups/page, `{ characters, hasMore, page, totalCharacters, totalChats }` with totals repeated | Keyset cursor pagination (P1) with SQLite WAL index, `limit` default `20` max `50`; totals served once/cached, not per page |
| **DOM Overhead** | Measured ~813–942 nodes flat while `scrollHeight` grew 2.7k→35k px: collapsed rows cheap, full showcase never mounted per row | Same discipline: lazy accordion mounting + top-3 eager preview, full list lazy via `GET /api/characters/:id/chats` (open question below whether JanitorAI inlines chats or lazy-loads on expand) |
| **Live State** | Not measured (no generation observed during probe) | Real-time generation indicators via existing `activeGenerationMessageId` pulse |

---

## 5. Peer Agent & Mindstorming Topics

Before creating the execution blueprint, the following open questions are submitted for feedback:

1. **Scope of Characters Shown:**
   - *Option A (Default):* Only characters that have ≥ 1 conversation are listed in the Hub.
   - *Option B (Toggleable):* Include a toggle (`[ All Characters ] / [ Active Chats Only ]`) so users can use the hub as an alternate character directory.
   - *Recommendation:* Option A for the primary view, with an empty state pointing to the Character Foyer (`/`) if the user has 0 chats.

2. **Accordion Memory:**
   - Should expanded accordion states be saved in `localStorage` or URL query params (e.g. `?open=char_123`)?
   - *Recommendation:* Keep state in memory by default, but honor `?character=:id` on navigation so clicking "View in Chats Hub" from a character page opens that character's accordion directly.

3. **Search Depth:**
   - Should the search input filter *only* by character name/tags, or also search across chat titles?
   - *Recommendation:* Filter by character name and chat title simultaneously using SQLite full-text search (FTS5) or subquery matching.

4. **Batch Management / Housekeeping:**
   - In Janitor AI, deleting multiple chats requires opening each accordion individually. Should FormaTavern provide a quick "Clear all chats with this character" option in the expanded header?
   - *Recommendation:* Yes, with a `ConfirmDialog` warning to protect against accidental mass deletion.

---

## 6. Next Steps & Artifact Registry
- **File Location:** `docs/history/reports/character-chats-hub-proposal.md`
- **Reference Aid:** `docs/history/reports/janitorai-behavior/my-chats-hub/REPORT.md` (local-only, git-ignored; load-bearing facts restated in §4 above).
- **Open measurement:** whether one `characters[N]` entry inlines recent chats or only counts (expand it in Network Preview) and whether accordion expansion fires a request. Answer decides eager top-3 vs fully lazy chat loading in §3.2.
- **Subsequent Step:** Once aligned with the user and peer agents, draft an Implementation Plan covering database index checks, backend route tests, Svelte 5 runes store, and component authoring.
