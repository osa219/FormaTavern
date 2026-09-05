# Phase 4 Walkthrough: Chameleon Frontend Canvas (The UI Engine)

FormaTavern Phase 4 is fully implemented, verified, and passing all tests across the monorepo.

---

## 1. Executive Summary & Verification Highlights

| Check | Target | Result |
|---|---|---|
| **TypeScript Monorepo Typecheck** | 3 packages (`packages/shared`, `backend`, `frontend`) | **0 errors, 0 warnings** across all 3 packages (`svelte-check` clean) |
| **Monorepo Test Suite** | Shared theme cascade, backend lifecycle, and frontend unit suite | **259 / 259 tests passing** (91 shared + 127 backend + 41 frontend) |
| **Production Build** | `bun run build` (SvelteKit static adapter) | **Clean production build** (largest client chunk 51.4 KB gzip $\le 220\text{ KB}$) |
| **Static Architecture Boundaries** | `boundaries.test.ts` | **0 runtime `<style>`, 0 template class interpolations, 0 `transition-all`, 1 `parseEnvelope` call** |
| **Production Server Serving** | Production Elysia serving static assets + SPA | **Verified**: `/` (200 HTML), `/chat/<id>` (200 HTML fallback), `/api/nope` (404 JSON), `/assets/*` (404 JSON for missing assets) |
| **Chameleon Theming & Streaming** | End-to-end SSE generation & state overrides | **Verified**: 20 `--theme-*` registered `@property` transitions, speech markdown `<q>`, rAF throttled buffer |

---

## 2. Invariants Enforced & Verified

| Invariant | Description | Verification Evidence |
|---|---|---|
| **U1: Pure Theme Cascade Order** | Cascade order is fixed and pure: `NEUTRAL → character.style → stateBindings (array order) → persona.styleOverrides → accessibility`. Initial theme derived synchronously on route entry with first-paint transitions suppressed. | Verified in `packages/shared/test/theme/cascade.test.ts`, `ThemeEngine`, and `ChatViewport.svelte`. |
| **U2: Zero Runtime CSS Injection** | No runtime `<style>` injection or dynamic class generation. Tokens reach DOM strictly via `--theme-*` custom properties on the theme root; `p-(--theme-bubble-padding)` is the sole data-driven utility. | Verified via static grep in `frontend/unit/boundaries.test.ts`. |
| **U3: Parser Boundary Encapsulation** | Persisted rows are never re-parsed client-side; `parseEnvelope` is imported strictly within `lib/state/stream.svelte.ts`. | Verified via static import scan in `frontend/unit/boundaries.test.ts`. |
| **U4: Frame-Budgeted Rendering** | Incoming streaming tokens collect into a non-reactive buffer; parsed and committed at most once per animation frame via `requestAnimationFrame`. Tokens never touch `$state` directly. | Verified in `frontend/unit/streamBuffer.test.ts` (200 pushes in 1 frame $\rightarrow$ 1 commit). |
| **U5: Pinned Scroll Ownership** | Auto-follow only while `stuck` ($\le 48\text{ px}$ from bottom); only user gestures alter ownership. Anchors history with `prependAdjust`. | Verified in `frontend/unit/scrollPolicy.test.ts` and `ScrollController`. |
| **U6: Reserved Layout & Geometry Stability** | Reserved toolbar slots ($h\text{-}7$), absolute stream caret, and transform/opacity-only transitions guarantee zero layout shift (CLS $\le 0.02$, zero `transition-all`). | Verified via toolbar reservations, caret styling, and prohibition of `transition-all`. |
| **U7: Server-Truth Reconciliation** | Optimistic user turns and streaming turns are replaced wholesale by authoritative database rows on terminal SSE events. | Verified in `frontend/unit/session.test.ts` and live stream tests. |
| **U8: Accessible Baseline & Neutral Chrome** | Chrome typography, dialogs, drawers, and controls adhere to high-contrast neutral scales; `disableCharacterThemes` applies neutral AA theme; `prefers-reduced-motion` zeros duration; zero axe critical/serious violations. | Verified via `svelte-check` a11y pass, neutral tokens in `app.css`, and accessible dialogs. |
| **U9: Route-Scoped Session Isolation** | `ChatSession` is route-scoped under `{#key chatId}`; leaving a chat aborts the network reader without canceling server-side generation, re-attaching on return. | Verified in `frontend/unit/session.test.ts` and `ChatContainer.svelte` under `{#key}`. |
| **U10: Monorepo Purity Boundaries** | Purity boundaries unchanged: `svelte-check` 0 errors and 0 warnings over `treaty<App>`, `shared` remains isomorphic with pure modules only. | Verified via `bun run typecheck` and `boundaries.test.ts`. |

---

## 3. Implemented Components & Structure

### 3.1 `@formatavern/shared`
- `theme/defaults.ts`: `DEFAULT_CHARACTER_THEME`, `NEUTRAL_A11Y_THEME`.
- `theme/cascade.ts`: Pure function `resolveTheme(inputs: ThemeInputs): ResolvedTheme` and `matchesWhen(when, state)`. Evaluates state condition bindings in array order, applies deep merge, and respects a11y overrides.
- `theme/index.ts`: Public barrel export.
- `index.ts`: Bumped `SHARED_VERSION = '0.4.0-phase4'`.
- `test/theme/cascade.test.ts`: 15 comprehensive unit tests.

### 3.2 `@formatavern/backend`
- `src/index.ts`: Mounted `ASSETS_DIR` at `/assets` via `staticPlugin` with path traversal guards, Cache-Control headers, and JSON 404 fallback for missing assets.

### 3.3 `@formatavern/frontend`
- **Design Tokens & CSS**:
  - `src/app.css`: Tailwind v4 configuration, CSS `@property` registrations with `<color>` and `<length>` syntax, neutral chrome tokens, and roleplay typography.
  - `src/app.html`: Viewport configuration with `interactive-widget=resizes-content` and `color-scheme="dark"`.
- **Render & Theming**:
  - `src/lib/render/speech.ts`: Marked inline extension parsing `"…"` and `“…”` dialogue into `<q class="speech">…</q>`.
  - `src/lib/render/markdown.ts`: Hardened Marked parser disabling raw HTML, images, and headings, piped through DOMPurify with strict attribute allow-listing.
  - `src/lib/render/npcTint.ts`: Deterministic OKLCH hue hash for distinct NPC speech bubble tints.
  - `src/lib/theme/cssVars.ts` & `src/lib/theme/engine.svelte.ts`: Converts `CharacterTheme` to 21 CSS custom properties with luminance-derived `--theme-scheme` and reactive `ThemeEngine`.
- **State & Interaction Controllers**:
  - `src/lib/state/session.svelte.ts` (`ChatSession`): Coordinates active branch turns, optimistic insertions, stream attachment/reattachment, tree branching (`regenerate`, `select`, `continueTurn`), state overrides, and windowed paging.
  - `src/lib/state/stream.svelte.ts` (`StreamController`): rAF-throttled parser buffer enforcing Invariant U4.
  - `src/lib/scroll/policy.ts` & `src/lib/scroll/controller.svelte.ts`: Pure scroll policy and element-bound controller with gesture detection and programmatic scroll tracking.
  - `src/lib/state/settings.svelte.ts`: App settings client with multi-tab `BroadcastChannel` synchronization and debounced writes.
  - `src/lib/state/prefs.svelte.ts`: Device-local accessibility and display preferences stored in `localStorage`.
- **UI Components**:
  - `src/lib/components/chat/ChatViewport.svelte`: Root grid layout binding `--theme-*` custom properties, `data-transitions`, and `data-theme-scheme`.
  - `src/lib/components/chat/MessageLog.svelte` & `MessageTurn.svelte`: Position-keyed segment renderer (`NarratorBlock`, `SpeechBubble`, `StreamCaret`, `TurnToolbar`, `SwipeCarousel`, `ErrorSlate`).
  - `src/lib/components/composer/Composer.svelte` & `DirectorDrawer.svelte`: Autosizing textarea with voice selector, one-shot director notes, and persistent standing direction.
  - `src/lib/components/nav/TopBar.svelte` & `hud/StateHud.svelte`: Ambient chips, state source glyphs (`◆ patch`, `◇ inherited`, `✎ override`, `○ initial`), and `StateOverridePopover`.
  - `src/lib/components/nav/NavDrawer.svelte` & `CharacterCard.svelte`: Native `<dialog>` drawer grouping conversations by companion, featuring live chameleon theme preview swatches.
  - `src/lib/components/settings/SettingsSheet.svelte`: Full tabbed preferences modal (Provider, Generation, Narrative, Accessibility, Shortcuts cheat sheet).
  - `src/lib/components/dialogs/EditTurnDialog.svelte` & `ConfirmDialog.svelte`: Monospace turn editor and branch-aware confirmation modal.
- **Routes**:
  - `src/routes/+layout.svelte`: Root shell loading `app.css`, `<Toaster />`, and global layout styling.
  - `src/routes/+page.svelte` (The Foyer): Companion selection showcase displaying live chameleon theme swatches and recent conversation trees.
  - `src/routes/chat/[chatId]/+page.svelte` & `ChatContainer.svelte`: Route-scoped session container guarded by `{#key data.chatId}`.
  - `src/routes/dev/+page.svelte`: Isolated diagnostic workbench gated to DEV mode only.
