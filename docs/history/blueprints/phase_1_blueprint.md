# Phase 0 Review → Approved

The walkthrough satisfies all ten criteria. Three notes, none blocking:

1. **Direct-stream first gap = 330 ms** (vs. 400 ms). That's curl's connect/first-byte skew being absorbed into the first interval, not a pacing fault — the proxied run and the browser deltas show clean 400 ms steps. No action.
2. **`--parallel` vs. `--filter`** in the root scripts: either is fine as long as `shared` is excluded from `dev` (it has no `dev` script). Keep whatever you have.
3. **Carry-forward into Phase 1:** `SHARED_VERSION`, `HealthResponse`, and `StreamEvent` all change shape below. The Phase 0 `readTestStream` handler treats any non-`token` event as `done`; with the full union it must treat `error` as an error. Small edit, called out in §3.6.

Proceed.

---

# FormaTavern — Phase 1 Blueprint: The Foundation (Storage, Schemas & Migrations)

**Purpose:** Establish the two things every later phase builds on: (a) a single source of truth for domain shapes in `@formatavern/shared` (TypeBox schemas → static types → runtime validation, isomorphic), and (b) an authoritative SQLite store with WAL, enforced referential integrity, versioned migrations, and idempotent seeds — proven by tests, not by inspection.

The vertical slice stays alive: `/api/health` gains a `db` block so the browser page demonstrates that the schema version and seed counts flow end-to-end. No other API surface is added.

**New dependencies:** `@sinclair/typebox` (shared), `ulid` (backend). Nothing else.

---

## 1. Invariants for this phase

| # | Invariant | Enforced by |
|---|---|---|
| I1 | Every shape that crosses a boundary (HTTP, DB row, import file) has exactly one TypeBox schema in `shared`; static types are derived with `Static<>`, never hand-written in parallel. | Code review + `typecheck` |
| I2 | Nothing is written to `characters`/`personas` that has not passed `assertValid(...)` against its schema. | Repository layer is the only write path; seeds go through it |
| I3 | Schema state is owned by `PRAGMA user_version`; running the migrator N times ≡ running it once. | `migrations.test.ts` |
| I4 | FK enforcement is on for every connection, and the cascade/restrict topology in the spec is real. | `openDatabase()` asserts `PRAGMA foreign_keys` = 1; `integrity.test.ts` |
| I5 | `shared` stays isomorphic (no `Bun`, no `node:*`, no DOM). TypeBox is allowed because it is. | `shared/tsconfig.json` (`lib: ES2022`, `types: []`) |
| I6 | `backend/src/app.ts` stays Bun-free (purity rule from Phase 0). The DB never appears in `type App`. | `svelte-check` traversing `import type { App }` |

---

## 2. `@formatavern/shared` — Schemas as the Single Source of Truth

### 2.1 File layout

```
packages/shared/
├── package.json            # + "@sinclair/typebox": "<match elysia's range>", + "test": "bun test"
├── tsconfig.json           # unchanged: lib ES2022, types [], include ["src"]
├── test/
│   ├── tsconfig.json       # extends ../tsconfig.json; "types": ["bun"]; include ["."]  ← see §4.1
│   └── schemas.test.ts
└── src/
    ├── index.ts            # barrel; SHARED_VERSION = '0.1.0-phase1'
    ├── validate.ts         # validate / assertValid / ValidationError
    ├── schemas/
    │   ├── primitives.ts   # Id, UnixMs, CssToken, AssetPath
    │   ├── theme.ts        # CharacterThemeSchema (+ sub-schemas, + overrides schema)
    │   ├── state.ts        # StateFieldSchema, StateBindingSchema, StateVectorSchema
    │   ├── character.ts    # CharacterCardSchema, CharacterMetadataSchema
    │   ├── persona.ts      # PersonaSchema
    │   └── narrative.ts    # SegmentSchema, ChatMetadataSchema
    ├── types/
    │   └── llm.ts          # StreamEvent, MessagePayload, LLMRequest, ModelInfo, LLMProvider (types only)
    └── fixtures.ts         # TEST_STREAM_* constants (moved out of index.ts)
```

**TypeBox version alignment (trap, see §4.1):** Elysia bundles its own `@sinclair/typebox` and re-exports it as `t`. `shared` must declare the same range Elysia declares (read `node_modules/elysia/package.json` → `dependencies["@sinclair/typebox"]`). After install, `bun pm ls --all | grep typebox` must show **one** version. If it shows two, add a root `"overrides": { "@sinclair/typebox": "<elysia's version>" }`.

### 2.2 Primitives (`schemas/primitives.ts`)

```ts
import { Type } from '@sinclair/typebox';

/** Slugs ('eldrin-the-mage') and ULIDs both match. */
export const Id = Type.String({ pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' });
export const UnixMs = Type.Integer({ minimum: 0 });

/**
 * A raw CSS value destined for an inline `style` attribute / custom property.
 * Forbids the characters that could break out of a declaration. This is the
 * import-safety guard promised by the Styling-as-Data philosophy.
 */
export const CssToken = Type.String({ pattern: '^[^;{}<>]*$', minLength: 1, maxLength: 256 });

/** Local asset only. No http(s):, data:, or traversal. */
export const AssetPath = Type.String({ pattern: '^/assets/[A-Za-z0-9_-]+(/[A-Za-z0-9._-]+)+$', maxLength: 512 });
```

### 2.3 Theme (`schemas/theme.ts`)

Mirror the `CharacterTheme` interface from the UI/UX spec field-for-field; the interface is deleted and replaced by `Static<typeof CharacterThemeSchema>`.

```ts
export const ThemeFontSchema = Type.Object({
  family: CssToken, size: Type.Optional(CssToken), lineHeight: Type.Optional(CssToken)
});
export const ThemeColorsSchema = Type.Object({
  charBubbleBg: CssToken, charBubbleText: CssToken, charBubbleBorder: Type.Optional(CssToken),
  userBubbleBg: CssToken, userBubbleText: CssToken, userBubbleBorder: Type.Optional(CssToken),
  accent: CssToken, quote: Type.Optional(CssToken), action: Type.Optional(CssToken),
  narratorText: Type.Optional(CssToken)
});
export const ThemeBubbleSchema = Type.Object({
  radius: CssToken,
  charTail: Type.Optional(Type.Union([Type.Literal('left'), Type.Literal('none')])),
  userTail: Type.Optional(Type.Union([Type.Literal('right'), Type.Literal('none')])),
  padding: Type.Optional(CssToken)
});
export const ThemeBackgroundSchema = Type.Object({
  image: Type.Optional(AssetPath), overlay: Type.Optional(CssToken), blur: Type.Optional(CssToken)
});

export const CharacterThemeSchema = Type.Object({
  font: ThemeFontSchema, colors: ThemeColorsSchema, bubble: ThemeBubbleSchema, background: ThemeBackgroundSchema
});
export type CharacterTheme = Static<typeof CharacterThemeSchema>;

/** Deep-partial for persona.style_overrides (Type.Partial is shallow — build it explicitly). */
export const ThemeOverridesSchema = Type.Object({
  font: Type.Optional(Type.Partial(ThemeFontSchema)),
  colors: Type.Optional(Type.Partial(ThemeColorsSchema)),
  bubble: Type.Optional(Type.Partial(ThemeBubbleSchema)),
  background: Type.Optional(Type.Partial(ThemeBackgroundSchema))
});
export type ThemeOverrides = Static<typeof ThemeOverridesSchema>;

/** Neutral fallback used when a card arrives without a style (Phase 4 cascade layer 1). */
export const DEFAULT_CHARACTER_THEME: CharacterTheme = { /* system-ui, slate palette, 1rem radius, background: {} */ };
```
`background` is a required object whose members are all optional; `background: {}` is valid.

### 2.4 State (`schemas/state.ts`)

Exactly the spec's `StateFieldSchema` / `StateBindingSchema`, plus:
```ts
export const StateVectorSchema = Type.Record(Type.String(), Type.Unknown());
export type StateVector = Static<typeof StateVectorSchema>;
```
Binding `set` keys are dotted theme paths (`'colors.accent'`). Validation of *whether the path exists in the theme* and of `initialState` against `stateSchema` are cross-field checks that belong to the state engine (Phase 2/4). Phase 1 validates structure only. The seed test does a hand-rolled cross-check on the two seed cards (§5.2) so the seeds themselves are known-good.

### 2.5 Character (`schemas/character.ts`)

```ts
export const CharacterCardSchema = Type.Object({
  $schema: Type.Optional(Type.String()),
  id: Id,
  name: Type.String({ minLength: 1, maxLength: 120 }),
  avatar: Type.Optional(AssetPath),
  description: Type.String(),
  personality: Type.String(),
  scenario: Type.String(),
  firstMessage: Type.String(),
  exampleDialogue: Type.Optional(Type.String()),          // Amendment A2 — see below
  style: CharacterThemeSchema,
  stateSchema: Type.Optional(Type.Record(Type.String(), StateFieldSchema)),
  stateBindings: Type.Optional(Type.Array(StateBindingSchema)),
  initialState: Type.Optional(StateVectorSchema),
  tags: Type.Optional(Type.Array(Type.String())),
  creator: Type.Optional(Type.String()),
  version: Type.Optional(Type.String())
});
export type CharacterCard = Static<typeof CharacterCardSchema>;

/** Shape of characters.metadata (JSON column). Everything not in a dedicated column lives here. */
export const CharacterMetadataSchema = Type.Object({
  exampleDialogue: Type.Optional(Type.String()),
  stateSchema: Type.Optional(Type.Record(Type.String(), StateFieldSchema)),
  stateBindings: Type.Optional(Type.Array(StateBindingSchema)),
  initialState: Type.Optional(StateVectorSchema),
  tags: Type.Optional(Type.Array(Type.String())),
  creator: Type.Optional(Type.String()),
  version: Type.Optional(Type.String())
});
```

**Decision D1 — where `stateSchema` / `stateBindings` / `initialState` live.** The ADR-005 table has no columns for them, and the roadmap fixes Phase 1 at migrations v1+v2. They are stored inside `characters.metadata` under the `CharacterMetadataSchema` shape. The repository maps `CharacterCard ⇄ row` explicitly (§3.5); nothing else touches the JSON. If they ever need indexing, that is a v3 migration — not a schema change in `shared`.

**Amendment A2 — `exampleDialogue`.** The PromptBuilder spec (Block 5) reads example dialogue from the card, but `CharacterCardSchema` in the data spec omits it. Add it as optional now; adding it later would mean reshaping stored `metadata` JSON.

### 2.6 Persona, narrative, LLM

```ts
// schemas/persona.ts
export const PersonaSchema = Type.Object({
  id: Id, name: Type.String({ minLength: 1, maxLength: 120 }),
  avatar: Type.Optional(AssetPath), description: Type.String(),
  isDefault: Type.Boolean({ default: false }),
  styleOverrides: Type.Optional(ThemeOverridesSchema)
});

// schemas/narrative.ts
export const SegmentKindSchema = Type.Union(['narrator','character','npc','persona'].map(k => Type.Literal(k)));
export const SegmentSchema = Type.Object({ kind: SegmentKindSchema, name: Type.Optional(Type.String()), text: Type.String() });
export const ChatMetadataSchema = Type.Object({ /* exactly the spec's ChatMetadata interface */ });

// types/llm.ts — types only, no runtime; verbatim from the provider spec:
export type StreamEvent =
  | { type: 'token'; text: string }
  | { type: 'usage'; promptTokens: number; completionTokens: number }
  | { type: 'error'; message: string; recoverable: boolean }
  | { type: 'done'; finishReason: 'stop' | 'length' | 'aborted' };
// + MessagePayload, LLMRequest, ModelInfo, LLMProvider
```
`AsyncIterable` in `LLMProvider.generate` type-checks under `lib: ES2022` (it's in `es2018.asynciterable`).

### 2.7 Validation entry point (`validate.ts`)

```ts
import { Value } from '@sinclair/typebox/value';
import type { Static, TSchema } from '@sinclair/typebox';

export interface ValidationIssue { path: string; message: string; }
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: ValidationIssue[] };

/** Pipeline: Clone → Clean (strip unknown keys) → Default (apply schema defaults) → Check. Never mutates input. */
export function validate<S extends TSchema>(schema: S, input: unknown): ValidationResult<Static<S>> {
  const value = Value.Default(schema, Value.Clean(schema, Value.Clone(input)));
  if (Value.Check(schema, value)) return { ok: true, value: value as Static<S> };
  return { ok: false, issues: [...Value.Errors(schema, value)].map(e => ({ path: e.path, message: e.message })) };
}

export class ValidationError extends Error {
  constructor(public readonly label: string, public readonly issues: ValidationIssue[]) {
    super(`${label}: ${issues.map(i => `${i.path || '/'} ${i.message}`).join('; ')}`);
    this.name = 'ValidationError';
  }
}

export function assertValid<S extends TSchema>(schema: S, input: unknown, label: string): Static<S> {
  const r = validate(schema, input);
  if (!r.ok) throw new ValidationError(label, r.issues);
  return r.value;
}
```
Use `Value.Clone`, **not** `structuredClone` — the latter is not in the ES2022 lib and will not type-check under `types: []`. `Value.Errors` yields JSON-pointer paths (`/style/colors/accent`); the test suite asserts on them.

`Value.Clean` is deliberate policy: schemas do **not** set `additionalProperties: false`, so imported cards with unknown fields are accepted and stripped, not rejected.

---

## 3. Database Architecture (`backend/src/db/`)

### 3.1 Layout

```
backend/
├── package.json             # + "ulid", scripts: test, db:migrate, db:seed, db:check, db:reset
├── tsconfig.json            # include: ["src", "test", "scripts"]
├── scripts/
│   ├── migrate.ts  seed.ts  check.ts  reset.ts
├── test/
│   ├── helpers.ts           # openTestDb(':memory:' | tempfile)
│   ├── migrations.test.ts   integrity.test.ts   repositories.test.ts   seed.test.ts
└── src/
    ├── app.ts               # createApp(deps: AppDeps) — Bun-free, DB-free
    ├── index.ts             # boot: paths → openDatabase → runMigrations → seedIfEmpty → createApp → listen
    └── db/
        ├── paths.ts         # DB_PATH, ASSETS_DIR resolution, ensureDataDirs()
        ├── connection.ts    # openDatabase(): pragmas + assertions
        ├── ids.ts           # newId() via ulid monotonicFactory
        ├── migrate.ts       # runner + migrations array (v1, v2)
        ├── contracts.ts     # Repository interfaces + AppDeps — imports ONLY from shared (Bun-free)
        ├── repositories.ts  # bun:sqlite implementations of contracts.ts
        └── seeds/
            ├── characters.ts  # CharacterCard[] — Eldrin, Alice
            ├── personas.ts    # Persona[] — default
            └── seed.ts        # seed(repos, { force })
```

### 3.2 Paths (`paths.ts`)

Resolve relative to the source file, never `cwd` (Phase 0 convention):
```ts
const REPO_ROOT = join(import.meta.dir, '../../..');
export const DB_PATH    = process.env.FORMATAVERN_DB_PATH    ?? join(REPO_ROOT, 'formatavern.db');
export const ASSETS_DIR = process.env.FORMATAVERN_ASSETS_DIR ?? join(REPO_ROOT, 'data', 'assets');
export function ensureDataDirs() { for (const d of ['characters','backgrounds','fonts']) mkdirSync(join(ASSETS_DIR, d), { recursive: true }); }
```
`.gitignore` additions: `*.db`, `*.db-wal`, `*.db-shm`, `data/assets/**` (keep `.gitkeep` files if you want the tree in git).

### 3.3 Connection (`connection.ts`)

```ts
import { Database } from 'bun:sqlite';

export function openDatabase(path: string): Database {
  const db = new Database(path, { create: true, strict: true });
  if (path !== ':memory:') {
    const { journal_mode } = db.query('PRAGMA journal_mode = WAL;').get() as { journal_mode: string };
    if (journal_mode !== 'wal') throw new Error(`Expected WAL, got '${journal_mode}' for ${path}`);
  }
  db.run('PRAGMA synchronous = NORMAL;');
  db.run('PRAGMA foreign_keys = ON;');
  db.run('PRAGMA busy_timeout = 5000;');
  const { foreign_keys } = db.query('PRAGMA foreign_keys;').get() as { foreign_keys: number };
  if (foreign_keys !== 1) throw new Error('foreign_keys pragma did not take effect');
  return db;
}
```
- `strict: true` → named params bind as `{ id }` without `$`, and a **missing** parameter throws instead of silently binding `NULL` (the classic "row inserted with NULL FK" bug).
- `journal_mode` must be set **outside** a transaction; `foreign_keys` is a silent no-op inside one. Both are per-connection — every `new Database(...)` (tests, scripts, second connections) goes through `openDatabase`.
- `:memory:` reports `journal_mode = memory`; the WAL assertion is skipped for it. WAL behaviour is tested on a temp file.

### 3.4 Migration runner (`migrate.ts`)

```ts
export interface Migration { version: number; name: string; up: (db: Database) => void; }

export function runMigrations(db: Database, list: readonly Migration[] = migrations): { from: number; to: number } {
  list.forEach((m, i) => { if (m.version !== i + 1) throw new Error(`Migrations must be contiguous from 1; found v${m.version} at index ${i}`); });
  const latest = list.length;
  const { user_version: from } = db.query('PRAGMA user_version;').get() as { user_version: number };
  if (from > latest) throw new Error(`Database is schema v${from}; this build supports up to v${latest}. Refusing to open.`);
  for (const m of list) {
    if (m.version <= from) continue;
    db.transaction(() => {
      m.up(db);
      db.run(`PRAGMA user_version = ${m.version};`);   // PRAGMA cannot take bind params; m.version is a validated integer
    })();
  }
  return { from, to: latest };
}
```
Each version is its own transaction. SQLite DDL is transactional, and `user_version` lives in the file header inside the same write transaction, so a throwing `up()` leaves both schema and version untouched. Idempotence is owned by `user_version`, **not** by `IF NOT EXISTS` — v2's `ALTER TABLE ADD COLUMN` is not re-runnable, and a fresh v1-only DB upgraded by v2 is the case the roadmap wants exercised.

**Migration v1 — `initial_schema`.** The five tables from `spec-data-schemas-and-storage`, with three small defensive additions (marked ★):

```sql
CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, avatar TEXT, description TEXT, personality TEXT,
  scenario TEXT, first_message TEXT, style TEXT NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, metadata TEXT
);
CREATE INDEX IF NOT EXISTS idx_characters_updated ON characters(updated_at DESC);

CREATE TABLE IF NOT EXISTS personas (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, avatar TEXT, description TEXT,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),          -- ★
  style_overrides TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_personas_single_default ON personas(is_default) WHERE is_default = 1;  -- ★ at most one default

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY, title TEXT NOT NULL,
  primary_character_id TEXT NOT NULL, active_persona_id TEXT NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, metadata TEXT,
  FOREIGN KEY (primary_character_id) REFERENCES characters(id) ON DELETE RESTRICT,
  FOREIGN KEY (active_persona_id)    REFERENCES personas(id)   ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_chats_updated ON chats(updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, parent_id TEXT, sender_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),                       -- ★
  content TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('streaming','complete','aborted','error')),      -- ★
  created_at INTEGER NOT NULL, metrics TEXT, metadata TEXT,
  FOREIGN KEY (chat_id)   REFERENCES chats(id)    ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES messages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id, id ASC);
CREATE INDEX IF NOT EXISTS idx_messages_parent  ON messages(parent_id);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
```
Note: `metadata` on `messages` is a **v1** column (it's in the spec's table definition); your request listed it under v2 — the spec is authoritative. `sender_id` is polymorphic (character *or* persona) and therefore intentionally has no FK.

**Migration v2 — `narrative_envelope`** (exactly the spec, plus the CHECK):
```sql
ALTER TABLE messages ADD COLUMN narrative_role TEXT NOT NULL DEFAULT 'character'
  CHECK (narrative_role IN ('character','persona','npc','narrator'));
ALTER TABLE messages ADD COLUMN sender_name TEXT;
ALTER TABLE messages ADD COLUMN segments TEXT;
ALTER TABLE messages ADD COLUMN state TEXT;
UPDATE messages SET narrative_role = 'persona' WHERE role = 'user';
```
`ADD COLUMN ... NOT NULL` is legal only with a non-NULL default — it has one. Execute each statement with its own `db.run` (bun:sqlite's `run` executes one statement).

### 3.5 Repositories and the Bun-free contract boundary

`contracts.ts` — imports only from `@formatavern/shared`; this is what `app.ts` is allowed to `import type`:
```ts
export interface CharacterRepository {
  list(): CharacterCard[]; get(id: string): CharacterCard | null;
  upsert(card: CharacterCard): void; insertIfAbsent(card: CharacterCard): boolean;
  remove(id: string): void; count(): number;
}
export interface PersonaRepository { /* same shape over Persona; getDefault(): Persona | null */ }
export interface Repositories { characters: CharacterRepository; personas: PersonaRepository; schemaVersion(): number; }
export interface AppDeps { repos: Repositories; }
```

`repositories.ts` — the only module besides `migrate.ts`/`connection.ts` that imports `bun:sqlite`. Mapping rules (normative):

| `CharacterCard` field | `characters` column | Encoding |
|---|---|---|
| `id, name, avatar, description, personality, scenario` | same (snake_case) | as-is |
| `firstMessage` | `first_message` | as-is |
| `style` | `style` | `JSON.stringify` (validated `CharacterTheme`) |
| `exampleDialogue, stateSchema, stateBindings, initialState, tags, creator, version` | `metadata` | one `JSON.stringify(CharacterMetadata)` object; **omit keys that are `undefined`** so `metadata` round-trips as a clean object |
| — | `created_at`, `updated_at` | `Date.now()`; `upsert` preserves `created_at` (`ON CONFLICT(id) DO UPDATE SET … updated_at = excluded.updated_at`, never `created_at`) |

`Persona`: `isDefault` ⇄ `is_default` (`1`/`0`), `styleOverrides` ⇄ `style_overrides` JSON.

- Every write method begins with `assertValid(Schema, input, label)` (I2). Reads trust the DB and do **not** revalidate (the `db:check` script audits rows on demand instead).
- `insertIfAbsent` = `INSERT … ON CONFLICT(id) DO NOTHING`, returns `changes === 1`. Used by seeding.
- Prepared statements are created once per repository instance (`db.query(...)` caches) — not per call.
- `newId()` = `monotonicFactory()` from `ulid` — ordinary `ulid()` can produce out-of-order IDs within one millisecond, which breaks the "ULID = chronological order" assumption the `messages` index relies on.

### 3.6 Boot wiring and the health contract

`index.ts` order: `ensureDataDirs()` → `openDatabase(DB_PATH)` → `runMigrations(db)` (log `from→to`) → `seedIfEmpty(repos)` → `createApp({ repos })` → prod static (unchanged) → `listen`. Add `process.on('SIGINT'|'SIGTERM', () => { db.close(); process.exit(0) })` so WAL checkpoints on clean exit.

`app.ts` becomes a factory; `App` type is `ReturnType<typeof createApp>`:
```ts
export function createApp({ repos }: AppDeps) {
  return new Elysia({ prefix: '/api' })
    .get('/health', (): HealthResponse => ({
      ok: true, service: 'formatavern-backend', sharedVersion: SHARED_VERSION, timestamp: Date.now(),
      db: { schemaVersion: repos.schemaVersion(), characters: repos.characters.count(), personas: repos.personas.count() }
    }))
    .post('/chat/test-stream', /* unchanged from Phase 0 */);
}
export type App = ReturnType<typeof createApp>;
```
`HealthResponse` in `shared` gains `db: { schemaVersion: number; characters: number; personas: number }`. The frontend health line becomes `ok · shared 0.1.0-phase1 · db v2 · 2 chars / 1 persona`. In `readTestStream`'s consumer: `if (e.type === 'token') … else if (e.type === 'done') status = 'done'; else if (e.type === 'error') status = 'error';`.

### 3.7 Seeds

`seed(repos, { force = false })`:
- If `!force` and `repos.characters.count() > 0` → no-op (a user who deleted Eldrin must not get him back on every boot).
- Otherwise `insertIfAbsent` each seed. With `force`, `upsert` instead (dev reset).
- Seed IDs are **fixed slugs** (`eldrin-the-mage`, `alice`, `persona-default`) so idempotence is by identity, not by name matching. ULIDs are for user-created rows.
- Seeds carry **no** `avatar` and no `background.image` — those files don't exist yet, and `AssetPath` rejects nothing but the seed would reference a 404. Add them when the asset pipeline lands.

Seed content (structure is normative; prose may be authored freely):

```ts
// seeds/characters.ts
export const eldrin: CharacterCard = {
  id: 'eldrin-the-mage', name: 'Eldrin the Mage',
  description: '…', personality: '…', scenario: '…',
  firstMessage: '*The observatory hums…* "You arrive as the ley lines align. Speak plainly—time is thin."',
  style: {
    font: { family: "'Cinzel', Georgia, serif", size: '1rem', lineHeight: '1.7' },
    colors: { charBubbleBg: 'rgba(69, 26, 3, 0.6)', charBubbleText: '#fef3c7', charBubbleBorder: 'rgba(180, 83, 9, 0.4)',
              userBubbleBg: 'rgba(15, 23, 42, 0.8)', userBubbleText: '#f8fafc', accent: '#d97706',
              quote: '#fde047', action: '#cbd5e1', narratorText: '#d6d3d1' },
    bubble: { radius: '1rem', charTail: 'left', padding: '1rem 1.25rem' },
    background: { overlay: 'rgba(10, 10, 15, 0.75)', blur: '4px' }
  },
  stateSchema: {
    mood:     { type: 'enum', values: ['calm','curious','urgent','furious'], aliases: { angry: 'furious', anxious: 'urgent' }, default: 'calm' },
    affinity: { type: 'int', min: 0, max: 10, default: 5 },
    danger:   { type: 'enum', values: ['low','elevated','high'], default: 'low' },
    scene:    { type: 'string', default: 'spire_observatory' }
  },
  stateBindings: [
    { when: { mood: 'furious' }, set: { 'colors.accent': '#dc2626', 'colors.charBubbleBorder': 'rgba(220, 38, 38, 0.6)' } },
    { when: { danger: 'high' },  set: { 'background.overlay': 'rgba(40, 5, 5, 0.8)' } }
  ],
  initialState: { mood: 'calm', affinity: 5, danger: 'low', scene: 'spire_observatory' },
  tags: ['fantasy', 'seed'], creator: 'formatavern', version: '1'
};

// alice: gothic serif — "'Playfair Display', Georgia, serif"; charBubbleBg 'rgba(24, 8, 16, 0.7)', charBubbleText '#f5e6e8',
// accent '#9f1239', quote '#fda4af', action '#c4b5fd'; bubble radius '0.5rem'; mood enum ['guarded','defiant','warm','furious']
// (alias cold→guarded), affinity default 4, danger default 'elevated', scene default 'tavern_ambush'; one binding on mood=furious.

// seeds/personas.ts
export const defaultPersona: Persona = { id: 'persona-default', name: 'Traveler', description: '…', isDefault: true };
```
Both seed cards must be the fixture data the Phase 2 `MockLLMProvider` and envelope tests will reference (`Eldrin the Mage`, `Alice`, state keys `mood/affinity/danger/scene`) — keep the names and keys exactly.

### 3.8 Scripts

Root: `"test": "bun run --cwd packages/shared test && bun run --cwd backend test"`, `"db:migrate" | "db:seed" | "db:check" | "db:reset"` → `bun run --cwd backend <same>`.

Backend `scripts/`:
- `migrate.ts`: open, migrate, print `from → to`, close.
- `seed.ts`: open, migrate, `seed(repos, { force: process.argv.includes('--force') })`, print counts.
- `check.ts`: prints `user_version`, `journal_mode`, `foreign_keys`, `PRAGMA integrity_check`, `PRAGMA foreign_key_check` (must be empty), `PRAGMA table_info(messages)` column names, row counts, and runs `validate()` over every character/persona row — exit 1 on any failure. This is the CLI verification tool; no `sqlite3` binary required.
- `reset.ts`: deletes `DB_PATH`, `-wal`, `-shm`; refuses when `NODE_ENV=production` unless `--yes`.

---

## 4. Tricky Traps & Failure Modes

### 4.1 Shared / TypeBox

| Trap | Symptom | Guard |
|---|---|---|
| Two `@sinclair/typebox` copies (shared vs. Elysia's) | Passing a shared schema to an Elysia `body:` in Phase 3 yields `TSchema` type mismatch; `Value.Check` results can differ | Match Elysia's range; `bun pm ls --all` shows one copy; root `overrides` if not |
| `shared/test/*.ts` imports `bun:test` under `types: []` | `Cannot find module 'bun:test'` in the editor / tsc | `test/tsconfig.json` with `types: ["bun"]`; `typecheck` script still targets `src` only |
| `structuredClone` in `validate.ts` | Type error under ES2022 lib | `Value.Clone` |
| `Type.Partial(CharacterThemeSchema)` for overrides | Shallow: `colors: {}` invalid unless all required colors present | Explicit `ThemeOverridesSchema` (§2.3) |
| Schemas with `additionalProperties: false` | Community cards with extra keys rejected outright | Leave open; strip with `Value.Clean` |
| Nested `Type.Union` of objects (`StateFieldSchema`) produces noisy `Value.Errors` | Hard-to-read failures | Tests assert on the *first* error path and `ok === false`, not on message text |
| Frontend Vite discovers `@sinclair/typebox` late (linked package dep) | One-time "new dependencies optimized, reloading" | Benign; if it recurs, `optimizeDeps.include: ['@sinclair/typebox', '@sinclair/typebox/value']` |

### 4.2 SQLite / bun:sqlite

| Trap | Symptom | Guard |
|---|---|---|
| `PRAGMA foreign_keys` set inside a transaction | Silently ignored; FKs never enforced | Set in `openDatabase()` before any transaction; assert it read back as `1` |
| Forgetting pragmas on a second connection (tests, scripts, CLI) | FK tests pass on one connection, fail on another | All connections via `openDatabase()` |
| `PRAGMA user_version = ?` with a bound param | Syntax error | String interpolation of a validated integer |
| `db.run` with multiple statements in one string | Only the first executes | One statement per `run` (or `db.exec` for a DDL batch) |
| Two `new Database(':memory:')` | Distinct databases; "concurrency" tests prove nothing | WAL / multi-connection tests use a temp **file** |
| `INSERT OR IGNORE` expected to swallow FK errors | It doesn't — FK violations are not "conflicts" | Expect and assert the throw |
| Missing named bind param | Inserts `NULL` silently → FK row with null pointer *passes* (NULL FKs are allowed) | `strict: true` throws on missing params |
| `is_default` set on two personas | Ambiguous `{{user}}` resolution later | Partial unique index (v1 ★) |
| Deleting a root message | Whole subtree disappears — **intended** (spec) | Test documents it explicitly so nobody "fixes" it |
| WAL sidecars `-wal`/`-shm` | Copying only `formatavern.db` loses recent writes | Backups must `PRAGMA wal_checkpoint(TRUNCATE)` first (documented, not built) |
| Windows: `db:reset` while `bun --watch` or SQLite CLI holds the file | `EBUSY`/`EPERM` | Stop servers/CLI first; script prints that hint on `EBUSY` |
| Windows: `bun test` temp DB cleanup | `unlink` fails on open handle | `db.close()` in `afterEach` **before** unlink; remove all three files |
| Large integers | `safeIntegers` off → numbers; ms timestamps < 2^53 are fine | No action; do not store token counts as BIGINT-scale values |

### 4.3 Purity / type boundary

| Trap | Symptom | Guard |
|---|---|---|
| `.decorate('db', db)` in `app.ts` | `Database` type leaks into `App` → `svelte-check` needs `bun:sqlite` types | Inject `Repositories` interface (`contracts.ts`, shared-only imports) |
| `app.ts` imports `repositories.ts` for the type | Same leak via transitive `import type` | Only `import type { AppDeps } from './db/contracts'` |
| `createApp` return type not exported | Eden client loses route typing | `export type App = ReturnType<typeof createApp>` |

---

## 5. Definition of Done & Verification

### 5.1 Acceptance criteria (all must hold)

1. `bun install` (root) resolves one `@sinclair/typebox` copy; `bun run typecheck` passes in all three packages (frontend `svelte-check` still 0/0 with `App` now sourced from `createApp`).
2. `bun run test` passes: shared schema tests + backend migration, integrity, repository, and seed tests.
3. Fresh boot on an absent DB file logs `migrations: 0 → 2` and `seeded: 2 characters, 1 persona`; second boot logs `migrations: 2 → 2` and no seeding.
4. `GET /api/health` (direct and proxied) returns `sharedVersion: "0.1.0-phase1"` and `db: { schemaVersion: 2, characters: 2, personas: 1 }`; the browser page shows it; the Phase 0 stream test still passes unchanged.
5. `bun run db:check` exits 0 and prints `journal_mode=wal`, `foreign_keys=1`, `user_version=2`, `integrity_check=ok`, empty `foreign_key_check`, `messages` columns including `narrative_role, sender_name, segments, state`, and "2/2 characters valid, 1/1 personas valid".
6. FK behaviour is proven by test: RESTRICT on character/persona with chats; CASCADE chat→messages; CASCADE message→subtree; sibling survives.
7. Migration semantics proven by test: idempotent re-run; v1-only DB upgrades to v2 with data preserved; a throwing migration leaves `user_version` and schema unchanged; `user_version` newer than build refuses to open.
8. Validation proven by test: seeds pass; targeted corruptions fail with the expected JSON-pointer path; `Value.Clean` strips unknown keys; CSS-injection-shaped tokens are rejected.
9. Production path: `bun run build && bun run start` boots, migrates, seeds, and serves the SPA exactly as in Phase 0 — with `formatavern.db` created at the repo root (or `FORMATAVERN_DB_PATH`).

### 5.2 Required tests (normative list)

**`packages/shared/test/schemas.test.ts`**
- `validate(CharacterCardSchema, eldrinFixture).ok === true` (import the seed object via a local copy/fixture, not from backend — shared must not depend on backend).
- Delete `style.colors.accent` → `ok === false`, first issue `path === '/style/colors/accent'`.
- `stateSchema.mood.type = 'bogus'` → `ok === false`, issue path starts with `/stateSchema/mood`.
- `style.colors.accent = 'red; background:url(x)'` → rejected (CssToken pattern). `avatar = 'http://evil/x.png'` → rejected (AssetPath).
- Input with `{ unknownKey: 1 }` → `ok === true` and `value` lacks `unknownKey`; original input object unchanged (no mutation).
- `PersonaSchema` with `isDefault` omitted → `value.isDefault === false` (defaulting works).
- Cross-check helper (test-local): for each seed card, every `initialState` key exists in `stateSchema`, enum values are members, ints within `[min,max]`, and every binding `set` key resolves to an existing path in `style`.

**`backend/test/migrations.test.ts`**
- Fresh `:memory:` → `runMigrations` returns `{from:0,to:2}`; `PRAGMA user_version` = 2; `table_info(messages)` contains the four v2 columns with `narrative_role` `notnull=1`, `dflt_value='character'`.
- Run again → `{from:2,to:2}`, no error.
- Fresh DB → `runMigrations(db, migrations.slice(0,1))`; insert a `role='user'` message (with prerequisite character/persona/chat); `runMigrations(db)` → that row now has `narrative_role='persona'`; an `assistant` row has `'character'`.
- Append a fake v3 whose `up` creates a table then throws → `runMigrations` throws; `user_version` still 2; the table does not exist (rollback).
- Set `PRAGMA user_version = 99` → `runMigrations` throws "newer than this build".
- Non-contiguous list (`[v1, v3]`) → throws before touching the DB.

**`backend/test/integrity.test.ts`** (helper seeds one character, one persona)
- Insert chat with `primary_character_id='ghost'` → throws `/FOREIGN KEY constraint failed/`.
- Insert chat (valid) → delete that character → throws (RESTRICT); delete persona → throws.
- Delete chat → `SELECT count(*) FROM messages WHERE chat_id=?` = 0 (CASCADE).
- Tree: root → A → A1, A2; root → B. Delete A → A, A1, A2 gone; root and B remain. Delete root → all gone.
- Insert second persona with `is_default=1` → throws (unique partial index).
- Insert message with `status='pending'` → throws (CHECK).
- WAL on temp file: `openDatabase(tmp)` → `PRAGMA journal_mode` = `wal`; open a **second** `openDatabase(tmp)`; within a write transaction on conn 1 (not yet committed), conn 2 can `SELECT count(*)` without error (readers don't block). Close both, unlink all three files.

**`backend/test/repositories.test.ts`**
- `characters.upsert(eldrin)` → `get('eldrin-the-mage')` deep-equals `eldrin` (JSON round-trip incl. `stateBindings`; no `undefined`-valued keys appear).
- `upsert` again with changed `name` → `updated_at` advanced, `created_at` unchanged, `count()` still 1.
- `upsert({ ...eldrin, style: { ...eldrin.style, colors: {} } })` → throws `ValidationError`; row unchanged.
- `insertIfAbsent(eldrin)` returns `true` then `false`.
- `personas.getDefault()` returns the default persona after seeding.

**`backend/test/seed.test.ts`**
- `seed()` on empty DB → counts 2/1; `seed()` again → 2/1 and `updated_at` unchanged (no rewrite).
- Modify Eldrin's `name` via `upsert`, `seed()` → modification preserved; `seed({force:true})` → reverted.
- Delete Alice, `seed()` → still 1 character (seed-if-empty semantics).

### 5.3 Step-by-step verification

```bash
bun install
bun pm ls --all | grep -i typebox          # exactly one version
bun run typecheck
bun run test                                # all suites green

bun run db:reset --yes 2>/dev/null; bun run dev
#   backend log: "[db] formatavern.db  migrations: 0 → 2  seeded: 2 characters, 1 persona"
curl -s http://127.0.0.1:5173/api/health   # ..."sharedVersion":"0.1.0-phase1","db":{"schemaVersion":2,"characters":2,"personas":1}
#   browser: health line shows db v2 · 2/1; "Run test stream" still ✓
#   Ctrl+C, restart `bun run dev` → log: "migrations: 2 → 2", no "seeded" line

bun run db:check                            # exit 0; prints wal / fk=1 / v2 / integrity ok / columns / 2/2 + 1/1 valid
ls formatavern.db*                          # formatavern.db, -wal, -shm present while server runs

# production
bun run build && bun run start              # same boot log; SPA + health as in Phase 0
```

### 5.4 Explicit scope boundaries — deferred

Do **not** introduce in Phase 1:
- **LLM engine (Phase 2):** no `LLMProvider` implementations, no `MockLLMProvider`, no OpenRouter adapter, no envelope parser, no `jsonrepair`, no state-value coercion / alias resolution (only the *schema* for state fields ships now).
- **Prompting (Phase 2):** no `PromptBuilder`, macros, or `gpt-tokenizer`.
- **API surface (Phase 3):** no `/api/characters` CRUD, no `/api/chat/send`, no chats/messages repositories or state machine, no import/export endpoints, no PNG parser. `health` is the only endpoint touching the DB.
- **Frontend (Phase 4):** no Tailwind, theme injection, routes, or components — only the health line text changes.
- **Ops:** no backup/checkpoint tooling, no `bun build --compile`, no auth.

What Phase 1 hands to Phase 2: validated `CharacterCard`/`Persona` records in SQLite with the exact names and state keys the mock provider and parser fixtures will use; a `validate()` pipeline every boundary reuses; a `Repositories` contract that Phase 3 extends with chats/messages without touching `app.ts` purity.

---

## 6. Execution Order

1. `shared`: add TypeBox (version-matched), write `primitives → theme → state → character → persona → narrative → llm → validate → index`; move Phase 0 stream constants to `fixtures.ts`; bump `SHARED_VERSION`; extend `HealthResponse`. Add `test/tsconfig.json` + `schemas.test.ts`. `bun run --cwd packages/shared test`.
2. `backend`: `paths.ts`, `connection.ts`, `ids.ts`, `migrate.ts` (v1, v2). Write `migrations.test.ts` and `integrity.test.ts` **before** repositories — they use raw SQL and prove the schema independently of the mapping layer.
3. `contracts.ts` → `repositories.ts` → `repositories.test.ts`.
4. `seeds/` → `seed.test.ts`.
5. `app.ts` → `createApp(deps)`; `index.ts` boot sequence; frontend health line + `error` event handling. `bun run typecheck` — confirm `svelte-check` is still clean (this is where a purity leak would surface).
6. Scripts (`migrate/seed/check/reset`), root script entries, `.gitignore`.
7. Run §5.3 top to bottom; attach the `db:check` output and boot logs (first and second boot) to the PR as the acceptance artifact.