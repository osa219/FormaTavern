# Universal Exchange Layer (Import/Export Subsystem) — Living Walkthrough

This living document tracks the progressive implementation, architectural compliance, and verification of the **FormaTavern Universal Exchange Layer** as specified in [`docs/history/blueprints/import-export-blueprint.md`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/docs/history/blueprints/import-export-blueprint.md).

It is updated after the completion of each execution step.

---

## Blueprint Implementation Progress

| Step | Title | Primary Invariants | Scope / Target | Status | Commit |
|---|---|---|---|---|---|
| **Step 1** | Shared Schemas, Media URLs & Deterministic Provenance | X1, X4, I5 | `@formatavern/shared`: canonical hashing, media URL rewriter, sync schemas | **Complete** | [`3b720e2`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared) |
| **Step 2** | Backend Storage Foundation, Schema v11 & Provenance Tracking | X1, X3, X7, I3 | Backend: migration 11, asset repo, provenance columns, audits, pool GC | **Complete** | [`f1ca51c`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend) |
| **Step 3** | Content-Addressed Media Pool Store & Serving | X3, X10, A-AS1 | Backend: `FsAssetStore.putPool`, static route nosniff, security guards | **Complete** | [`af4b245`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend) |
| **Step 4** | CustomEngine ETL Pipeline Service & CLI Runner | X1, X2, X5, X6, X9 | Backend: Sniff/Plan/Copy/Upsert/Append/Rebuild service, CLI, 6 test suites | **Complete** | [`3fac6be`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend) |
| **Step 5** | API Routes, Background Runner & Format Exporters | X8, N6, S2 | API endpoints, progress polling, V2 PNG, JSONL, CharX, Relational Pack | *Queued* | — |
| **Step 6** | Frontend Render Boundary, Media Rewrite & Snapshot Label | X4, X5, U2, U10 | Frontend: pure mediaRewrite, missing slate, You panel snapshot label | *Queued* | — |
| **Step 7** | Documentation, Production Static Proofs & PR Verification | All | Docs update (v11 schema/arch), live dump full run artifacts, verification proofs | *Queued* | — |

---

## Step 1: Shared Schemas, Media URLs & Deterministic Provenance

### Objective
Establish pure, isomorphic primitives in `@formatavern/shared` for:
1. Detecting and rewriting `media://{64hex}` URIs without host coupling.
2. Canonical, key-sorted JSON projection and deterministic SHA-256 hashing for dirty-checking and idempotency.
3. TypeBox contracts for sync reports, quarantine records, and character import extensions.

### Implementation Summary
- **Pure SHA-256 Digest** ([`packages/shared/src/text/sha256.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/text/sha256.ts)):
  - Built an isomorphic, zero-dependency SHA-256 implementation capable of executing in Node, Bun, and browser runtimes.
- **Media URL Utilities** ([`packages/shared/src/mediaUrls.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/mediaUrls.ts)):
  - Declared `MEDIA_URL_RE = /media:\/\/([a-f0-9]{64})/g` (strictly lowercase 64-hex SHA-256).
  - Implemented `extractMediaHashes(text)` returning a deduplicated array of 64-hex hashes.
  - Implemented `rewriteMediaUrls(text, resolver)` for deterministic render-boundary transformation. Verified idempotency: `rewrite(rewrite(text)) === rewrite(text)`.
- **Deterministic Provenance Engine** ([`packages/shared/src/provenance.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/provenance.ts)):
  - `canonicalJson(val)`: Recursively sorts object keys alphabetically at all nesting levels, strips whitespace, and canonicalizes arrays while preserving item ordering.
  - `canonicalCharacter(record)` & `canonicalChat(record)`: Strips non-semantic/volatile timestamps (`created_at`, `updated_at`) to ensure dirty-checking tests semantic content rather than file export times.
  - `hashCanonical(input)`: Generates 64-character lowercase SHA-256 hash representing canonical payload.
- **Schema Extensions** ([`packages/shared/src/schemas/character.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/schemas/character.ts), [`sync.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/schemas/sync.ts)):
  - Added `CharacterImportMetadataSchema` for `metadata.import` (`origin`, `originId`, `originHash`, `tagsRaw`, `tokenCounts`, `stats`, `soundcloudTrackId`, `isNsfw`, `isImageNsfw`).
  - Added `SyncReportSchema` and `QuarantinedChatSchema`.
  - Added `ApiErrorCodeSchema` additions: `'sync_in_progress'`, `'unsupported_format'`, `'quarantined'`, `'asset_type_rejected'`.

### Verification
- `packages/shared/test/mediaUrls.test.ts`: Verified regex matching, uppercase/short/long hash rejection, and idempotency.
- `packages/shared/test/provenance.test.ts`: Verified canonical projection key order stability and semantic hash integrity.
- `packages/shared/test/schemas-sync.test.ts`: Verified `SyncReportSchema` validation bounds.

---

## Step 2: Backend Storage Foundation, Schema v11 & Provenance Tracking

### Objective
Expand the SQLite WAL database schema to support content-addressed pool assets, two-tier semantic asset bindings, source provenance metadata, and message sequence indexing, accompanied by repository queries and database audit tools.

### Implementation Summary
- **Database Migration 11** ([`backend/src/db/migrate.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/db/migrate.ts)):
  - Added `origin` (default `'native'`), `origin_id`, `origin_hash` columns on `characters`.
  - Added `origin`, `origin_id`, `origin_hash`, `active_greeting_index` (default 0), and `persona_snapshot` (TEXT) on `chats`.
  - Added `origin_id`, `sequence_index`, and `missing_assets` (TEXT) on `messages`.
  - Created indexes: `idx_characters_origin`, `idx_chats_origin`, `idx_messages_origin`.
  - Created `assets` table: `(id TEXT PRIMARY KEY, mime, ext, size, width, height, path, created_at)`.
  - Created `character_assets` table: `(id PRIMARY KEY, character_id REFERENCES characters ON DELETE CASCADE, asset_id REFERENCES assets ON DELETE RESTRICT, role CHECK(...), label, sort_order, created_at)`.
  - Created `message_assets` table: `(message_id REFERENCES messages ON DELETE CASCADE, asset_id REFERENCES assets ON DELETE RESTRICT, PRIMARY KEY (message_id, asset_id)) WITHOUT ROWID`.
  - Upgraded `PRAGMA user_version: 10 -> 11`.
- **Asset Repository** ([`backend/src/db/repositories/assets.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/db/repositories/assets.ts)):
  - Implemented `SQLiteAssetRepository` handling CRUD on `assets`, binding roles (`avatar`, `gallery`, `sprite`, `greeting`, `background`), and message asset links.
- **Repository Provenance & Index Methods**:
  - `CharacterRepository.findByProvenance(origin, originId)`.
  - `ChatRepository.findByProvenance(origin, originId)`.
  - `MessageRepository.getMaxSequenceIndex(chatId)`.
- **System Integrity Audits** ([`backend/scripts/check.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/scripts/check.ts)):
  - Added Audit 7: `provenance_orphans` verifying non-native entities have valid `origin_id` and `origin_hash`.
  - Added Audit 8: `pool_orphans` auditing unindexed pool files on disk and missing pool files referenced in the database.
- **Mark-and-Sweep Asset GC** ([`backend/scripts/assets-gc.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/scripts/assets-gc.ts)):
  - Added `--pool` flag scanning all 5 reference sources (`characters.avatar`, `character_assets`, `message_assets`, `personas.avatar`, and inline `media://` scans across characters and messages).
  - Defaults to dry-run reporting; unlinks unreferenced pool blobs only when `--delete` is passed.

### Verification
- `backend/test/migrations.test.ts`: Verified clean migration from v0 to v11 and rollback-on-error behavior.
- `backend/test/db/assets.test.ts`: Verified pool blob insertion, character bindings, and cascade restriction behavior.
- `backend/scripts/check.ts`: Clean report (`user_version=11`, `fts_parity=ok`, `provenance_orphans=0`, `pool_orphans=unindexed:0,missing:0`).

---

## Step 3: Content-Addressed Media Pool Store & Serving

### Objective
Provide a unified, content-addressed storage pool (`data/assets/pool/<sha256>.<ext>`) that deduplicates bulk assets across characters, protects against malicious files, bounds header dimensions, and serves static files securely.

### Implementation Summary
- **Pool Store Methods** ([`backend/src/assets/store.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/assets/store.ts)):
  - Implemented `FsAssetStore.putPool(bytes: Uint8Array): Promise<AssetRecord>`.
  - Implemented `FsAssetStore.resolvePool(hash: string): Promise<string | null>`.
  - Enforced 64-character lowercase SHA-256 filenames (`<full-sha256><ext>`).
- **Security & Dimension Guards** (Invariants X10 & A-AS1):
  - Sniffs magic bytes via `sniffMimeType`: strictly allows `image/png`, `image/jpeg`, `image/webp`, and `image/gif`.
  - Rejects SVG, executables, scripts, and non-image binaries with `ApiError('asset_type_rejected', 415)`.
  - Reads image header dimensions without full decode via `getImageDimensions`. Rejects files exceeding `4096 px` on any side with `ApiError('asset_dimensions', 422)`.
  - Exempts pool ingestion from interactive 64 MiB per-owner directory quotas (Amendment A-AS1).
  - Writes new pool files via atomic temporary file (`<hash>.<newId>.tmp`) + rename.
- **Static Route Serving**:
  - Existing `/assets/*` Elysia static route automatically mounts `/assets/pool/*`.
  - Enforces `X-Content-Type-Options: nosniff` and `Content-Disposition: inline`.
  - Rejects path traversal attempts (`../../formatavern.db`) with HTTP 404 JSON.

### Verification
- `backend/test/import/guards.test.ts`: Verified 4096 px dimension bounds, rejection of SVGs/executables, and preservation of interactive quotas.
- `backend/test/import/mediaPool.test.ts`: Verified SHA-256 content naming, WebP resolution, idempotent re-writes, and static serving headers.

---

## Step 4: CustomEngine ETL Pipeline Service & CLI Runner

### Objective
Deliver the core ingestion pipeline (Slice A) capable of parsing and reconciling the `custom_engine` relational format (1,623 characters, 2,696 chats, ~80k messages, ~4.3k blobs) with deterministic idempotency, linear-to-tree message mapping, persona deduplication, and atomic batching.

### Implementation Summary
- **ETL Subsystem Architecture** ([`backend/src/import/customEngine/`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/import/customEngine)):
  - **`guard.ts`**: Implemented `acquireSyncLock()`. Rejects concurrent sync executions with `ApiError('sync_in_progress', 409)` while allowing concurrent chat interactions.
  - **`sniff.ts`**: Sniffs directory archives (`characters/`, `chats/`, optional `media/`, `manifest.json`) or standalone `.json` files.
  - **`plan.ts`**: Reads records, computes `originHash` via `canonicalCharacter` and `canonicalChat`, checks provenance against DB, and partitions work into `skip`, `insert`, `update`, `append`, or `quarantine`.
  - **`service.ts`**: Implements the multi-stage pipeline:
    1. **Sniff & Plan**: Generates dirty-check plan; short-circuits on `--dry-run` to return report without disk/DB mutation.
    2. **Blob Preparation**: Streams referenced avatars and inline media from `media/` into the content-addressed pool via `putPool`, registering them in `assets`.
    3. **Character Upsert**: Mints slugs with collision avoidance (`-2` suffix), reconciles normalizable tags into `character_tags`, preserves raw emoji tags in `metadata.import.tagsRaw`, and binds avatars in `character_assets`.
    4. **Persona Resolution**: Resolves user persona by exact name, creating a single `imported-<slug>` persona to prevent roster fan-out, while writing the verbatim snapshot to `chats.persona_snapshot` (Invariant X5).
    5. **Message Tree Mapping**: Reconstructs main branch lineage (`parent_id = prevMainId`). Maps `alternate_swipes[]` and `is_main: false` turns to sibling rows sharing the same `parent_id` marked `metadata.imported_swipe: true` (Invariant X6). Sets `active_leaf_id` on the chat.
    6. **Missing Assets & Self-Healing**: Unresolved media hashes are stored on `messages.missing_assets` without failing the batch (Invariant X9). Subsequent syncs that provide the missing blob automatically heal affected message rows and link `message_assets`.
    7. **Transaction Batching**: Groups characters and their associated chats into atomic 500-character batches. Failures roll back the active batch without corrupting prior committed batches (Invariant X2).
    8. **FTS Rebuild**: Deferral of search indexing during bulk writes; invokes `reindexCharactersFts(db)` once at the conclusion of the sync.
- **FTS Utility** ([`backend/src/db/fts.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/db/fts.ts)):
  - Extracted shared `reindexCharactersFts(db)` rebuilding `characters_fts` with `unicode61` tokenizer and `character_name` support. Updated `backend/scripts/reindex.ts` to share this logic.
- **CLI Runner** ([`backend/scripts/import-custom-engine.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/scripts/import-custom-engine.ts)):
  - Implemented command-line interface supporting `--root`, `--file`, `--dry-run`, `--limit`, `--character`, and `--batch-size`.
  - Added npm scripts `"import:custom-engine"` in both `backend/package.json` and root `package.json`.
  - Implemented exit codes: `0` (clean), `2` (quarantined records encountered), `1` (fatal error).

### Verification
- **Test Suites** (`backend/test/import/`):
  - [`characters.test.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/test/import/characters.test.ts): Verified slug minting, `-2` collision handling, emoji raw tag retention, all 13 alternate greetings in order, avatar-less cards, and skip vs. update dirty-checking (X1).
  - [`chats.test.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/test/import/chats.test.ts): Verified orphan quarantine, null `updated_at` handling, `active_greeting_index` persistence, and persona snapshot preservation without roster fan-out (X5).
  - [`treeMapping.test.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/test/import/treeMapping.test.ts): Verified linear chain parentage, swipe siblings with `imported_swipe`, `is_main: false` sibling behavior, and 50+ turn recursive tree depth queries (X6).
  - [`delta.test.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/test/import/delta.test.ts): Verified append-only message insertion (`sequence_index > maxSeq`), `active_leaf_id` advancement, and preservation of user-edited turns in UI (X7).
  - [`bulk.test.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/test/import/bulk.test.ts): Verified batch transaction rollback atomicity, deferred FTS search parity, and 409 concurrency lock enforcement (X2).
  - [`missingAssets.test.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/test/import/missingAssets.test.ts): Verified missing asset tolerance and subsequent sync healing (X9).
- **Monorepo Health**:
  - `bun run typecheck`: 0 errors, 0 warnings across all 3 monorepo packages.
  - `bun run test`: All 29 import tests and 900+ monorepo tests pass (100% green).
  - `bun run db:check`: Clean integrity (`user_version=11`, `fts_parity=ok`, `provenance_orphans=0`, `pool_orphans=unindexed:0,missing:0`).
  - **Live Dump Smoke Test**:
    ```bash
    bun run import:custom-engine --root "S:/WorkSpace/Projects Workspace/Python/JAI_Migration/exports/custom_engine" --limit 5 --dry-run
    ```
    Executed in 43ms; planned 5 characters + 8 chats with zero errors.

---

## Queued Steps

### Step 5: API Routes, Background Runner & Format Exporters
- Implementation of API endpoints:
  - `POST /api/import/custom-engine/sync` (with `?wait=true` or background run polling via `GET /api/import/runs/:runId`).
  - `POST /api/import/custom-engine/single` (multipart single character or chat file).
  - `POST /api/import/v2` (TavernCard V2 PNG `tEXt` / JSON card import).
  - `POST /api/import/jsonl` (SillyTavern JSONL chat import).
  - `GET /api/characters/:id/export.png` & `.json` (V2 card export from DB).
  - `GET /api/chats/:id/export.jsonl` (SillyTavern compatible JSONL chat export).
  - `GET /api/characters/:id/export.charx` (CharX pack export with asset bindings).
  - `GET /api/export/relational-pack` (lossless CustomEngine format export).
- Route integration tests and export round-trip verification.

### Step 6: Frontend Render Boundary, Media Rewrite & Snapshot Label
- Implementation of `lib/render/mediaRewrite.ts` in frontend.
- Markdown and ShowcaseBody integration for `media://{64hex}` rewrite with broken-asset slate fallback.
- Chat "You" panel displaying historical `Snapshot: <name>` when `persona_snapshot` is present.
- Unit tests and updating `boundaries.test.ts`.

### Step 7: Documentation, Production Static Proofs & PR Verification
- Update `docs/schema.md` to `user_version = 11`.
- Update `docs/architecture.md` (§5 asset pool, §10 import/export rows).
- Update `.agents/AGENTS.md` and `docs/development.md` §6.3 with Invariants X1–X10 and amendments A-P3 / A-AS1.
- Complete live dump full bulk execution, record `SyncReport` benchmarks, verify no-op idempotency, and collect PR evidence.
