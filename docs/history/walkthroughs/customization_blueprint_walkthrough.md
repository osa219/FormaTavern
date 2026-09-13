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
| **Slice 6** | Chat scope & conservative profile | **Complete** | C7 (chat profile), C8 (viewer supremacy), C9 (reduced motion), C12 (SPA lifecycle), U4–U7 (runtime stability) |
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

## Slice 6: Chat Scope & Conservative Profile

### Objective
Activate creator custom CSS on the primary reading surface (`ChatViewport.svelte`) under the chat-conservative policy profile (§5.3), enforce viewer supremacy (`hideCustomStyling`, Invariant C8) and reduced motion guards (Invariant C9), surface policy-driven diagnostic explanations in the Studio editor (Invariant C7), and index the C-series invariants across documentation.

### Implementation Summary
- **Chat Viewport Style Injection** ([`ChatViewport.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/chat/ChatViewport.svelte)):
  - Mounted `<CustomStyleOutlet scope="chat" css={session.character?.customCss} />` within the `ChatViewport` container (`data-ft-surface="chat"`).
  - Maintained non-nesting surface architecture (Invariant §2.1): `ChatViewport` operates outside `ShellSurface` so shell sheets never pollute chat chrome.
  - Automatically receives the chat-conservative sanitization profile: strips `position: fixed/sticky`, blocks `z-index > 10`, forbids `scroll-behavior`, and blocks scroll-container manipulation on `ft-message-log` and `ft-viewport`.
- **Policy Explanations & Studio Diagnostics UX (Invariant C7)** ([`policy.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/customCss/policy.ts), [`lint.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/customCss/lint.ts), [`CustomCssPanel.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/studio/CustomCssPanel.svelte)):
  - Defined `CHAT_POLICY_EXPLANATIONS` and `explainChatDrop(property, selector, value)` in `policy.ts` as the single source of truth driving both sanitizer enforcement and Studio UI lints.
  - Implemented `lintChatRestrictions(raw: string)` in `lint.ts` to detect properties stripped in chat and return structured explanations.
  - Added `CHAT_NOTE` issue code to `LintIssue` when `scope === 'chat'`.
  - Added dedicated **Chat Surface Restrictions** alert box in the `CustomCssPanel` Diagnostics tab when authoring companion sheets (`targetScope === 'character'`), detailing every declaration that will be stripped when chatting and explaining why.
  - Added `.ft-bubble-char` quick snippet button for instant companion bubble styling.
- **Documentation & Cheat Sheet Indexing**:
  - Updated [`.agents/AGENTS.md §4`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/.agents/AGENTS.md) with the complete **Customization Series (C)** invariant cheat sheet (C1–C13).
  - Updated [`docs/development.md §6.3`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/docs/development.md) indexing C1–C13 to test files.
  - Updated [`docs/architecture.md`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/docs/architecture.md) §11.2 (Chameleon pipeline with global cascade and CustomStyleOutlet) and §11.3 (Non-nesting surfaces: chat, character, shell).
  - Updated [`docs/schema.md`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/docs/schema.md) documenting database version 5, `characters.custom_css`, and `settings.shell_theme`.
- **Verification**:
  - `packages/shared/test/customCss/chatProfile.test.ts`: tested `explainChatDrop`, `CHAT_POLICY_EXPLANATIONS`, and `lintChatRestrictions` (189 green).
  - `frontend/unit/chatViewportStyle.test.ts`: verified `ChatViewport` outlet mounting, chat-conservative profile sanitization, reduced-motion guard attachment, and viewer supremacy kill-switch (161 green).
  - `frontend/unit/boundaries.test.ts`: confirmed single style outlet, dynamic `css-tree` imports, and purity boundaries hold clean.

---

## Slice 7: Presets & the Alice Showpiece

### Objective
Complete the final slice of the Customization Blueprint: provide four curated, production-grade starter stylesheets (*Terminal*, *Manuscript*, *Window*, *Night Market*) with in-editor quick starter loading in `CustomCssPanel.svelte`, equip seed character Alice with a ~60-line gothic gold showpiece custom stylesheet, provide unit test coverage for presets and seeds, and document seed refresh commands.

### Implementation Summary
- **Curated Starter Presets** ([`presets.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/custom/presets.ts)):
  - Defined `CUSTOM_CSS_PRESETS` list and individual exports (`TERMINAL_PRESET`, `MANUSCRIPT_PRESET`, `WINDOW_PRESET`, `NIGHT_MARKET_PRESET`).
  - **Terminal**: Retro CRT monospace aesthetic with phosphor green accents, subtle vignette background, and uppercase button styling.
  - **Manuscript**: Warm antique parchment with classic serif typography, gold-sepia card borders, and ornate bubble insets.
  - **Window**: Classic desktop OS window frame with beveled 3D borders (`inset`/`outset` styling) and retro button styling.
  - **Night Market**: Cyberpunk neon noir with luminous cyan/magenta glassmorphic glow, radial gradient hero backdrop, and dark-glass speech bubbles.
  - All four presets are strictly constrained under 8 KB ($\le 8,192$ bytes), produce zero lint issues (`lintSheet`), and pass `sanitizeCss` with zero drops under both character and chat-conservative profiles.
- **Studio Editor Preset Selector** ([`CustomCssPanel.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/studio/CustomCssPanel.svelte)):
  - Added dedicated **"Start from a preset"** row in the editor header featuring one-click buttons for each curated starter.
  - Implemented `applyPreset(preset)` with overwrite protection: prompts confirmation if the editor already contains non-empty edits that differ from the selected preset.
  - Dispatches positive feedback via `toasts.success`.
- **Alice Gothic Gold Showpiece** ([`backend/src/db/seeds/characters.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/db/seeds/characters.ts)):
  - Configured `alice.style.fx = { bubble: 'glow' }` to pair with slow glow keyframes.
  - Added a 61-line gothic gold custom CSS showpiece to Alice:
    - `.ft-hero`: Gothic gold / deep wine radial gradient vignette with gold frame border and soft drop shadow.
    - `.ft-showcase-body`: Victorian serif typography with delicate pink text tint.
    - `.ft-bubble-char`: Gothic parchment border with dark wine background and gold inset aura.
    - `.ft-bubble-char[data-fx="glow"]`: Deep ruby and amber triple-layer glow aura complementing the compositor motion preset.
    - `.ft-bubble-user`: Subtle crimson-tinted user bubble with matching radius.
    - `.ft-action-hub button::before`: Steampunk cogwheel label swap (`content: "⚙ "` in amber gold).
    - `.ft-tag-chips span`: Polished dark wine tag chips with amber borders.
  - Verified 100% `sanitizeCss`-clean under both character and chat scopes (0 dropped rules, 0 dropped declarations, 0 dropped at-rules, 0 fatal errors).
- **Seed Refresh Instructions**:
  - To refresh existing local databases with Alice's updated showpiece sheet:
    ```bash
    bun run db:seed --force
    ```
- **Verification**:
  - `frontend/unit/presets.test.ts`: verified all 4 presets define valid metadata, remain strictly $\le 8$ KB, pass `sanitizeCss` with 0 drops across character and chat scopes, and pass `lintSheet` with 0 issues (6 passed).
  - `frontend/unit/customCssPanel.test.ts`: verified "Start from a preset" row and all four preset buttons render in the editor (6 passed).
  - `backend/test/seed.test.ts`: verified Alice's custom CSS presence, length (~61 lines), `sanitizeCss`-cleanliness on both scopes, and database seeding preservation (4 passed).

---

## Blueprint Series Completion Status

All 7 slices of the **Customization Series (C)** are now complete and fully verified:
- **Slice 1:** Hook Contract Retrofit (`packages/shared/src/hooks/manifest.ts`, Invariant C1)
- **Slice 2:** Pure CSS Sanitizer & Scope Engine (`packages/shared/src/customCss/`, Invariants C3, C4, C5, C6, C7)
- **Slice 3:** Character Sheet End-to-End & Single Style Outlet (`CustomStyleOutlet.svelte`, Studio CSS tab, Invariants C2, C8, C10, C11, C12, C13, Amendment A-U2b)
- **Slice 4:** Global Shell Theme & Unified Cascade (`ShellSurface.svelte`, settings doc, Invariants A-U1, C13)
- **Slice 5:** Graduation Batch 1: Motion Presets, Decor Layers & Local Font Manager (Invariants C9, C13)
- **Slice 6:** Chat Scope & Conservative Reading Profile (Invariants C7, C8, C9)
- **Slice 7:** Curated Starter Presets & Alice Gothic Gold Showpiece (Invariants C1–C13)

---

## Post-Implementation Polish & Bug Fixes

Following Slice 7 and visual verification across companion pages, two UX and theming inconsistencies were addressed:

### 1. Chat Chameleon Drawer Theme Nesting & Nav Unwrapping
- **Issue:** Opening the sidebars (`NavDrawer`, `LoreDrawer`) in a themed chat (e.g., Alice's crimson theme) rendered default blue/neutral chrome instead of the companion's crimson theme. In addition, the navigation drawer showed `UNKNOWN CHARACTER` headers.
- **Resolution:**
  - In [`ChatViewport.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/chat/ChatViewport.svelte), moved `<NavDrawer>`, `<LoreDrawer>`, and modal dialogs inside the `<div style={themeEngine.styleAttr} data-ft-surface="chat">` container, allowing the companion's active theme custom properties (`--theme-accent`, `--theme-chrome`, `--theme-font`) to cascade cleanly into the drawers.
  - Fixed `loadNavData()` in `ChatViewport.svelte` to unwrap paginated `{ items: CharacterSummary[] }` from `GET /api/characters`, eliminating `UNKNOWN CHARACTER` headers.
  - Added unit test in `frontend/unit/chatViewportStyle.test.ts` asserting `<NavDrawer>` and `<LoreDrawer>` are nested inside `[data-ft-surface="chat"]`.

### 2. Character Showcase Story Filtering & Layout Reordering
- **Issue:** On the Character Showcase page (`/character/[id]`), the "Resume Existing Story" menu listed all chats from all characters across the entire application, and was placed above the character's description. This pushed the companion's lore, scene, and opening words far down the page.
- **Resolution:**
  - In [`backend/src/routes/chats.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/routes/chats.ts), wired up `query: ChatListQuerySchema` on `GET /api/chats` and passed `{ characterId, limit, cursor }` to `repos.chats.list()`, scoping the story list strictly to the active companion (`c.primary_character_id = ?`).
  - In [`packages/shared/src/schemas/chat.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/schemas/chat.ts), updated `ChatListQuerySchema` so `limit` accepts both numbers and numeric strings.
  - In [`frontend/src/routes/character/[id]/+page.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/routes/character/%5Bid%5D/+page.svelte), reordered `<main>` elements so the character's details (Showcase body, About, The Scene, Opening Words, and Author Prompt fields) appear directly below `ActionHub`, followed by `ResumeMenu` at the bottom of the page.
  - Added tests in `backend/test/routes/chats.test.ts` verifying `GET /api/chats?characterId=...` returns only the matching character's stories and respects `limit`.

### 3. Persona Speech Bubble Styling Scope
- **Issue:** Persona style overrides in `PersonaEditor.svelte` were able to spill into companion or narrative styling.
- **Resolution:** Scoped persona style overrides strictly to the user speech bubble, preserving companion and narrative styling boundaries.

### 4. Surface Completeness, Dialog Containment & Invariant C14
- **Issue:** Dialogs (`ConfirmDialog`, `SettingsSheet`) and Persona management routes were previously mounted outside surface boundaries or lacking `--theme-accent-contrast` pairing, creating accessibility and theme cascade gaps.
- **Resolution:**
  - Codified **Invariant C14 (Surface Completeness & Dialog Scoping)** in `AGENTS.md`, `docs/architecture.md`, and `docs/development.md`.
  - Wrapped all Persona routes (`/personas`, `/personas/new`, `/personas/[id]/edit`) in `<ShellSurface>`.
  - Enclosed all modal dialogs and settings sheets inside their host surface container so that CSS custom properties (`--theme-*`, `--chrome-*`, `--theme-accent-contrast`) cascade downwards seamlessly.
  - Replaced hardcoded dark text on `bg-accent` with semantic `text-accent-contrast` across all buttons and interactive elements.
  - Added the static architecture test suite in [`frontend/unit/surfaces.test.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/unit/surfaces.test.ts) enforcing surface root delegation, dialog containment, and contrast safety.

### 5. Semantic Chrome Harmonization & Status Badges
- **Issue:** Discovery components and settings still had hardcoded `text-neutral-100` or `bg-neutral-900` classes, and status badges hardcoded Tailwind emerald utilities.
- **Resolution:**
  - Migrated [`CompanionCard.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/discovery/CompanionCard.svelte), [`SearchBar.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/discovery/SearchBar.svelte), [`TagFilter.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/discovery/TagFilter.svelte), [`SortSelect.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/discovery/SortSelect.svelte), and [`SettingsSheet.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/settings/SettingsSheet.svelte) to semantic chrome tokens (`text-(--chrome-text)`, `bg-(--chrome-surface)`, `border-(--chrome-line)`).
  - Harmonized status badges and success indicators across the shell to use dynamic `--theme-accent` instead of hardcoded emerald.

### 6. Themable Scrollbars & Persona/Custom CSS Panel Harmonization
- **Issue:** Scrollbars were unstyled browser defaults that clashed with dark and light custom themes; Persona editor and `CustomCssPanel` had residual static neutral classes.
- **Resolution:**
  - Configured themable modern scrollbar custom properties in [`frontend/src/app.css`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/app.css) (`--scrollbar-track`, `--scrollbar-thumb`, `--scrollbar-thumb-hover`, `scrollbar-color: ...`).
  - Harmonized [`PersonaCard.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/persona/PersonaCard.svelte), [`PersonaEditor.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/persona/PersonaEditor.svelte), [`BubblePreview.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/persona/BubblePreview.svelte), and [`CustomCssPanel.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/studio/CustomCssPanel.svelte) with semantic chrome tokens.

### 7. Active Surface Synchronization & Accessible Custom Checkboxes
- **Issue:** Native browser checkboxes in dark mode had white borders/checkmarks that ignored custom accent colors; the active surface attribute was not synchronized to `<html>`.
- **Resolution:**
  - In [`frontend/src/routes/+layout.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/routes/+layout.svelte), reactively synchronized `data-ft-surface`, `data-ft-motion`, and accent tokens directly to `document.documentElement`.
  - Added custom CSS checkbox rules in `app.css` using `accent-accent` to eliminate browser-default white/dark contrast bugs.

### 8. Studio Shell Harmonization & Custom Style Outlet
- **Issue:** Studio editor panels retained static neutral classes and did not apply the user's shell custom CSS.
- **Resolution:**
  - Harmonized [`StudioShell.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/studio/StudioShell.svelte) and all eight editor panels (`IdentityPanel`, `VoicePanel`, `ShowcaseEditor`, `AestheticPanel`, `StatePanel`, `BindingsPanel`, `GalleryManager`) to use semantic chrome tokens.
  - Mounted `<CustomStyleOutlet scope="shell" css={shellTheme.theme.customCss} />` in `StudioShell.svelte`, ensuring custom shell styling applies across the studio.

### 9. Modern Dark Slate Palette Baseline (`#313338` / `#38393C`)
- **Issue:** The harsh OLED pitch-black baseline created extreme contrast fatigue and sharp visual disparity across dark themes.
- **Resolution:**
  - Softened the application neutral baseline in [`frontend/src/app.css`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/app.css), updating `--n-950` to modern graphite slate (`#313338`) and `--n-900` to `#38393c`.
  - Dynamically bound `bg-(--chrome-bg)` and `text-(--chrome-text)` across `app.html` (`<body>`), [`character/[id]/+page.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/routes/character/%5Bid%5D/+page.svelte), [`ChatViewport.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/chat/ChatViewport.svelte), and [`LivePreview.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/studio/LivePreview.svelte).

### 10. Surface Accent Tint Slider (`--chrome-tint-strength`)
- **Issue:** Users could not control how much the active accent color tinted surfaces and backgrounds.
- **Resolution:**
  - Added optional `tint: Type.Optional(CssToken)` to `ShellThemeSchema` in [`packages/shared/src/schemas/shellTheme.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/schemas/shellTheme.ts).
  - Wired reactive variable `--chrome-tint-strength` in `app.css` (default `0%`) across `--chrome-bg`, `--chrome-surface`, and `--chrome-line`.
  - Added the **Surface Accent Tint** slider in [`SettingsSheet.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/settings/SettingsSheet.svelte) Appearance tab (0% to 15%, step 1%) with real-time dragging and descriptive labels (`Pure Neutral`, `Subtle`, `Ambient`, `Vibrant`).

### 11. Token Track Cascade Expansion
- **Issue:** Shell theme customizations (accent, font, bubble radius, background) did not cascade down into characters that lacked custom overrides.
- **Resolution:**
  - Updated `shellToThemeOverrides()` in [`packages/shared/src/schemas/shellTheme.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/schemas/shellTheme.ts) to bridge `chrome.accent` into `overrides.colors.accent`, along with `font`, `background`, `bubble`, and `colors`.
  - Added comprehensive test suites in [`packages/shared/test/theme/cascade.test.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/test/theme/cascade.test.ts) verifying global cascade behavior.

### 12. Studio Live Preview Surface Isolation & Layered Viewport
- **Issue:** When a user configured shell custom CSS (e.g. setting `--n-950: #f8fafc;`), the live aesthetic preview in the studio rendered a white background because `LivePreview.svelte` is nested inside `[data-ft-surface="shell"]`. In addition, `<Backdrop>` squished when scrolling.
- **Resolution:**
  - In [`frontend/src/app.css`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/app.css), added global surface isolation rules for `[data-ft-surface="character"]` and `[data-ft-surface="chat"]` to explicitly re-anchor `--n-950: #313338;` down to `--n-50`, `--chrome-bg`, `--chrome-surface`, `--chrome-line`, `--chrome-text`, and `color-scheme: dark;`.
  - In [`LivePreview.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/studio/LivePreview.svelte), defined `previewChromeReset` with inline specificity and restructured the preview into a fixed outer viewport holding `<Backdrop>` at `absolute inset-0`, with an independent inner container (`flex-1 overflow-y-auto`) handling scrolling.
  - Added regression test in [`frontend/unit/surfaces.test.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/unit/surfaces.test.ts).

---

## Test Suite Status

- **`bun run typecheck`**: 0 errors, 0 warnings across monorepo (`shared`, `backend`, `frontend`, `svelte-check` clean).
- **`bun run test`**: 100% green across all packages:
  - `packages/shared`: 190 passed, 0 failed.
  - `backend`: 173 passed, 0 failed.
  - `frontend`: 179 passed, 0 failed.
  - Total: 542 passed, 0 failed.
- **`bun run db:check`**: Clean integrity (`wal`, `foreign_keys=1`, `user_version=5`, `fts_parity=ok (3/3)`).


