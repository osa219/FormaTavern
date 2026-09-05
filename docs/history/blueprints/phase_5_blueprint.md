# FormaTavern — Phase 5 Blueprint: The Companion Hub & Character Platform

**Purpose:** Turn the Chameleon canvas into a platform. Companions get expressive showcase pages that feel alive before the first message; users get first‑class personas with their own bios, avatars, and bubble aesthetics; creators get a Studio that edits *every* field the engine already understands (voice, aesthetic tokens, state schema, bindings) with live preview; the Foyer becomes a searchable catalog; and the chat room gets a lore drawer so the story never has to be left to look something up.

Nothing in the engine changes. Every feature here is a new **surface over existing contracts**: `CharacterCard`, `Persona`, `resolveTheme`, `ThemeEngine`, the `/api/characters` and `/api/personas` routers from Phase 3, and the `/assets` mount from Phase 4. The one genuinely new capability is **author‑controlled rich text** — and it is quarantined behind a second render profile that can never touch the chat log or the prompt.

**New dependencies:** none. (Image cropping uses `<canvas>`; image header parsing is a 60‑line pure module; search is SQLite FTS5, which Bun's bundled SQLite ships with; sanitization extends the existing `marked` + `DOMPurify` setup.) **`SHARED_VERSION`:** `0.5.0-phase5`. **Migration:** v4 `companion_platform`.

---

## 0. Carry‑forward from Phase 4 & amendments

Three small amendments to prior invariants are required by this phase. They are declared here so `boundaries.test.ts` and `AGENTS.md` are updated deliberately, not drifted.

| Amendment | Change | Why |
|---|---|---|
| **A‑U3** | `parseEnvelope` importer allow‑list becomes `lib/state/stream.svelte.ts` **and** `lib/studio/greetingPreview.ts`. The chat log still never re‑parses persisted rows. | The Studio previews a `firstMessage` that may contain envelope markers. The intent of U3 (persisted rows rendered as received) is unchanged. |
| **A‑U2** | `{@html` allow‑list becomes `ui/Markdown.svelte` **and** `showcase/ShowcaseBody.svelte`. No other file. | A second render profile needs a second (and last) `{@html}` sink. |
| **A‑S8** | `GET /api/characters` list responses are `CharacterSummary`, not full cards. | The Foyer must not download 64 KiB showcases × N characters. Detail routes still return the full card. |

Everything else (I1–I6, E1–E8, S1–S9, U1–U10) holds verbatim and is re‑verified by the existing suites.

---

## 1. Invariants for Phase 5

| # | Invariant | Enforced by |
|---|---|---|
| **P1** | **Two render profiles, one direction of trust.** `renderRoleplayMarkdown` (chat) is byte‑for‑byte unchanged — a golden test pins its output on a fixture corpus. `renderShowcaseMarkdown` is the *only* pipeline that admits `style`, `img`, headings, tables, and the curated `class` list. Neither is ever used for the other's content. | `unit/markdown.test.ts` golden; `unit/showcase.test.ts`; `boundaries.test.ts` import scan |
| **P2** | **Inline `style` is rebuilt, never passed through.** The showcase sanitizer parses `style` into declarations, keeps only the properties in `STYLE_ALLOWLIST` whose values match that property's value grammar, and re‑serializes. The rebuilt string can never contain `url(`, `var(`, `expression(`, `@`, `\`, `<`, `>`, `&`, `/*`, `!important`, or a NUL. Layout‑affecting properties (`position`, `z-index`, `transform`, `filter`, `pointer-events`, `content`, `clip-path`, `background-image`, …) are not in the allow‑list and the container additionally pins them with stylesheet `!important` (defense in depth). | `unit/styleAllowlist.test.ts` (pure, no DOM); `unit/showcase.test.ts` XSS corpus; `app.css` review |
| **P3** | **Images are same‑origin uploads only.** `<img src>` must match `^/assets/(characters\|personas\|backgrounds)/…` or the element is removed (not just the attribute). Uploads are sniffed by magic bytes (PNG/JPEG/WebP/GIF only; **SVG rejected**), dimension‑checked from headers, size‑capped, and stored under a **server‑minted** filename whose extension derives from the sniffed type. No remote image is ever fetched by the client on a showcase page. | `backend/test/assets/*.test.ts`; `unit/showcase.test.ts`; `db:check` assets audit |
| **P4** | **Showcase never enters the prompt.** `characters.showcase`, `tagline`, `creator`, and `tags` are display‑only. `PromptBuilder` reads exactly the fields it read in Phase 2. A test compiles a prompt for a card whose showcase contains a sentinel string and asserts the sentinel is absent. | `backend/test/prompt/builder.test.ts` (new case) |
| **P5** | **Editor ↔ schema parity.** Studio and Persona forms validate with the *same* TypeBox schemas via `validate()` from `shared`; the server re‑validates and remains authoritative. There is no field the editor can write that the schema does not describe, and no schema field the Studio cannot edit (`exampleDialogue`, `stateSchema`, `stateBindings`, `initialState` included). | `unit/studio.test.ts` parity scan over `CharacterCardSchema` keys; route tests |
| **P6** | **Migration v4 is additive; search is derived.** New columns are nullable or defaulted; no existing row is rewritten except the FTS backfill. `characters_fts` is a rebuildable index maintained by the repository in the *same transaction* as the row write — never by triggers, never a source of truth. `db:check` asserts `count(characters_fts) == count(characters)`. | `backend/test/migrations.test.ts` (v3→v4); `scripts/check.ts`; `scripts/reindex.ts` |
| **P7** | **Persona switch is atomic, guarded, and non‑destructive.** `PATCH /chats/:id { activePersonaId }` is one `UPDATE`, returns `409 generation_in_progress` while a stream is active, and **never** rewrites history rows or `sender_id`. The next prompt build and the theme cascade pick up the new persona; nothing else changes. | `backend/test/routes/chats.test.ts`; `unit/session.test.ts` |
| **P8** | **Deletes are explicit and counted.** FK `RESTRICT` remains the default. `DELETE /characters/:id?cascade=chats` and `DELETE /personas/:id?reassignTo=<id>` are the only escape hatches; both are transactional and the UI confirms with the exact count returned by a preflight. Owner asset directories are removed only after the DB transaction commits. | route tests; `ConfirmDialog` copy from server counts |
| **P9** | **Stale writes are rejected.** Every `PATCH` on characters and personas carries `expectedUpdatedAt`; the repository issues `UPDATE … WHERE id = ? AND updated_at = ?`; zero affected rows ⇒ `409 stale_write` with the current row so the editor can offer a diff/reload. | repository + route tests; `unit/studio.test.ts` |
| **P10** | **Layout stability on content pages.** Hero and gallery images reserve space (`aspect-ratio`, explicit `width`/`height` when known); the showcase body renders under `contain: layout paint style; overflow: clip`; Foyer cards have fixed geometry with skeletons. CLS ≤ 0.05 on a showcase with 6 images. | Lighthouse; CSS checklist |
| **P11** | **Purity boundaries unchanged.** `backend/src/app.ts` stays Bun‑free: uploads flow through an injected `AssetStore` contract implemented in `index.ts`; `shared` gains only pure modules (`tags.ts`, `slug.ts`, schema extensions); `svelte-check` 0/0 over `treaty<App>`. | `bun run typecheck`; `boundaries.test.ts` |

---

## 2. Design language

### 2.1 Where each palette applies
- **Showcase page (`/character/[id]`)** is a **theme root** for that companion: `--theme-*` from `resolveTheme({ character.style, a11y })` (no bindings, no persona). The page *is* the chameleon thesis in long form — Cinzel and parchment for Eldrin, Playfair and gothic slate for Alice — with `data-transitions="off"` (no animation on a content page).
- **Studio and `/personas`** are **chrome** (neutral) surfaces. Every live preview inside them is its own miniature theme root, exactly like Foyer swatches.
- **Foyer** stays chrome; cards keep their swatch roots.

### 2.2 Showcase typography & sectioning (normative defaults)
Authors should get the Janitor‑style "section banner" look **without writing HTML**. Under `.showcase-body`:
- `h1/h2` → centered band: `background: color-mix(in oklab, var(--theme-char-bg) 70%, transparent)`, 1 px `--theme-char-border`, `border-radius: var(--theme-bubble-radius)`, uppercase, `letter-spacing .06em`, `font-family: var(--theme-font-family)`, color `--theme-accent`; `h3/h4` → left‑aligned, accent underline hairline.
- Body measure `68ch`, `font-size: clamp(0.95rem, 0.9rem + .25vw, 1.0625rem)`, `line-height: var(--theme-line-height)`, `text-wrap: pretty`.
- `blockquote` → callout card on `--theme-char-bg` with `--theme-char-border`; `<q class="speech">` **is not applied** in showcases (that's dialogue styling; prose quotes stay plain).
- Curated author classes (the *only* `class` values admitted): `banner`, `callout`, `center`, `muted`, `columns`, `sidebar`. Defined once in `app.css`; anything else is stripped.
- `img` → `max-width: 100%; height: auto; border-radius: var(--theme-bubble-radius)`; `figure` centered with `figcaption` in chrome font at 75 %.
- Tables → wrapped in a horizontally scrolling container by the sanitizer post‑hook (`<div class="table-scroll">`), never the page.

### 2.3 Hero geometry
- Banner: `aspect-ratio: 21 / 9` (desktop) / `4 / 3` (≤ 640 px), source = `style.background.image` if set, else avatar scaled `1.2` + `blur(24px)` under the ambient gradient, else the ambient gradient alone. Overlay `--theme-bg-overlay`.
- Avatar: `9rem` circle (`6rem` mobile) overlapping the banner's bottom edge by 50 %, 3 px ring in `--theme-accent`. Initials fallback as in Phase 4.
- Below: name in `--theme-font-family` at `clamp(1.75rem, 4vw, 2.75rem)`; tagline (plain, ≤ 140 chars) at 70 % opacity; creator credit `by <creator>` in chrome font; tag chips (chrome palette, accent border at 40 %).
- Action Hub: primary **Start New Story** (with persona picker caret), secondary **Resume** (dropdown when > 1 story, direct when 1, hidden when 0), tertiary **Edit** and **⋯** (Duplicate, Export‑later, Delete).

### 2.4 Persona bubble preview
Every persona card and the persona editor render a two‑bubble preview: a neutral character bubble (`DEFAULT_CHARACTER_THEME`) and the user bubble with the persona's `styleOverrides` applied through `resolveTheme({ persona })`. The preview exists so users see that overrides layer on **any** companion, not one.

---

## 3. Data model & Migration v4 (`companion_platform`)

### 3.1 Schema additions (`shared`)

```ts
// packages/shared/src/schemas/character.ts — additive
export const TagSchema = Type.String({ pattern: '^[a-z0-9][a-z0-9-]{0,23}$' });   // normalized key form
export const CharacterCardSchema = Type.Object({
  …existing…,
  tagline:  Type.Optional(Type.String({ maxLength: 140 })),   // plain text, one line
  creator:  Type.Optional(Type.String({ maxLength: 80 })),    // plain text credit
  tags:     Type.Array(TagSchema, { default: [], maxItems: 12, uniqueItems: true }),
  showcase: Type.Optional(Type.String({ maxLength: 65_536 })) // markdown + safe HTML subset; DISPLAY ONLY (P4)
});

export const CharacterSummarySchema = Type.Object({          // list/search shape (A‑S8)
  id: Id, name: Type.String(), tagline: Type.Optional(Type.String()), avatar: Type.Optional(AssetPath),
  creator: Type.Optional(Type.String()), tags: Type.Array(TagSchema), style: CharacterThemeSchema,
  storyCount: Type.Integer(), lastStoryAt: Type.Optional(UnixMs), updatedAt: UnixMs
});

export const CharacterCreateSchema = Type.Omit(CharacterCardSchema, ['id', 'createdAt', 'updatedAt']) // id optional → server mints slug
  extended with Type.Optional(Id) as `id`;
export const CharacterPatchSchema = Type.Partial(CharacterCreateSchema) ∧ { expectedUpdatedAt: UnixMs };
export const PersonaCreateSchema / PersonaPatchSchema — same pattern; PersonaPatch carries expectedUpdatedAt.

// packages/shared/src/text/tags.ts (pure)
export function normalizeTag(input: string): string | null;  // NFKC → lowercase → trim → spaces/underscores→'-' → strip non [a-z0-9-] → collapse '-' → ≤24 → null if empty
export function displayTag(key: string): string;             // 'sci-fi' → 'Sci‑Fi'
export const SUGGESTED_TAGS = ['fantasy','sci-fi','modern','steampunk','adventure','romance','mystery','horror','slice-of-life','comedy','historical','drama'];

// packages/shared/src/text/slug.ts (pure)
export function slugify(name: string): string;               // ^[a-z0-9][a-z0-9-]{1,62}$ or '' if nothing survives
```

`Persona` gains nothing structurally — `avatar`, `description`, `isDefault`, `styleOverrides` already exist. The **editor** exposes only `colors.userBubbleBg/Text/Border` and `bubble.radius/userTail` (the cascade accepts any legal key; the UI is deliberately narrow, per Phase 4 §4.1).

### 3.2 Migration v4 DDL

```sql
-- characters: display-only columns (P4)
ALTER TABLE characters ADD COLUMN tagline  TEXT;
ALTER TABLE characters ADD COLUMN creator  TEXT;
ALTER TABLE characters ADD COLUMN showcase TEXT;

-- tags: join table is the ONLY storage of tags (card.tags is the API projection)
CREATE TABLE IF NOT EXISTS character_tags (
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  tag          TEXT NOT NULL,                     -- normalized key form
  PRIMARY KEY (character_id, tag)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_character_tags_tag ON character_tags(tag, character_id);

-- search: standalone FTS5 table keyed by id, maintained by the repository (P6)
CREATE VIRTUAL TABLE IF NOT EXISTS characters_fts USING fts5(
  id UNINDEXED, name, tagline, description, creator, tags,
  tokenize = 'unicode61 remove_diacritics 2'
);
-- backfill
INSERT INTO characters_fts(id, name, tagline, description, creator, tags)
  SELECT id, name, tagline, description, creator, '' FROM characters;

-- name sort support
CREATE INDEX IF NOT EXISTS idx_characters_name_nocase ON characters(name COLLATE NOCASE, id);
```

- The migration **feature‑detects FTS5** (`SELECT 1 FROM pragma_compile_options WHERE compile_options = 'ENABLE_FTS5'`). If absent (custom Bun builds), it records `settings.search_backend = 'like'` and skips the virtual table; the repository falls back to `LIKE … ESCAPE '\'` on `name/tagline/description`. `db:check` prints the active backend.
- `scripts/reindex.ts` (`bun run db:reindex`) truncates and rebuilds `characters_fts` from `characters` ⨝ `character_tags` — the recovery path if parity ever fails.

### 3.3 Repository contract additions

```ts
interface CharacterRepository {
  …existing…
  list(q: CharacterListQuery): { items: CharacterSummary[]; nextCursor: string | null };
  create(input: CharacterCreate): CharacterCard;                          // mints slug, resolves collisions (-2, -3 …)
  patch(id: string, input: CharacterPatch): CharacterCard | 'stale' | 'missing';
  remove(id: string, opts: { cascadeChats: boolean }): { chats: number } | 'restricted';
  duplicate(id: string): CharacterCard;                                   // "<name> (copy)", new slug, assets NOT copied (references kept)
  chatCounts(id: string): { chats: number };                              // preflight for ConfirmDialog
  tags(): { tag: string; count: number }[];
}
interface PersonaRepository {
  …existing…
  create / patch (stale-aware) / setDefault(id) (transaction: clear + set)
  remove(id: string, opts: { reassignTo?: string }): { chats: number } | 'restricted' | 'is_default';
}
interface AssetStore {                                                     // backend/src/assets/contracts.ts — Bun-free
  put(scope: AssetScope, ownerId: string, bytes: Uint8Array): Promise<AssetRecord>;   // sniff → mint ULID.<ext> → write
  list(scope: AssetScope, ownerId: string): Promise<AssetRecord[]>;
  remove(scope: AssetScope, ownerId: string, file: string): Promise<boolean>;
  removeOwner(scope: AssetScope, ownerId: string): Promise<number>;       // after cascade delete commits
  usage(scope: AssetScope, ownerId: string): Promise<number>;             // bytes, for quota
}
type AssetScope = 'characters' | 'personas' | 'backgrounds';
interface AssetRecord { path: AssetPath; mime: 'image/png'|'image/jpeg'|'image/webp'|'image/gif'; bytes: number; width: number; height: number; }
```

`CharacterListQuery = { q?: string; tags?: string[]; sort: 'recent'|'name'|'stories'; limit: number (≤ 60); cursor?: string }`. Writes touching `characters` + `character_tags` + `characters_fts` run in one `db.transaction()`.

---

## 4. API surface

All bodies/queries validated with the shared TypeBox schemas; all errors use the Phase 3 `ApiError` envelope. New codes: `stale_write`, `slug_taken`, `asset_type_rejected`, `asset_too_large`, `asset_dimensions`, `asset_quota`, `persona_is_default`, `persona_in_use`, `character_in_use`.

| Method | Endpoint | Body / Query | Returns | Notes |
|---|---|---|---|---|
| `GET` | `/api/characters` | `?q&tags=a,b&sort&limit&cursor` | `{ items: CharacterSummary[], nextCursor }` | FTS `MATCH` when `q.length ≥ 2`; tags are **AND**; keyset cursors (see §9.3) |
| `GET` | `/api/characters/:id` | — | `CharacterCard` (full) | unchanged shape + new optional fields |
| `POST` | `/api/characters` | `CharacterCreate` | `201 CharacterCard` | mints slug from `name` if `id` absent; `409 slug_taken` if provided id exists |
| `PATCH` | `/api/characters/:id` | `CharacterPatch` (+`expectedUpdatedAt`) | `CharacterCard` | top‑level field replace; `style`, `stateSchema`, `stateBindings`, `tags` are sent whole; `409 stale_write { current }` |
| `DELETE` | `/api/characters/:id` | `?cascade=chats` | `{ deleted: true, chats: n }` | without `cascade` → `409 character_in_use { chats }`; assets removed post‑commit |
| `POST` | `/api/characters/:id/duplicate` | — | `201 CharacterCard` | |
| `GET` | `/api/characters/:id/usage` | — | `{ chats, assetsBytes }` | preflight for confirm dialogs & quota bar |
| `GET` | `/api/tags` | — | `{ tag, count }[]` | sorted by count desc, then tag |
| `GET` | `/api/personas` | — | `Persona[]` | default first |
| `POST` | `/api/personas` | `PersonaCreate` | `201 Persona` | first persona ever created becomes default |
| `PATCH` | `/api/personas/:id` | `PersonaPatch` | `Persona` | `isDefault` cannot be set here |
| `POST` | `/api/personas/:id/default` | — | `Persona[]` | atomic clear+set |
| `DELETE` | `/api/personas/:id` | `?reassignTo=<id>` | `{ deleted: true, reassigned: n }` | default persona → `409 persona_is_default`; in use without reassign → `409 persona_in_use { chats }` |
| `GET` | `/api/chats` | `?characterId&limit&cursor` | `ChatListItem[]` | **extends** the Phase 3 list with a filter and adds `turnCount`, `activeGenerationMessageId`, `personaId` |
| `PATCH` | `/api/chats/:id` | `{ activePersonaId }` | `ChatView` | **extends** `ChatPatchSchema`; `409 generation_in_progress` if hub has this chat active (P7) |
| `POST` | `/api/assets/:scope/:ownerId` | `multipart file` | `201 AssetRecord` | owner must exist (or `scope=characters&ownerId=draft-<ulid>` for unsaved Studio drafts — see §9.2); 8 MiB cap; ≤ 4096 px/side; 64 MiB per owner |
| `GET` | `/api/assets/:scope/:ownerId` | — | `AssetRecord[]` | for GalleryManager |
| `DELETE` | `/api/assets/:scope/:ownerId/:file` | — | `{ deleted }` | `file` pattern‑validated (`^[0-9A-HJKMNP-TV-Z]{26}\.(png\|jpg\|webp\|gif)$`) |

Static serving of `/assets/*` (Phase 4) gains `X-Content-Type-Options: nosniff` and `Content-Disposition: inline`.

---

## 5. The rich‑text pipeline (normative)

### 5.1 `render/showcase.ts`
```ts
export function renderShowcaseMarkdown(md: string): string;   // marked(showcaseOptions) → DOMPurify(showcaseConfig) → postProcess
```
- **marked**: `gfm: true, breaks: true`, raw HTML **passed through** (inline and block), headings/images/tables **enabled**, no heading‑id extension (DOM‑clobbering guard), the `speech` extension **not** registered. Link renderer emits `<a href rel="noopener noreferrer" target="_blank">` for `https?:` only.
- **DOMPurify config** (a separate instance via `DOMPurify()` so chat config is untouched):
  ```ts
  ALLOWED_TAGS: ['p','br','em','strong','u','s','del','mark','small','sup','sub','code','pre','blockquote','ul','ol','li','hr','a','span','div',
                 'h1','h2','h3','h4','img','figure','figcaption','table','thead','tbody','tr','th','td','details','summary','center'],
  ALLOWED_ATTR: ['style','class','href','rel','target','src','alt','width','height','align','open'],
  ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false,
  FORBID_TAGS: ['style','script','iframe','object','embed','svg','math','form','input','button','textarea','select','link','meta','base','video','audio','source','template','slot','noscript'],
  FORBID_ATTR: ['id','name','srcset','sizes','usemap','ismap','form','formaction','xmlns','poster'],
  ```
- **Hooks** (`uponSanitizeAttribute`):
  - `style` → `rebuildStyle(value)` (§5.2); empty result ⇒ attribute removed.
  - `class` → keep only tokens ∈ `SHOWCASE_CLASSES`; empty ⇒ removed.
  - `src` → must match `^/assets/(characters|personas|backgrounds)/[a-z0-9][a-z0-9-]{1,62}/[0-9A-HJKMNP-TV-Z]{26}\.(png|jpe?g|webp|gif)$`; else **remove the element** (`data.forceKeepAttr = false` + mark node for removal in `uponSanitizeElement`). Backgrounds scope uses the flat `/assets/backgrounds/<file>` form.
  - `href` → `^https?:` or `^/character/[a-z0-9-]+$` (internal cross‑links); else removed (text remains).
  - `width`/`height` → integer `1..4096`; `align` → `left|center|right`; `target` → forced `_blank` with `rel` forced.
- **Post‑process** (`afterSanitizeAttributes`): `img` gets `loading="lazy" decoding="async" referrerpolicy="no-referrer"`; each `table` is wrapped in `<div class="table-scroll">`; text nodes have Unicode bidi‑override characters (`U+202A–U+202E`, `U+2066–U+2069`) removed.
- **Container**: `<div class="showcase-body" style="contain: layout paint style; overflow: clip; isolation: isolate">` with defensive stylesheet rules:
  ```css
  .showcase-body :where(*) { position: static !important; transform: none !important; filter: none !important;
                             pointer-events: auto !important; z-index: auto !important; inset: auto !important; }
  .showcase-body img { max-width: 100%; height: auto; }
  ```
  Because the rebuilt inline styles never carry `!important`, these stylesheet declarations win.

### 5.2 `render/styleAllowlist.ts` (pure — testable without DOM)
```ts
export const STYLE_ALLOWLIST: Record<string, RegExp> = {
  'color': COLOR, 'background-color': COLOR,
  'text-align': /^(left|center|right|justify)$/,
  'font-style': /^(normal|italic)$/, 'font-weight': /^(normal|bold|[1-9]00)$/,
  'font-size': /^(0\.[5-9]\d?|1(\.\d{1,2})?|2(\.[0-4]\d?)?|2\.5)(rem|em)$/,        // 0.5–2.5 em/rem only; px never
  'font-family': /^[a-zA-Z0-9 ,'"-]{1,80}$/, 'font-variant': /^(normal|small-caps)$/,
  'line-height': /^(1(\.\d{1,2})?|2)$/, 'letter-spacing': /^-?0?\.\d{1,2}em$/,
  'text-transform': /^(none|uppercase|lowercase|capitalize)$/,
  'text-decoration': /^(none|underline|line-through|underline line-through)$/,
  'text-shadow': /^-?\d{1,2}px -?\d{1,2}px \d{1,2}px COLOR$/,   // expanded at build
  'opacity': /^(0(\.\d{1,2})?|1)$/,
  'border': /^[1-3]px (solid|dashed|dotted) COLOR$/, 'border-radius': LEN_0_64PX_OR_REM_0_4,
  'padding': LEN_LIST_1_4, 'margin': LEN_LIST_1_4_OR_AUTO,
  'width': /^\d{1,3}%$/, 'max-width': /^\d{1,3}%$/,
  'display': /^(block|inline|inline-block)$/, 'float': /^(left|right|none)$/, 'clear': /^(both|left|right)$/,
};
const COLOR = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\(\s*[\d.]+%?(\s*[, \/]\s*[\d.]+%?){2,3}\s*\)|[a-z]{3,20})$/i;
const FORBIDDEN_SUBSTRINGS = ['url(', 'var(', 'expression', 'image-set', '@', '\\', '<', '>', '&', '/*', '!important', '-moz-', 'behavior', 'javascript', '\0'];

export function rebuildStyle(raw: string): string;
// 1. if raw.length > 512 or contains any FORBIDDEN_SUBSTRING (case-insensitive) → ''
// 2. split on ';', at most 12 declarations; each split at FIRST ':'; prop lowercased+trimmed; value trimmed, collapsed whitespace
// 3. keep iff prop ∈ STYLE_ALLOWLIST && regex.test(value)
// 4. serialize `${prop}: ${value}` joined with '; ' — deterministic order = input order, duplicates: last wins
```
A property is safe **because it is on this list**, not because it "seems harmless". Adding a property requires a test case and a review note; the list is the contract.

### 5.3 What this permits authors to do
Everything visible in the Janitor reference screenshot — centered section banners, colored emphasis spans, bold lead‑ins, ordered lore, callouts, inline gallery images — with either pure Markdown (`## LAWS AND PLOT IDEAS`, `> callout`, `![](/assets/…)`) or the inline HTML subset (`<p style="text-align:center">`, `<span style="color:#f5c76a">`). What it does not permit: anything that positions, overlays, animates, loads, or scripts.

---

## 6. Asset pipeline

### 6.1 Server (`backend/src/assets/`)
- `sniff.ts` (pure): detect PNG (`89 50 4E 47 0D 0A 1A 0A`), JPEG (`FF D8 FF`), WebP (`RIFF….WEBP`), GIF (`GIF87a|GIF89a`); return `{ mime, ext }` or `null`. Anything else — including SVG, BMP, TIFF, AVIF (deferred), HEIC — is `415 asset_type_rejected`.
- `dimensions.ts` (pure): PNG IHDR; JPEG SOF0/1/2 scan; WebP VP8/VP8L/VP8X; GIF logical screen. Reject `> 4096` px per side (`asset_dimensions`) — the decompression‑bomb guard, since we never decode server‑side.
- `store.ts` (Bun): `FsAssetStore implements AssetStore`. Path = `${ASSETS_DIR}/${scope}/${ownerId}/${ulid()}.${ext}` (backgrounds: flat). `ownerId` validated against the `Id` pattern *and* `path.resolve` must stay under `ASSETS_DIR`. Writes are `tmp → rename` for atomicity. Per‑owner quota 64 MiB (`asset_quota`).
- Route handler in `app.ts` uses `t.Object({ file: t.File({ maxSize: '8m' }) })`, reads `await file.arrayBuffer()`, and calls the injected store. No `Bun.*` in `app.ts`.

### 6.2 Client (`lib/assets/`)
- `upload.ts`: `uploadAsset(scope, ownerId, blob, { signal, onProgress })` via `XMLHttpRequest` (fetch has no upload progress) — returns `AssetRecord`.
- `crop.ts`: `AvatarCropper` draws the selected region to a `512×512` canvas and exports `image/webp` (q 0.9), falling back to PNG where WebP export is unsupported (Safari < 16). Client re‑encoding also **strips EXIF** for free.
- `GalleryManager`: uploads originals (no re‑encode; authors want their art intact), shows thumbnails, copies a ready Markdown snippet `![alt](/assets/characters/<id>/<file>)` to the clipboard, and flags **unreferenced** images (not found in the current showcase text) for cleanup.

---

## 7. Frontend architecture & file layout

```
frontend/src/
├── routes/
│   ├── +page.svelte                          # Foyer v2: SearchBar, TagFilter, SortSelect, CompanionGrid, RecentStories
│   ├── character/
│   │   ├── new/+page.svelte                  # Studio (create) — StudioShell mode="create"
│   │   └── [id]/
│   │       ├── +page.ts  +page.svelte        # Showcase (theme root)
│   │       └── edit/+page.ts +page.svelte    # Studio (edit) — StudioShell mode="edit"
│   ├── personas/
│   │   ├── +page.svelte                      # grid of PersonaCard + "New persona"
│   │   ├── new/+page.svelte                  # PersonaEditor
│   │   └── [id]/edit/+page.ts +page.svelte   # PersonaEditor
│   └── chat/[chatId]/…                       # + LoreDrawer mounted in ChatViewport
├── lib/
│   ├── render/  showcase.ts  styleAllowlist.ts  showcasePolicy.ts (src/href/class rules as pure predicates)
│   ├── assets/  upload.ts  crop.ts
│   ├── studio/  draft.svelte.ts (CharacterDraft: $state card, dirty, validation issues, localStorage autosave)
│   │            greetingPreview.ts (parseEnvelope → segments; A‑U3)  bindingsModel.ts (pure helpers over THEME_PATHS)
│   ├── state/   catalog.svelte.ts (q/tags/sort ↔ URL, debounce 200ms, seq-guarded fetch)  personas.svelte.ts
│   └── components/
│       ├── showcase/   ShowcaseHero  ShowcaseBody ({@html} sink #2)  TagChips  ActionHub  ResumeMenu  PersonaPicker  CreatorCredit
│       ├── studio/     StudioShell (tabs + PublishBar)  IdentityPanel  VoicePanel  ShowcaseEditor (split textarea/preview)
│       │               AestheticPanel  StatePanel  BindingsPanel  ExamplesPanel  AvatarCropper  GalleryManager  LivePreview
│       ├── persona/    PersonaCard  PersonaEditor  BubblePreview
│       ├── discovery/  SearchBar  TagFilter  SortSelect  CompanionGrid  CompanionCard  EmptyState
│       └── chat/       LoreDrawer (About / Voice / You / State tabs)
frontend/unit/
├── styleAllowlist.test.ts  showcase.test.ts  catalog.test.ts  studio.test.ts  tags.test.ts (shared re-export)  boundaries.test.ts (amended)
```

### 7.1 Route loads
- `/character/[id]/+page.ts`: parallel `GET /characters/:id`, `GET /chats?characterId=&limit=10`, `GET /personas`. 404 → `error(404)` rendered with a "Back to Foyer" slate.
- `/character/[id]/edit/+page.ts`: `GET /characters/:id` only; `updatedAt` captured for P9.
- `/character/new`: no load; `CharacterDraft` seeded from `DEFAULT_CHARACTER_THEME` + empty fields; `ownerId = 'draft-<ulid>'` for pre‑save uploads (§9.2).

### 7.2 `CharacterDraft` contract (`studio/draft.svelte.ts`)
```ts
export class CharacterDraft {
  card = $state<CharacterCreate>(…);            // deep $state is fine here: one object, edited field by field
  readonly issues = $derived(validate(CharacterCardSchema, this.withProvisionalId()).issues);   // P5 — same validator
  readonly issuesByPath = $derived(groupBy(this.issues, i => i.path));
  readonly dirty = $derived(this.snapshot !== JSON.stringify(this.card));
  readonly previewState = $state<StateVector>({});                              // for BindingsPanel "simulate" toggle
  readonly previewTheme = $derived(resolveTheme({ character: this.card.style, bindings: this.card.stateBindings,
                                                  state: this.previewState, a11y: prefs.a11y }));   // U1: same cascade, no ad‑hoc merge
  save(): Promise<'saved' | 'stale' | 'invalid'>;   // POST or PATCH(+expectedUpdatedAt); on 'stale' opens ReloadDialog with server copy
  autosave(): void;                                  // localStorage `ft.draft.<routeKey>` every 2s while dirty; restored with a banner
  discard(): void;
}
```
The **LivePreview** pane is a theme root rendering three `SpeechBubble`s (character, NPC, persona) + one `NarratorBlock` from the parsed `firstMessage` (`greetingPreview.ts`), driven by `draft.previewTheme`. The BindingsPanel's "simulate" toggles set `previewState` so an author can *see* `mood: furious` turn the accent red before saving.

---

## 8. Feature specifications

### 8.1 Showcase (`/character/[id]`)
- **Hero** per §2.3. Tags link to `/?tags=<tag>`. Creator credit is plain text.
- **Body**: `ShowcaseBody` renders `showcase` when present; otherwise a **generated profile** from the prompt fields (`description` as "About", `scenario` as "The Scene", greeting excerpt as a callout) so imported/seeded cards never look empty. A small "Author fields" disclosure shows `personality` and `exampleDialogue` verbatim (monospace, chrome) — useful, never styled.
- **Action Hub**:
  - *Start New Story* → `PersonaPicker` popover (default preselected; last‑used per character remembered in `localStorage`) → `POST /chats { characterId, personaId }` → navigate to `/chat/[id]`.
  - *Resume* → `ResumeMenu` listing chats: title, `turnCount`, relative time, persona avatar, "writing…" dot when `activeGenerationMessageId` set. Delete via `⋯` with confirm.
  - *Edit* → `/character/[id]/edit`. `⋯` → Duplicate, Delete (preflight `GET /usage` → confirm copy "and its 4 stories" → `DELETE ?cascade=chats` → navigate `/`).
- Keyboard: `E` edit, `N` new story, `Esc` closes popovers (not in text fields).

### 8.2 Personas (`/personas`)
- Grid of `PersonaCard` (avatar, name, bio excerpt, `BubblePreview`, "Default" badge, story count). Card `⋯`: Edit, Make default, Delete.
- `PersonaEditor`: Name, `AvatarCropper`, Bio (plain textarea; hint: "This is sent to the model as your character description"), **Bubble style** — `userBubbleBg`, `userBubbleText`, `userBubbleBorder` (color inputs emitting `#rrggbb` or `rgba()` via an alpha slider; each validated by `CssToken`), `bubble.radius` (slider 0–2 rem), `userTail` (right/none); reset link. Live `BubblePreview`.
- Delete flow: `409 persona_in_use` → dialog "Used by 3 stories — reassign them to: [select]" → `DELETE ?reassignTo=`. Default persona: "Make another persona default first."
- Quick access: the Foyer top bar gets a persona avatar button linking to `/personas`; `PersonaPicker` includes "Manage personas…".

### 8.3 Companion Studio (`/character/new`, `/character/[id]/edit`)
Tabs (desktop: left rail + content + right LivePreview; mobile: accordion, preview behind a toggle):
1. **Identity** — Name (slug preview shown once, read‑only after create), Tagline, Creator, Tags (chip input with `SUGGESTED_TAGS` datalist; `normalizeTag` applied on entry; 12 max), `AvatarCropper`.
2. **Voice** — Description, Personality, Scenario, First Message (envelope‑aware preview), Example Dialogue. Each textarea shows a `gpt-tokenizer` estimate (reuse the Phase 2 counter via a tiny `POST /api/prompt/estimate`? **No** — keep it client‑side with `gpt-tokenizer`'s browser build, lazy‑loaded on this tab only, ≤ 220 KB budget preserved for the chat route by code‑splitting).
3. **Showcase** — split editor: Markdown textarea ↔ live `ShowcaseBody` preview (debounced 150 ms); toolbar inserts `## Section`, `> Callout`, `<p style="text-align:center">`, `<span style="color:…">`, image from `GalleryManager`; size meter against 64 KiB.
4. **Aesthetic** — font family (datalist of the four bundled + free text), size multiplier, line height; colors (char/user bubble bg/text/border, accent, quote, action, narrator); bubble radius/padding/tails; background (pick from `/assets/backgrounds`, upload, blur 0–12 px, overlay color+alpha). Every field writes a `CssToken`‑validated value; invalid ⇒ inline issue, save disabled.
5. **State** — `StatePanel`: rows of `{ key, type: enum|int|string, … }` with per‑type editors (enum values + aliases, int min/max/default, string default) and `initialState`. `BindingsPanel`: rows of `when` (built from schema keys → value pickers) and `set` (path select from `THEME_PATHS` → token input), reorder handles (order matters — U1), "simulate" toggle.
6. **Publish bar** — issue count (click → jumps to field), *Save*, *Save & open showcase*, *Discard*. `beforeunload` guard while dirty.

### 8.4 Foyer v2 (`/`)
- `SearchBar` (debounced 200 ms, `/` focuses it, `Esc` clears), `TagFilter` (chips from `GET /tags`, multi‑select AND, counts), `SortSelect` (Recent · A–Z · Most stories). State mirrors to the URL (`?q=&tags=&sort=`) with `replaceState`, so back/forward and sharing work.
- `CompanionGrid`: 24 per page, "Load more" (keyset cursor), skeleton cards with identical geometry, `EmptyState` with "Create a companion" CTA when zero results.
- `CompanionCard`: avatar/initials, name, tagline, up to 3 tag chips (+n), swatch (Phase 4), story count; click → showcase; hover reveals *New story* (direct with default persona) and *Edit*.
- Recent Stories section unchanged, now filtered by the same query when `q` is set.

### 8.5 In‑chat Lore Drawer (`Alt+L` / TopBar book icon)
Native `<dialog>` slide‑over (right on desktop, bottom sheet on coarse pointer), width `min(28rem, 100vw)`, **rendered on the chat's theme root** so it reads as part of the world.
- **About** — `ShowcaseBody` (or generated profile). Data comes from the card already loaded by the chat route; no extra request.
- **Voice** — collapsed by default: Description / Personality / Scenario / Example dialogue (monospace).
- **You** — current persona (avatar, name, bio), *Switch persona* select → `PATCH /chats/:id { activePersonaId }`; disabled with tooltip while `busy` (P7); success toast "You are now Detective — future replies address you as Detective; earlier turns are unchanged."
- **State** — the `stateSchema` as a reference table (key, type, range/values, current value) with a link that opens the `StateOverridePopover`.
Opening the drawer does not affect scroll ownership; closing returns focus to the composer.

---

## 9. Tricky traps & failure modes

### 9.1 Rich text & CSS

| Trap | Symptom | Guard |
|---|---|---|
| Passing `style` through DOMPurify's default (it allows `style` when listed) | `position:fixed; inset:0` overlays the composer; clickjacking of "Delete" | Rebuild from `STYLE_ALLOWLIST` (P2) **and** container `!important` pins for position/transform/filter/pointer-events |
| `background:url(…)` / `list-style-image` / `cursor:url()` | Remote fetch = IP/timing leak, or `javascript:` in old engines | `url(` is a forbidden substring for the whole attribute; `background` shorthand not on the list |
| `font-size: 900px` / `letter-spacing: 40em` | Page becomes unusable; hides content | Grammar‑bounded values (0.5–2.5 em/rem; `px` never accepted for font‑size) |
| `color: var(--theme-accent)` | Author styles entangle with the cascade; theme switch drags author colors | `var(` forbidden — author colors are literals or nothing |
| `<img src="https://tracker/px.gif">` | Remote beacon on every showcase view | `src` must be same‑origin `/assets/` or the **element** is removed (P3); `referrerpolicy=no-referrer` as belt‑and‑braces |
| `id="settings"` / `name="submit"` in author HTML | DOM clobbering of `document.settings`, form gadgets | `id`, `name` in `FORBID_ATTR`; marked heading ids disabled |
| Mutation XSS via nested `<math>`/`<svg>`/`<noscript>` | Sanitizer bypass classes | All three forbidden; DOMPurify pinned and updated; 20‑vector corpus in tests |
| `<a href="https://…" target="_blank">` without `rel` | Reverse tabnabbing | `rel="noopener noreferrer"` forced in post‑hook |
| RLO/bidi characters in text | `‮txt.exe` style visual spoofing of names/links | Strip `U+202A–E`, `U+2066–9` from text nodes |
| Author sets text color ≈ background | Invisible text; a11y complaint | Accepted and documented: author intent; `disableCharacterThemes` still renders author inline colors (they're content) — but the **Studio preview shows an A11Y‑theme toggle** so authors can check |
| Tables wider than viewport | Horizontal page scroll on mobile | Post‑hook wraps tables in `.table-scroll` |
| `<details open>` with huge content | Layout jump when toggled | Fine — user‑initiated; not a CLS violation |
| Author markdown `#` headings in chat greeting | Nothing — chat profile still renders `#` literally | P1 golden test proves chat profile unchanged |
| Two DOMPurify configs on one instance | Config bleed between profiles | Separate instances: `DOMPurify(window)` for showcase, existing one for chat |

### 9.2 Assets

| Trap | Symptom | Guard |
|---|---|---|
| Trusting `file.type` / extension | `evil.png` that is HTML/SVG → stored XSS when served | Magic‑byte sniff decides the extension; SVG never accepted; served with `nosniff` |
| PNG/HTML polyglot ("GIFAR") | Served as image but parsed as HTML in a frame | `nosniff` + `Content-Disposition: inline` + correct `Content-Type` from minted extension; no frames of asset URLs exist |
| Decompression bomb (1×1 KB → 20k×20k) | Client tab OOM on showcase | Header dimension check ≤ 4096 px (`asset_dimensions`); we never decode server‑side |
| Uploading for an unsaved character | No `ownerId` yet; orphan files if the draft is abandoned | Draft scope `characters/draft-<ulid>`; on first successful `POST /characters` the server **renames** `draft-<ulid>` → `<slug>` and rewrites `/assets/characters/draft-…/` references in `avatar`, `showcase`, `style.background.image`; `bun run assets:gc` deletes `draft-*` older than 24 h |
| Avatar replaced at the same path | Browser cache shows the old avatar | Filenames are fresh ULIDs per upload; old file deleted after the PATCH commits |
| Deleting a character before its assets | Orphaned directory | `removeOwner` runs **after** the DB transaction commits; failures logged, retried by `assets:gc` |
| Path traversal in `ownerId`/`file` | Escape from `ASSETS_DIR` | `Id`/filename patterns at the boundary **and** `resolve()` containment check in the store |
| Disk fill | Home server out of space | 8 MiB per file, 64 MiB per owner; quota bar in GalleryManager |
| Multipart body parsed in memory | 8 MiB × concurrent uploads | Acceptable single‑user; `t.File({ maxSize })` rejects before read |
| Canvas WebP export unsupported | Empty blob on old Safari | Feature‑detect `canvas.toBlob('image/webp')`; fall back to PNG |
| EXIF orientation on originals | Sideways gallery image | `img { image-orientation: from-image }` (default in modern browsers); avatars are re‑encoded upright by the cropper |

### 9.3 Search & SQLite

| Trap | Symptom | Guard |
|---|---|---|
| Raw user input in `MATCH` | `fts5: syntax error` on `"`, `-`, `NEAR(` | Tokenize on whitespace, wrap each term in double quotes (escaping `"` → `""`), append `*` for prefix on terms ≥ 2 chars; join with implicit AND |
| Single‑letter prefix queries | `a*` matches everything, slow | Require `q.length ≥ 2`; below that, list without `MATCH` |
| FTS5 missing in a custom Bun | Migration fails | Feature‑detect; `LIKE … ESCAPE '\'` fallback with `%`/`_` escaped; `db:check` prints backend |
| Triggers maintaining FTS | Second write path; drift after manual SQL | Repository‑maintained in the same transaction (P6); `db:reindex` + parity audit |
| `characters` rowid instability (TEXT PK) with external‑content FTS | Silent index corruption after `VACUUM` | Standalone FTS table keyed by `id UNINDEXED` — no rowid coupling |
| Sort by `stories` with offset pagination | Skips/duplicates as counts change | Keyset cursors: `recent → (updated_at, id)`, `name → (name COLLATE NOCASE, id)`, `stories → (story_count, id)` computed in a CTE; cursor is base64url of the tuple |
| Search results + sort by name with diacritics | "Élodie" sorts after "Zed" | `COLLATE NOCASE` is ASCII‑only; acceptable for v1, documented; FTS matching itself is diacritic‑insensitive (`remove_diacritics 2`) |
| Tag filter semantics ambiguous | User expects OR, gets AND | AND, stated in the UI ("matching all of:"); implemented as `GROUP BY character_id HAVING COUNT(DISTINCT tag) = ?` |
| Race between typed queries | Older response overwrites newer | `catalog.svelte.ts` keeps a `seq`; responses with `seq < latest` are dropped; in‑flight `AbortController` aborted on new input |
| Story count subquery on every list | Slow with thousands of chats | `LEFT JOIN (SELECT primary_character_id, COUNT(*) c, MAX(updated_at) m FROM chats GROUP BY 1)` — indexed by existing FK; ≤ 1,000 characters is the declared scale |
| Writing FTS on the single‑writer thread during a stream | Stall | Character writes are rare, small, and transactional (< 5 ms); uploads hit the filesystem, not SQLite |

### 9.4 Personas & chats

| Trap | Symptom | Guard |
|---|---|---|
| Switching persona mid‑generation | Prompt built with A, reply addressed to B; theme flips mid‑stream | `409 generation_in_progress` (P7); UI disables the control while `busy` |
| Expecting history to change | "Why does Eldrin still call me Traveler?" | History is immutable (P7); toast copy says so; the greeting root keeps the name it was rendered with (offer *Regenerate greeting* later — deferred) |
| Deleting the default persona | New chats have no persona | `409 persona_is_default`; `setDefault` is an atomic clear+set under the partial unique index |
| Deleting a persona used by chats | FK RESTRICT error surfaced raw | Preflight count → reassign dialog → transactional `UPDATE chats … ; DELETE persona` |
| `sender_id` pointing at a deleted persona | Broken join | `reassignTo` also updates `messages.sender_id` for `narrative_role='persona'` rows in the same transaction |
| Persona `styleOverrides` with any theme path | Persona overrides character *bubble* colors globally | Cascade allows it (Phase 4 §4.1) but the editor exposes only user‑bubble keys; if a persona JSON arrives with other keys (future import), they still apply — documented |
| Persona change in a second tab | Stale `persona` in an open chat | Out of scope for live sync (ADR‑003); the chat refetches `chat` + `persona` on every terminal event and on `visibilitychange`, so it converges within one turn |

### 9.5 Studio & editing

| Trap | Symptom | Guard |
|---|---|---|
| Losing 40 minutes of showcase writing on a mis‑click | Rage | `beforeunload` guard + localStorage autosave every 2 s + restore banner |
| Two tabs editing the same card | Last write silently wins | `expectedUpdatedAt` → `409 stale_write { current }` → Reload/Overwrite dialog (P9) |
| Renaming a character | Old segments' `name` ≠ new `primaryName` → speaker label appears on historical bubbles | Accepted; label shows the historical name (it *is* what was said); slug is immutable so links survive |
| Editing `stateSchema` under existing chats | Existing `currentState` has keys/values the new schema rejects | `resolveState` already drops/clamps with warnings at the next turn; the Studio shows a note when editing a character with `storyCount > 0` |
| Ad‑hoc theme merge in preview | Preview ≠ chat (U1 violation) | `draft.previewTheme` calls `resolveTheme` — the only combinator |
| Binding `set` with a free‑text path | Warnings at runtime, silent no‑op | Path is a `<select>` over `THEME_PATHS`; value validated by `CssToken`; the panel surfaces `resolveTheme(...).warnings` live |
| `firstMessage` with `:::persona` block | Player‑agency violation baked into the greeting | Greeting preview shows the parser's `truncatedAt` warning; save is allowed (author's call) but the field is flagged |
| Studio pulls `gpt-tokenizer` into the chat bundle | Route JS over 220 KB | Dynamic `import()` inside the Voice tab only; `build` size test asserts the chat entry chunk is unchanged |
| Slug collisions / non‑Latin names | Empty slug for "エルドリン" | `slugify` returns `''` → server falls back to `c-<ulid>`; collisions get `-2`, `-3` |
| Avatar cropper on a 12 MP phone photo | Main‑thread jank | Downscale via `createImageBitmap(file, { resizeWidth: 1024 })` before drawing; export 512² |

### 9.6 Foyer & navigation

| Trap | Symptom | Guard |
|---|---|---|
| Query state only in memory | Back button loses filters | URL is the source of truth; `catalog` hydrates from `page.url` |
| 200 swatch theme roots | Style recalc storm on filter change | Cards are keyed by `id`; swatches have `data-transitions="off"`; `content-visibility: auto` on cards below the fold |
| Empty catalog on first run | Blank Foyer | Seeds remain; `EmptyState` only when a filter yields zero |
| Card click vs. hover actions | Accidental "New story" | Hover actions are separate buttons with `stopPropagation`; card itself is an `<a>` to the showcase |

---

## 10. Definition of Done & verification

### 10.1 Acceptance criteria
1. `bun run typecheck` 3/3 clean (`svelte-check` 0 errors / 0 warnings, all new `a11y-*` resolved); `bun run test` green with the new suites; `bun run build` succeeds and the **chat route entry chunk size is unchanged ± 2 KB** (Studio code split).
2. `bun run db:migrate` upgrades a v3 database to v4 in one transaction; `db:check` reports `user_version=4`, `search_backend=fts5|like`, `fts_parity=ok`, `tags_orphans=0`, `assets_orphans=0`; `db:reindex` restores parity after a deliberate `DELETE FROM characters_fts`.
3. **Rich text proof:** paste the Janitor‑style sample (section banners, centered paragraphs, colored spans, callouts, two gallery images) into the Showcase editor → renders as designed on the showcase page under Eldrin's theme; paste the 20‑vector XSS corpus → zero scripts, zero remote requests (Network panel filtered to non‑`127.0.0.1` shows nothing), no element escapes the `.showcase-body` box (`position:fixed` sample stays inline).
4. **Prompt isolation proof (P4):** put `SENTINEL-7731` in a showcase, send a message in a chat with that character, `?dev=1` prompt inspector shows no sentinel; `builder.test.ts` case passes.
5. **Persona proof:** create "Detective" with a red user bubble; start a story from Eldrin's showcase choosing Detective → user bubbles are red, `{{user}}` resolves to Detective in the compiled prompt; in an existing Traveler chat open the Lore Drawer → You → switch to Detective → next reply addresses Detective, earlier turns unchanged, bubbles restyle over 600 ms; attempt the switch mid‑stream → 409 toast.
6. **Studio proof:** create a new companion end‑to‑end (avatar crop, tags, voice, showcase with an uploaded image, custom tokens, one enum state field, one binding `mood: furious → colors.accent #dc2626`); LivePreview reflects each edit; "simulate furious" turns the preview accent red; save → showcase page matches preview; open a chat → theme matches; edit in a second tab, save in the first → second tab gets the stale‑write dialog.
7. **Search proof:** `GET /api/characters?q=obs` finds Eldrin (prefix on "observatory" in description); `?tags=steampunk` finds Alice only; `?tags=fantasy,steampunk` finds none (AND); `?q="` and `?q=NEAR(` return 200 with sane results (no 500); sort by `stories` orders by count; "Load more" yields no duplicates across pages while a new chat is created between pages.
8. **Deletion proof:** deleting Eldrin with 7 stories → confirm dialog states "7 stories" → cascade removes chats, messages, tags, FTS row, and `data/assets/characters/eldrin-the-mage/`; deleting a persona in use offers reassignment and updates both `chats.active_persona_id` and `messages.sender_id`.
9. **Layout & a11y:** Lighthouse on a showcase with 6 images: CLS ≤ 0.05, Accessibility ≥ 95; axe 0 critical/serious on `/`, `/character/[id]`, `/personas`, `/character/new`; keyboard‑only pass of create → showcase → start story → lore drawer → switch persona; drawers present as bottom sheets at 390 px; Studio usable at 390 px (accordion + preview toggle).
10. **Production:** `bun run start` serves `/character/x`, `/personas`, `/character/new` (SPA fallback), `/assets/characters/<id>/<ulid>.webp` with `nosniff`, and returns JSON 404 for `/assets/characters/../../formatavern.db`.

### 10.2 Required tests (normative)

**`packages/shared/test/`** — `tags.test.ts` (normalization table incl. NFKC, spaces, unicode, length, empty); `slug.test.ts`; `schemas.test.ts` additions (`tags` max/unique/pattern, `showcase` max length, `CharacterSummary`, `CharacterPatch` requires `expectedUpdatedAt`).

**`backend/test/`** —
- `migrations.test.ts`: v3→v4 on a seeded DB; FTS backfill row count; feature‑detect branch (simulate missing FTS5 via injected `compileOptions`).
- `repositories/characters.test.ts`: create mints slug + collision suffix; patch stale → `'stale'`; tags written to join table and FTS in one transaction (inject a failing FTS write → nothing persists); `list` for each sort with keyset cursors (no dup/skip under concurrent insert); FTS query escaping corpus (`"`, `-x`, `NEAR(`, `a*b`, emoji); tag AND semantics; LIKE fallback parity on a 20‑row fixture.
- `repositories/personas.test.ts`: setDefault atomicity; remove with reassign updates chats + `messages.sender_id`; default guard.
- `routes/characters.test.ts`, `routes/personas.test.ts`, `routes/chats.test.ts`: status codes for every error code above; `PATCH /chats/:id { activePersonaId }` → 409 while hub active; `DELETE ?cascade` removes assets via a spy `AssetStore`.
- `assets/sniff.test.ts` + `assets/dimensions.test.ts`: fixtures for PNG/JPEG(SOF0/2, progressive)/WebP(VP8/VP8L/VP8X)/GIF; SVG/BMP/HTML‑with‑PNG‑extension rejected; oversized dimensions rejected; truncated headers rejected without throwing.
- `assets/store.test.ts` (tmp dir): traversal attempts rejected; tmp→rename atomicity; quota; `removeOwner`.
- `prompt/builder.test.ts`: **P4 sentinel case**.

**`frontend/unit/`** —
- `styleAllowlist.test.ts`: every allowed property × valid/invalid values; each forbidden substring nukes the attribute; 13th declaration dropped; 513‑char attribute dropped; order preserved; idempotent (`rebuild(rebuild(x)) === rebuild(x)`).
- `showcase.test.ts` (happy‑dom): section banners/centered/colored spans survive; **20 XSS vectors** (`<script>`, `<img onerror>`, `<svg onload>`, `<math><mi xlink:href>`, `javascript:`/`data:`/`vbscript:` hrefs, `<iframe>`, `<object>`, `<form>`, `<a target=_blank>` w/o rel, `style="position:fixed"`, `background:url()`, `expression()`, `-moz-binding`, `id="settings"`, `srcset`, `<noscript><img>`, mXSS `<p><math><mtext><table>`, remote `<img src="https://…">`, `<img src="/assets/../x">`) → none survive; remote img element removed entirely; class allow‑list; table wrapped; bidi chars stripped; determinism; 64 KiB in < 30 ms.
- `markdown.test.ts`: **golden corpus** for the chat profile, unchanged (P1).
- `catalog.test.ts`: URL ↔ state round trip; debounce; `seq` guard drops stale responses; abort on new input.
- `studio.test.ts`: schema‑key parity scan (every `CharacterCardSchema` key except `id/createdAt/updatedAt` has an editor binding); `issues` mapping; autosave/restore; stale‑write path; `previewTheme` equals `resolveTheme` output (no ad‑hoc merge); draft‑asset reference rewrite after create.
- `boundaries.test.ts` (amended): `parseEnvelope` importers ⊆ {`stream.svelte.ts`, `greetingPreview.ts`}; `{@html` ⊆ {`Markdown.svelte`, `ShowcaseBody.svelte`}; `renderShowcaseMarkdown` imported only by `ShowcaseBody.svelte` and `ShowcaseEditor.svelte`; still no `transition-all`, no runtime `<style>`.

### 10.3 Step‑by‑step verification
```bash
bun install && bun run typecheck && bun run test
bun run db:migrate && bun run db:check                      # user_version=4, fts_parity=ok, search_backend=fts5
bun run --cwd frontend build && gzip -c frontend/build/_app/immutable/entry/*.js | wc -c   # chat entry unchanged ±2 KB

bun run dev   # http://127.0.0.1:5173
#  1. Foyer: search "obs" → Eldrin; tag chip Steampunk → Alice; sort A–Z; back button restores filters.
#  2. Eldrin card → showcase: hero on Eldrin's theme (Cinzel), generated profile (no showcase yet), Resume lists 7-turn story.
#  3. Edit → Showcase tab: paste janitor-sample.md; upload 2 images via GalleryManager; preview; Save & open → matches.
#  4. Showcase tab: paste xss-corpus.md → save → open showcase with Network panel: no external requests; DevTools: no element outside .showcase-body.
#  5. /personas → New: "Detective", crop avatar, red bubble, radius 0.5rem → save → default toggle.
#  6. Eldrin showcase → Start New Story → pick Detective → chat: red user bubbles; ?dev=1 prompt inspector: "[User Persona: Detective]", no SENTINEL.
#  7. In a Traveler chat: Alt+L → You → switch to Detective while idle → OK; send → reply addresses Detective; try switching mid-stream → 409 toast.
#  8. /character/new: full create incl. state field + binding; simulate furious in preview; save; open chat; Alt+S override mood=furious → accent red.
#  9. Open the same character's edit page in two tabs; save in A; save in B → stale-write dialog; Reload → B shows A's changes.
# 10. Delete the new companion (with 1 story) → dialog counts "1 story" → cascade → assets dir gone → Foyer updated.
# 11. Delete Traveler persona (in use) → reassign to Detective → chats + sender_id updated; try deleting default → refused.
# 12. 390×844: Foyer, showcase, /personas, Studio accordion + preview toggle, Lore drawer as bottom sheet; keyboard-only pass; axe on 4 routes.

bun run build && bun run start
curl -si http://127.0.0.1:3000/character/eldrin-the-mage | head -1                   # 200 HTML
curl -si http://127.0.0.1:3000/assets/characters/eldrin-the-mage/<ulid>.webp | grep -i -E 'content-type|nosniff'
curl -si "http://127.0.0.1:3000/assets/characters/../../formatavern.db" | head -1     # 404 JSON
curl -s  "http://127.0.0.1:3000/api/characters?q=%22&sort=stories" | head -c 200      # 200, no 500
curl -si -X POST -F "file=@evil.svg" http://127.0.0.1:3000/api/assets/characters/eldrin-the-mage | head -1   # 415
# Lighthouse: /character/<id-with-6-images> → CLS ≤ 0.05, A11y ≥ 95 — attach report
```

Artifacts for the PR: XSS corpus run screenshot (Network + Elements), stale‑write dialog clip, persona switch before/after with prompt inspector, Lighthouse report, axe summaries (4 routes), `db:check` output pre/post migration, keyboard‑only pass notes.

---

## 11. Explicit scope boundaries — deferred

Not in Phase 5: PNG/JSON **import/export** (the Studio is the manual path; the importer is Phase 6 and will reuse `CharacterCreate` + the draft‑asset rewrite); lorebook/world‑info UI; community browsing or any network catalog; per‑character "hidden/unlisted" visibility; comments/ratings/favorites; character versioning/history; server‑side image re‑encoding or thumbnails (originals served; `content-visibility` and `loading=lazy` carry the cost); AVIF/HEIC; multiple avatars/expressions; persona‑specific first messages; auto‑generated chat titles; theme presets marketplace; a WYSIWYG showcase editor (Markdown + toolbar only); regenerate‑greeting after persona switch; full‑text search across **chat messages**.

What Phase 5 hands forward: a rich‑text profile the importer can populate verbatim, a `CharacterDraft` the importer can preview with, an `AssetStore` the PNG parser writes avatars through, a catalog query the lorebook and future community views can extend, and a persona system the split‑view grid can bind per pane.

---

## 12. Execution order

1. **shared**: `tags.ts`, `slug.ts`, schema extensions (`CharacterCard`, `CharacterSummary`, `Create/Patch` with `expectedUpdatedAt`), `SHARED_VERSION` bump, tests.
2. **backend storage**: migration v4 with FTS feature‑detect; repository `list/create/patch/remove/duplicate/tags`, FTS maintenance in‑transaction; persona `setDefault/remove(reassign)`; `scripts/reindex.ts`; `db:check` audits (`fts_parity`, `tags_orphans`); tests.
3. **backend assets**: `sniff.ts`, `dimensions.ts` (pure, tested first), `AssetStore` contract + `FsAssetStore`, routes, `nosniff` on static; draft‑owner rename on character create; `scripts/assets-gc.ts`.
4. **backend routes**: characters/personas/chats extensions, error codes, `PATCH chats activePersonaId` with hub guard; P4 builder test.
5. **frontend render**: `styleAllowlist.ts` (+ tests, no DOM), `showcase.ts` (+ XSS corpus), `ShowcaseBody.svelte`, `app.css` showcase rules & author classes, chat‑profile golden test; amend `boundaries.test.ts` **before** any other UI (it polices the rest).
6. **frontend showcase route**: load, Hero, Body, ActionHub, PersonaPicker, ResumeMenu, delete flow.
7. **frontend personas**: `personas.svelte.ts`, `/personas`, `PersonaEditor`, `AvatarCropper`, `BubblePreview`, reassign dialog.
8. **frontend studio**: `CharacterDraft`, StudioShell + panels bottom‑up (Identity → Voice → Showcase → Aesthetic → State/Bindings), `LivePreview` via `resolveTheme`, `GalleryManager`, autosave, stale‑write dialog, code‑split `gpt-tokenizer`.
9. **frontend foyer v2 + lore drawer**: `catalog.svelte.ts`, SearchBar/TagFilter/SortSelect/CompanionGrid, URL sync; `LoreDrawer` with persona switch; `Alt+L` shortcut + cheat‑sheet entry.
10. **polish & §10.3**: mobile sheets/accordion, CLS pass on image‑heavy showcase, a11y sweep, artifacts; update `docs/schema.md` (v4), `docs/architecture.md` (render profiles, asset pipeline), `docs/development.md §6.3` (P1–P11 mapping) and `.agents/AGENTS.md` (amendments A‑U2/A‑U3/A‑S8, new invariants).