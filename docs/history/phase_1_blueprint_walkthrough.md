# FormaTavern — Phase 1: The Foundation (Storage, Schemas & Migrations) Walkthrough

All deliverables, database constraints, schemas, and acceptance criteria specified in [phase_1_blueprint.md](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/docs/blueprints/phase_1_blueprint.md) have been implemented and verified.

---

## 1. Overview of Delivered Components

```
FormaTavern/
├── package.json                          # Root orchestration: test, db:migrate, db:seed, db:check, db:reset
├── packages/shared/                      # @formatavern/shared (isomorphic domain layer)
│   ├── package.json                      # TypeBox ^0.34.52 singleton dependency
│   ├── tsconfig.json                     # Strict isomorphism (lib: ["ES2022"], types: [])
│   └── src/
│       ├── schemas/
│       │   ├── primitives.ts             # Id, UnixMs, CssToken (CSS injection guard), AssetPath
│       │   ├── theme.ts                  # ThemeFont, ThemeColors, ThemeBubble, ThemeBackground, CharacterTheme, ThemeOverrides
│       │   ├── state.ts                  # StateField (enum, int, string), StateBinding, StateVector
│       │   ├── character.ts              # CharacterCard (with exampleDialogue, style, stateSchema, bindings, initialState)
│       │   ├── persona.ts                # Persona (isDefault defaults false, styleOverrides)
│       │   └── narrative.ts              # SegmentKind, Segment, ChatMetadata
│       ├── types/
│       │   └── llm.ts                    # StreamEvent, MessagePayload, LLMRequest, ModelInfo, LLMProvider, AbortSignal
│       ├── validate.ts                   # validate(), assertValid() with Clone -> Clean -> Default -> Check
│       ├── fixtures.ts                   # Test stream constants
│       └── index.ts                      # Barrel export, SHARED_VERSION = '0.1.0-phase1', HealthResponse
├── backend/                              # @formatavern/backend (Elysia + SQLite storage)
│   ├── src/
│   │   ├── db/
│   │   │   ├── paths.ts                  # DB_PATH (formatavern.db), ASSETS_DIR (data/assets)
│   │   │   ├── connection.ts             # openDatabase() with WAL, synchronous=NORMAL, foreign_keys=ON
│   │   │   ├── ids.ts                    # Monotonic ULID generator (monotonicFactory)
│   │   │   ├── migrate.ts                # Transactional runner: v1 (5 tables, partial index) & v2 (narrative columns)
│   │   │   ├── contracts.ts              # Repository & AppDeps interfaces (zero native runtime types)
│   │   │   ├── repositories.ts           # SQLite CharacterRepository & PersonaRepository with assertValid writes
│   │   │   └── seeds/
│   │   │       ├── characters.ts         # Eldrin the Mage & Alice fixtures
│   │   │       ├── personas.ts           # Default persona (Traveler)
│   │   │       └── seed.ts               # Idempotent seed-if-empty logic
│   │   ├── app.ts                        # createApp({ repos }) factory, /api/health with db metrics
│   │   └── index.ts                      # Boot sequence & graceful SIGINT/SIGTERM shutdown
│   ├── scripts/                          # CLI database utilities
│   │   ├── migrate.ts                    # bun run db:migrate
│   │   ├── seed.ts                       # bun run db:seed [--force]
│   │   ├── check.ts                      # bun run db:check (schema integrity, FK check, row validation)
│   │   └── reset.ts                      # bun run db:reset [--yes]
│   └── test/                             # 21 backend unit & integration tests
│       ├── helpers.ts                    # openTestDb() with memory and disk fixtures
│       ├── migrations.test.ts            # v0->v2, idempotency, v1->v2 backfill, rollback, sequence validation
│       ├── integrity.test.ts             # FK RESTRICT, CASCADE, partial unique index, CHECK constraints, WAL readers
│       ├── repositories.test.ts          # CRUD, JSON round-trips, validation rejection, default persona lookup
│       └── seed.test.ts                  # Empty seeding, idempotency, user modification preservation, --force
└── frontend/                             # @formatavern/frontend (SvelteKit)
    └── src/routes/+page.svelte           # Updated health readout: schemaVersion, characters, personas
```

---

## 2. Invariants & Key Architectural Decisions

- **Invariant I1 (TypeBox Singleton)**: Single `@sinclair/typebox` `^0.34.52` dependency in `packages/shared`, matching Elysia's peer dependency requirement. Zero duplicates across the workspace.
- **Invariant I2 (Validation Pipeline)**: All writes in `CharacterRepository` and `PersonaRepository` invoke `assertValid()`. Unknown fields are stripped via `Value.Clean()`, defaults applied via `Value.Default()`, and structural types validated via `Value.Check()`.
- **Invariant I3 (SQLite WAL & Pragmas)**: Initialized via `openDatabase()` applying `journal_mode = WAL`, `synchronous = NORMAL`, `busy_timeout = 5000`, and `foreign_keys = ON`. An explicit pragma assertion verifies `foreign_keys === 1`.
- **Invariant I4 (Monotonic ULIDs)**: Monotonic factory `ulid.monotonicFactory()` ensures lexical ordering even when IDs are generated within the same millisecond.
- **Invariant I5 (Transactional Migrations)**: Migrations run inside explicit SQLite transactions (`db.transaction()`), safely updating `PRAGMA user_version`. Any failure rolls back completely without altering `user_version`.
- **Invariant I6 (Boundary Purity)**: `backend/src/app.ts` does not import `bun:sqlite` or native database instances. Dependency injection via `AppDeps` allows `svelte-check` to inspect `import type { App }` without loading native modules into browser tooling.

---

## 3. Verification Results

### A. Comprehensive Test Suite (`bun run test`)
```
$ bun run test
$ bun run --cwd packages/shared test && bun run --cwd backend test
$ bun test
bun test v1.4.1 (4661e494f)

test\schemas.test.ts:
(pass) Shared Schema Validation > validates a complete valid CharacterCard (Eldrin) [2.66ms]
(pass) Shared Schema Validation > fails with exact JSON pointer when required field style.colors.accent is missing [4.03ms]
(pass) Shared Schema Validation > fails with issue path starting at /stateSchema/mood for invalid state field type [0.75ms]
(pass) Shared Schema Validation > rejects CSS token injection attempts and invalid asset paths [1.59ms]
(pass) Shared Schema Validation > strips unknown keys without mutating the input object [0.54ms]
(pass) Shared Schema Validation > applies default for isDefault in PersonaSchema [0.12ms]
(pass) Shared Schema Validation > passes cross-check verification on seed fixtures [0.18ms]

 7 pass
 0 fail
 46 expect() calls
Ran 7 tests across 1 file. [74.00ms]

$ bun test
bun test v1.4.1 (4661e494f)

test\integrity.test.ts:
(pass) Database Foreign Keys & Schema Integrity > rejects chat insertion with nonexistent primary_character_id (FK RESTRICT) [2.69ms]
(pass) Database Foreign Keys & Schema Integrity > prevents deletion of character or persona referenced by a chat (ON DELETE RESTRICT) [1.91ms]
(pass) Database Foreign Keys & Schema Integrity > cascades deletion from chat to messages (ON DELETE CASCADE) [1.92ms]
(pass) Database Foreign Keys & Schema Integrity > cascades deletion through the message tree (root -> A -> A1, A2; root -> B) [2.02ms]
(pass) Database Foreign Keys & Schema Integrity > enforces partial unique index on personas.is_default (at most one default) [1.43ms]
(pass) Database Foreign Keys & Schema Integrity > enforces CHECK constraint on messages.status [1.45ms]
(pass) Database Foreign Keys & Schema Integrity > enables WAL on file database and verifies non-blocking readers [12.41ms]

test\migrations.test.ts:
(pass) Database Migrations > runs migrations on fresh database from v0 to v2 and alters schema [1.68ms]
(pass) Database Migrations > is idempotent on subsequent migration runs [1.50ms]
(pass) Database Migrations > upgrades v1 database to v2 and backfills user messages [1.79ms]
(pass) Database Migrations > rolls back failed migration without altering user_version or leaving partial schema [1.78ms]
(pass) Database Migrations > refuses to open if user_version is newer than supported migrations [0.21ms]
(pass) Database Migrations > rejects non-contiguous migration sequences before running [0.17ms]

test\repositories.test.ts:
(pass) SQLite Repositories > upserts and retrieves CharacterCard with clean JSON round-trip [4.95ms]
(pass) SQLite Repositories > preserves created_at and advances updated_at on subsequent upsert [14.74ms]
(pass) SQLite Repositories > rejects invalid card writes with ValidationError and leaves table unchanged [5.96ms]
(pass) SQLite Repositories > returns true on first insertIfAbsent and false on duplicate [2.45ms]
(pass) SQLite Repositories > retrieves default persona via personas.getDefault() [1.69ms]

test\seed.test.ts:
(pass) Database Seeding > seeds empty database with 2 characters and 1 persona, and is idempotent on re-run without rewriting [13.82ms]
(pass) Database Seeding > preserves user modifications on normal seed, but resets with force: true [2.99ms]
(pass) Database Seeding > does not re-seed deleted characters if other characters exist (seed-if-empty semantics) [2.04ms]

 21 pass
 0 fail
 73 expect() calls
Ran 21 tests across 4 files. [157.00ms]
```

### B. Type Integrity (`bun run typecheck`)
```
$ bun run typecheck
$ bun run --cwd packages/shared typecheck && bun run --cwd backend typecheck && bun run --cwd frontend check
$ tsc --noEmit -p .
$ tsc --noEmit -p .
$ svelte-kit sync && svelte-check --tsconfig ./tsconfig.json
Loading svelte-check in workspace: s:\WorkSpace\Git Workspace\FormaTavern\frontend
Getting Svelte diagnostics...

svelte-check found 0 errors and 0 warnings
```

### C. Database Health Oracle (`bun run db:check`)
```
$ bun run db:check
$ bun scripts/check.ts
journal_mode=wal
foreign_keys=1
user_version=2
integrity_check=ok
foreign_key_check=empty
messages columns: id, chat_id, parent_id, sender_id, role, content, status, created_at, metrics, metadata, narrative_role, sender_name, segments, state
counts: 2 characters, 1 personas
2/2 characters valid, 1/1 personas valid
```

### D. Extended `/api/health` Payload
```json
{
  "ok": true,
  "service": "formatavern-backend",
  "sharedVersion": "0.1.0-phase1",
  "timestamp": 1788562300000,
  "db": {
    "schemaVersion": 2,
    "characters": 2,
    "personas": 1
  }
}
```

---

## 4. Scope Boundary Verification

| Component | Status | Target Phase |
|---|---|---|
| Isomorphic TypeBox domain schemas | **Complete** | Phase 1 |
| SQLite WAL, migrations v1 & v2, seeds | **Complete** | Phase 1 |
| Repository layer & `assertValid` enforcement | **Complete** | Phase 1 |
| Database CLI tools (`migrate`, `seed`, `check`, `reset`) | **Complete** | Phase 1 |
| LLM Adapters / Providers | **Deferred** | Phase 2 |
| PromptBuilder / Token Budgeting / Macros | **Deferred** | Phase 2 |
| Chat & Message CRUD Endpoints | **Deferred** | Phase 3 |
| Streaming state machine (500ms SQLite flush, stop maps) | **Deferred** | Phase 3 |
| Chameleon UI & Theme Token Cascade | **Deferred** | Phase 4 |
