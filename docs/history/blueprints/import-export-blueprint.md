# FormaTavern — Import/Export Blueprint: The Universal Exchange Layer

**Purpose:** Turn the isolated canvas into a connected ecosystem. FormaTavern stays database-first internally (SQLite WAL is the only source of truth) and standards-compatible externally (it ingests and emits the community's exchange envelopes). The first and most important source is the `custom_engine` relational archive — 1,623 characters, 2,696 chats, ~80,000 messages, ~4,300 media blobs (~780 MB) — plus every future delta it produces. Everything else (TavernCard V2 PNG/JSON, SillyTavern JSONL, CharX/CCv3) is an interchange adapter over the same pipeline.

Nothing in the generation engine, envelope parser, prompt builder, or theme cascade changes. Every feature here is a new **ingestion and emission surface over existing contracts**: `CharacterCard`, `Persona`, `ChatView`, the repositories from Phases 1–5, and the `/assets` mount. The genuinely new capabilities are a **content-addressed asset pool**, **provenance-tracked idempotent sync**, and **`media://` resolution at the render boundary**.

**New dependencies:** none. (PNG `tEXt` parsing is a small pure module over `zlib`; ZIP extraction uses the existing platform unzip or a vendored pure reader; SHA-256 uses `node:crypto`; MIME sniffing reuses `backend/src/assets/sniff.ts`.) **`SHARED_VERSION`:** bump patch only (new schemas are additive). **Migration:** v11 `import_export_foundation`.

**Related reports (why, not what):** `docs/history/reports/unified-import-export-architecture-strategy.md`, `custom-engine-format-analysis.md`, `sillytavern-import-export-analysis.md`. This blueprint is normative; on any conflict between those reports and this document, this document wins.

---

## 0. Carry-forward from prior phases & amendments

All prior invariants (I1–I6, E1–E8, S1–S9, U1–U10, P1–P7, C1–C15, L1–L8, N1–N10) hold verbatim except the two amendments below, declared here so `boundaries.test.ts` and `.agents/AGENTS.md` are updated deliberately.

| Amendment | Change | Why |
|---|---|---|
| **A-P3** | The `media://{sha256}` URI scheme is admitted as **stored text only**. `renderRoleplayMarkdown` and `renderShowcaseMarkdown` rewrite `media://{64-hex}` to same-origin `/assets/…` at render time. Stored rows never contain `/assets/…` host coupling from imports, and no remote URL is ever admitted. | P3's intent (zero remote fetches) is preserved; the rewrite is a pure function at the render boundary, testable without DOM. |
| **A-AS1** | The asset store gains a **global content-addressed pool** (`data/assets/pool/<sha256>.<ext>`) alongside the existing per-owner scopes. Bulk ingestion writes to the pool and is exempt from the 64 MiB per-owner quota; interactive uploads keep existing caps. | A 780 MB deduplicated dump cannot fit a 64 MiB per-owner quota. The pool is the only layout that deduplicates across 1,623 characters. |

`docs/schema.md` currently documents `user_version = 7`; the code is at v10 (`card_character_split`). The implementer updates `docs/schema.md` and `docs/architecture.md` §5 to v11 in the same PR (see §12).

---

## 1. Invariants for this phase

| # | Invariant | Enforced by |
|---|---|---|
| **X1** | **Idempotent sync by provenance.** Every imported `characters` / `chats` row carries `(origin, origin_id, origin_hash)`. Re-running sync with unchanged source bytes changes zero rows (verified by a re-sync test asserting `updated_at` untouched and row counts stable). | `backend/test/import/provenance.test.ts`; `db:check` provenance audit |
| **X2** | **Bulk writes are one transaction with deferred search.** Bulk ingest runs `BEGIN … COMMIT` once per batch (≥ 500 rows), pauses FTS maintenance during the batch, rebuilds FTS once at the end. Interactive single imports use the normal repository path with per-row FTS. | `backend/test/import/bulk.test.ts` (rollback-on-throw; FTS parity after) |
| **X3** | **Content-addressed pool; manifest is advisory.** Blob identity is `SHA-256(file bytes)`. `manifest.json` counts and `media_assets[]` are pre-flight hints only — the importer probes the filesystem and never trusts the manifest for correctness. Filenames on disk are never parsed for identity. | `backend/test/import/mediaPool.test.ts` (renamed file still resolves; tampered bytes rejected) |
| **X4** | **Stored text keeps `media://`, render resolves.** `description`, `first_message`, `alternate_greetings`, `Message.content` persist `media://{sha256}` verbatim. The frontend rewrites to `/assets/pool/<hash>.<ext>` at render. No stored row contains a hostname, port, or mount point. | `packages/shared/test/mediaUrls.test.ts` (pure rewrite); `frontend/unit/mediaRewrite.test.ts` |
| **X5** | **Persona snapshot preserved per chat.** Imported chats store the point-in-time `user_persona` snapshot verbatim. Switching the global default persona never rewrites historical prompt context of imported chats. | `backend/test/import/personaSnapshot.test.ts`; prompt builder test |
| **X6** | **Linear source maps to tree without loss.** `sequence_index` order becomes the main branch chain; each `alternate_swipes[]` entry becomes an additional sibling under the same parent (marked `imported_swipe`). `is_main: false` rows (absent in the current dump, present in schema) map the same way. | `backend/test/import/treeMapping.test.ts` |
| **X7** | **Non-destructive upsert; append-only messages; ignore deletes.** Re-import updates changed fields, appends messages with `sequence_index > max_existing`, never deletes rows the source no longer lists, never rewrites user-edited turns. | `backend/test/import/delta.test.ts` |
| **X8** | **Export is generated; source never mutated.** V2 PNG / JSON / JSONL / CharX / relational-pack exports are rendered from SQLite on demand. Import blobs and pool files are read-only inputs. | route tests asserting pool bytes unchanged after export |
| **X9** | **Missing assets never fail a batch.** A referenced hash absent from `media/` imports as a typed placeholder (`missing_asset`), is counted in the sync report, and resolves automatically on a later sync that provides it. | `backend/test/import/missingAssets.test.ts` (live dump has exactly 1 such inline hash — the test pins the behavior, not the count) |
| **X10** | **Interactive caps hold; bulk path has its own guards.** `POST /api/assets/upload` keeps 10 MiB/file, 4096 px/side, 64 MiB/owner. The bulk pool path enforces only: magic-byte allowlist (PNG/JPEG/WebP/GIF), dimension header bound, total-bytes accounting in the sync report. No SVG, no executables, ever. | `backend/test/assets/*` unchanged + `backend/test/import/guards.test.ts` |

---

## 2. Source format, normative mapping (`custom_engine` → FormaTavern)

Measured against the live dump (`exports/custom_engine/`, manifest `version 1.0.0`). Figures below describe the current dump; the importer must not hardcode them.

* Characters: 1,623 files. 397 have `alternate_greetings` (1,445 total, max 13 per card). 1,392 have `tags`. 1,613 flagged `is_nsfw`, 0 `is_image_nsfw`. 541 descriptions contain inline `media://`. 1 card lacks `avatar_hash`. 1,591 unique avatars (32 cards share). All avatar hashes resolve on disk.
* Chats: 2,696 files across 1,623 character dirs (399 characters have > 1 chat, max 99). 80,673 messages, roles strictly `user | assistant` (no `system`). Average ~30/chat, median 12, max 433. `updated_at` is null on **all** chats — dirty-checking must use content hashes, never timestamps. `summary` always empty, `fork_source_chat_id` always null, `user_persona.avatar` always null in this dump (schema still supports all three).
* Greetings: 2,530 chats at index 0; 126 / 25 / 7 / 8 at indices 1–4. Must be preserved, not flattened.
* Media in chats is rare but real: 95 messages with inline `media://`, 646 with `alternate_swipes`, 0 with `media_hashes[]` populated, 0 with `is_main: false`, `sequence_index` always contiguous from 0.
* `token_counts` key names vary between cards (`personality_tokens`, `scenario_tokens`, `example_dialog_tokens`, `first_message_tokens`, `total_tokens`). The importer accepts any key map and stores it verbatim.

### 2.1 Character mapping

| `custom_engine` field | FormaTavern target | Notes |
|---|---|---|
| `id` (UUID) | `characters.origin_id` + fresh `characters.id` (slug) | Slug mints from `card_title` (63-cap, `-2` collisions); UUID never becomes the PK (PKs stay slug/ULID per I1). |
| `card_title` | `characters.name` (slice 120) | Distinct listing identity; slug source; Foyer/showcase heading. |
| `chat_name` | `characters.character_name` | Canonical in-world persona ({{char}}); direct assignment, no fallback chain. |
| — | `characters.tagline` | No source field; left empty and update-exempt (user-authored subtitle). |
| `avatar_hash` | pool blob + `characters.avatar` = `/assets/pool/<hash>.<ext>` | 1 card has none → initials fallback (existing behavior). |
| `description` | → `characters.showcase` (verbatim, clamped to 65_536) + verbatim copy in `metadata.import.sourceDescription` for lossless exports; lore `description` column stays `''` | Source blurbs are author marketing (HTML), not prompt lore — Block 2 stays silent for imports. `media://` kept verbatim (X4). |
| `personality`, `scenario`, `first_message`, `mes_example` | same-named columns (`mes_example` → `metadata.exampleDialogue`) | `media://` URIs kept verbatim (X4). No dialect conversion in this phase (deferred §11). |
| `alternate_greetings[]` | `characters.alternate_greetings` (JSON array, v9 column) | Order preserved; max observed 13, no cap imposed. |
| `creator_name`, `creator_url`, `character_url`, `source_platform` | `characters.creator`, `creator_url`, `character_url`, `origin='custom_engine'` | `origin` column exists from v10; this phase adds `origin_id`/`origin_hash` (§3). |
| `creator_notes` | appended to `showcase` after the source blurb under an "Author notes" disclosure | Display-only (P4). Never prompt-injected. |
| `CUSTOM_ENGINE_MAPPING_VERSION` (= 3) | mixed into `origin_hash` (`plan.ts:characterOriginHash`) | Mapping changes re-sync old rows once instead of skipping forever (X1/X7). Bump on any future mapping change. |
| Normative field spec | `docs/exchange-spec.md` | Living interchange contract (entities, media protocol, version history). |
| `tags[]` | `character_tags` join + FTS (normalize via existing `normalizeTag`) | Emoji tags (e.g. `👩‍🦰 Female`) normalize to null → stored in `metadata.importedTagsRaw`, excluded from FTS, still displayed. |
| `token_counts`, `stats`, `soundcloud_track_id`, `is_nsfw`, `is_image_nsfw` | `characters.metadata` extensions block | Stored verbatim under `metadata.import.{...}`; `is_nsfw` additionally drives the existing blur/visibility hint where the UI already supports it. No new filtering UI in this phase. |
| `created_at` / `updated_at` (ISO strings) | `characters.created_at` / `updated_at` (UnixMs) | Parse ISO → ms; null `updated_at` → `created_at`. Import never sets `updated_at` newer than wall-clock. |

### 2.2 Chat mapping

| `custom_engine` field | FormaTavern target | Notes |
|---|---|---|
| `id` (e.g. `1566553883`) | `chats.origin_id`; fresh short `chats.id` | Chat IDs stay short Base58 per existing contract; source id preserved for delta matching. |
| `character_id` | `chats.primary_character_id` via character `origin_id` lookup | Import order: characters before chats. Orphan chats (character missing) → quarantine list in sync report, never inserted (FK RESTRICT holds). |
| `title` | `chats.title` | Verbatim; empty → `Chat with <name>` fallback. |
| `active_greeting_index` | new `chats.active_greeting_index INTEGER DEFAULT 0` | Structural link back to the card's greeting array. UI surfacing deferred; column first. |
| `user_persona` object | new `chats.persona_snapshot TEXT` (JSON, verbatim) + link `active_persona_id` | `active_persona_id` points at a matching-or-created global persona for prompt continuity (`{{user}}`); the snapshot is the historical record (X5). Persona rows are created sparingly: match by exact name, else create `imported-<slug>` once per distinct name, never per chat. Null avatar stays null. |
| `summary` | `chats.metadata.summary` | Empty today; path must exist for future deltas. |
| `fork_source_chat_id` | `chats.metadata.forkSource` (origin_id reference) | Null today; stored as origin reference, not PK. |
| `created_at` / `updated_at` | `chats.created_at` / `updated_at` | Null `updated_at` → max message timestamp. |

### 2.3 Message mapping

| `custom_engine` field | FormaTavern target | Notes |
|---|---|---|
| `id` (`<chat>_<seq>`) | `messages.origin_id`; fresh ULID PK | ULIDs preserve chronological sibling order (`id ASC`); source id kept for idempotency only. |
| `sequence_index` | `messages.sequence_index INTEGER` (new column) + chain order | Main branch: message N's `parent_id` = message N−1's PK. |
| `role` | `role` (`user`→`user`, `assistant`→`assistant`) + `narrative_role` (`user`→`persona`, `assistant`→`character`) | No `system` rows in dump; if encountered, store as `role='system'`, `narrative_role='narrator'`. |
| `sender_name` | `messages.sender_name` | Verbatim (historical label; renames don't rewrite it). |
| `content` | `messages.content` | Verbatim incl. `media://` (X4). No envelope conversion. `segments`/`state` stay NULL for imported rows (parsed lazily only if regenerated). |
| `alternate_swipes[]` | additional sibling rows, same `parent_id`, `metadata.imported_swipe=true` | The `content` row is the selected swipe; each alternate becomes one sibling with a fresh ULID ordered after it. `swipe_id` semantics emerge from sibling order — no separate index column. |
| `is_main: false` | same sibling mechanism | Absent in current dump; path covered by the same test. |
| `media_hashes[]` | `message_assets` join rows | Empty in current dump; join table must exist before the data does. |
| `timestamp` (ms) | `messages.created_at` | Verbatim. |

### 2.4 Media mapping (all four pointer types)

Regex (shared, pure): `/media:\/\/([a-f0-9]{64})/g`. Accepted only lowercase 64-hex; anything else is literal text, never a reference.

1. `Character.avatar_hash` → pool file → `characters.avatar`.
2. `Chat.user_persona.avatar` → pool file → persona avatar when non-null (null in current dump — path tested with fixture, not live data).
3. Inline `media://` in `description` / `Message.content` → resolved at render (X4, §7).
4. `Message.media_hashes[]` → `message_assets` join.

Manifest `media_assets[]` (`hash`, `mime_type`, `file_extension`, `size_bytes`, `relative_path`) is used only to pre-size progress bars. After copy, the importer re-sniffs magic bytes and re-stats; mismatch → warn in report, trust disk.

---

## 3. Data model & Migration v11 (`import_export_foundation`)

Additive only. No existing row rewritten except backfills stated. `PRAGMA user_version: 10 → 11`.

```sql
-- 1. Provenance on existing entities (X1, X7)
ALTER TABLE characters ADD COLUMN origin TEXT DEFAULT 'native';
ALTER TABLE characters ADD COLUMN origin_id TEXT;
ALTER TABLE characters ADD COLUMN origin_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_characters_origin ON characters(origin, origin_id);

ALTER TABLE chats ADD COLUMN origin TEXT DEFAULT 'native';
ALTER TABLE chats ADD COLUMN origin_id TEXT;
ALTER TABLE chats ADD COLUMN origin_hash TEXT;
ALTER TABLE chats ADD COLUMN active_greeting_index INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chats ADD COLUMN persona_snapshot TEXT;
CREATE INDEX IF NOT EXISTS idx_chats_origin ON chats(origin, origin_id);

ALTER TABLE messages ADD COLUMN origin_id TEXT;
ALTER TABLE messages ADD COLUMN sequence_index INTEGER;
ALTER TABLE messages ADD COLUMN missing_assets TEXT;
CREATE INDEX IF NOT EXISTS idx_messages_origin ON messages(chat_id, origin_id);

-- 2. Global content-addressed pool index (X3; filesystem remains in data/assets/pool/)
CREATE TABLE IF NOT EXISTS assets (
  id         TEXT PRIMARY KEY,   -- full 64-char lowercase sha256
  mime       TEXT NOT NULL,      -- sniffed: image/png | image/jpeg | image/webp | image/gif
  ext        TEXT NOT NULL,      -- .png | .jpg | .webp | .gif (derived from sniff, never source ext)
  size       INTEGER NOT NULL,
  width      INTEGER NOT NULL,
  height     INTEGER NOT NULL,
  path       TEXT NOT NULL,      -- '/assets/pool/<id>.<ext>'
  created_at INTEGER NOT NULL
);

-- 3. Semantic bindings (two-tier model; roles constrained)
CREATE TABLE IF NOT EXISTS character_assets (
  id           TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  asset_id     TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  role         TEXT NOT NULL CHECK (role IN ('avatar','gallery','sprite','greeting','background')),
  label        TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_char_assets_role ON character_assets(character_id, role, label);

CREATE TABLE IF NOT EXISTS message_assets (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  asset_id   TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  PRIMARY KEY (message_id, asset_id)
) WITHOUT ROWID;
```

Repository rules:

* `assets` rows are written in the same transaction as the characters/chats that reference them; pool files are written to `*.tmp` + atomic rename **before** the transaction commits, fsynced per existing `FsAssetStore` behavior.
* Deleting a character/chat cascades bindings but `RESTRICT`s pool blobs (X3). A new `bun run assets:gc --pool` mark-and-sweep (referenced from `characters.avatar`, `character_assets`, `message_assets`, `personas.avatar`, inline `media://` scan) deletes unreferenced pool files. No automatic deletion on character delete in this phase.
* `origin_hash` = SHA-256 over a canonical JSON projection of the source record (field order fixed, whitespace stripped). The canonical projection function lives in `shared` (pure, tested) so CLI and server agree byte-for-byte.
* Backfill: existing rows get `origin='native'`, `origin_id=NULL`, `origin_hash=NULL`; `active_greeting_index=0`; `persona_snapshot=NULL`. FTS rebuilt only if the migration touches indexed text (it doesn't — tags path unchanged).

`shared` additions (pure, isomorphic): `mediaUrls.ts` (`MEDIA_URL_RE`, `extractMediaHashes(text)`, `rewriteMediaUrls(text, (hash)=>url)`), `provenance.ts` (`canonicalCharacter(record)`, `canonicalChat(record)`, `hashCanonical(json)`), extended `CharacterMetadataSchema` (`import?: { origin, originId, tagsRaw?, tokenCounts?, stats?, soundcloudTrackId?, isNsfw?, isImageNsfw? }`), `ChatMetadataSchema` (`summary?`, `forkSource?`), new `SyncReportSchema`.

---

## 4. ETL pipeline (normative)

One pipeline, three entrypoints (§5). Stages are fixed order; a stage never reaches back to an earlier one.

```
Sniff → Plan → Copy blobs → Upsert characters → Upsert chats → Append messages → Rebuild FTS → Report
```

1. **Sniff.** Accept a directory root (`manifest.json` + `characters/` + `chats/` + `media/`) or a single file (`.json` character, chat JSON, `.png`, `.charx`, `.jsonl` — single-file routing by magic bytes, not extension). Reject anything else with `unsupported_format`. For directories, missing `manifest.json` is a warning, not an error (probe filesystem).
2. **Plan.** List source records, compute `origin_hash` per record, compare against `WHERE origin=? AND origin_id=?`. Three sets: `skip` (hash equal), `upsert` (new or changed), `append` (chat exists, higher `sequence_index` present). The plan is returned in the sync report and `--dry-run` prints it without writing.
3. **Copy blobs.** For every referenced hash in the `upsert`/`append` set: if `assets.id` exists, reuse; else sniff magic bytes, check dimensions header, stream-copy to `data/assets/pool/<hash>.<ext>` via tmp+rename, insert `assets` row. Unknown/missing source file → record in `missing_assets`, continue (X9). SVG / non-image magic → `asset_type_rejected` for that blob only, continue batch.
4. **Upsert characters.** `INSERT … ON CONFLICT(origin, origin_id) DO UPDATE` — but SQLite has no unique index on that pair for native rows with NULLs, so implement as: lookup by `(origin, origin_id)`; if found and hash equal → skip; if found and hash differs → `UPDATE` changed columns + `updated_at=now`; else `INSERT` with minted slug. Never touch `chats`/`messages` FKs on character update. Tags reconciled (delete-then-insert join rows in the same transaction).
5. **Upsert chats + append messages.** Same lookup pattern. New chat → insert chat + full message chain in `sequence_index` order with sibling swipes (§2.3). Existing chat → `SELECT MAX(sequence_index)`; insert only higher indices; update `active_leaf_id` to the new tip, `updated_at=now`. Never update existing message rows (X7) except filling `missing_assets` resolutions.
6. **Rebuild FTS.** Bulk path: `DELETE FROM characters_fts` + reinsert once (reuse `scripts/reindex.ts` logic as an imported function, not a subprocess). Single path: per-row maintenance (existing behavior).
7. **Report.** Every run returns `SyncReport`: `{ scanned, skipped, insertedChars, updatedChars, insertedChats, appendedMessages, reusedBlobs, copiedBlobs, missingAssets[], quarantinedChats[], durationMs }`. CLI prints it; API returns it; frontend renders it verbatim.

Performance contract (measured on the live dump, Windows NTFS): bulk import completes without holding SSE or generation state; generation requests during bulk receive `409 sync_in_progress` only if they target a chat currently being written, never globally. The blueprint sets no second-count target — the implementer reports measured wall time for full + no-op re-sync in the PR (expect no-op re-sync to be hash-compare bound, well under a minute).

Concurrency: one sync at a time per database (synchronous guard like S2 — second caller gets `409 sync_in_progress`). Normal chat/message writes proceed concurrently except on rows in the current batch.

---

## 5. API & CLI surface

Bodies/queries validated with shared TypeBox schemas; errors use the existing `ApiError` envelope. New codes: `sync_in_progress`, `unsupported_format`, `quarantined` (orphan chat), `asset_type_rejected` (per-blob, non-fatal — appears in report, not as HTTP error).

| Method | Endpoint | Body / Query | Returns | Notes |
|---|---|---|---|---|
| `POST` | `/api/import/custom-engine/sync` | `{ root: string }` (server-local path) **or** multipart `manifest + files` | `202 { runId }` then poll, **or** synchronous `200 SyncReport` when `?wait=true` | P0 bulk + delta. `root` must resolve under an allowlist (`FORMATAVERN_IMPORT_DIR` or the known exports dir); path traversal → 403. |
| `GET` | `/api/import/runs/:runId` | — | `{ status: 'running'|'done'|'error', report? }` | Progress for the 780 MB first run (counts + bytes copied). |
| `POST` | `/api/import/custom-engine/single` | multipart `file` (character/chat JSON) | `200 SyncReport` (single-record) | P0 selective import; same pipeline, batch size 1. |
| `POST` | `/api/import/v2` | multipart `file` (`.png`/`.json`) | `201 CharacterCard` | Slice C: V2 ingest via `tEXt chunck → CharacterCreate` + avatar through pool. |
| `POST` | `/api/import/jsonl` | multipart `file` (`.jsonl`) + `characterId` | `201 ChatView` | Slice D: ST chat ingest (line-0 metadata → persona snapshot fallback). |
| `GET` | `/api/characters/:id/export.png` | `?format=png\|json` | `image/png` / `application/json` | Slice C: V2 render from DB (§8). |
| `GET` | `/api/chats/:id/export.jsonl` | — | `application/octet-stream` JSONL | Slice D: ST-compatible transcript. |
| `GET` | `/api/characters/:id/export.charx` | — | `application/zip` | Slice E: CharX pack (`card.json` + `assets/`). |
| `GET` | `/api/export/relational-pack?characterId=` | — | `application/zip` | Slice E: lossless `custom_engine`-shaped pack for backup/transfer. |

CLI (for the operator running the 1,623-card migration locally):

```bash
bun run import:custom-engine --root "S:/WorkSpace/Projects Workspace/Python/JAI_Migration/exports/custom_engine" [--dry-run] [--limit N] [--character <originId>]
bun run import:custom-engine --file <path-to-character-or-chat.json>
bun run assets:gc --pool [--delete]     # mark-and-sweep report; --delete actually unlinks
```

`--dry-run` prints the plan (§4.2) and exits 0 without writing. `--limit N` imports the first N characters (for smoke runs). `--character` imports one character + its chats. Exit codes: 0 ok, 2 plan has quarantined/failed items (still imported the rest), 1 fatal.

Auth: all endpoints behind the existing N6 pre-parse gate; no new auth logic.

---

## 6. Asset pool evolution

* New pool dir `data/assets/pool/` (env `FORMATAVERN_ASSETS_DIR` join). Existing `avatars/`, per-character dirs, `draft-*`, `fonts/`, `backgrounds/` untouched; existing rows keep their paths.
* Pool filename = `<full-sha256><sniffed-ext>` (64 hex, not the 16-char interactive form — the length difference is intentional and documented; both are content hashes, different scopes).
* `FsAssetStore` gains `putPool(bytes): AssetRecord` + `resolvePool(hash): path|null`, reusing `sniff.ts`/`dimensions.ts`. No changes to interactive `save()` caps.
* Static serving: existing `/assets/*` mount covers `/assets/pool/*` with the same `nosniff` + `inline` headers. Path containment checks apply.
* Backfill/GC: `assets:gc --pool` scans all five reference sources (§3); without `--delete` it prints `referenced / unreferenced / bytes`. Interactive `DELETE /characters/:id?cascade=chats` does **not** delete pool blobs in this phase (X3) — GC is the only pool deleter.

---

## 7. Frontend (minimal slice)

No new routes, no catalog changes, no studio changes in this phase. Three surgical additions:

1. **`media://` rewrite (required, P0).** `lib/render/mediaRewrite.ts` (pure, imports `rewriteMediaUrls` from shared): rewrites `media://{hash}` → `/assets/pool/<hash>.<ext>` by looking up the extension from aprefetched hash→ext map on the chat/character payload (fallback: probe `.webp` → `.png` → `.jpg` → `.gif` via `HEAD`, cache result). Applied inside `Markdown.svelte` (chat) and `ShowcaseBody.svelte` (description/notes) after sanitization, before `{@html}`. Missing blob → renders the existing broken-image slate with `data-missing-asset=<hash>` (never a network fetch to a remote host).
2. **Persona snapshot label (required, P0).** Chat `You` panel shows `Snapshot: <name>` from `persona_snapshot` when present, with the existing switch-persona control untouched. No editing of snapshots.
3. **Import status surface (deferred to Slice B UI, backend-first).** Bulk sync is CLI + API in P0; the Foyer/Studio upload buttons arrive with Slice C. The API already returns `SyncReport`; any UI renders it verbatim, no new state shapes.

`boundaries.test.ts` gains: `mediaRewrite.ts` is the only importer of `rewriteMediaUrls` outside shared; `{@html}` allow-list unchanged.

---

## 8. Feature specifications (slices)

### Slice A — `custom_engine` bulk import (P0, ship first)

* CLI `--root` full import of the live dump: characters → pool blobs → chats → messages, one transaction per 500-character batch, FTS rebuild at end, `SyncReport` printed.
* Character detail proof: a card with 13 alternates, a card with shared avatar, the avatar-less card, an emoji-tagged card, and a `media://`-in-description card all import per §2.1.
* Chat proof: a 400+ turn chat, a multi-chat character (spot-check the 99-chat extreme for keyset sanity, full content for at least 3), a non-zero `active_greeting_index` chat, a swiped chat (646 candidates), an inline-media chat (95 candidates).
* `db:check` clean; FTS parity; re-run is a no-op (X1 proof).

### Slice B — Delta + single + missing-asset healing (P0)

* Modify one source character JSON (e.g. append a tag) + add one message to a chat JSON + drop one new media file → sync updates 1 character, appends 1 message, resolves a previously-missing hash. Nothing else changes (`updated_at` spot-check).
* `POST …/single` with one character file and one chat file.
* Quarantine proof: chat JSON pointing at an unknown `character_id` → `quarantinedChats[]`, HTTP 200 with report (never 500, never partial insert).

### Slice C — TavernCard V2 import/export

* Import: PNG `tEXt` (`ccv3` preferred, `chara` fallback) → Base64 → UTF-8 → V2 `data` → `CharacterCreate` (+ avatar bytes through `putPool`, `token_counts`/`extensions` → `metadata.import`). Raw JSON same path. V1/Gradio/YAML mappings deferred (§11).
* Export: `GET …/export.png` re-embeds cleansed V2 (`fav=false`, no `chat` pointer) into the pool avatar bytes; `?format=json` returns strict V2 JSON. Round-trip test: export → re-import as new `origin_id` → field equality on the §2.1 prompt fields.

### Slice D — SillyTavern JSONL chat import/export

* Import: line-0 `chat_metadata`/`user_name`/`character_name` → title + persona snapshot fallback; lines 1..N → linear chain + `swipes`/`swipe_id` → siblings; `is_system` rows stored but flagged `metadata.system=true` (hidden from prompt per existing builder behavior).
* Export: active branch root→leaf walk → JSONL with line-0 header. Round-trip: export → import → message count and order equality.

### Slice E — CharX + relational pack export

* CharX: `card.json` + `assets/<role>/<label>.<ext>` from `character_assets`; avatar = `icon/main`. Relational pack: `manifest.json` + `characters/*.json` + `chats/*/*.json` + `media/*` in `custom_engine` shape (lossless except FormaTavern-native fields, which ride `metadata.import`).

---

## 9. Tricky traps & failure modes

### 9.1 Identity & idempotency

| Trap | Symptom | Guard |
|---|---|---|
| Trusting `updated_at` for deltas | All 2,696 chats have null `updated_at` → every sync looks "changed" | Content `origin_hash` only (X1); timestamps informational |
| Trusting manifest counts | Manifest says 4,325 media, disk has 4,371 → import "completes" with blobs missing | Manifest advisory (X3); filesystem probe authoritative; counts in report, not in logic |
| Reusing source IDs as PKs | `1566553883_0` sorts wrong as ULID siblings; cross-chat collisions | Fresh ULIDs/slugs; source ids in `origin_id` only (§2.3) |
| `token_counts` key drift | Strict schema rejects cards with `example_dialog_tokens` vs `first_message_tokens` | Accept-any-map into `metadata.import` (§2.1); canonical hash uses the raw map |
| Emoji/unicode tags | FTS tokenizer chokes; `normalizeTag` returns null | Raw list in `metadata.import.tagsRaw`; join rows only for normalizable tags |

### 9.2 Media & filesystem (Windows NTFS)

| Trap | Symptom | Guard |
|---|---|---|
| 64 MiB quota on 780 MB | First batch fails with `asset_quota` | Pool exempt (A-AS1); interactive caps unchanged (X10) |
| Per-file readdir quota accounting | `getDirSize` recursion per upload → O(n²) stall | Bulk path skips quota accounting entirely; reports total bytes instead |
| Extension mismatches | `.png` file that is WebP bytes | Sniff decides ext (existing `sniff.ts`); manifest ext ignored |
| 1 orphan inline hash (live data) | Whole character fails | Placeholder + `missing_assets` (X9); heals on later sync |
| GIF/XL images | `sniff.ts` allows GIF; >4096px header | GIF passes; oversize header → per-blob reject, batch continues |
| Case-variant hashes | `MEDIA://ABC…` treated as reference | Regex lowercase-64 only; all else literal text |

### 9.3 Tree & persona

| Trap | Symptom | Guard |
|---|---|---|
| Flattening swipes to text | 646 swiped turns lose alternates | Sibling rows with `imported_swipe` (X6); count asserted in tests |
| Dropping `active_greeting_index` | 166 chats lose scenario lineage | Dedicated column; export round-trips it |
| Persona fan-out (2,696 personas) | Persona roster spammed | Match-by-name + single `imported-*` per name (X5); snapshot is per-chat regardless |
| Snapshot vs live persona confusion | Old chats change voice after default switch | Builder reads snapshot for imported chats when rendering history header; global persona only for new turns |

### 9.4 Bulk & SQLite

| Trap | Symptom | Guard |
|---|---|---|
| Per-row FTS writes on 80k messages | Import stalls the single writer; SSE timeouts | Deferred FTS rebuild (X2); single-import path unaffected |
| One giant transaction for 780 MB | WAL grows; abort loses everything | Batches of 500 characters; each batch atomic; resume re-skips completed batches (X1) |
| Two syncs at once | Interleaved batches, half-updated chats | Single-sync guard → `409 sync_in_progress` (like S2) |
| FTS rebuild crash mid-way | Search parity fails | `db:check fts_parity`; `db:reindex` recovery; parity asserted post-sync |

### 9.5 Export

| Trap | Symptom | Guard |
|---|---|---|
| Mutating pool bytes during PNG embed | Later re-sync hash mismatch | Exports read pool bytes, write to response stream only (X8 test) |
| CharX `icon/main` missing | Broken avatar in third-party clients | Fallback: first `icon`, else pool avatar with `name='main'`; warned in export report |
| JSONL `swipe_id` drift | ST shows wrong selected swipe | Selected = first sibling (chain order); `swipe_id` = sibling index; round-trip test pins it |

---

## 10. Definition of Done & verification

### 10.1 Acceptance criteria

1. `bun run typecheck` 3/3 clean; `bun run test` green with the new suites; `bun run build` succeeds.
2. `bun run db:migrate` upgrades a v10 database to v11 in one transaction; `db:check` reports `user_version=11`, `fts_parity=ok`, `provenance_orphans=0`, `pool_orphans=<reported>`; `db:reindex` restores parity after a deliberate `DELETE FROM assets`.
3. **Bulk proof (Slice A):** full `--root` import of the live dump completes; `SyncReport` shows 1,623 characters / 2,696 chats / ~80k messages reconciled; spot-checks (§8) render avatars, inline description art, 13-greeting cards, and a 400-turn chat; `db:check` clean.
4. **Idempotency proof (X1):** immediate re-run returns `skipped == scanned`, zero `updated_at` changes (asserted by query, not eyeballed).
5. **Delta proof (Slice B):** 1-character edit + 1-message append + 1-new-blob → exactly those rows change; missing-asset placeholder from Slice A heals if its blob arrives.
6. **Persona proof (X5):** open an imported chat, switch global default persona, reload — historical header still shows snapshot name; new turns use the new persona; prompt inspector shows no cross-contamination.
7. **Media proof (X4):** disable network (offline) → showcase + chat inline images still render; page source contains zero `http(s)://` image URLs; a missing-hash message shows the missing slate, not a broken fetch.
8. **Export proof:** V2 PNG export opens in a third-party viewer with avatar + prompt fields; JSONL export re-imports with equal message order; CharX/relational-pack unzip with `card.json` + blobs intact.
9. **Quarantine proof:** orphan chat file → report entry, HTTP 200, zero partial rows.
10. **Production:** `bun run start` serves `/assets/pool/<64hex>.<ext>` with `nosniff`, and returns JSON 404 for `/assets/pool/../../formatavern.db`.

### 10.2 Required tests (normative)

**`packages/shared/test/`** — `mediaUrls.test.ts` (regex table: 64-hex match, uppercase/short/long rejected; rewrite idempotent; `rewrite(rewrite(x))===rewrite(x)`); `provenance.test.ts` (canonical projections stable under key reorder; hash changes on any semantic edit, stable on whitespace); schema additions (`metadata.import`, `persona_snapshot`, greeting index bounds).

**`backend/test/`** —
* `migrations.test.ts`: fresh → v11; v10-with-data upgrades (native rows backfilled `origin='native'`); rollback-on-throw leaves v10 intact.
* `import/mediaPool.test.ts`: renamed/tampered blobs; sniff-over-extension; SVG rejected per-blob; 64-hex pool naming.
* `import/characters.test.ts`: slug mint + collision; emoji-tag raw path; 13-alternate card; avatar-less card; `origin_hash` skip vs update.
* `import/chats.test.ts`: orphan quarantine; null-`updated_at` handling; greeting index preserved; snapshot stored + persona reuse (no fan-out).
* `import/treeMapping.test.ts`: linear chain parentage; swipes → siblings with order; `is_main:false` fixture; 433-turn chain depth query.
* `import/delta.test.ts`: append-only (existing rows byte-equal); `active_leaf_id` advances; user-edited turn untouched.
* `import/bulk.test.ts`: 500-batch atomicity (inject throw → batch rolled back, prior batches kept); FTS deferred + parity; single-sync guard 409.
* `import/missingAssets.test.ts`: placeholder render path; heal on later sync.
* `import/exportV2.test.ts`, `import/exportJsonl.test.ts`, `import/exportCharx.test.ts`: round-trips per §8.
* `routes/import.test.ts`: status codes for every §5 code; traversal `root` → 403; `?wait=true` vs `runId` polling.

**`frontend/unit/`** — `mediaRewrite.test.ts` (hash→URL with ext map, fallback probe order, missing slate, zero remote fetch); persona snapshot label test; `boundaries.test.ts` amended per §7.

### 10.3 Step-by-step verification

```bash
bun install && bun run typecheck && bun run test
bun run db:migrate && bun run db:check        # user_version=11, fts_parity=ok

# Smoke (fast): 5 characters, dry-run first
bun run import:custom-engine --root "S:/WorkSpace/Projects Workspace/Python/JAI_Migration/exports/custom_engine" --limit 5 --dry-run
bun run import:custom-engine --root "S:/WorkSpace/Projects Workspace/Python/JAI_Migration/exports/custom_engine" --limit 5
bun run db:check

# Full bulk + idempotency
bun run import:custom-engine --root "S:/WorkSpace/Projects Workspace/Python/JAI_Migration/exports/custom_engine"
bun run import:custom-engine --root "S:/WorkSpace/Projects Workspace/Python/JAI_Migration/exports/custom_engine"   # must be no-op
bun run db:check && bun run db:reindex && bun run db:check

bun run dev   # http://127.0.0.1:5173
#  1. Open an inline-art card (541 candidates) → description images render offline.
#  2. Open the 13-greeting card → alternates listed in order.
#  3. Open a 400-turn chat → full scroll, correct order, swipes navigable where present.
#  4. Open an imported chat → You panel shows Snapshot name; switch default persona → history unchanged.
#  5. Export V2 PNG + JSONL + CharX for one character → third-party open + re-import equality.

bun run build && bun run start
curl -si http://127.0.0.1:3000/assets/pool/<64hex>.webp | grep -i -E 'content-type|nosniff'
curl -si "http://127.0.0.1:3000/assets/pool/../../formatavern.db" | head -1     # 404 JSON
```

Artifacts for the PR: `SyncReport` JSON for full + no-op runs, wall-time numbers for both, `db:check` pre/post, offline-render screenshot, persona-snapshot before/after, export round-trip logs.

---

## 11. Explicit scope boundaries — deferred

Not in this blueprint: V1/Gradio/YAML card mappings; BYAF/Risu/Agnai/Ooba/Kobold/CAI chat transpilation (the ST report catalogs them — each gets its own slice when requested); lorebook/world-info import; group chats; presets/templates/themes/tags-backup import; community hub browsing; remote URL/UUID fetching (whitelist model deferred); server-side image re-encode/thumbnails/AVIF; multi-avatar/expression sprites beyond the `character_assets` rows (rows exist, sprite UI deferred); auto chat titles; full-text search across messages; persona-specific first messages; example-dialogue dialect conversion; live watch-mode sync (polling `sync` on an interval — the pipeline is idempotent so this is a later cron, not a design change).

What this blueprint hands forward: a pool any future sprite/gallery feature reads from, provenance columns every future importer reuses, a `SyncReport` envelope every future source returns, and exporters that make FormaTavern a good citizen in the ST/Chub/Discord ecosystem.

---

## 12. Execution order

1. **shared**: `mediaUrls.ts`, `provenance.ts`, schema extensions (`metadata.import`, `persona_snapshot`, greeting index, `SyncReport`, `ApiErrorCode` additions), `SHARED_VERSION` bump, tests.
2. **backend storage**: migration v11 with all §3 DDL + backfills; repository provenance lookups; `assets` + bindings repositories; `db:check` audits (`provenance_orphans`, `fts_parity`, `pool_orphans`); `assets:gc --pool`; tests.
3. **backend pool**: `FsAssetStore.putPool/resolvePool`, static coverage for `/assets/pool/*`, guards test.
4. **backend pipeline**: sniff/plan/copy/upsert/append/rebuild/report as an injectable service (filesystem decoupled for tests); CLI `import:custom-engine` (`--dry-run/--limit/--character/--file`); tests per §10.2.
5. **backend routes**: §5 table with 409/403 semantics + `runId` polling; exporters (V2 → JSONL → CharX → relational-pack); route tests.
6. **frontend render**: `mediaRewrite.ts` + Markdown/Showcase integration + missing slate + snapshot label; unit tests; amend `boundaries.test.ts` **before** any other UI.
7. **docs & proofs**: update `docs/schema.md` (v11), `docs/architecture.md` (§5 pool, §10 import/export rows), `docs/development.md` §6.3 (X1–X10 mapping), `.agents/AGENTS.md` (amendments A-P3/A-AS1, new invariants); run §10.3; attach artifacts.

(End of blueprint — implement slices A→E in order; do not parallelize across slices sharing the pool or provenance columns.)
