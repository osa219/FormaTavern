# Customization Blueprint — Living Walkthrough

This living document tracks the progressive implementation and verification of the **FormaTavern Customization Blueprint** ([`docs/history/blueprints/customization_blueprint.md`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/docs/history/blueprints/customization_blueprint.md)). It is updated as each slice is completed.

---

## Overview of Slices

| Slice | Title | Status | Primary Invariants |
|---|---|---|---|
| **Slice 1** | Hook contract retrofit | **Complete** | C1 (`manifest.ts` sole source of `ft-*` strings) |
| **Slice 2** | CSS sanitizer & policy tables | **Complete** | C3 (pure/deterministic), C4 (scope containment), C5 (keyframes), C6 (URLs), C7 (profiles) |
| **Slice 3** | Character sheet end-to-end | **Complete** | C2 (single outlet), C8 (viewer supremacy), C10 (cap), C11 (import/export), C12 (SPA lifecycle), A-U2b |
| **Slice 4** | Global shell & theme cascade | **Complete** | A-U1 (unified cascade), C13 (performance budget) |
| **Slice 5** | Graduation batch 1 (tokens, decor, fx, fonts) | **Complete** | D7 (sanctioned replacements), C13 (decor layers), C6 (zero remote font assets), C9 (reduced motion fx) |
| **Slice 6** | Chat scope & conservative profile | *Queued* | C7 (chat profile), C9 (reduced motion), U4–U7 (runtime stability) |
| **Slice 7** | Presets & the Alice showpiece | *Queued* | Curated starter sheets & showpiece |

---

## Slice 1: Hook Contract Retrofit

### Objective
Establish stable, public CSS hook classes (`ft-*`) across all UI components and tag outermost container elements with `data-ft-surface="<scope>"`.

### Implementation Summary
- **Hook Manifest** ([`manifest.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/hooks/manifest.ts)):
  - Defined surface constants: `SURFACE_ATTR = 'data-ft-surface'`, `SURFACES = ['shell', 'character', 'chat']`.
  - Defined the frozen `HOOKS` dictionary across four groups:
    - `chrome`: `topbar`, `navdrawer`, `card`, `dialog`
    - `shell`: `foyerGrid`, `foyerHeader`, `recentStories`, `settings`, `personas`, `studio`
    - `character`: `hero`, `showcaseBody`, `actionHub`, `tagChips`, `creatorCredit`, `resumeMenu`
    - `chat`: `viewport`, `backdrop`, `messageLog`, `turn`, `bubbleChar`, `bubbleUser`, `bubbleNpc`, `narrator`, `composer`, `loreDrawer`, `swipeCarousel`, `turnToolbar`, `streamCaret`, `jumpToLatest`
- **Component Retrofit**:
  - Replaced all hardcoded class names with references to `HOOKS.*`.
  - Added `data-ft-surface` root attributes:
    - `shell`: Foyer (`/`), Personas (`/personas`), Studio (`/character/new`, `/character/[id]/edit`)
    - `character`: Author Showcase (`/character/[id]`)
    - `chat`: Chat Viewport (`/chat/[chatId]`)
- **Verification**:
  - `frontend/unit/hooksManifest.test.ts`: verified manifest shape, uniqueness, `ft-` prefix, absence of literal `ft-` strings outside manifest, and DOM presence in each component.

---

## Slice 2: Pure CSS Sanitizer & Policy Tables

### Objective
Build an isomorphic, zero-DOM CSS sanitizer in `@formatavern/shared` using `css-tree`, enforcing strict scope containment, keyframe namespacing, URL restrictions, and scope profiles.

### Implementation Summary
- **Policy Engine** ([`policy.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/customCss/policy.ts)):
  - Defined property allowlists, at-rule policies, and scope-specific profiles (permissive for shell/character, conservative for chat).
- **Pure Sanitizer** ([`sanitizer.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/customCss/sanitizer.ts)):
  - Implemented `sanitizeCss(raw, scope)`:
    - Prepends `[data-ft-surface="<scope>"]` to every selector.
    - Rewrites `@keyframes` to `ftkf-<scope>-<n>-<name>` and updates all animation references.
    - Validates `url()` targets against `/assets/` and `data:image/` only.
    - Strips dangerous rules (`<`, `</style>`, `@import`, remote resources).
    - Idempotent: `sanitizeCss(out.css, scope).css === out.css`.
- **Linter Suite** ([`lint.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/customCss/lint.ts)):
  - Implemented `lintSheet(raw)` detecting L1–L9 issues (layout animation, focus visibility, unbounded fixed positioning, strobe hazards, etc.).
- **Dynamic Loader** ([`loader.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/customCss/loader.ts)):
  - Dynamic `loadCustomCss()` keeping `css-tree` out of initial application bundles.
- **Verification**:
  - 40+ adversarial vectors verified across 7 test suites in `packages/shared/test/customCss/`.

---

## Slice 3: Character Sheet End-to-End

### Objective
Complete the end-to-end authoring, persistence, injection, and viewer-control pipeline for custom CSS on character surfaces.

### Implementation Summary
- **Database & Migration v5** ([`migrate.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/db/migrate.ts)):
  - Added `custom_css TEXT` column to `characters` table.
  - Bumped `user_version` to 5.
  - Audited via `backend/scripts/check.ts`.
- **Repository & Schemas**:
  - Stored authored CSS verbatim (preserving comments and formatting).
  - Excluded `custom_css` from `CharacterSummary` (Invariant A-S8).
  - Schema cap enforced at 131,072 characters (128 KiB).
- **Single Runtime Style Outlet** ([`CustomStyleOutlet.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/custom/CustomStyleOutlet.svelte)):
  - Sole authorized writer of runtime `<style>` elements (Amendment A-U2b).
  - Injects sanitized CSS tagged with `data-ft-sheet={scope}` and appends reduced-motion guard.
  - Binds to component lifecycle and cleans up on unmount (Invariant C12).
- **Viewer Supremacy**:
  - Added `hideCustomStyling` preference in `prefs.svelte.ts` and toggle in `SettingsSheet.svelte`. When enabled, style outlets render nothing (Invariant C8).
- **Studio Custom CSS Editor** ([`CustomCssPanel.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/studio/CustomCssPanel.svelte)):
  - Monospace code editor with quick snippets, character counter, live diagnostics tab, and interactive hooks reference.
- **HTML-Gap Ledger** ([`html-gap-ledger.md`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/docs/history/reports/html-gap-ledger.md)):
  - Initialized per Decision D1 to track unexpressed author styling needs.

### Slice 3 Verification & Browser Testing
- **Root Cause Analysis (Headless Edge CDP)**:
  - Discovered that `LivePreview.svelte` lacked `.ft-hero`, `.ft-action-hub`, and `.ft-showcase-body` mock elements, causing authored CSS to appear ineffective in Studio.
  - Discovered `ShowcaseEditor.svelte` split preview lacked `data-ft-surface="character"`.
- **Architectural Fixes**:
  - Embedded full character surface mock (`ShowcaseHero`, mock `ActionHub`, `ShowcaseBody`, dialogue preview) inside `LivePreview.svelte` with reactive auto-switching to `Showcase` preview on CSS/Showcase tab selection.
  - Added `data-ft-surface="character"` to `ShowcaseEditor.svelte`.
- **Visual Evidence**:
  - Headless Edge captures verified computed styles (`heroBoxShadow = "rgba(0, 0, 0, 0.5) 0px 10px 30px 0px"`) and live reactive rendering.

---

## Slice 4: Global Shell & Theme Cascade

### Objective
Unify the global shell theme with the character theme cascade under Amendment A-U1 (`NEUTRAL → global(shell) → character → bindings → persona → a11y`). Wrap shell routes (Foyer, Personas, Studio) in `<ShellSurface>` without nesting, wire chrome CSS tokens, provide multi-tab synchronization via `BroadcastChannel`, and deliver full user customization controls in `SettingsSheet.svelte`.

### Implementation Summary
- **Unified Isomorphic Cascade (Amendment A-U1)** ([`cascade.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/theme/cascade.ts)):
  - Added optional `global?: ThemeOverrides` layer to `ThemeInputs`.
  - Implemented exact precedence order: `NEUTRAL_THEME` defaults overwritten by `global` (shell document), then `character`, then `bindings`, then `persona`, with `a11y.disableCharacterThemes` overriding everything.
  - Defined `ShellThemeSchema`, `ShellTheme`, `DEFAULT_SHELL_THEME`, and `shellToThemeOverrides` in [`shellTheme.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/schemas/shellTheme.ts).
- **Backend Persistence & API Routes**:
  - Added `getShellTheme(): Promise<ShellTheme>` and `putShellTheme(theme: ShellTheme): Promise<ShellTheme>` to `SettingsRepository` in [`contracts.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/db/contracts.ts) and [`settings.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/db/repositories/settings.ts).
  - Added `GET /api/settings/shell-theme` and `PUT /api/settings/shell-theme` endpoints with `ShellThemeSchema` validation and 128 KiB cap enforcement in [`routes/settings.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/routes/settings.ts).
- **Frontend Reactive Store with Multi-Tab Sync** ([`shellTheme.svelte.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/state/shellTheme.svelte.ts)):
  - Built `ShellThemeStore` with sequence numbering concurrency guard (`seq`), dependency-injectable client for testing, and `BroadcastChannel('formatavern_sync')` message distribution to immediately synchronize theme changes across open browser tabs without page reloads.
  - Sanitized payloads via plain JSON serialization (`JSON.parse(JSON.stringify(data))`) and protected with `try...catch` guards to prevent `DOMException: DataCloneError` when posting Svelte 5 reactive `$state` proxy objects across browser tabs.
  - Eager initialization in root [`+layout.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/routes/+layout.svelte).
- **Global Solid vs. Frosted Chrome Architecture** ([`app.css`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/app.css), [`+layout.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/routes/+layout.svelte)):
  - Root `+layout.svelte` dynamically attaches `data-ft-chrome="solid" | "frosted"` to `document.documentElement` driven reactively by `prefs.forceSolidChrome`.
  - Defined `:root` defaults (`--chrome-scrim: 0.8`, `--chrome-backdrop-filter: blur(12px)`) and `[data-ft-chrome="solid"]` overrides (`--chrome-scrim: 1`, `--chrome-backdrop-filter: none`, with modal backdrop blur neutralization).
  - Introduced unified `.chrome-bar` class using `color-mix` with `--chrome-surface` and `--chrome-scrim` alongside `--chrome-backdrop-filter`, replacing hardcoded `bg-neutral-900/*` and `backdrop-blur-md` across all navigation bars:
    - Foyer Header ([`+page.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/routes/+page.svelte))
    - Personas Header ([`personas/+page.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/routes/personas/+page.svelte))
    - Studio Publish Bar ([`StudioShell.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/studio/StudioShell.svelte))
    - Chat TopBar ([`TopBar.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/nav/TopBar.svelte))
    - Character Showcase Header ([`character/[id]/+page.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/routes/character/%5Bid%5D/+page.svelte))
  - Guarantees immediate zero-blur solid chrome across all routes and dialogs when toggled, and silky frosted glass when off.
- **Shell Surface Component** ([`ShellSurface.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/custom/ShellSurface.svelte)):
  - Emits `data-ft-surface="shell"`.
  - Dynamically computes inline `--chrome-*` CSS custom properties (`--theme-accent`, `--chrome-bg`, `--chrome-surface`, `--chrome-line`, `--chrome-text`, `--chrome-font`, `--chrome-card-radius`, `--chrome-card-padding`, `--chrome-card-gap`, `--chrome-scrim`).
  - Supports `prefs.forceSolidChrome` (forces `--chrome-scrim: 1` and `--chrome-backdrop-filter: none`).
  - Renders backdrop image and overlay layers when `background.image` is configured.
  - Mounts `<CustomStyleOutlet scope="shell" css={shellTheme.theme.customCss} />` (with `withOutlet={false}` support for Studio to maintain Invariant C13: single active sheet per surface).
- **Route Wrapping (Surfaces Never Nest, Invariant §2.1)**:
  - Foyer (`/`, [`+page.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/routes/+page.svelte)): Wrapped with `<ShellSurface>`, top bar title dynamic to `shellTheme.theme.labels?.foyerTitle`.
  - Personas (`/personas`, [`personas/+page.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/routes/personas/+page.svelte)): Wrapped with `<ShellSurface class={HOOKS.shell.personas}>`.
  - Studio (`StudioShell.svelte`): Wrapped with `<ShellSurface withOutlet={false} class="h-[100dvh] overflow-hidden {HOOKS.shell.studio}">`.
  - Chat and Author Showcase remain strictly outside `ShellSurface`.
- **Chrome Token Consumers**:
  - `CompanionCard.svelte`, `CharacterCard.svelte`, `TopBar.svelte`, and `NavDrawer.svelte` consume `--chrome-card-radius`, `--chrome-card-padding`, `--chrome-font`, `--chrome-text`, and `--chrome-backdrop-filter` with fallback defaults.
  - Moved `.ft-char-card` styling rules (`border-radius`, `padding`, `font-family`, `color`) out of inline `style` attributes into [`app.css`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/app.css), allowing creator Custom CSS rules like `.ft-char-card { border-radius: ... }` to take effect immediately without requiring `!important`.
- **SettingsSheet Appearance Tab** ([`SettingsSheet.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/settings/SettingsSheet.svelte)):
  - Added **Appearance** section:
    - Chrome Accent color picker and palette presets.
    - Solid Chrome toggle (`prefs.forceSolidChrome`).
    - Scrim opacity range slider (0.1–1.0).
    - Foyer Title override input.
    - Card Density selector (`compact`, `regular`, `airy`).
    - Dual-track Card Corner Radius control: preset dropdown with Sharp (0px), Subtle (8px), Rounded (16px), Default (24px), Pill (32px), plus freeform text input for exact CSS units (`px`, `rem`).
    - Background image, blur, and overlay inputs.
    - Embedded `CustomCssPanel` configured for `scope="shell"` with live validation, size meter, and quick snippets (`.ft-foyer-header`, `.ft-foyer-grid`, `.ft-char-card`).
- **Reduced Motion Attribute (Invariant C9)**:
  - Root `+layout.svelte` sets `data-ft-motion="reduce"` or `"full"` on `<html>` driven by `media.reducedMotion`, freezing animations even when OS media query does not match.

---

## Slice 5: Graduation Batch 1 (Tokens, Decor, FX, Fonts)

### Objective
Deliver structured, sanctioned first-party schema features for styling needs identified in the blueprint (decor layers, speech bubble fx, companion font uploads, call-to-action labels) per Decision D7, eliminating raw CSS hacks while maintaining strict performance budgets and security invariants.

### Implementation Summary
- **Shared Schemas & Cascade** ([`schemas/theme.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/schemas/theme.ts), [`schemas/character.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/schemas/character.ts), [`cascade.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/theme/cascade.ts)):
  - Defined `ThemeDecorPositionSchema` (`'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'`).
  - Defined `ThemeDecorLayerSchema` with image path, position, opacity (0–1), and blur (0–40px), capped at `maxItems: 2` (Invariant C13).
  - Defined `ThemeFxBubbleSchema` (`'none' | 'breathe' | 'float' | 'glow'`) and `ThemeFxSchema`.
  - Added optional `decor` and `fx` properties to `CharacterThemeSchema` and `ThemeOverridesSchema`.
  - Added optional `labels?: { startStory?: string ≤ 40 }` to `CharacterCardSchema` and `CharacterMetadataSchema`.
  - Extended `cloneTheme` and `deepMergeTheme` to merge `decor` and `fx` across character and global layers, with `NEUTRAL_A11Y_THEME` resetting them.
- **Backend Font Engine & Asset Store** ([`contracts.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/assets/contracts.ts), [`sniff.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/assets/sniff.ts), [`store.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/assets/store.ts), [`routes/assets.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/routes/assets.ts)):
  - Added `'fonts'` to `AssetScope` in backend contracts and asset upload body schema.
  - Implemented `sniffFontMimeType` validating binary magic bytes for WOFF2 (`wOF2`), WOFF (`wOFF`), TTF (`0x00010000`, `true`), and OTF (`OTTO`).
  - Enforced 4 MiB upload limit (`MAX_FONT_FILE_SIZE`) and monotonic ULID naming in `assets/store.ts`, stored under `/assets/fonts/<targetId>/<ulid>.<ext>`.
  - Normalized asset web paths with forward slashes for cross-platform URL safety.
  - Maintained Invariants C6 & P3: strictly local assets, zero remote font fetches (`google-fonts` or CDNs).
  - Serialized and deserialized `card.labels` in `SQLiteCharacterRepository` via existing `metadata` JSON column (no SQLite migration required, `user_version = 5`).
- **Frontend Presentation & Components** ([`DecorLayers.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/custom/DecorLayers.svelte), [`app.css`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/app.css), [`SpeechBubble.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/chat/SpeechBubble.svelte), [`ActionHub.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/showcase/ActionHub.svelte)):
  - Created `DecorLayers.svelte`: pure presentation layer (`fixed`, `pointer-events-none`, `aria-hidden="true"`, `z-0`) supporting 5 anchor positions with opacity and blur, capped at $\le 2$ layers (Invariant C13).
  - Mounted `DecorLayers` across character showcase (`/character/[id]`), `ChatViewport.svelte`, and studio `LivePreview.svelte`.
  - Implemented static compositor keyframes (`ft-fx-breathe`, `ft-fx-float`, `ft-fx-glow`) in `app.css` with reduced-motion neutralizer overrides (`[data-ft-motion="reduce"]`, Invariant C9).
  - Wired `fx` prop to companion speech bubbles in `SpeechBubble.svelte` via `data-fx={fx}`.
  - Wired custom Call-to-Action label override in `ActionHub.svelte` (`character.labels?.startStory || 'Start New Story'`).
  - Added **AestheticPanel** controls for Motion Presets radio buttons, Decor Layers image slot editor (max 2 slots), and Call-to-Action button text.
  - Added **Fonts** manager tab in `CustomCssPanel.svelte` with upload button, local font list, and one-click "Insert @font-face" snippet generator.
  - Enhanced `DecorLayers.svelte` with `fixed={false}` mode for `LivePreview.svelte` to strictly contain decor layers within the studio preview box without window breakout, and bounded sticker size to `max-h-[40%] max-w-[40%]`.
  - Added empty string tolerance in `ThemeDecorLayerSchema` and draft prune-on-save in `draft.svelte.ts` to prevent schema validation errors during in-progress draft editing.
  - Added direct image upload, preview thumbnails, and status counter (`0/2`, `1/2`, `Maximum 2 reached`) in `AestheticPanel.svelte`.
  - **Dual-Track Decor Layers Expansion**:
    - **Track 1 (Studio GUI in `AestheticPanel.svelte`)**:
      - Expanded anchor positions from 5 to 7 (`bottom-right`, `bottom-left`, `bottom-center`, `top-left`, `top-right`, `top-center`, `center`).
      - Added dual-track **Size / Scale** controls: quick presets (`Default`, `Small: 120px`, `Medium: 220px`, `Large: 340px`) plus freeform CSS input (`placeholder="e.g. 240px, 30vw, 15rem"`).
      - Added **Position Nudge (Offset)** inputs for fine-tuning coordinates (`X Offset`, `Y Offset`) via modern CSS `translate: <x> <y>` without interfering with Tailwind center transforms.
    - **Track 2 (CSS Hook Contract & Manifest in `manifest.ts`)**:
      - Added `decorLayers: 'ft-decor-layers'` and `decorLayer: 'ft-decor-layer'` to `HOOKS.character`.
      - Added `decorLayers: 'ft-chat-decor-layers'` and `decorLayer: 'ft-chat-decor-layer'` to `HOOKS.chat`.
      - Added `data-slot="1"` and `data-slot="2"` attributes to individual layers in `DecorLayers.svelte`, enabling precise creator CSS targeting (e.g. `.ft-decor-layer[data-slot="1"] { transform: rotate(5deg); }`).
      - Added `.ft-decor-layer` quick snippet button and dynamic hook documentation listing in `CustomCssPanel.svelte`.
    - **Schema & Persistence**:
      - Added `top-center` and `bottom-center` to `ThemeDecorPositionSchema`.
      - Added `size` and `offset` (`x`, `y`) to `ThemeDecorLayerSchema` in `packages/shared/src/schemas/theme.ts`.
      - Extended `cloneTheme` and `deepMergeTheme` in `cascade.ts` to deep-clone `offset`.
      - Extended `draft.svelte.ts` to auto-prune empty sizes and offsets on save.
- **Verification**:
  - `packages/shared/test/theme/cascade.test.ts` & `schemas.test.ts`: tested decor capping, fx enums, label character constraints, expanded positions, custom size, offset, and cascade merging (186 green).
  - `backend/test/assets/fonts.test.ts`: tested font format sniffing, 4 MiB rejection, ULID generation, and local asset retrieval (171 green).
  - `frontend/unit/decorLayers.test.ts`, `hooksManifest.test.ts`, and `motionPresets.test.ts`: tested 7 anchor positions, size and offset styling, slot tracking, manifest uniqueness (34 hooks), and reduced motion safety overrides (157 green).

---

## Test Suite Status

- **`bun run typecheck`**: 0 errors, 0 warnings across monorepo (`shared`, `backend`, `frontend`).
- **`bun run test`**: 100% green across all packages:
  - `packages/shared`: 186 passed, 0 failed.
  - `backend`: 171 passed, 0 failed.
  - `frontend`: 157 passed, 0 failed.
  - Total: 514 passed, 0 failed.
- **`bun run db:check`**: Clean integrity (`wal`, `foreign_keys=1`, `user_version=5`, `fts_parity=ok (2/2)`).
