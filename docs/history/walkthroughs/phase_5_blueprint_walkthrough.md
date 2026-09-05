# Phase 5: Companion Platform & Foyer v2 — Walkthrough

FormaTavern Phase 5 has been fully implemented, verified, and audited across all 9 architectural layers. The platform now features author showcases with chameleon theming, a tabbed companion studio with optimistic concurrency control, an atomic persona roster, a discovery catalog with FTS5 search, and a content-addressed local asset pipeline.

---

## 1. Accomplishments by Layer

### Layer 1: Isomorphic Domain (`@formatavern/shared`)
- **Tag Normalization & Formatting (`tags.ts`):** Canonical lowercase alphanumeric tags (`normalizeTag`), title-cased display strings (`displayTag`), and curated `SUGGESTED_TAGS`.
- **Slug Generation (`slug.ts`):** Deterministic ASCII slug generator (`slugify`) handling diacritics, unicode punctuation, and collisions.
- **TypeBox Schemas:** Added `CharacterCardSchema` (+`tagline`, `creator`, `showcase`), `CharacterSummarySchema`, `CharacterCreateSchema`, `CharacterPatchSchema` (with `expectedUpdatedAt`), `PersonaSchema` (+`avatar`), `PersonaCreateSchema`, `PersonaPatchSchema`, `ChatListItemSchema`, and `ChatPatchSchema`.
- **Purity:** Remained 100% isomorphic with zero platform runtime dependencies. 108/108 tests passing.

### Layer 2: Backend Persistence & SQLite Migration v4
- **Migration v4 (`companion_platform`):**
  - Expanded `characters` table with `tagline`, `creator`, `showcase`, and composite indexes `(updated_at DESC, id DESC)`, `(name ASC, id ASC)`.
  - Added `character_tags` junction table with cascade deletion and tag-lookup indexes.
  - Added `characters_fts` FTS5 virtual table with `unicode61` tokenizer. Automated probe feature-detection falls back gracefully to `LIKE` queries on SQLite builds lacking FTS5, tracking `search_backend` in `settings`.
  - Added `avatar` to `personas`.
- **Repositories:**
  - `SqliteCharacterRepository`: Keyset cursor pagination over `(sort_value, id)` with opaque base64 cursor (`recent`, `name`, `stories`), tag AND filter, OCC via `expectedUpdatedAt` (throws 409 `stale_write`), slug collision resolution `(copy)`, `(copy 2)`, cascade delete (`cascade: 'chats'`), and story usage counts.
  - `SqlitePersonaRepository`: Roster management, atomic default switching, and safe deletion with chat reassignment (`reassignTo`).
- **Audit & Reindex Scripts:** `backend/scripts/check.ts` checks FTS parity, orphaned tags, and index health. `backend/scripts/reindex.ts` rebuilds FTS5 from SQLite.

### Layer 3: Asset Storage Pipeline
- **`FsAssetStore` (`backend/src/assets/`):**
  - SHA-256 content-addressing `<hash>.<ext>`.
  - Magic byte header sniffing (`sniffImageMime`) permitting PNG, JPEG, WebP, GIF while strictly rejecting SVGs, HTML, and executables.
  - Image dimension parser enforcing bounds ($\le 4096 \times 4096$ px).
  - Size quota enforcement (10 MiB per file, 64 MiB total asset quota).
  - Atomic rename writes (`*.tmp` $\rightarrow$ final) and strict directory containment assertions against path traversal (`..`).
- **Garbage Collection (`assets-gc.ts`):** Reclaims unpromoted `draft-*` uploads older than 24 hours.

### Layer 4: Backend API & Routes
- **Routes Implemented:**
  - `GET /api/characters`: Keyset cursor pagination, FTS5 match / LIKE fallback, tag AND filtering.
  - `POST /api/characters`: Validated creation, promoting draft asset owners.
  - `GET /api/characters/:id`: Character details with avatar and theme.
  - `PATCH /api/characters/:id`: OCC patch with `expectedUpdatedAt` check.
  - `DELETE /api/characters/:id`: Deletion with optional `?cascade=chats`.
  - `POST /api/characters/:id/duplicate`: Duplicate companion with slug resolution.
  - `GET /api/characters/:id/usage`: Active chats count.
  - `GET /api/tags`: Aggregated tag frequency counts.
  - `GET /api/personas` & `POST /api/personas`: Persona roster & atomic default creation.
  - `PATCH /api/personas/:id` & `DELETE /api/personas/:id`: Persona edits & deletion with `?reassignTo=`.
  - `POST /api/assets/upload`: Multipart form-data image upload.
  - `GET /api/assets/:filename`: Static asset streaming with containment guard.
- **Purity Boundary Maintained:** `backend/src/app.ts` remains 100% Bun/SQLite-free. 154 backend tests passing.

### Layer 5: Frontend Render Pipeline & Security Boundaries
- **Showcase Markdown & Safe Inline Styles (Amendment A-U2):**
  - `rebuildStyle`: Whitelist parser allowing safe typography, colors, layout, and borders. Allows local `/assets/` and `data:image/` URLs while strictly rejecting remote `http(s)://` URLs (Invariant P3).
  - `renderShowcaseMarkdown`: `marked` parser configured with DOMPurify sanitization and `rebuildStyle` hook.
  - `ShowcaseBody.svelte`: Dedicated showcase renderer component.
  - Boundary guard in `boundaries.test.ts` asserts `{@html}` is used strictly in `Markdown.svelte` and `ShowcaseBody.svelte`.

### Layer 6: Frontend Showcase & Personas Surfaces
- **Author Showcase (`/character/:id`):**
  - `ShowcaseHero`: Avatar, creator attribution, tagline, tag chips.
  - `ActionHub`: Keyboard shortcuts `N` (Start New Story via `PersonaPicker`), `E` (Edit companion), duplicate, and cascade delete confirmation dialog.
  - `ResumeMenu`: Quick resumption of existing conversations with story counts and timestamps.
- **Personas System (`/personas`, `/personas/new`, `/personas/[id]/edit`):**
  - `crop.ts`: Canvas 1:1 square cropper generating WebP with PNG fallback.
  - `BubblePreview`: Live speech bubble preview reacting to font and color overrides.
  - `PersonaEditor`: Form validation, default toggle, and avatar upload.
  - `PersonasStore`: Reactive roster state and deletion modal with chat reassignment.

### Layer 7: Frontend Companion Studio
- **Companion Studio (`/character/new`, `/character/:id/edit`):**
  - `CharacterDraft` reactive class with TypeBox validation, reactive `previewTheme`, 2000 ms local autosave, and OCC saves (`expectedUpdatedAt`).
  - `StudioShell`: Navigation sidebar with live TypeBox validation issues and direct scroll-to-issue links.
  - `LivePreview`: Chameleon live preview using `parseGreeting` envelope parser (Amendment A-U3).
  - `VoicePanel`: Lazy code-split `gpt-tokenizer` for real-time prompt token budgeting.
  - `ShowcaseEditor`: Split-screen Markdown editor with snippet insertion toolbar and 64 KiB size meter.
  - `AestheticPanel`, `StatePanel`, `BindingsPanel`, `GalleryManager`.

### Layer 8: Foyer v2 & In-Chat Lore Drawer
- **Foyer v2 (`/`):**
  - `CatalogStore`: Sequence-guarded queries, 200 ms debounced search, tag AND filtering, sort select (`recent`, `name`, `stories`), keyset cursor pagination, and two-way URL search param synchronization.
  - `SearchBar`, `TagFilter`, `SortSelect`, `CompanionGrid`, `CompanionCard` with accent glow and quick-start actions.
- **In-Chat Lore Drawer (`Alt+L`):**
  - Native slide-over drawer mounted on the theme root in `ChatViewport.svelte`.
  - Four tabs: **About** (author showcase markdown), **Voice** (personality and scenario), **You** (persona switcher locked while generation is busy), and **State** (live state vector display and manual override trigger).
  - Shortcut `Alt+L` wired into global keyboard map (`shortcuts.ts`).

### Layer 9: Verification, Testing & Audits
- 13 frontend test suites in `frontend/unit/`:
  - `catalog.test.ts`: URL synchronization, debounced search, tag filtering, cursor pagination, and out-of-order sequence guards.
  - `studio.test.ts`: Validation issue tracking, dirty tracking, reactive theme resolution, autosave, and OCC conflict handling.
  - `greetingPreview.test.ts`: Plain-text and envelope-parsed greeting previews (Amendment A-U3).
  - `bindingsModel.test.ts`: Theme path categorization and validation.
  - `showcase.test.ts`: 20 OWASP XSS attack vectors and remote asset rejection.
  - `boundaries.test.ts`: Static AST assertions for zero runtime stylesheet injection (U2/A-U2), parseEnvelope isolation (U3/A-U3), and no `transition-all` (U6).

---

## 2. Verification Results

| Suite / Audit | Command | Result | Details |
|---|---|---|---|
| **Full Monorepo Typecheck** | `bun run typecheck` | **PASS (0 errors, 0 warnings)** | Clean across `packages/shared`, `backend` (`tsc`), and `frontend` (`svelte-check`). |
| **Monorepo Test Suites** | `bun run test` | **PASS (354/354 tests)** | 108 shared + 154 backend + 92 frontend tests passing (100% green). |
| **Database Integrity Audit** | `bun run db:check` | **PASS** | `user_version=4`, `journal_mode=wal`, `foreign_keys=1`, active leaf integrity ok, FTS parity ok (2/2), 0 orphaned tags. |
| **Search Index Rebuild** | `bun run db:reindex` | **PASS** | FTS5 index rebuilt successfully. |
| **Production Build** | `bun run build` | **PASS** | Vite + SvelteKit static adapter bundle generated cleanly in `frontend/build/`. |

---

## 3. Invariants & Architecture Preserved

- **I1–I6 (Foundation):** TypeBox at every boundary; SQLite repositories as sole write paths; `user_version=4` owned migrations; `foreign_keys=ON`; `packages/shared` isomorphic; `app.ts` Bun-free.
- **E1–E8 (Engine):** `parseEnvelope` purity; prompt building determinism; provider stream contracts intact; `gpt-tokenizer` backend-only with frontend lazy client-side token counting.
- **S1–S9 (State & API):** Disconnect immunity; generation concurrency lock; 500 ms trailing throttled writes; byte-exact SSE.
- **U1–U10 (UI):** Chameleon theme cascade order; zero runtime stylesheet injection; Invariant U6 layout stability (`transition-all` replaced with targeted transitions); route-scoped sessions.
- **Amendments A-U2 & A-U3:**
  - **A-U2:** Author showcase safe inline styles sanitized via `rebuildStyle` in `ShowcaseBody.svelte`.
  - **A-U3:** Pure `parseGreeting` envelope parser for studio live preview.
- **Phase 5 Invariants (P1–P7):** Keyset cursor pagination; optimistic concurrency control; zero remote asset fetches; author showcase sanitization; FTS5 feature detection with LIKE fallback; atomic persona default switching.
