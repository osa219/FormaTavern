# FormaTavern — Database & Storage Schema Reference

**Scope:** The definitive data dictionary, relational DDL, JSON column schemas, tree branching model, and integrity contracts for FormaTavern (Phase 0 through Customization Series).
**Engine:** SQLite 3 in WAL mode via Bun embedded (`bun:sqlite`), schema version `PRAGMA user_version = 5`.
**Cross-references:** See [`docs/architecture.md §5`](architecture.md#5-storage) for storage architecture and [`.agents/AGENTS.md §4`](../.agents/AGENTS.md#4-invariant-cheat-sheet-cite-by-id) for canonical invariants (I1–I6, S2–S6).

---

## 1. Storage Architecture & Connection Invariants

All database access (HTTP server, background engines, CLI scripts, and test suites) is routed strictly through `backend/src/db/connection.ts:openDatabase()`.

### 1.1 Connection Pragmas

```sql
PRAGMA journal_mode = WAL;     -- Write-Ahead Logging; verified 'wal' on disk DBs (in-memory skips)
PRAGMA synchronous = NORMAL;   -- Balance between durability and write performance in WAL mode
PRAGMA foreign_keys = ON;      -- Enforced on every connection (asserted = 1; Invariant I4)
PRAGMA busy_timeout = 5000;    -- Wait up to 5,000 ms on write locks before throwing SQLITE_BUSY
```

- **Strict Binding Mode:** Connections are initialized with `{ strict: true }`. Missing or misspelled named bind parameters throw an immediate exception rather than silently binding `NULL`.
- **Concurrency Model:** Unlimited concurrent readers + exactly one writer. Bun is single-threaded and `bun:sqlite` execution is synchronous; database writes are batched with a trailing-edge 500 ms throttle (Invariant S5).
- **WAL Sidecar Files:** `formatavern.db-wal` and `formatavern.db-shm` are active components of the database during runtime. Clean shutdown checkpoints and truncates these sidecars.

---

## 2. Relational Schema (DDL)

```
   ┌─────────────────┐             ┌──────────────┐
   │   characters    │             │   personas   │
   └────────┬────────┘             └──────┬───────┘
            │ 1                           │ 1
            │ RESTRICT                    │ RESTRICT
            ▼ *                           ▼ *
   ┌──────────────────────────────────────────────┐
   │                    chats                     │◀─────────┐
   └──────────────────────┬───────────────────────┘          │
                          │ 1                                │ ON DELETE
                          │ CASCADE                          │ SET NULL
                          ▼ *                                │
   ┌──────────────────────────────────────────────┐          │
   │                   messages                   │──────────┘
   │  (parent_id FK ── self-reference CASCADE)    │  active_leaf_id
   └──────────────────────────────────────────────┘
```

### 2.1 `characters` Table

Stores companion character definitions, base aesthetic tokens, dialogue examples, and reactive state machine bindings.

```sql
CREATE TABLE IF NOT EXISTS characters (
  id           TEXT PRIMARY KEY,              -- Slug (e.g. 'eldrin-the-mage') or ULID
  name         TEXT NOT NULL,                 -- Display name (1–120 characters)
  avatar       TEXT,                          -- Asset path (e.g. '/assets/characters/eldrin.webp')
  description  TEXT,                          -- Character overview / background
  personality  TEXT,                          -- Behavioural trait guidelines
  scenario     TEXT,                          -- Initial narrative scene premise
  first_message TEXT,                         -- Opening greeting / scene starter
  style        TEXT NOT NULL,                 -- JSON: CharacterTheme (colors, fonts, bubble, background)
  created_at   INTEGER NOT NULL,              -- Unix timestamp in milliseconds
  updated_at   INTEGER NOT NULL,              -- Unix timestamp in milliseconds
  metadata     TEXT,                          -- JSON: CharacterMetadata (stateSchema, stateBindings, etc.)
  custom_css   TEXT                           -- Raw author custom CSS; NULL = none (added in v5)
);

CREATE INDEX IF NOT EXISTS idx_characters_updated ON characters(updated_at DESC);
```

### 2.2 `personas` Table

Stores user persona profiles and per-persona aesthetic overrides.

```sql
CREATE TABLE IF NOT EXISTS personas (
  id              TEXT PRIMARY KEY,           -- Slug (e.g. 'persona-default') or ULID
  name            TEXT NOT NULL,              -- User display name
  avatar          TEXT,                       -- Asset path
  description     TEXT,                       -- User bio / roleplay persona notes
  is_default      INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  style_overrides TEXT,                       -- JSON: ThemeOverrides (deep partial of CharacterTheme)
  created_at      INTEGER NOT NULL,           -- Unix timestamp in milliseconds
  updated_at      INTEGER NOT NULL            -- Unix timestamp in milliseconds
);

-- Guarantees at most one persona has is_default = 1
CREATE UNIQUE INDEX IF NOT EXISTS idx_personas_single_default ON personas(is_default) WHERE is_default = 1;
```

### 2.3 `chats` Table

Stores conversation sessions linking a character and a persona, managing active narrative state, and tracking the active tree leaf.

```sql
CREATE TABLE IF NOT EXISTS chats (
  id                   TEXT PRIMARY KEY,      -- ULID
  title                TEXT NOT NULL,         -- Chat title
  primary_character_id TEXT NOT NULL,         -- FK -> characters(id) ON DELETE RESTRICT
  active_persona_id    TEXT NOT NULL,         -- FK -> personas(id) ON DELETE RESTRICT
  created_at           INTEGER NOT NULL,      -- Unix timestamp in milliseconds
  updated_at           INTEGER NOT NULL,      -- Unix timestamp in milliseconds
  metadata             TEXT,                  -- JSON: ChatMetadata (narrativeMode, npcs, currentState, etc.)
  active_leaf_id       TEXT,                  -- FK -> messages(id) ON DELETE SET NULL (added in v3)
  FOREIGN KEY (primary_character_id) REFERENCES characters(id) ON DELETE RESTRICT,
  FOREIGN KEY (active_persona_id) REFERENCES personas(id) ON DELETE RESTRICT,
  FOREIGN KEY (active_leaf_id) REFERENCES messages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_chats_updated ON chats(updated_at DESC);
```

### 2.4 `messages` Table

Stores all conversation turns organized as a non-linear parent-pointer tree.

```sql
CREATE TABLE IF NOT EXISTS messages (
  id             TEXT PRIMARY KEY,            -- Monotonic ULID (chronological sorting)
  chat_id        TEXT NOT NULL,               -- FK -> chats(id) ON DELETE CASCADE
  parent_id      TEXT,                        -- FK -> messages(id) ON DELETE CASCADE (NULL for greeting)
  sender_id      TEXT,                        -- Polymorphic ID (character ID, persona ID, or NULL)
  sender_name    TEXT,                        -- Display name snapshot (added in v2)
  role           TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  narrative_role TEXT NOT NULL DEFAULT 'character' CHECK (narrative_role IN ('character', 'persona', 'npc', 'narrator')),
  content        TEXT NOT NULL,               -- Full raw text including markdown and envelope directives
  segments       TEXT,                        -- JSON: Segment[] authoritative parsed tracks (added in v2)
  state          TEXT,                        -- JSON: StateVector resolved scene vector after this turn (added in v2)
  status         TEXT NOT NULL CHECK (status IN ('streaming', 'complete', 'aborted', 'error')),
  created_at     INTEGER NOT NULL,            -- Unix timestamp in milliseconds
  metrics        TEXT,                        -- JSON: MessageMetrics (tokens, timing, provider)
  metadata       TEXT,                        -- JSON: MessageMetadata (parse report, directorNote, errors)
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id, id ASC);
CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parent_id);
CREATE INDEX IF NOT EXISTS idx_messages_parent_id_id ON messages(parent_id, id);
CREATE INDEX IF NOT EXISTS idx_messages_streaming ON messages(status) WHERE status = 'streaming';
```

### 2.5 `settings` Table

Key-value store for system configuration.

```sql
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,                -- Config section ('provider', 'openrouter', 'generation', etc.)
  value      TEXT NOT NULL,                   -- JSON: Section configuration object
  updated_at INTEGER NOT NULL                 -- Unix timestamp in milliseconds
);
```

---

## 3. Migration Lifecycle & Protocol

Migrations live in `backend/src/db/migrate.ts` and execute automatically during backend startup.

### 3.1 Idempotent Versioning Protocol (Invariant I3)
- Migration state is owned solely by `PRAGMA user_version;`.
- Every migration must be **strictly contiguous** starting from version 1.
- Each migration runs inside an isolated transaction:
  ```ts
  db.transaction(() => {
    migration.up(db);
    db.run(`PRAGMA user_version = ${migration.version};`);
  })();
  ```
- If the file-based database reports a `user_version` higher than the latest application migration, the process refuses to boot to prevent silent data corruption.
- Shipped migrations are immutable. Schema adjustments require appending a new migration version `v(N+1)`.

### 3.2 Migration History

| Version | Name | Description | Key Changes |
|---|---|---|---|
| **v1** | `initial_schema` | Foundation relational tables | Creates `characters`, `personas`, `chats`, `messages`, `settings`. Defines FKs and indices. |
| **v2** | `narrative_envelope` | Three-Track narrative envelope support | Adds `messages.narrative_role`, `sender_name`, `segments`, `state`. Backfills user rows to `narrative_role = 'persona'`. |
| **v3** | `chat_branching` | Non-linear tree branching & swipes | Adds `chats.active_leaf_id` (FK to `messages(id)`). Adds partial index on `status = 'streaming'` and composite index on `(parent_id, id)`. Backfills leaf to newest message per chat. |
| **v4** | `companion_platform` | Companion platform & discovery | Adds FTS5 search index table `characters_fts`; creator credit, tagline, showcase fields in character schemas. |
| **v5** | `creator_customization` | Creator custom CSS styling | Adds `characters.custom_css TEXT` column. Global shell theme rides `settings` row `shell_theme`. |

---

## 4. Polymorphic JSON Columns & TypeBox Schema Mapping

JSON columns are stringified during repository persistence and parsed upon retrieval. Boundary validation is executed via TypeBox isomorphic schemas defined in `@formatavern/shared/schemas`.

### 4.1 Character Schemas (`packages/shared/src/schemas/character.ts`)

#### `characters.style` $\rightarrow$ `CharacterThemeSchema`
```ts
{
  font: {
    family?: string,            // e.g. 'Cinzel, Georgia, serif'
    size?: string,              // e.g. '1rem'
    lineHeight?: string         // e.g. '1.7'
  },
  colors: {
    charBubbleBg: string,       // e.g. '#1e1b4b' (CSS color string)
    charBubbleText: string,     // e.g. '#e0e7ff'
    charBubbleBorder?: string,  // e.g. '#4338ca'
    userBubbleBg: string,       // e.g. '#18181b'
    userBubbleText: string,     // e.g. '#f4f4f5'
    userBubbleBorder?: string,  // e.g. '#27272a'
    accent: string,             // e.g. '#818cf8'
    quoteColor?: string,        // e.g. 'inherit' (color for <q class="speech">)
    actionColor?: string,       // e.g. '#94a3b8' (color for italicized stage directions)
    narratorColor?: string      // e.g. '#cbd5e1' (color for narrator track text)
  },
  bubble: {
    radius?: string,            // e.g. '1rem'
    padding?: string,           // e.g. '1rem 1.25rem'
    charTail?: 'none' | 'left' | 'right',
    userTail?: 'none' | 'left' | 'right'
  },
  background: {
    image?: string,             // e.g. '/assets/backgrounds/library.webp'
    blur?: string,              // e.g. '8px'
    overlay?: string            // e.g. 'rgba(0, 0, 0, 0.65)'
  }
}
```

#### `characters.metadata` $\rightarrow$ `CharacterMetadataSchema`
```ts
{
  exampleDialogue?: string,     // Verbatim few-shot dialogue examples
  stateSchema?: Record<string, {
    type: 'enum' | 'int' | 'string',
    values?: string[],          // If enum: valid set of string states
    aliases?: Record<string, string>, // If enum: lenient mapping (e.g. 'mad' -> 'angry')
    min?: number,               // If int: lower boundary clamp
    max?: number,               // If int: upper boundary clamp
    step?: number,              // If int: step delta
    initial?: unknown           // Default starting value
  }>,
  stateBindings?: Array<{
    when: Record<string, unknown>, // Condition match (e.g. { mood: 'furious' })
    set: Record<string, unknown>   // CSS token overrides (e.g. { 'colors.accent': '#ef4444' })
  }>,
  initialState?: Record<string, unknown>, // Starting scene state vector
  tags?: string[],
  creator?: string,
  version?: string
}
```

### 4.2 Chat Metadata (`packages/shared/src/schemas/narrative.ts`)

#### `chats.metadata` $\rightarrow$ `ChatMetadataSchema`
```ts
{
  narrativeMode?: 'classic' | 'narrative',
  envelopeDialect?: 'directive' | 'xml' | 'prefix',
  standingDirection?: string,   // Persistent system instructions injected into every prompt
  npcs?: Record<string, {       // Registry of dynamically discovered or pre-configured NPCs
    displayName: string,
    avatar?: string,
    accent?: string,
    voice?: string
  }>,
  currentState?: Record<string, unknown>, // Cached active scene vector for the active leaf
  stateOverrides?: Array<{      // Audit log of manual state overrides
    appliedAt: number,          // UnixMs
    patch: Record<string, unknown>,
    resolved: Record<string, unknown>,
    source: string
  }>
}
```

### 4.3 Message Payload Schemas (`packages/shared/src/schemas/message.ts`)

#### `messages.segments` $\rightarrow$ `Segment[]`
Authoritative segmentation of the turn across narrative tracks:
```ts
Array<{
  kind: 'narrator' | 'character' | 'npc' | 'persona',
  name?: string,               // Speaker name for 'character' and 'npc'
  text: string                 // Clean markdown content (envelope headers stripped)
}>
```

#### `messages.state` $\rightarrow$ `StateVector`
```ts
Record<string, unknown>        // e.g. { mood: 'friendly', affinity: 6, danger: 'none', scene: 'tavern' }
```

#### `messages.metrics` $\rightarrow$ `MessageMetricsSchema`
```ts
{
  provider: string,            // 'mock' | 'openrouter'
  model: string,               // Model identifier
  promptTokensEstimated: number,
  promptTokens?: number,       // Provider reported prompt tokens
  completionTokens?: number,   // Provider reported completion tokens
  durationMs: number,          // Total completion latency
  ttftMs?: number,             // Time to first token
  finishReason?: 'stop' | 'length' | 'aborted',
  droppedTurns: number         // Turns evicted by budget pruning
}
```

#### `messages.metadata` $\rightarrow$ `MessageMetadataSchema`
```ts
{
  directorNote?: string,       // One-shot director instruction for this specific turn
  parse?: {
    dialect: 'directive' | 'xml' | 'prefix' | 'none',
    parserVersion: number,
    adherent: boolean,         // True if response strictly matched prompt dialect
    warnings: string[],        // Parser lenience warnings (e.g. 'state_unclosed')
    truncatedAt: 'persona' | null // Indicates server-side agency cut-off
  },
  stateSource?: 'initial' | 'patch' | 'inherited' | 'override',
  stateWarnings?: string[],
  stateOverrides?: Array<{ at: number, patch: Record<string, unknown> }>,
  reasoning?: string,          // Extracted <think> reasoning tokens (if present)
  error?: { message: string, recoverable: boolean },
  edited?: { at: number, count: number },
  continuations?: number,      // Number of continuation chunks appended
  recovered?: boolean          // True if stale streaming row was repaired on boot
}
```

---

## 5. Message Tree & Branching Model

FormaTavern structures messages as a parent-pointer directed acyclic tree (S6).

### 5.1 Tree Topography
- **Root Turns:** The character greeting has `parent_id IS NULL`.
- **Swipes as Siblings:** All generations sharing the same `parent_id` are sibling swipes ($1/N$).
- **Branches as Subtrees:** Selecting or continuing any turn forks execution into an independent subtree.

```
[Greeting (parent_id: NULL)]
           │
     [User Message 1]
      ┌────┴────────────────────────┐
[Assistant Turn 1 (1/2)]     [Assistant Turn 1 (2/2)] ◀── Active Leaf
      │                             │
[User Message 2]              [User Message 2]
      │                             │
[Assistant Turn 2]           [Assistant Turn 2]
```

### 5.2 Active Branch CTE Query

The active conversation branch is resolved by traversing upwards from `chats.active_leaf_id` to the root via a recursive Common Table Expression (CTE):

```sql
WITH RECURSIVE p(id, depth) AS (
  SELECT :leafId, 0
  UNION ALL
  SELECT m.parent_id, p.depth + 1
  FROM messages m JOIN p ON m.id = p.id
  WHERE m.parent_id IS NOT NULL
)
SELECT m.*
FROM messages m JOIN p ON m.id = p.id
ORDER BY p.depth DESC;
```

### 5.3 Pagination & Sibling Decoration (`pageActiveBranch`)

Active branch retrieval executes windowed pagination with backwards depth scanning and single-pass sibling metadata decoration:

```sql
WITH RECURSIVE p(id, depth) AS (
  SELECT ?1, 0
  UNION ALL
  SELECT m.parent_id, p.depth + 1
  FROM messages m JOIN p ON m.id = p.id
  WHERE m.parent_id IS NOT NULL
)
SELECT m.* FROM messages m JOIN p ON m.id = p.id
WHERE (?2 IS NULL OR p.depth > (SELECT p2.depth FROM p p2 WHERE p2.id = ?2))
ORDER BY p.depth ASC
LIMIT ?3;
```

For each returned message, sibling index, sibling count, and child presence are calculated:
- **`siblingCount`:** Total messages in this chat with the same `parent_id`.
- **`siblingIndex`:** 0-indexed position sorted by `id ASC` (ULID chronological order).
- **`hasChildren`:** Boolean indicating whether any message in the database has `parent_id = message.id`.

### 5.4 Descend-Latest Algorithm (`descendLatest`)

When a user switches swipes to an older sibling via `POST /api/messages/:id/select`, the active leaf moves to the newest descendant leaf of that node by iteratively descending the newest child:

```sql
SELECT id FROM messages WHERE parent_id = :currentId ORDER BY id DESC LIMIT 1;
```

### 5.5 Subtree Deletion Cascade

Deleting a message node (`DELETE /api/messages/:id`) triggers an engine-level cascade:
1. All descendants are deleted via SQLite's `FOREIGN KEY (parent_id) REFERENCES messages(id) ON DELETE CASCADE`.
2. If the active leaf was inside the deleted subtree, `chats.active_leaf_id` is automatically repositioned to the deleted node's `parent_id`.

---

## 6. State Vector Engine & Cache Invariant

Scene states model ambient story context (e.g. location, companion mood, relationship affinity, danger level).

### 6.1 State Resolution

1. If the turn produces a trailing ````state { ... } ```` block, it is parsed and sanitized.
2. The patch is merged against the previous turn's state vector:
   - **Enum fields:** Verified against legal options; case-insensitive alias conversion applied.
   - **Integer fields:** Clamped between `min` and `max`.
   - **Unknown keys:** Stripped.
3. If no state block is emitted or an unclosed block is detected, the turn inherits the previous turn's state (`stateSource = 'inherited'`).

### 6.2 Cache Invariant (S6)

`chats.metadata.currentState` caches the active leaf's state. It is refreshed:
- Upon every assistant turn finalization.
- Upon active branch switching (`/select`).
- Upon turn deletion or manual override (`PATCH /chats/:id/state`).

Integrity is validated by `bun run db:check`, which computes `nearestState(path, character)` and asserts strict equality with `chats.metadata.currentState`.

---

## 7. Database Integrity & Audit Contract (`bun run db:check`)

The database integrity script (`backend/scripts/check.ts`) enforces strict runtime verification. Any discrepancy exits with code 1.

| Audit Item | Rule / Assertion | Invariant |
|---|---|---|
| **Pragma Audit** | `journal_mode = wal`, `foreign_keys = 1`, `user_version = 5`. | I3, I4 |
| **Integrity Check** | `PRAGMA integrity_check` returns `ok`. | Engine |
| **Foreign Key Check** | `PRAGMA foreign_key_check` returns 0 violations. | I4 |
| **Columns Check** | `messages` includes `narrative_role`, `sender_name`, `segments`, `state`. `chats` includes `active_leaf_id`. `characters` includes `custom_css`. | v2, v3, v5 |
| **Search Index Parity** | `characters_fts` count matches `characters` count (`fts_parity = ok`). | P6 |
| **Zero Streaming Rows** | No rows exist with `status = 'streaming'` on an idle database. | S3 |
| **Active Leaf Cohesion** | `chats.active_leaf_id` exists and belongs to the same chat. | S6 |
| **Current State Parity** | `chats.metadata.currentState` strictly equals `nearestState(path(leaf), character)`. | S6 |
| **Row Validation** | 100% of character and persona rows pass `validate(CharacterCardSchema)` and `validate(PersonaSchema)`. | I2 |
