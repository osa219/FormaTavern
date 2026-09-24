# FormaTavern Exchange Archive Specification

**Status:** Living specification. This document is the normative contract for the bulk interchange format between the upstream fusion pipeline and FormaTavern's import pipeline. Code (`backend/src/import/customEngine/`) implements this document; on conflict, this document wins pending a fix on either side.
**Format codename:** `custom_engine` (a FormaTavern-specific format name is pending; the rename will be recorded here when decided).
**Mapping version:** v3 (see §6).

---

## 1. Purpose & Principles

1. The archive is a **relational database-in-a-folder**: characters, chats, messages, and media are first-class entities linked by IDs, never by file paths or names.
2. **Zero external hotlinks.** Every binary is stored locally under `media/` and referenced by SHA-256.
3. **Zero path coupling.** Records reference media by 64-char lowercase hex digest; the manifest is an advisory index, never the authority.
4. **Two names, two roles.** `card_title` is the distinct listing identity (card name, slug source). `chat_name` is the canonical in-world persona name (`{{char}}` in dialogue and prompts). There is no ambiguous `name` field.
5. **Marketing is not lore.** `description` holds author showcase/marketing content (often HTML). It is display-only in FormaTavern and never enters prompts.

---

## 2. Package Layout

```
<root>/
├── manifest.json        # advisory inventory (counts, media index); never authoritative
├── characters/          # one JSON file per character: <id>.json
├── chats/               # one subdirectory per character id, each with <chatId>.json files
└── media/               # content-addressed blobs: <sha256>.<ext>
```

An ingester must probe the filesystem directly and treat missing `manifest.json` as a warning, not an error.

---

## 3. Character Entity (`characters/<id>.json`)

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | `TEXT` | yes | Stable UUID, independent of renames. |
| `card_title` | `TEXT` | yes | Distinct listing identity (e.g. `"Shizuku - Your Neighbor ♥"`). → FormaTavern card name. |
| `chat_name` | `TEXT` | yes | Canonical in-world persona name (e.g. `"Shizuku"`). → FormaTavern `character_name` ({{char}}). |
| `avatar_hash` | `TEXT` (nullable) | no | SHA-256 of the avatar blob in `media/`. |
| `description` | `TEXT` | yes | Author showcase/marketing blurb (Markdown/HTML). → FormaTavern `showcase` (display-only). |
| `personality` | `TEXT` | yes | Core system traits (`<Persona>`). → prompt Block 3. |
| `scenario` | `TEXT` | no | Setting premise (`<Scenario>`). → prompt Block 4. |
| `first_message` | `TEXT` | yes | Primary greeting turn. |
| `alternate_greetings` | `JSON array` | no | Alternate greeting variants, order-preserved. |
| `mes_example` | `TEXT` (nullable) | no | Few-shot dialogue examples. → `metadata.exampleDialogue`. |
| `creator_name` | `TEXT` | yes | Author handle (attribution). |
| `creator_id` | `TEXT` | no | Author identifier. |
| `creator_url` | `TEXT` (nullable) | no | Author profile URL. |
| `character_url` | `TEXT` (nullable) | no | Origin platform character URL. |
| `source_platform` | `TEXT` | no | Origin hub slug. → `origin` provenance detail. |
| `creator_notes` | `TEXT` (nullable) | no | Author commentary/warnings. Appended to showcase. |
| `tags` | `JSON array` | no | Classification tags. |
| `soundcloud_track_id` | `TEXT` (nullable) | no | Ambient track reference. Preserved in metadata. |
| `token_counts` | `JSON object` | no | Token breakdown map (keys vary; stored verbatim). |
| `is_nsfw` | `BOOLEAN` | no | Maturity flag (defaults safe). |
| `is_image_nsfw` | `BOOLEAN` (nullable) | no | Avatar maturity flag. |
| `stats` | `JSON object` (nullable) | no | Community metrics. Preserved verbatim. |
| `created_at` / `updated_at` | `TIMESTAMP` | no | ISO-8601 lifecycle stamps (`updated_at` may be null). |

### FormaTavern column mapping (mapping v3)

| Source | Target | Notes |
| :--- | :--- | :--- |
| `id` | `characters.origin_id` (`origin='custom_engine'`) | Fresh slug minted from `card_title`; UUID never becomes the PK. |
| `card_title` | `characters.name` (slice 120) | Slug source. Foyer/showcase heading. |
| `chat_name` | `characters.character_name` | {{char}} fallback chain root. |
| — | `characters.tagline` | Left empty (user-authored; never overwritten on re-sync). |
| `description` | `characters.showcase` (verbatim, clamp 65_536) + `metadata.import.sourceDescription` | Lore `description` stays `''`; prompt Block 2 silent. |
| `creator_notes` | appended to `showcase` as `<details>` block | Display-only. |
| `personality`, `scenario`, `first_message`, `alternate_greetings`, `mes_example` | same-named columns | Prompt Blocks 3/4/5 + greeting pipeline. |
| `avatar_hash` | pool blob + `characters.avatar` + `character_assets(role='avatar')` | Content-addressed, deduplicated. |
| `tags` | `character_tags` (normalized) + `metadata.import.tagsRaw` | Un-normalizable tags kept raw, excluded from FTS. |
| `token_counts`, `stats`, `soundcloud_track_id`, `is_nsfw`, `is_image_nsfw` | `metadata.import.*` | Verbatim preservation. |

---

## 4. Chat Entity (`chats/<characterId>/<chatId>.json`)

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | `TEXT` | yes | Session id (platform id). → `chats.origin_id`; fresh short id minted. |
| `character_id` | `TEXT` (FK) | yes | Links `Character.id`. Unknown ids quarantine the chat (never inserted). |
| `title` | `TEXT` | no | Session label (fallback `Chat with <name>`). |
| `summary` | `TEXT` | no | Long-term memory summary. → `chats.metadata.summary`. |
| `fork_source_chat_id` | `TEXT` (nullable) | no | Branch parent. → `metadata.forkSource` (origin reference). |
| `active_greeting_index` | `INTEGER` | no | `0` = `first_message`, `1..N` = alternates (clamped). Structural link to the card. |
| `user_persona` | `JSON object` | no | Immutable point-in-time snapshot `{name, description, avatar, pronouns}`. Stored verbatim in `chats.persona_snapshot`; global persona linked by name (no fan-out). |
| `created_at` / `updated_at` | `TIMESTAMP` | no | `updated_at` may be null → falls back to max message timestamp. |

---

## 5. Message Entity (embedded `messages[]` array)

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | `TEXT` | yes | `<chat>_<seq>` turn id. → `messages.origin_id`; fresh ULID minted. |
| `sequence_index` | `INTEGER` | yes | Contiguous from 0; main-branch order + delta watermark. |
| `role` | `TEXT` | yes | `user` → (`user`/`persona`), `assistant` → (`assistant`/`character`), `system` → (`system`/`narrator`). |
| `sender_name` | `TEXT` (nullable) | no | Historical display label; renames never rewrite it. |
| `content` | `TEXT` | yes | Verbatim (incl. `media://`). `segments`/`state` stay NULL unless regenerated. |
| `is_main` | `BOOLEAN` | no | `false` rows map to siblings sharing the parent (same as swipes). |
| `alternate_swipes` | `JSON array` | no | Each entry becomes a sibling row (`metadata.imported_swipe`). |
| `media_hashes` | `JSON array` | no | Turn attachments → `message_assets` join. |
| `timestamp` | `INTEGER` (nullable) | no | Unix ms → `created_at`. |

---

## 6. Media Protocol (`media://{sha256}`)

* Blobs live at `media/<64-hex>.<ext>`; identity is `SHA-256(bytes)`, verified on ingest (mismatch → recorded missing, batch continues).
* Four pointer types: `Character.avatar_hash`, `Chat.user_persona.avatar`, inline `media://{hash}` in `description`/`first_message`/`Message.content`, `Message.media_hashes[]`.
* Inline references match `/media:\/\/([a-f0-9]{64})/` (lowercase only). Stored text keeps `media://` verbatim; resolution to `/assets/pool/…` happens only at the render boundary.
* Unresolvable hashes never fail a batch: recorded per-message (`missing_assets`) and healed by a later sync that provides the blob.

---

## 7. Sync Contract (Idempotency)

* Provenance `(origin, origin_id, origin_hash)` on characters and chats; `origin_hash = SHA-256(canonical record + mapping version)`.
* Re-running a sync with unchanged bytes changes zero rows.
* Character re-import = non-destructive upsert (FK relations preserved; `tagline` and user edits outside mapped columns are never clobbered — `tagline` is excluded from updates entirely).
* Chat deltas append only `sequence_index > max_existing`; existing turns are never rewritten.

### Mapping version history

| Version | Change |
| :--- | :--- |
| v1 | Source blurb stored as lore `description`; card name from ambiguous `name`. |
| v2 | Blurb → display-only `showcase`, lore `description` empty; `sourceDescription` preserved. |
| v3 | Listing identity (`card_title` → card name, `chat_name` → {{char}}) after source `name` removal; `tagline` user-owned and update-exempt. |
