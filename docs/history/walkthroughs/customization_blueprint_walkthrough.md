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
| **Slice 5** | Graduation batch 1 (tokens, decor, fx, fonts) | *Queued* | D7 (sanctioned replacements), C13 (decor layers) |
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
  - Eager initialization in root [`+layout.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/routes/+layout.svelte).
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
- **SettingsSheet Appearance Tab** ([`SettingsSheet.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/settings/SettingsSheet.svelte)):
  - Added **Appearance** section:
    - Chrome Accent color picker and palette presets.
    - Solid Chrome toggle (`prefs.forceSolidChrome`).
    - Scrim opacity range slider (0.1–1.0).
    - Foyer Title override input.
    - Card Density selector (`compact`, `regular`, `airy`) and radius selector.
    - Background image, blur, and overlay inputs.
    - Embedded `CustomCssPanel` configured for `scope="shell"` with live validation, size meter, and quick snippets (`.ft-foyer-header`, `.ft-foyer-grid`, `.ft-char-card`).
- **Reduced Motion Attribute (Invariant C9)**:
  - Root `+layout.svelte` sets `data-ft-motion="reduce"` or `"full"` on `<html>` driven by `media.reducedMotion`, freezing animations even when OS media query does not match.

---

## Test Suite Status

- **`bun run typecheck`**: 0 errors, 0 warnings across monorepo (`shared`, `backend`, `frontend`).
- **`bun run test`**: 100% green across all packages:
  - `packages/shared`: 180 passed, 0 failed.
  - `backend`: 161 passed, 0 failed.
  - `frontend`: 145 passed, 0 failed.
  - Total: 486 passed, 0 failed.
- **`bun run db:check`**: Clean integrity (`wal`, `foreign_keys=1`, `user_version=5`, `fts_parity=ok (2/2)`).

