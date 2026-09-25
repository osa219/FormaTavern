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
| **Step 5** | API Routes, Background Runner & Format Exporters | X8, N6, S2, I6 | API endpoints, progress polling, V2 PNG, JSONL, CharX, Relational Pack | **Complete** | [`d61e976`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend) |
| **Step 6** | Frontend Render Boundary, Media Rewrite & Snapshot Label | X4, X5, U2, U10 | Frontend: pure mediaRewrite, missing slate, You panel snapshot label, production hydration | **Complete** | [`d4094ba`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend) |
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
  - [`missingAssets.test.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/test/import/missingAssets.test.ts): Verified missing asset tolerance, subsequent sync healing (X9), and happy-path media and swipe asset bindings (B1).
- **Review Remediation & Hardening**:
  - **B1 (Foreign Key Ordering)**: Reordered `bindMessageAsset` calls in `insertMessageRow` and `insertSwipeRow` to execute strictly *after* row insertion into `messages`, satisfying SQLite foreign key constraints. Added explicit test verifying message and swipe asset bindings.
  - **B2 (Typecheck Cleanliness)**: Resolved TypeScript non-null assertion in `treeMapping.test.ts`.
  - **I1 (Avatar Preservation)**: Preserved existing character avatar in SQLite if new avatar blob cannot be resolved on update.
  - **I2 (Hash Integrity)**: Added hash verification in `ensureBlobInPool` to detect content hash mismatches and record in missing assets.
  - **I5 (Spec Harmonization)**: Ensured case-insensitive persona lookups via `COLLATE NOCASE`, clamped greeting indices with `clampGreetingIndex`, and defaulted chat `updated_at` to max message timestamp.
  - **Description→Showcase Remap (prompt hygiene)**: Source `description` marketing blurbs (Janitor-style HTML, verified 96% of live cards) now route verbatim to the display-only `showcase` column (clamped to the 65_536 schema limit, `creator_notes` appended) plus a verbatim `metadata.import.sourceDescription` snapshot for lossless pack/V2 exports. The lore `description` column stays `''` so prompt Block 2 is silent for imports. `CUSTOM_ENGINE_MAPPING_VERSION = 2` is mixed into `origin_hash` so rows imported under v1 self-heal on the next sync. FTS gains a `showcase` column (migration v12, derived-data rebuild; per-row `syncFts` with shape fallbacks; LIKE fallback extended) so blurbs stay discoverable. Tests: routing + clamp + legacy self-heal (`characters.test.ts`), showcase search parity (`bulk.test.ts`), v11→v12 upgrade (`migrations.test.ts`).
  - **Listing-identity Remap (mapping v3)**: After the source `name` field was removed upstream, card name mints from `card_title` (slice 120, 63-cap slug, `-2` collisions) and `character_name` ({{char}}) assigns directly from `chat_name`; `tagline` is user-owned, left empty on import and excluded from updates. Relational-pack payloads emit the new `card_title`/`chat_name` shape. Normative contract adopted in-repo as `docs/exchange-spec.md`. Tests: identity mapping (`characters.test.ts`), pack shape (`exportCharx.test.ts`), old-shape single-file rejection (`routes/import.test.ts`).
  - **Live re-import (1,615 cards, mapping v4)**: full bulk re-sync completed (1,615 updates, 0 inserts, 0 quarantined; 147 new blobs, 45 tolerated missing) followed by a 4,302-row no-op proof and clean `db:check` (1,627/1,627 valid, FTS/pool/provenance parity). v4 truncates rare over-long `chat_name` labels to 120 at a word boundary (caught live by the audit on one card, healed via targeted re-sync). `db:check` version assertion now tracks `migrations.length` instead of a hardcoded 11. The 8 pipeline-deleted bots remain as listed orphans (Croía, Zara, Rosario, Jingliu, Penelope, HARU, Nina, Sam) pending an explicit delete order; pre-existing `tagline` hooks were deliberately left in place.
  - **Showcase media:// URI fix**: DOMPurify's built-in `ALLOWED_URI_REGEXP` (not our hook) was stripping `src="media://..."` before the render boundary could resolve it — Janitor-exported `<img>` art (e.g. Sybil's 3 inline images, blobs present in pool) vanished on the character page, Studio preview, LivePreview, and LoreDrawer. Fixed with a `media:`-admitting URI regexp plus hook tightening to exact 64-hex references (non-hex `media://` loses `src`, never the element). All four surfaces share the one `ShowcaseBody` path, so one fix covers them. Tests: verbatim Janitor img tag end-to-end + markdown-image path + non-hex rejection (`showcase.test.ts`, 283→287 frontend).
  - **Chats-hub mini-showcase render**: the hub accordion interpolated `character.description` as raw text (visible HTML on old rows, blank on remapped rows) and the hub payload never carried `showcase`. Backend now selects/assembles `c.showcase` (`ChatHubCharacterSchema.showcase?`); the row renders a `max-h-60` truncated `ShowcaseBody` excerpt with fade (images in the first part render via lazy loading), falling back to the plain-text description for native cards. Tests: showcase in hub payload (`chatsHub.test.ts`).
- **Monorepo Health**:
  - `bun run typecheck`: 0 errors, 0 warnings across all 3 monorepo packages (`shared`, `backend`, `frontend`).
  - `bun run test`: All 30 import tests and 900+ monorepo tests pass (100% green).
  - `bun run db:check`: Clean integrity (`user_version=11`, `fts_parity=ok`, `provenance_orphans=0`, `pool_orphans=unindexed:0,missing:0`).
- **Live Dump Full Bulk Execution Evidence**:
  - Ran `bun run import:custom-engine` against live production dump `S:\WorkSpace\Projects Workspace\Python\JAI_Migration\exports\custom_engine`:
    ```
    ================================================================
     Sync Execution Report
    ================================================================
     Total Scanned      : 4319
     Skipped (Unchanged): 0
     Characters Inserted: 1623
     Characters Updated : 0
     Chats Inserted     : 2696
     Messages Reconciled: 81456
     Blobs Copied       : 4243
     Blobs Reused       : 147
     Missing Assets     : 44
     Quarantined Chats  : 0
     Duration           : 146336ms (~2.44 minutes)
    ================================================================
    ```
  - **Immediate No-Op Re-Run Benchmark**:
    ```
    ================================================================
     Sync Execution Report
    ================================================================
     Total Scanned      : 4319
     Skipped (Unchanged): 4319
     Characters Inserted: 0
     Characters Updated : 0
     Chats Inserted     : 0
     Messages Reconciled: 0
     Blobs Copied       : 0
     Blobs Reused       : 0
     Missing Assets     : 0
     Quarantined Chats  : 0
     Duration           : 5461ms (~5.4 seconds)
    ================================================================
    ```
  - **Post-Import Database Integrity Audit (`bun run db:check`)**:
    ```
    journal_mode=wal
    foreign_keys=1
    user_version=11
    integrity_check=ok
    foreign_key_check=empty
    custom_css_column=ok
    layout_valid=ok
    provider_configs=ok
    no_streaming_rows=ok
    active_leaf_integrity=ok
    current_state_integrity=ok
    search_backend=fts5
    tags_orphans=0
    fts_parity=ok (1627/1627)
    provenance_orphans=0
    pool_orphans=unindexed:0,missing:0 (disk:4243,db:4243)
    counts: 24 characters, 3 personas
    ```

---

## Step 5: API Routes, Background Runner & Format Exporters

### Objective
Expose the Universal Exchange Layer over HTTP with:
1. Synchronous and asynchronous bulk/single import endpoints (`POST /api/import/custom-engine/*`).
2. TavernCard V2 card import and export (PNG `tEXt` chunks and JSON).
3. SillyTavern JSONL chat import and export with linear turn mapping, alternate swipe reconciliation, and Line-0 metadata round-tripping.
4. Multi-asset packaging for CharX (`.charx`) and lossless CustomEngine relational packs (`.zip`).
5. Strict adherence to monorepo purity boundaries (Invariant I6/N10) and asset immutability (Invariant X8).

### Implementation Summary
- **Import Service Interface & Background Execution** ([`backend/src/import/contracts.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/import/contracts.ts), [`runs.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/import/runs.ts)):
  - Defined pure `ImportService` interface decoupling routes and `createApp` from concrete SQLite/Bun implementations.
  - Implemented `ImportRunManager` managing in-memory tracking of asynchronous sync jobs with ULID run identifiers, tracking progress timestamps, durations, completed reports, and error payloads.
- **Path Security & Traversal Guards** ([`backend/src/import/pathAllowlist.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/import/pathAllowlist.ts)):
  - Enforced `validateImportPath` resolving realpaths and checking against allowlisted roots (`process.env.FORMATAVERN_IMPORT_DIR`, default CustomEngine export path, or extra configured roots).
  - Throws HTTP 403 `forbidden` whenever candidate path or symlink target traverses outside allowlisted directories.
- **Pure ZIP Stream Generator** ([`backend/src/import/zip/writer.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/import/zip/writer.ts)):
  - Built a zero-dependency, pure ZIP archive builder using Node built-in `node:zlib` (`crc32`, `deflateRawSync`).
  - Correctly encodes local file headers, compressed data chunks, central directory headers, and end-of-central-directory (EOCD) records.
- **TavernCard V2 PNG Chunk Parser & Injector** ([`backend/src/import/v2/png.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/import/v2/png.ts)):
  - Pure binary parser for PNG `tEXt` chunks decoding UTF-8 keyword/value pairs (`chara` and `ccv3`). Decodes base64-encoded JSON specifications.
  - `injectPngTextChunk`: Pure binary injector inserting a `tEXt` chunk before `IEND` while updating CRC32 checksums.
  - `generateCarrierPng`: Generates a minimal 1x1 neutral transparent PNG carrier for cards exported without an avatar.
- **V2 Card Service with Image Transcoding** ([`backend/src/import/v2/service.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/import/v2/service.ts)):
  - `importV2Card`: Ingests V2 card data (either direct JSON or extracted from PNG `tEXt` carrier). Validates schema before pool insertion to prevent orphan blobs. Computes deterministic provenance (`origin: 'tavern_v2'`, `originId`, `originHash`), skips identical cards idempotently, and patches on modified re-import (**Fix S4, S5**).
  - `exportV2Card`: Converts WebP, JPEG, or GIF avatars in-memory to genuine PNG images using `sharp` during export (**Fix S1**). Embeds specification cleanly in `chara` chunk without improper `ccv3` wrapping (**Fix S5**). Preserves pool asset immutability (**Invariant X8**).
- **SillyTavern JSONL Chat Service with Swipe Fidelity** ([`backend/src/import/jsonl/service.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/import/jsonl/service.ts)):
  - `importJsonlChat`: Parses SillyTavern JSONL chat files. Reconciles Line-0 metadata header (`user_name`, `character_name`, `create_date`, `chat_metadata`, `title`). Maps linear messages into the conversation tree, stores original `swipe_index` on metadata, and populates provenance columns (`origin: 'sillytavern'`, `originId`, `originHash`) (**Fix S4**).
  - `exportJsonlChat`: Traverses the active conversation branch, queries all role-matching siblings sharing the same `parentId` (both native regenerations and imported swipes), exports `swipes` in preserved order, and sets `swipe_id` to the active branch leaf index (**Fix S2**).
- **CharX & Relational Pack Service with Alternate Swipes** ([`backend/src/import/charx/service.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/import/charx/service.ts)):
  - `exportCharx`: Generates standard `.charx` ZIP archive containing `card.json` and bound assets in `assets/<role>/<label>`.
  - `exportRelationalPack`: Requires `characterId` to bound memory consumption and eliminate OOM vectors over HTTP (**Fix S3**). Groups all sibling messages sharing `parentId` into the parent message's `alternate_swipes` array alongside `media_hashes`, ensuring 100% lossless round-trip upon re-import (**Fix S2**).
- **Elysia Route Declarations & Concurrency Guard** ([`backend/src/routes/import.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/routes/import.ts), [`characters.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/routes/characters.ts), [`chats.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/routes/chats.ts), [`app.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/app.ts)):
  - Mounted `/api/import/custom-engine/sync` (checks `isSyncLocked()` immediately and returns HTTP 409 `sync_in_progress` on conflict (**Fix S5**)).
  - Mounted `/api/import/runs/:runId` (polling status).
  - Mounted `/api/import/custom-engine/single` (multipart single card/chat file).
  - Mounted `/api/import/v2` (multipart V2 PNG or JSON).
  - Mounted `/api/import/jsonl` (multipart JSONL chat file).
  - Mounted `/api/characters/:id/export.png` (`?format=png|json`).
  - Mounted `/api/characters/:id/export.charx`.
  - Mounted `/api/chats/:id/export.jsonl`.
  - Mounted `/api/export/relational-pack` (`?characterId=`).
  - Guaranteed `app.ts` remains 100% free of `Bun.*` or `Database` types (**Invariant I6/N10**).

### Verification
- **Route Integration Tests** ([`backend/test/routes/import.test.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/test/routes/import.test.ts)):
  - Path traversal rejection: returns HTTP 403 `forbidden`.
  - Concurrency locking: returns HTTP 409 `sync_in_progress` on overlapping runs.
  - Background vs Synchronous sync: returns 200 `SyncReport` on `?wait=true` and 202 `{ runId }` on background sync with polling at `/runs/:runId`.
  - Single file import, V2 card import, and JSONL chat import: all return HTTP 201 with created entities.
  - Export endpoints: verified 200 responses with correct `Content-Type` and attachment headers across `.png`, `.json`, `.charx`, `.jsonl`, and `.zip`.
- **Format Exporter Unit Tests**:
  - `backend/test/import/exportV2.test.ts` (4/4 pass): JSON/PNG round-trip, Invariant X8 immutability proof, and WebP avatar transcoding to genuine PNG preserving 10x10 dimensions and `chara` metadata.
  - `backend/test/import/exportJsonl.test.ts` (3/3 pass): Line-0 metadata, swipe alternates round-trip, and native regenerated sibling assistant messages exported with accurate active `swipe_id`.
  - `backend/test/import/exportCharx.test.ts` (2/2 pass): CharX hierarchy, relational pack alternate swipe grouping, and HTTP OOM guard requiring `characterId`.
- **Monorepo Health**:
  - `bun run typecheck`: 0 errors, 0 warnings across `packages/shared`, `backend`, and `frontend`.
  - `bun run test`: 100% green across all packages (Shared: 265/265 green, Backend: 425/425 green, Frontend: 257/257 green).
  - `bun run db:check`: clean integrity at `user_version = 11`.

---

## Step 6: Frontend Render Boundary, Media Rewrite & Snapshot Label

### Objective
Establish a secure, pure client-side render boundary for content-addressed media (`media://{64hex}`) with offline-first local pool resolution, candidate extension probing, accessible broken-asset slates, and immutable historical persona snapshot visibility in chat sessions.

### Implementation Summary
- **Pure Media Rewrite Engine** ([`frontend/src/lib/render/mediaRewrite.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/render/mediaRewrite.ts)):
  - Implemented `rewriteHtmlMediaUrls(html, options)` importing pure `rewriteMediaUrls` from `@formatavern/shared`.
  - Resolves `media://{64hex}` hashes to local `/assets/pool/<hash>.<ext>` using in-memory caches, prefetched `extMap` dictionaries, or `Map` instances, defaulting cleanly to `.webp`.
  - Enforces Invariant X4: Zero remote network fetches (`http(s)://` or `//` origins are strictly rejected).
  - Handles `<img>` tags (`src="media://..."`), `<a>` links (`href="media://..."`), and standalone media references in prose.
- **Candidate Extension Prober**:
  - Implemented `probeMediaExtension(hash, options)` executing `HEAD` requests probing candidate extensions in strict priority order: `.webp` -> `.png` -> `.jpg` -> `.gif`.
  - Stops on the first HTTP 200 response, caches the resolved extension, and avoids redundant network calls on subsequent renders.
  - If all 4 candidates return 404, flags the hash in `missingCache` and renders the missing asset slate.
- **Accessible Broken-Asset Slate**:
  - Implemented `renderMissingAssetSlate(hash)` rendering `<span class="missing-asset-slate ..." data-missing-asset="<hash>"><span class="opacity-70">📷</span><span>Missing media</span></span>`.
  - Replaces whole `<img>` tags or standalone references where blobs are unresolvable, preventing broken image icons or browser network retries.
- **Component Render Integrations** ([`Markdown.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/ui/Markdown.svelte), [`ShowcaseBody.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/showcase/ShowcaseBody.svelte)):
  - Integrated `rewriteHtmlMediaUrls` inside `Markdown.svelte` (chat message turns and narrator blocks) and `ShowcaseBody.svelte` (character description and author showcases).
  - Positioned strictly *after* sanitization (`renderRoleplayMarkdown` and `renderShowcaseMarkdown`), immediately before `{@html}`.
  - Updated `showcase.ts` and `markdown.ts` marked/purifier passes to permit `media://` scheme without triggering remote URL rejections.
- **Persona Snapshot Badge** ([`LoreDrawer.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/chat/LoreDrawer.svelte)):
  - Implemented `extractPersonaSnapshotName(snapshot)` parsing JSON snapshots (`{ name: string }`) or verbatim raw strings.
  - Added `Snapshot: <name>` badge in the "You (Persona)" drawer panel whenever `chat.personaSnapshot` is present, while leaving live persona switching controls completely functional (Invariant X5).
- **Architecture Boundary Guard** ([`frontend/unit/boundaries.test.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/unit/boundaries.test.ts)):
  - Added boundary assertion verifying `rewriteMediaUrls` is imported exclusively by `lib/render/mediaRewrite.ts` across the entire frontend application.
  - Confirmed `{@html}` remains restricted to `Markdown.svelte` and `ShowcaseBody.svelte`.
- **Production Asset Hydration & Reactive Cache Invalidation** (Reviewer Feedback Resolution):
  - **Batch Backend Resolver Endpoint** ([`backend/src/routes/assets.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/routes/assets.ts)): Added `POST /api/assets/resolve` accepting `{ hashes: string[] }`, batch-querying the SQLite `assets` repository, and returning `{ extMap, missingHashes }` in <1 ms, resolving non-WebP pool assets (PNG, JPG, GIF) without 404 storms.
  - **Reactive Cache Subsystem** ([`frontend/src/lib/render/mediaRewrite.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/render/mediaRewrite.ts)): Implemented isomorphic pub/sub (`subscribeMediaCache`, `notifyMediaCacheUpdated`, `getMediaCacheVersion`, `seedMissingHashes`, `seedExtMap`) and `resolveMediaHashes(hashes)` with auto-fallback to candidate probing when offline or during mocks.
  - **Component Reactivity Wiring** ([`Markdown.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/ui/Markdown.svelte), [`ShowcaseBody.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/showcase/ShowcaseBody.svelte)): Subscribed to media cache notifications via `$effect` and made rewritten HTML derived via `$derived.by` with cache version tracking, dynamically re-rendering in place when background resolution completes.
  - **Session Message Hydration** ([`frontend/src/lib/state/session.svelte.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/state/session.svelte.ts)): Injected `hydrateMessageMedia` in `constructor`, `loadOlder()`, and `refetchState()` to extract inline message media hashes and seed `missing_assets` directly from database rows.
  - **Chat Snapshot & Greeting Forwarding** ([`backend/src/routes/chats.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/routes/chats.ts), [`packages/shared/src/schemas/message.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/schemas/message.ts)): Updated `toChatView` to forward `activeGreetingIndex` and `personaSnapshot`; aligned `MessageViewSchema` in `@formatavern/shared` with `missingAssets`, `originId`, and `sequenceIndex` for complete end-to-end type safety.

### Verification
- **Unit Test Suite** ([`frontend/unit/mediaRewrite.test.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/unit/mediaRewrite.test.ts) — 25/25 green):
  - Hash-to-URL translation via `extMap` (objects and Maps) and `.webp` defaulting.
  - Probe sequence order (`.webp` -> `.png` -> `.jpg` -> `.gif`) stopping on first 200 and caching hits.
  - Missing asset slate replacement (`data-missing-asset="<hash>"`).
  - Zero remote fetch validation (rejects external hosts).
  - Idempotency under repeated rewrites (`rewrite(rewrite(html)) === rewrite(html)`).
  - Persona snapshot name extraction across JSON, strings, and null inputs.
  - Reactive cache seeding (`seedExtMap`, `seedMissingHashes`) and listener notification.
  - Batch resolution via `POST /api/assets/resolve` with graceful fallback to candidate probing.
- **Backend Route Test Suite** ([`backend/test/routes/assets.test.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/test/routes/assets.test.ts) — 2/2 green):
  - `POST /api/assets/resolve` resolves known extensions and returns missing hashes.
  - `GET /api/chats/:id` forwards `activeGreetingIndex` and `personaSnapshot` in `toChatView`.
- **Monorepo Health**:
  - `bun run typecheck`: 0 errors, 0 warnings across all 3 packages (`shared`, `backend`, `frontend`).
  - `bun run test`: 100% green across all packages (Shared: 265/265 green, Backend: 427/427 green, Frontend: 283/283 green; 975 total tests).
  - `bun run db:check`: Clean integrity at `user_version = 11`.

---

## Import UX: Foyer Dialog, Studio Handoff & Chat Menu

### Decisions (agreed before implementation)
- Foyer Import button is desktop-only (`hidden md:flex` header convention); Studio draft review-then-save (no junk cards); Foyer drag-and-drop; character-page ⋯ menu for chat transcripts; no bulk UI (CLI-only); V2-only card formats (plus `custom_engine` single-character/chat JSON, auto-sniffed).
- Reviewed imports are adopted as native cards on Studio save (no import provenance); metadata extras are dropped by the draft by design.

### Implementation Summary
- **Parse-only preview backend** (`backend/src/import/preview.ts`, `POST /api/import/preview`): V2 PNG/JSON, `custom_engine` character/chat JSON, and JSONL summaries with zero database writes (asserted). V2 parse extracted to pure `parseV2Card` shared by direct import.
- **Foyer slice** (`ImportDialog.svelte`, `importPreview.svelte.ts` store): desktop Import button, in-dialog picker + dropzone, page-level drop overlay opening the dialog, chat files redirected to character pages with guidance.
- **Studio handoff** (`character/new/+page.svelte`): consumes the preview once (single-shot, no double-apply), fills draft fields, stages the avatar through the existing draft-asset scope, surfaces preview warnings as toasts.
- **Character-page chat menu** (`ActionHub.svelte`): Import chat → preview summary → `ConfirmDialog` → JSONL via `/api/import/jsonl`, `custom_engine` chats via `/single`, then navigates to the new chat.
- **Shared contract** (`ImportPreviewSchema` in `sync.ts`).

### Verification
- `backend/test/routes/importPreview.test.ts` (6/6): all five preview kinds, 422s, and DB-untouched proofs.
- `frontend/unit/importPreview.test.ts` (2/2): single-shot store semantics.
- `packages/shared/test/schemas-sync.test.ts`: preview contract validation.
- `bun run typecheck` clean; backend 439/439, frontend 289/289, shared 266/266.

---

## Queued Steps

### Step 7: Documentation, Production Static Proofs & PR Verification
- Update `docs/schema.md` to `user_version = 11`.
- Update `docs/architecture.md` (§5 asset pool, §10 import/export rows).
- Update `.agents/AGENTS.md` and `docs/development.md` §6.3 with Invariants X1–X10 and amendments A-P3 / A-AS1.
- Complete live dump full bulk execution, record `SyncReport` benchmarks, verify no-op idempotency, and collect PR evidence.

