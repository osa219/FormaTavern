# Chat Layout Neutrality — Living Walkthrough

This living document tracks the progressive implementation and verification of the **FormaTavern Chat Layout Neutrality Blueprint** ([`docs/history/blueprints/chat-layout-neutrality-blueprint.md`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/docs/history/blueprints/chat-layout-neutrality-blueprint.md)). It is updated as each slice is completed.

---

## Overview of Slices

| Slice | Title | Status | Primary Invariants |
|---|---|---|---|
| **Slice 1** | Shared domain foundations | **Complete** | L3 (pure resolve), L5 (preset layout-only), C1 (hooks manifest) |
| **Slice 2** | Backend storage & Migration v7 | **Complete** | L4 (NULL=neutral, backfill=classic), P9 (OCC) |
| **Slice 3** | Frontend layout contract & attributes | **Complete** | L1 (per-voice primitive), L2 (no role branches), L7 (one measure) |
| **Slice 4** | Chat log & component neutrality | **Complete** | L1, L2, L8 (non-owner inline voice tags in `single`), U4 |
| **Slice 5** | Studio layout panel & LivePreview | **Complete** | L5, L6 (single owner), mode matrix parity |
| **Slice 6** | Verification, documentation & polish | **Complete** | Definition of Done, bundle size, a11y |

---

## Slice 1: Shared Domain Foundations

### Objective
Establish schemas, pure deterministic layout resolution, classic preset definitions, and append-only hook extensions in `@formatavern/shared`.

### Changes Made
- **Schemas** ([`packages/shared/src/schemas/layout.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/schemas/layout.ts)):
  - Defined `LayoutAlignSchema`, `LayoutContainerSchema`, `LayoutHeadersSchema`, `LayoutNarratorSchema`, `LayoutNameFormatSchema`.
  - Defined `CharacterAvatarsSchema` (booleans for character/persona/npc, shape, optional CssToken size).
  - Defined `CharacterNamesSchema` (show booleans and format).
  - Defined `CharacterLayoutSchema`.
- **Card Schema Integration** ([`packages/shared/src/schemas/character.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/schemas/character.ts)):
  - Added optional `layout` to `CharacterCardSchema`.
  - Added `layout: Type.Optional(Type.Union([CharacterLayoutSchema, Type.Null()]))` to `CharacterPatchSchema` for neutral clear semantics.
  - Preserved `CharacterSummarySchema` without layout (Invariant L0).
- **Pure Resolver & Presets** ([`packages/shared/src/layout/resolve.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/layout/resolve.ts), [`presets.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/layout/presets.ts)):
  - Implemented `resolveLayout(layout, narrativeMode)` (Invariant L3).
  - Defined `NEUTRAL_LAYOUT_DOC` as normative baseline (uniform-left, row, voices in narrative, dim-only narrator, plain names, 0 avatars, no tails).
  - Defined `CLASSIC_LAYOUT` preset document, asserting 0 style keys (Invariant L5).
  - Enforced mode matrix (§2.3): classic mode forces headers to `single` and marks narrator/npc as inert.
  - Enforced tail containment: tails are forced `false` outside `container === 'bubble'`.
- **Hook Manifest** ([`packages/shared/src/hooks/manifest.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/hooks/manifest.ts)):
  - Appended 5 new chat hooks per Invariant C1: `row`, `rowHeader`, `avatar`, `turnName`, `turnBody`.
- **Version Bump** ([`packages/shared/src/index.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/index.ts)):
  - Bumped `SHARED_VERSION` to `'0.7.0-chat-layout'`.

### Verification
- `packages/shared/test/layout/resolve.test.ts`: verified defaults, mode matrix, overrides, tail containment, and determinism.
- `packages/shared/test/layout/presets.test.ts`: verified `CLASSIC_LAYOUT` matches schema and contains 0 style keys (Invariant L5).
- `packages/shared/test/schemas.test.ts`: verified optional layout, invalid enum rejection, CharacterSummary exclusion, L6 single-owner isolation (no layout keys in `ThemeOverridesSchema` or `THEME_PATHS`), and patch null-clearing.
- All 205 tests passing, `tsc` clean.

---

## Slice 2: Backend Storage & Migration v7 (`chat_layout_neutrality`)

### Objective
Implement the v7 database migration, stamping pre-existing characters with the classic layout document while honoring dead `charTail` intent, and wire `characters.layout` into `SqliteCharacterRepository` and `db:check`.

### Changes Made
- **Migration v7** ([`backend/src/db/migrate.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/db/migrate.ts)):
  - Added DDL: `ALTER TABLE characters ADD COLUMN layout TEXT;` (nullable JSON column; NULL = neutral default per Invariant L4).
  - Executed idempotent JS backfill loop: stamped all `layout IS NULL` rows with `CLASSIC_LAYOUT`, inspecting `style` to set `tails: false` if `json_extract(style, '$.bubble.charTail') === 'none'`, and defaulting to `tails: true` with a safe catch for unparseable JSON.
- **Repository Integration** ([`backend/src/db/repositories.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/db/repositories.ts)):
  - Extended `CharacterRow` with `layout: string | null`.
  - Updated `cardToRow` to serialize `card.layout`.
  - Updated `rowToCard` to parse `row.layout` when non-null (NULL leaves `layout` undefined, resolving to neutral).
  - Updated `create`, `upsert`, `insertIfAbsent`, and `patch` statements to include `layout`.
  - Implemented PATCH semantics: `undefined` retains current layout, `null` clears back to neutral (undefined on card), object performs whole-document replace under OCC (`expectedUpdatedAt`).
  - Preserved `layout` on `duplicate()`.
  - Ensured `list()` / `CharacterSummary` excludes `layout` (Invariant L0).
- **Integrity Audit** ([`backend/scripts/check.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/scripts/check.ts)):
  - Bumped expected `user_version` to 7.
  - Added column verification for `layout`.
  - Added `layout_valid` audit: parses every non-null `layout` and validates against `CharacterLayoutSchema`.

### Verification
- `backend/test/migrations.test.ts`: verified v0→v7 execution, idempotent re-run, v2→v7 and v6→v7 upgrades with backfill, tail intent extraction, unparseable fallback, and v8 rollback simulation.
- `backend/test/repositories/characters.test.ts`: verified creation with layout, retrieval round-trip, duplication persistence, summary exclusion, patch update, and patch null-clearing.
- `backend/test/routes/characters-personas.test.ts`: verified all route operations with new schema.
- `bun run db:migrate && bun run db:check`: executed successfully on dev database (`user_version=7`, `layout_valid=ok (3 checked)`).
- All 273 backend tests passing.

---

## Slice 3: Frontend Layout Contract & Attributes

### Objective
Expose the resolved layout to CSS through data attributes, establish layout CSS primitives in `app.css`, enforce measure stability (`--msg-measure: 72ch`), and test the contract.

### Changes Made
- **Layout Attributes Helper** ([`frontend/src/lib/chat/layoutAttrs.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/chat/layoutAttrs.ts)):
  - Pure converter from `ResolvedLayout` to DOM data attributes (`data-align`, `data-container`, `data-headers`, `data-narrator`, `data-tails`).
  - Added avatar size custom property generator (`styleString` with `--msg-avatar-size`).
- **Styles & Layout Rules** ([`frontend/src/app.css`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/app.css)):
  - Added `--msg-measure: 72ch` stylesheet constant (Invariant L7).
  - Defined container modes for `.ft-turn-body`:
    - `[data-container="row"]`: zero background, zero border, zero shadow, padding 0.
    - `[data-container="bubble"]`: background surface, border, radius, padding.
    - `[data-container="minimal"]`: subtle left border highlight.
  - Defined alignment rules:
    - `[data-align="left"]`: all turns and rows align left.
    - `[data-align="split"]`: persona turns align right (`justify-end`, `items-end`, text left-aligned within body); character and system turns align left.
    - `[data-align="center"]`: turns and rows centered (`justify-center`).
  - Defined speech tail rules (`[data-tails="true"][data-container="bubble"]`):
    - Classic directional tail pseudo-elements with strict mode containment (zero tails on raw rows or minimal mode).
  - Defined narrator block modes:
    - `[data-narrator="dim"]`: transparent background, italic typography, dimmed text.
    - `[data-narrator="box"]`: distinct subtle border and surface card styling.
    - `[data-narrator="full"]`: full-width section styling.
- **Contract Tests** ([`frontend/unit/layoutAttrs.test.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/unit/layoutAttrs.test.ts), [`frontend/unit/layoutContract.test.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/unit/layoutContract.test.ts)):
  - Tested pure attribute emission and style generation.
  - Validated selector presence and invariants in `app.css` (`--msg-measure: 72ch`, `[data-align]`, `[data-container]`, `[data-tails]`, `[data-narrator]`, zero tails when container is row).

### Verification
- `bun run --cwd frontend test unit/layoutAttrs.test.ts` passing.
- `bun run --cwd frontend test unit/layoutContract.test.ts` passing (all 6 tests).

---

## Slice 4: Chat Log & Component Neutrality

### Objective
Refactor chat components so that layout is entirely governed by CSS data attributes rather than role conditionals. Introduce the per-voice row primitive (`TurnRow.svelte`) and avatar component (`SegmentAvatar.svelte`).

### Changes Made
- **Segment Avatar** ([`frontend/src/lib/components/chat/SegmentAvatar.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/chat/SegmentAvatar.svelte)):
  - Renders image if available with fallback to 2-letter uppercase initials.
  - Configurable shape (`circle`, `rounded`, `square`) and size via `--msg-avatar-size`.
  - Colored hue ring for NPC voices (`kind === 'npc'`).
- **Turn Row Primitive** ([`frontend/src/lib/components/chat/TurnRow.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/chat/TurnRow.svelte)):
  - Per-voice row primitive (`article.ft-turn > div.ft-row[data-kind]`, Invariant L1).
  - Handles avatar placement, header/name formatting, and body slot.
  - Implements Invariant L8: In `single` header mode, non-owner segments (NPC or switched voice) keep inline voice tags (`span.ft-turn-name.inline`).
  - Placed message edit button on the body/action row instead of role-branched header.
- **Component Decoupling & Role Neutrality**:
  - [`SpeechBubble.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/chat/SpeechBubble.svelte): Stripped role-branched classes (`justify-end`, `border-accent/40`, hardcoded tails). Delegated structure to `ft-turn-body` and container data attributes (Invariant L2).
  - [`NarratorBlock.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/chat/NarratorBlock.svelte): Removed hardcoded box styling; delegated to `ft-turn-narrator` and `[data-narrator]`.
  - [`MessageTurn.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/chat/MessageTurn.svelte): Emits `article.ft-turn[data-role]` and renders each envelope segment through `TurnRow`.
  - [`MessageLog.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/chat/MessageLog.svelte): Calls `resolveLayout(card?.layout, narrativeMode)` and mounts `data-align`, `data-container`, `data-headers`, `data-narrator`, `data-tails`, and `--msg-avatar-size` on log root. Passes resolved layout and avatar URLs down.
- **Boundary & Manifest Tests**:
  - Updated [`frontend/unit/hooksManifest.test.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/unit/hooksManifest.test.ts) to verify 41 hooks.
  - Scoped Invariant L2 test in [`frontend/unit/boundaries.test.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/unit/boundaries.test.ts) to prohibit `justify-end` in turn rendering components and enforce per-voice row primitive (Invariant L1).

### Verification
- `boundaries.test.ts`: 10/10 tests passing (L1, L2, U2, U3, U6, C13, C14).
- `bun run --cwd frontend test`: all 223 tests passing across 32 files.
- `bun run typecheck`: clean (0 errors, 0 warnings across monorepo).

---

## Slice 5: Studio Layout Panel & LivePreview

### Objective
Provide creators with direct UI controls (Track 1) for all layout primitives, integrate live reactive simulation in `LivePreview` across Narrative and Classic modes using production `TurnRow`, and provide starter custom CSS layout sheets (Track 2).

### Changes Made
- **Studio Layout Panel** ([`frontend/src/lib/components/studio/LayoutPanel.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/studio/LayoutPanel.svelte)):
  - Built comprehensive editor panel for all `CharacterLayoutSchema` fields:
    - Alignment: Uniform Left vs Split.
    - Container: Row vs Bubble vs Flat.
    - Headers: Auto (follow mode) vs Per-Voice vs Single Turn.
    - Narrator: Dim-Only vs In-line vs Centered (with mode-inert explanations).
    - Tails: Enabled only in Bubble container mode; disabled with explanation otherwise.
    - Names: Plain vs Classic format; per-voice toggles (Companion, Persona, NPC).
    - Avatars: Per-voice toggles (Companion, Persona, NPC); shape (Circle, Rounded, Square); CSS token size input.
  - Added "Classic Preset" one-click button (writes `CLASSIC_LAYOUT`, Invariant L5: 0 style keys).
  - Added "Reset to Neutral" one-click button (clears `layout` to `undefined`, stamped back to NULL in DB).
  - Designed strictly with semantic chrome tokens and `accent-accent` checkboxes per Invariant C14.
- **Studio Shell Tab** ([`frontend/src/lib/components/studio/StudioShell.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/studio/StudioShell.svelte)):
  - Registered `layout` in `StudioTab` type and added tab button between `Aesthetic` and `Custom CSS`.
- **Character Draft Integration** ([`frontend/src/lib/studio/draft.svelte.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/studio/draft.svelte.ts)):
  - Initialized `layout: undefined` in `createEmptyCard()`.
  - Deserialized `layout` in draft constructor for existing characters.
  - Included `layout` in POST (for new cards) and PATCH (with `null` clearing when undefined per Invariant L4).
- **Studio LivePreview** ([`frontend/src/lib/components/studio/LivePreview.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/studio/LivePreview.svelte)):
  - Added Mode Toggle (`previewMode: 'narrative' | 'classic'`) in preview header.
  - Automatically switches to `samples` tab when `activeStudioTab === 'layout'`.
  - Renders all 4 voices (Narrator, Companion, User, NPC) using production `TurnRow` and resolves layout live via `resolveLayout(draft.card.layout, previewMode)`.
  - Attaches `layoutRootAttrs` and `layoutRootStyle` to preview container.
- **Custom CSS Layout Sheets** ([`frontend/src/lib/custom/presets.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/custom/presets.ts)):
  - Added 3 curated starter layout presets: `UNIFORM_ROWS_PRESET`, `SPLIT_BUBBLES_PRESET`, and `CENTERED_NARRATOR_PRESET`.
  - Added quick snippet buttons for `.ft-row`, `.ft-turn-body`, `.ft-avatar` in `CustomCssPanel.svelte`.

### Verification
- `frontend/unit/studio.test.ts`: verified draft initialization, mutation tracking, dirty detection, and PATCH payload (including `null` clearing).
- `frontend/unit/surfaces.test.ts`: verified 11/11 tests passing (surface completeness, semantic tokens, Invariant C14 compliance).
- `frontend/unit/presets.test.ts`: verified all 7 presets under 8 KB, 100% sanitizeCss-clean and lintSheet-clean.
- `frontend/unit/hooksManifest.test.ts`: verified 33/33 tests passing, zero hardcoded `ft-*` strings outside manifest (Invariant C1).
- `bun run --cwd frontend test`: all 224 tests passing across 32 files.
- `bun run typecheck`: clean across all packages.
- `bun run db:check`: clean schema and layout validity audit (`layout_valid=ok (3 checked)`).

---

## Slice 6: Verification, Documentation & Polish

### Objective
Complete end-to-end verification, audit production build and bundle sizes, enhance in-chat lore drawer with layout awareness (§8.4), and synchronize technical documentation.

### Changes Made
- **Lore Drawer Layout Awareness** ([`frontend/src/lib/components/chat/LoreDrawer.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/chat/LoreDrawer.svelte)):
  - Added reactive `layoutSummary` helper computing human-friendly summary line (e.g., `Uniform rows · voices · no avatars` or `Split · bubbles · avatars`).
  - Added quiet layout line in About tab with direct navigation link to Studio (`/studio/[companionId]`) per blueprint §8.4.
- **Documentation Synchronization**:
  - [`docs/schema.md`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/docs/schema.md): Documented `user_version = 7`, `characters.layout` nullable JSON column, backfill logic, Invariant L4, and `layout_valid` integrity audit contract.
  - [`docs/architecture.md`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/docs/architecture.md): Added Principle 7 (Neutral layout as data) and Section 11.5 documenting Invariants L1–L8, per-voice row primitive, mode matrix, and Track 1 / Track 2 interplay.
  - [`docs/development.md`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/docs/development.md): Appended Invariants L1–L8 to §6.3 Invariant & Test Index.

### Verification & Definition of Done
1. **Typecheck**: `bun run typecheck` passes with 0 errors and 0 warnings across all 3 packages (`packages/shared`, `backend`, `frontend`).
2. **Tests**: `bun run test` passes 100% across the monorepo:
   - `packages/shared`: 205 pass (schemas, pure resolve, presets, hooks, parser, state engine).
   - `backend`: 273 pass (migrations v0→v7, repositories, OCC, routes, prompt builder, providers, engine).
   - `frontend`: 224 pass across 32 files (boundaries L1/L2/U2/U3/U6/C13/C14, layout contract, studio, surfaces, presets, hooks manifest).
   - Total: 702 tests passing, 0 failing.
3. **Database Integrity**: `bun run db:check` passes with `user_version=7`, `layout_valid=ok (3 checked)`, clean WAL, clean FKs, and clean active leaf state.
4. **Production Build**: `bun run build` completes successfully in 7.4s with `@sveltejs/adapter-static` generating the production bundle.

---

## Section 7: Post-Blueprint Architectural Horizons: Surface-Scoped Customization & Immersive Studio Chat Frame

### Objective
Elevate the Custom CSS authoring experience in Character Studio by cleanly separating the two primary customization domains—**Companion Showcase** (`data-ft-surface="character"`) and **Chat Experience** (`data-ft-surface="chat"`). Provide non-conflicting partition storage within existing character cards without schema migrations, eliminate false-alarm cross-surface diagnostics, contextualize all studio authoring tooling (snippets, starter presets, linter, manifest hooks reference), and elevate the Studio Live Preview into an authentic, interactive miniature **Chat Viewport Frame**.

### Architectural Design & Invariants

1. **Deterministic Virtual Surface Partitioning (Invariant C15)**
   - Stored in a single `card.customCss` column via deterministic boundary delimiters:
     - `/* === @formatavern/surface: showcase === */`
     - `/* === @formatavern/surface: chat === */`
   - Pure parser and serializer implemented in `@formatavern/shared/customCss/partition.ts`:
     - `splitCustomCss(rawCss)` parses raw CSS into `{ showcase: string, chat: string }`.
     - Backward compatibility: Unsegmented legacy sheets are intelligently assigned to either showcase or chat based on surface selector heuristics (`.ft-message-log`, `.ft-viewport`, `.ft-composer`, `.ft-turn` allocate to chat; `.ft-hero`, `.ft-showcase-body`, `.ft-action-hub` allocate to showcase).
     - `joinCustomCss(partitions)` produces a clean, unified document with delimiters only when both surfaces have authored content, or clean single-block content when only one surface is active.
   - Zero database migration or schema modification required (`user_version = 7` maintained).

2. **Scoped Runtime Style Outlets**
   - **Showcase View** (`/character/[id]`): Injects only the `showcase` partition into `CustomStyleOutlet` scoped to `[data-ft-surface="character"]`.
   - **Chat View** (`ChatViewport.svelte`): Injects only the `chat` partition into `CustomStyleOutlet` scoped to `[data-ft-surface="chat"]`.
   - Ensures rules authored for one surface never leak into or conflict with the other surface at runtime.

3. **Contextual Studio Custom CSS Subtabs**
   - Implemented within `CustomCssPanel.svelte` as subtabs:
     - **Companion Showcase** (`targetScope = 'character'`)
     - **Chat Experience** (`targetScope = 'chat'`)
   - Switching subtabs completely transforms the panel context:
     - **Quick Snippet Buttons**: Showcase snippets (`.ft-hero`, `.ft-showcase-body`, `.ft-action-hub`, `--theme-accent`) vs. Chat snippets (`.ft-viewport`, `.ft-message-log`, `.ft-topbar`, `.ft-composer`, `.ft-row`, `.ft-turn-body`, `.ft-avatar`, `--theme-chat-bg`).
     - **Curated Starter Presets**: Showcase presets (`Terminal`, `Manuscript`, `Window`, `Night Market`) vs. Chat presets (`Illuminated Codex`, `Uniform Rows`, `Split Bubbles`, `Centered Narrator`).
     - **Target Scope & Diagnostics**: Sanitizer evaluates under the active surface scope. Chat rules targeting `[data-ft-surface="chat"]`, `.ft-viewport`, and `.ft-message-log` evaluate cleanly with 0 dropped rules, resolving the false-alarm cross-surface warning.
     - **Hooks Reference**: Filters the manifest hooks table to match the active surface.

4. **Immersive Studio Live Aesthetic Preview: Miniature Chat Viewport Frame**
   - When the author is in the **Chat Experience** CSS subtab (or viewing the Layout tab), the Live Aesthetic Preview transforms from the static Showcase card into a fully articulated miniature Chat Viewport Frame:
     - **Miniature TopBar** (`.ft-topbar`): Companion avatar, name, and back navigation indicator.
     - **Chat Canvas & MessageLog** (`[data-ft-surface="chat"] .ft-viewport .ft-message-log`): Production `TurnRow` rendering all 4 voices (Narrator, Companion, User, NPC) with live dynamic theme custom properties, decor layers, and active layout configuration.
     - **Miniature Composer** (`.ft-composer`): Input bar mockup with action buttons.
     - Provides instant, zero-latency visual feedback for chat styling and typography changes directly in the studio.

### Key Changes
- **Shared Domain** ([`packages/shared/src/customCss/partition.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/customCss/partition.ts)):
  - Implemented `splitCustomCss` and `joinCustomCss` with comprehensive edge case and heuristic fallback handling.
  - Exported through `packages/shared/src/customCss/index.ts` and root `packages/shared/src/index.ts`.
  - Added unit test suite [`packages/shared/test/customCss/partition.test.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/test/customCss/partition.test.ts) covering splitting, joining, roundtripping, and heuristic classification.
- **Curated Presets** ([`frontend/src/lib/custom/presets.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/custom/presets.ts)):
  - Added `surface` property (`'character' | 'chat'`) to all presets.
  - Added `ILLUMINATED_CODEX_PRESET` (gold illuminated border, parchment background, ornate typography, custom drop caps) for chat authoring.
  - Exported `SHOWCASE_PRESETS` and `CHAT_PRESETS`.
- **Custom CSS Panel** ([`frontend/src/lib/components/studio/CustomCssPanel.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/studio/CustomCssPanel.svelte)):
  - Added surface switcher subtabs with active tab styling and scope description.
  - Synchronized partition reading and writing into `draft.card.customCss` with roundtrip delimiter preservation.
  - Split snippet helpers, starter presets, and hooks reference tables by active surface.
- **Studio Shell Connection** ([`frontend/src/lib/components/studio/StudioShell.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/studio/StudioShell.svelte)):
  - Added `cssSubtab` state management and passed it to `CustomCssPanel` and `LivePreview`.
- **Live Preview** ([`frontend/src/lib/components/studio/LivePreview.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/studio/LivePreview.svelte)):
  - Renders miniature chat viewport frame with `.ft-topbar`, `.ft-viewport`, `.ft-message-log`, and `.ft-composer` when `activeStudioTab === 'css' && activeCssSubtab === 'chat'` or `activeStudioTab === 'layout'`.
- **Runtime Outlets**:
  - [`frontend/src/routes/character/[id]/+page.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/routes/character/[id]/+page.svelte): Passes `splitCustomCss(character.customCss).showcase` to `CustomStyleOutlet`.
  - [`frontend/src/lib/components/chat/ChatViewport.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/chat/ChatViewport.svelte): Passes `splitCustomCss(chat.character?.customCss).chat` to `CustomStyleOutlet`.

### Verification
- `bun run typecheck`: 0 errors, 0 warnings across all 3 packages (`packages/shared`, `backend`, `frontend`).
- `bun run test`: 710 passing tests across the monorepo:
  - `packages/shared`: 211 pass (including partition tests).
  - `backend`: 273 pass (all routes, repositories, engine).
  - `frontend`: 226 pass across 32 files (including custom CSS panel subtabs and chat viewport outlet tests).
- `bun run db:check`: 100% clean schema, foreign keys, and layout audits.




