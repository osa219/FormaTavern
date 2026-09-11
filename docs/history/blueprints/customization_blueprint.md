# FormaTavern — Customization Blueprint: Creator-Grade Expressive Freedom

**Purpose:** Turn the agreed Stage 1 direction (`docs/history/reports/customization_vision_stage1.md`, rev 2) into an executable specification: per-surface custom CSS (character pages, chat, global shell) beside the existing token layer, powered by a stable hook contract, a pure scope-aware CSS sanitizer, a single injection outlet, viewer supremacy controls, and a first batch of graduated tokens. Nothing in the narrative engine, streaming, prompt, or storage engines changes. Everything here is presentation-layer over existing contracts (`CharacterCard`, `resolveTheme`, `ThemeEngine`, the `/api/characters` router, the `/assets` mount, the `FsAssetStore`).

**Decision record.** Stage 1 rev 2 is authoritative; its decisions are locked and transcribed below — this blueprint does not relitigate them (§13 flags, in one paragraph each, the two places where transcription required a judgment call).

**Revision rev 3 (review pass):** single-sheet-per-page coherence (§2.2, C5, C13, §6, §9.1); `css-tree` reaches route chunks by cached dynamic import only, so the §10.1.1 chunk budget holds (§5.1, §6, C13, §10.2); Composer path + C3 wording corrected.

| # | Locked decision | Transcribed as |
|---|---|---|
| D1 | No free author HTML outside showcase markdown; concrete ledger trigger | §8 Slice 3 acceptance test + `docs/history/reports/html-gap-ledger.md` mechanism (§7.5) |
| D2 | One sheet per character | `characters.custom_css` single column (§4.1); authors target `[data-ft-surface=…]` hooks within it |
| D3 | Global theme as a settings document | `settings` row `shell_theme`, dedicated endpoints (§4.4) |
| D4 | No CSS on import in v1 — strip-and-notify; export symmetry | §4.5 import/export contract |
| D5 | Caps as stated: ~128 KB/sheet, `!important` allowed, `data:` URLs bounded by the sheet cap | §1 C10, §5.3 |
| D6 | Shell before chat | Slice order §8 (1 hooks → 2 sanitizer → 3 character page → 4 shell → 5 graduations → 6 chat → 7 presets) |
| D7 | Enforced chat-conservative; graduated replacements ship first | §5.3 per-scope profiles; slice 5 precedes slice 6 |
| D8 | `ft-` prefix + machine-readable manifest as source of truth | §3 hook manifest |

**New dependency:** `css-tree` (^3.x, pure JS, no DOM — added to `packages/shared`). **`SHARED_VERSION`:** `0.6.0-customization`. **Migration:** v5 `creator_customization` (one additive column; the shell theme needs no DDL — it is a `settings` row).

---

## 0. Carry-forward & amendments

Two amendments to prior invariants are declared here so `boundaries.test.ts`, `AGENTS.md`, and `docs/development.md §6.3` are updated deliberately, not drifted.

| Amendment | Change | Why |
|---|---|---|
| **A-U2b** | The U2 anti-pattern "no `document.createElement('style')`" gains exactly one exception: `components/custom/CustomStyleOutlet.svelte`. Everywhere else the ban stands verbatim. | The outlet is the single sanctioned injection point for sanitized sheets (Stage 1 §5). It is the A-U2 pattern (one sink, everything else forbidden) applied to stylesheets. |
| **A-U1** | The cascade order becomes `NEUTRAL → global(shell) → character → bindings → persona → a11y`. `resolveTheme` gains an optional `global` input; behavior with `global` undefined is byte-identical to today. | D3/D6: the shell theme is the lowest authored layer of the unified cascade. |

**Code-vs-blueprint discrepancy (code wins, noted per the brief):** `phase_5_blueprint.md` §5.1 lists `id` in `FORBID_ATTR` for showcase markdown, but the implemented `renderShowcaseMarkdown` (`frontend/src/lib/render/showcase.ts`) puts `id` in `SHOWCASE_ALLOWED_ATTR` and no hook strips it. The implementation is authoritative. This blueprint's carousel acceptance test (§8 Slice 3) *depends* on ids being allowed (`:target` anchors), so the discrepancy is resolved in favor of the code and the phase-5 doc should be annotated, not the code changed. Note for a later hardening pass: free ids widen the DOM-clobbering surface (`id="settings"`); acceptable now, revisit only if the HTML-gap ledger (§7.5) ever reopens D1.

Everything else (I1–I6, E1–E8, S1–S9, U1–U10, P1–P11) holds verbatim and is re-verified by the existing suites.

---

## 1. Invariants for the customization series

Every row names its enforcement (test file or check). The C-series joins the AGENTS.md §4 cheat sheet and `docs/development.md §6.3` index at the end of slice 6.

| # | Invariant | Enforced by |
|---|---|---|
| **C1** | **The manifest is the only source of `ft-*` strings.** Components never hardcode `ft-` class literals; they consume `HOOKS.*` from `packages/shared/src/hooks/manifest.ts`. Hook names are append-only public API: removing or renaming one is a breaking change requiring a deprecation note in the manifest. | `frontend/unit/hooksManifest.test.ts` (shape, uniqueness, prefix, no literal `ft-` class strings in `frontend/src` outside the manifest); DOM-presence test renders each hooked component and asserts its manifest class |
| **C2** | **One style outlet.** `CustomStyleOutlet.svelte` is the only component permitted to create a `<style>` element at runtime (A-U2b). It injects only `sanitizeCss()` output, composed with the reduced-motion guard. | `frontend/unit/boundaries.test.ts` amended: `createElement('style')` / `<style` appears in exactly one component file |
| **C3** | **The sanitizer is pure and deterministic.** `sanitizeCss(raw, scope)` lives in `@formatavern/shared`, imports no DOM/Node/Bun (I5), and is a fixed point on its own output: `sanitizeCss(out.css, scope).css === out.css`. | `packages/shared/test/customCss/*.test.ts` (purity additionally enforced by the shared import-surface scan — no DOM/Node/Bun imports per I5); idempotency case |
| **C4** | **Scope containment.** Every emitted selector resolves under `[data-ft-surface="<scope>"]` (or already contains it). Selectors referencing `html`, `body`, `:root`, or a *different* surface's attribute are dropped and reported — never passed through. | adversarial corpus cases in `packages/shared/test/customCss/scope.test.ts` |
| **C5** | **Keyframes are namespaced per sheet.** Every `@keyframes` name is rewritten to `ftkf-<scope>-<n>-<name>` (`n` = 1-based occurrence order); all `animation`/`animation-name` references resolve to the **first** occurrence's renamed name, and further same-name definitions are renamed distinctly with a `note` report. Namespacing protects author keyframes against the site's own (`sonner-*`, `animation-*`, `app.css` presets), which share the document cascade. | `keyframes.test.ts`: author `fadeIn` coexists with a site `fadeIn`; duplicate-definition note case; shorthand/longhand reference rewrite |
| **C6** | **URL policy.** Every `url()` target in declarations matches `^/assets/` or `^data:image/`; in `@font-face` `src`, `^/assets/fonts/`, `^data:font/`, or `local(…)`. Everything else — `http(s):`, protocol-relative, `data:text/`, whitespace/quote tricks — drops the declaration (or the whole at-rule) and is reported. No remote fetch is ever triggered by a sheet. | `urlPolicy.test.ts` (12+ vectors incl. `URL(`, `url( "https://…" )`, `data:text/html`) |
| **C7** | **Per-scope profiles are data, not special cases.** The chat-conservative blocklist (§5.3) is a table in `packages/shared/src/customCss/policy.ts` consumed by the sanitizer; the same table drives the Studio lint explanation strings. Shell/character run the permissive profile. | `chatProfile.test.ts` (every blocked property × value × selector combination, and the shell/character counterparts that must *pass*) |
| **C8** | **Viewer supremacy.** `prefs.hideCustomStyling === true` ⇒ the outlet renders nothing (no `<style>` element in the DOM at all); a11y token resolution stays inline (beats any sheet); `disableCharacterThemes` continues to force `NEUTRAL_A11Y_THEME` and additionally the outlet is not mounted. | `frontend/unit/customStyleOutlet.test.ts` (mount matrix: pref × sheet presence) |
| **C9** | **Reduced motion is enforced by us.** The outlet appends the guard block (§5.7) to every injected sheet; `+layout.svelte` sets `data-ft-motion` on `<html>` from `media.reducedMotion` so `prefs.reducedMotion = 'on'` kills sheet motion regardless of the media query. | `customStyleOutlet.test.ts` guard-presence case; manual step in §10.3 |
| **C10** | **Size cap.** `customCss` is `maxLength: 131_072` characters (128 KiB) at the TypeBox schema — the Studio meter, API validation, and repository all inherit it. `data:` URLs need no separate per-URL cap: they are bounded by the sheet cap by construction. | `packages/shared/test/schemas.test.ts` (maxLength); route test posting an over-cap sheet → 422 |
| **C11** | **Import/export symmetry.** `customCss` is a legal `CharacterCard` field so the (future) exporter includes the author's own CSS verbatim; the (future) card importer strips it and notifies; `duplicate` carries it. Manual API writes accept it (that is the Studio's own write path). | §4.5 contract; `repositories.test.ts` duplicate case; importer behavior is specified now, implemented with the Phase-6 importer |
| **C12** | **SPA non-leakage.** The style element's lifecycle is the outlet component's lifecycle: route change unmounts the surface, the element is removed. No sheet survives navigating away; no sheet exists for a surface whose route isn't active. | `customStyleOutlet.test.ts` mount/unmount; manual nav sweep in §10.3 |
| **C13** | **Performance budgets.** ≤ 1 sheet active per page (one outlet per surface root; surfaces never nest — §2.1); ≤ 2 decor layers (schema `maxItems`); the CSS parser (`css-tree`) reaches route chunks by cached dynamic import only, never a static import (§6); keyframe economy + lint set v1 (§5.8) steer animation to compositor-only properties; every slice's DoD includes the themed-page perf pass (§10). | schema constraints (`decorLayers.maxItems: 2`); `lint.test.ts`; boundaries test bans static `customCss` imports outside the loader, the Studio panel, and tests; §10.3 measurement steps |

---

## 2. Surfaces, ownership & composition

### 2.1 Surface map

| Surface | Root element (verified in code) | `data-ft-surface` | Sheet source | Token source |
|---|---|---|---|---|
| Shell — Foyer `/`, `/personas`, `/character/new`, `/character/[id]/edit`, future library | each route's outermost container, wrapped by `ShellSurface.svelte` | `shell` | `shell_theme.customCss` (settings doc) | `shell_theme` chrome tokens + `--chrome-*` |
| Character page `/character/[id]` | root `div` (the existing theme root, `style={showcaseStyle}`) | `character` | `characters.custom_css` | `resolveTheme({ global, character, a11y })` |
| Chat `/chat/[chatId]` | `ChatViewport` root `div` (`grid h-[100dvh]…`) | `chat` | same `characters.custom_css` (character owns its chat look) | existing cascade + `global` |

Surfaces never nest: character and chat routes do **not** sit inside a `ShellSurface`, so a shell rule prefixed `[data-ft-surface="shell"] …` cannot reach chat chrome. `TopBar`/`NavDrawer`/dialog chrome render *inside* whichever surface hosts them and are styleable by that surface's sheet via the `chrome` hook group (§3) — in chat, that means the character's sheet restyles the chrome (the chameleon thesis); on shell routes, the user's shell sheet does.

### 2.2 Composition order

1. **Tokens** (inline `style` on the surface root — beats any stylesheet by cascade mechanics): `resolveTheme` output via `ThemeEngine` / the character page's existing derivation, now with `global` as the lowest authored layer.
2. **Sheet** (injected by the surface's outlet — exactly one sheet is ever active on a page, because surfaces never nest): the shell sheet on shell routes, the character's sheet on character/chat routes. No cross-surface ordering rule is needed; styling Foyer cards with character sheets (or any other cross-surface composition) is out of scope until this blueprint is amended.
3. **A11y** (supreme, mechanical): `hideCustomStyling` removes sheets from the DOM entirely; `disableCharacterThemes` short-circuits `resolveTheme` to `NEUTRAL_A11Y_THEME` and the outlets do not mount; the reduced-motion guard (§5.7) always accompanies an injected sheet.

### 2.3 The token ↔ CSS bridge

Sheets **read** every `--theme-*` and `--chrome-*` var (so `border-color: var(--theme-accent)` follows the resolved cascade, including persona overrides and mood bindings) and **may define their own custom properties**, including `--theme-*` writes. Author `--theme-*` writes lose to the surface root's inline values wherever both exist — inline beats stylesheet — so the bridge can never dethrone the cascade; it can only fill gaps. `@property` in sheets is blocked (§5.2) to protect the registered `--theme-accent` transition machinery in `app.css`.

### 2.4 Shell chrome tokens

The app already has a chrome palette (`--chrome-bg`, `--chrome-surface`, `--chrome-line` in `app.css`, color-mixed from the neutrals with ≤ 8 % character accent). The shell theme **builds on it** rather than inventing parallel vars: `ShellSurface.svelte` sets inline overrides for the `--chrome-*` vars (plus new `--chrome-text`, `--chrome-font`, `--chrome-card-radius`) from the shell doc, with fallbacks equal to today's computed values. Every consumer keeps a `var(--chrome-…, <current-default>)` fallback so non-shell surfaces (chat chrome) are untouched. P1's frosted-chrome toggle lands as `prefs.forceSolidChrome` (§8 Slice 4): when on, `ShellSurface` overrides `--chrome-scrim` to `1` (solid surfaces, no `backdrop-filter`).

---

## 3. The hook contract (`packages/shared/src/hooks/manifest.ts`)

```ts
export const SURFACE_ATTR = 'data-ft-surface' as const;
export const SURFACES = ['shell', 'character', 'chat'] as const;
export type SurfaceScope = (typeof SURFACES)[number];

export const HOOKS = {
  chrome: {            // shared components that render inside whichever surface hosts them
    topbar: 'ft-topbar', navdrawer: 'ft-navdrawer', card: 'ft-char-card', dialog: 'ft-dialog'
  },
  shell: {
    foyerGrid: 'ft-foyer-grid', foyerHeader: 'ft-foyer-header', recentStories: 'ft-recent-stories',
    settings: 'ft-settings', personas: 'ft-personas', studio: 'ft-studio'
  },
  character: {
    hero: 'ft-hero', showcaseBody: 'ft-showcase-body', actionHub: 'ft-action-hub',
    tagChips: 'ft-tag-chips', creatorCredit: 'ft-creator-credit', resumeMenu: 'ft-resume-menu'
  },
  chat: {
    viewport: 'ft-viewport', backdrop: 'ft-backdrop', messageLog: 'ft-message-log',
    turn: 'ft-turn', bubbleChar: 'ft-bubble-char', bubbleUser: 'ft-bubble-user',
    bubbleNpc: 'ft-bubble-npc', narrator: 'ft-narrator', composer: 'ft-composer',
    loreDrawer: 'ft-lore-drawer', swipeCarousel: 'ft-swipe-carousel',
    turnToolbar: 'ft-turn-toolbar', streamCaret: 'ft-stream-caret', jumpToLatest: 'ft-jump-to-latest'
  }
} as const satisfies Record<string, Record<string, `ft-${string}`>>;
```

**Rules (normative):**
- Components consume hooks via `import { HOOKS } from '@formatavern/shared'` — e.g. `MessageTurn`'s root becomes `class="turn group relative … {HOOKS.chat.turn}"`. No `ft-` literal outside the manifest (C1).
- Hooks are additive: new hooks append; removing/renaming requires a manifest `@deprecated` entry and a release note.
- `ft-showcase-body` is co-stable with `.showcase-body` (the existing A-U2 container class); the manifest entry maps to it, it does not replace it.
- Root elements add the surface attribute alongside existing attributes: `ChatViewport` root and the character page root gain `data-ft-surface`, `ShellSurface` renders it for shell routes.
- The manifest is the Studio element-picker's data source (§8 Slice 3) and the hook reference doc is generated from it — docs cannot drift from code because they are the same object.

---

## 4. Data model & migration v5 (`creator_customization`)

### 4.1 `characters.custom_css`

```sql
-- Migration v5 — additive, one column, no data migration
ALTER TABLE characters ADD COLUMN custom_css TEXT;   -- raw authored sheet, comments preserved (C11); NULL = none
-- settings row 'shell_theme' is written lazily on first save; no DDL needed (settings is a KV table)
```

`packages/shared/src/schemas/character.ts` — additive:

```ts
export const CharacterCardSchema = Type.Object({
  …existing…,
  customCss: Type.Optional(Type.String({ maxLength: 131_072 }))  // raw authored CSS; sanitized at render (C10)
});
```

`CharacterCreateSchema` / `CharacterPatchSchema` derive automatically (existing `Omit`/`Composite`). `CharacterSummarySchema` does **not** gain the field (A-S8 reasoning: list payloads stay light). Repository: extend `CharacterRow` with `custom_css: string | null`, `cardToRow` (`customCss ?? null`), `rowToCard` (`if (row.custom_css) card.customCss = row.custom_css`), and the `INSERT`/`UPDATE` statements. `duplicate` copies it (C11). `db:check` v5 audit: `custom_css` column exists, values ≤ 131 072 chars, `user_version = 5`.

### 4.2 `ShellThemeSchema` (`packages/shared/src/schemas/shellTheme.ts`)

```ts
export const ShellThemeSchema = Type.Object({
  font: Type.Optional(Type.Partial(ThemeFontSchema)),          // base font under character fonts (cascade `global`)
  background: Type.Optional(ThemeBackgroundSchema),            // foyer backdrop + base under character backgrounds
  chrome: Type.Optional(Type.Object({
    accent: Type.Optional(CssToken),                            // → --theme-accent base on shell routes
    surface: Type.Optional(CssToken),                           // → --chrome-bg override
    surfaceRaised: Type.Optional(CssToken),                     // → --chrome-surface override
    border: Type.Optional(CssToken),                            // → --chrome-line override
    text: Type.Optional(CssToken),                              // → --chrome-text
    font: Type.Optional(CssToken)                               // → --chrome-font
  })),
  card: Type.Optional(Type.Object({
    radius: Type.Optional(CssToken),                            // → --chrome-card-radius
    density: Type.Optional(Type.Union([Type.Literal('compact'), Type.Literal('regular'), Type.Literal('airy')]))
  })),
  scrim: Type.Optional(CssToken),                               // frosted chrome strength 0–1 (P1)
  labels: Type.Optional(Type.Object({ foyerTitle: Type.Optional(Type.String({ maxLength: 40 })) })),
  customCss: Type.Optional(Type.String({ maxLength: 131_072 }))
});
export type ShellTheme = Static<typeof ShellThemeSchema>;
export const DEFAULT_SHELL_THEME: ShellTheme = {};              // absence = today's neutral chrome, exactly
```

`resolveTheme` gains `global?: ThemeOverrides` in `ThemeInputs` (A-U1): merged immediately after `DEFAULT_CHARACTER_THEME`, before `character`. The shell→cascade adapter is `shellToThemeOverrides(shell) = pick(shell, ['font', 'background'])` — chrome-only keys never enter the character cascade (character colors come from the character; chrome colors drive `--chrome-*`).

### 4.3 Repository & API

`SettingsRepository` gains (row key `shell_theme`; corrupt rows reset to default with a console warning, matching the existing settings behavior; **not** part of `AppSettingsSchema`, so the general settings GET/PATCH is untouched):

```ts
getShellTheme(): ShellTheme;
putShellTheme(doc: ShellTheme): ShellTheme;
```

| Method | Endpoint | Body | Returns | Notes |
|---|---|---|---|---|
| `GET` | `/api/settings/shell-theme` | — | `ShellTheme` | default `{}` when absent; never includes secrets shape |
| `PUT` | `/api/settings/shell-theme` | `ShellThemeSchema` (full document replace) | `ShellTheme` | 422 on schema violation incl. over-cap `customCss` |
| `POST`/`PATCH` | `/api/characters(…)` | `customCss?: string ≤ 131_072` | `CharacterCard` | stores the **raw** sheet (render sanitizes — §6); `PATCH` semantics: undefined = keep, `null` = clear, string = replace |

The server does **not** run sheet policy on write (the Studio's write path must be able to save a sheet whose lint warnings the author accepted); it enforces only the schema cap. The render-time sanitizer is the trust boundary — it runs on every injection regardless of what is stored (defense in depth, and the reason a hostile direct-API write cannot bypass policy).

### 4.4 Client state

`frontend/src/lib/state/shellTheme.svelte.ts` — mirrors `settings.svelte.ts`: eager `load()` from `+layout.svelte` (all routes need the `global` cascade layer), BroadcastChannel `formatavern_sync` sync on `shell_theme_updated`, `$state` doc + `saving`/`error`. `prefs.svelte.ts` gains `hideCustomStyling: boolean` and `forceSolidChrome: boolean` (localStorage, same `formatavern_prefs` key, never server — standing rule).

### 4.5 Import/export contract (D4, C11)

- **Export** (future exporter, and any card JSON produced by the API): `customCss` is included verbatim — the author's own work travels with the card.
- **Import** (future JSON/PNG importer): `customCss` is **stripped** on import and the user is notified in the import result — copy: *"Custom CSS was removed from the imported card for safety. Review it in the Studio → CSS tab and re-apply what you trust."* The stripped text is offered in the notification for one-click copy so no work is lost.
- **`duplicate`** carries `customCss` (local copy, same author).
- **Direct API writes** accept `customCss` — that is the Studio's own path; the render sanitizer makes it safe regardless of origin.

---

## 5. The CSS sanitizer (normative) — `packages/shared/src/customCss/`

### 5.1 Pipeline

```
sanitizeCss(raw: string, scope: SurfaceScope): { css: string; report: SanitizeIssue[] }
```

Pure, deterministic, css-tree-based: **parse → walk → policy → scope-prefix → keyframe rename → regenerate → integrity pass → emit.** Regeneration from the AST (rather than string surgery) drops author comments in the *injected* copy (the stored raw keeps them for editing), normalizes syntax, and makes the output canonical. The report describes every dropped or rewritten item; `sanitizeCss` never throws on bad input — a parse-fatal sheet yields `{ css: '', report: [fatal] }`. On the client the module is reached through the cached dynamic import in `customCss/loader.ts` (§6); the sync API is unchanged, so tests and the preloaded Studio panel call it directly.

```ts
export type SanitizeIssue =
  | { kind: 'parse-fatal'; detail: string }
  | { kind: 'dropped-rule'; selector: string; reason: 'cross-surface' | 'escape-selector' | 'empty-after-policy' }
  | { kind: 'dropped-declaration'; selector: string; property: string; reason: 'blocked-property-scope' | 'blocked-value' | 'url-policy' }
  | { kind: 'dropped-at-rule'; atRule: string; reason: 'blocked' | 'url-policy' }
  | { kind: 'renamed-keyframes'; from: string; to: string }
  | { kind: 'note'; detail: string };   // e.g. "@font-face src rewritten", "var() reads allowed"
```

### 5.2 At-rule policy

| At-rule | Permissive (shell, character) | Chat | Notes |
|---|---|---|---|
| `@media` | allow (recurse; rules inherit all policies) | allow | incl. `prefers-reduced-motion`, `(pointer: coarse)` |
| `@supports` | allow (recurse) | allow | |
| `@keyframes` | allow; rename to `ftkf-<scope>-<n>-<name>`; rewrite references (C5) | allow, same | `n` = occurrence order in the sheet (deterministic) |
| `@font-face` | allow; descriptors limited to `font-family, src, font-weight, font-style, font-display, unicode-range`; `src` per §5.5 | allow, same | document-wide by nature — not selector-scoped; name collisions between two sheets' families are the author's to avoid (lint L9 notes duplicates) |
| `@container` | allow (recurse) | allow | |
| `@import`, `@layer`, `@property`, `@scope`, `@namespace`, `@page`, `@charset` | **drop + report** | **drop + report** | `@import` = remote fetch; `@property` could re-register `--theme-accent`; `@scope` would bypass our prefixing |

### 5.3 Property & value policy

**Global (all scopes):** values containing `expression(`, `behavior:`, `-moz-binding`, `javascript:`, `vbscript` (case-insensitive) drop the declaration. Every `url()` in every value obeys §5.5. `!important` is allowed (D5 — hooks should make it rare; lint L6 tracks it).

**Permissive profile (shell, character):** all properties and values pass except the global value rules above. `position`, `z-index`, `overflow`, `scroll-*`, `touch-action` are unrestricted — the viewer kill-switch is the remedy for self-sabotage, per the locked D7 split.

**Chat-conservative profile (enforced additions — drop declaration + report `blocked-property-scope`):**

| What | Rule | Protects |
|---|---|---|
| `position: fixed`, `position: sticky` | blocked on **any** selector | no click-trapping overlays, no scroll-hijacking layers in the reading surface |
| `z-index` | integer ≤ 10 only (`auto` allowed) | sheets stay under chrome (TopBar z-30, dialogs z-50); decor sits at z ≤ 10 |
| `scroll-behavior` | blocked on any selector | U5 — a smooth-scroll sheet would fight scroll-follow during streaming |
| `overflow`, `overflow-x/y`, `overscroll-behavior*`, `scroll-snap-*`, `scroll-margin*`, `scroll-padding*`, `touch-action` | blocked **only on rules whose selector list matches `ft-message-log` or `ft-viewport`** | the scroll mechanics of the reading surface; nested decorative `overflow: hidden` elsewhere stays legal |
| `transition`/`animation` on layout properties | lint (L1/L2), not blocked | U6 spirit; the reduced-motion guard is the hard stop |

The profile tables live in `customCss/policy.ts` as data (C7) — `{ scope: 'chat', properties: {…}, valueFilters: {…}, selectorScopedBlocks: { selectors: ['ft-message-log','ft-viewport'], properties: {…} } }` — and are the single source the sanitizer, the Studio lint explainer, and the tests all read.

### 5.4 Selector policy (C4)

For each complex selector in each rule's selector list:

1. If it contains `[data-ft-surface=` with a value **≠** the current scope → drop that selector (`cross-surface`).
2. If any compound's subject is `html`, `body`, or `:root` → drop that selector (`escape-selector`).
3. If it already contains `[data-ft-surface="<current>"]` → pass through unchanged (already scoped; this is also how authors target the surface root itself).
4. Otherwise → prefix: `[data-ft-surface="<scope>"] <selector>`.

If every selector in a list is dropped, the rule is dropped (`empty-after-policy`). Universal/structural/pseudo selectors (`*`, `>`, `+`, `~`, `:hover`, `:focus-visible`, `:target`, `::before/::after`, `:has()`) pass through under the prefix. Selector text is compared post-regeneration (css-tree normalizes quoting/whitespace, so `URL(`-style casing tricks in attribute values do not evade step 1–3 checks).

### 5.5 URL policy (C6)

| Context | Allowed `url()` targets | Everything else |
|---|---|---|
| Declaration values (all scopes) | `^/assets/`, `^data:image/` | declaration dropped + `url-policy` report |
| `@font-face` `src` | `^/assets/fonts/`, `^data:font/`, `local(…)` | at-rule dropped + report |

Every `Url` node in the AST is checked (css-tree surfaces them regardless of quoting/whitespace/casing). `data:` URLs are bounded by the sheet cap by construction — no separate per-URL cap (D5 note, §13).

### 5.6 Keyframe renaming (C5)

On encountering `@keyframes NAME`, rewrite to `ftkf-<scope>-<n>-<NAME>` (n = 1-based occurrence order). Then rewrite every `animation-name` longhand and the name component of every `animation` shorthand **in the same sheet** to the new name. Unresolvable names (referencing a keyframes the sheet never defines) pass through unrename — they are inert — with a `note`.

### 5.7 The reduced-motion guard (C9) — appended by the **outlet**, not the sanitizer

`sanitizeCss` output is a fixed point (C3); the guard is composed at injection time by `CustomStyleOutlet`, once per sheet:

```css
@media (prefers-reduced-motion: reduce) {
  [data-ft-surface="<scope>"] *, [data-ft-surface="<scope>"] *::before, [data-ft-surface="<scope>"] *::after {
    animation-duration: 0.01ms !important; animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important; scroll-behavior: auto !important;
  }
}
[data-ft-motion="reduced"] [data-ft-surface="<scope>"] *,
[data-ft-motion="reduced"] [data-ft-surface="<scope>"] *::before,
[data-ft-motion="reduced"] [data-ft-surface="<scope>"] *::after {
  animation-duration: 0.01ms !important; animation-iteration-count: 1 !important;
  transition-duration: 0.01ms !important; scroll-behavior: auto !important;
}
```

`+layout.svelte` sets `data-ft-motion={media.reducedMotion ? 'reduced' : 'full'}` on `<html>` reactively — `prefs.reducedMotion = 'on'` thereby kills sheet motion even when the OS media query is off. The second selector's guard is also what enforces U8's "0 ms motion on preference" for authored CSS.

### 5.8 Lint set v1 (`lintSheet(raw): LintIssue[]`, pure, shared)

Warnings, never blocks (the save path only hard-stops on `parse-fatal`, so author intent is never silently edited away):

| # | Trigger | Message theme |
|---|---|---|
| L1 | `@keyframes` animating layout/paint properties (`width,height,top,left,right,bottom,margin*,padding*,filter,backdrop-filter,box-shadow`) | "prefer `transform`/`opacity` — compositor-only animation" |
| L2 | `transition` on layout properties | same (U6 spirit) |
| L3 | `outline: none/0` without a `:focus-visible` replacement on the same hook | "focus visibility" |
| L4 | `position: fixed` + viewport-covering box without `pointer-events: none` — **shell/character scopes only; chat blocks fixed in policy** | "decor layers should not intercept clicks" |
| L5 | animation duration < 0.5 s animating `opacity`/`filter` with infinite or ≥ 3 iterations | photosensitivity |
| L6 | `!important` count > 20 | "hooks should make this rare — report a gap if you need it" |
| L7 | `transition`/`animation` on `color`/`background-color`/`border-color` within `ft-bubble-*`/`ft-turn` selectors | "strobe risk with reactive bindings" |
| L8 | `backdrop-filter` or blur > 8 px without a `(pointer: coarse)` block | mobile GPU cost |
| L9 | `@font-face` family name colliding with another sheet's | author-facing note |

---

## 6. The outlet & render path

`frontend/src/lib/components/custom/CustomStyleOutlet.svelte` — the only style-creating component (A-U2b, C2):

```svelte
<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { SurfaceScope } from '@formatavern/shared';
  import { loadCustomCss } from '@formatavern/shared/customCss/loader';  // cached dynamic import: the parser stays out of the initial chunk (C13)
  import { prefs } from '$lib/state/prefs.svelte';

  let { scope, css }: { scope: SurfaceScope; css?: string | null } = $props();
  let styleEl: HTMLStyleElement | null = null;

  $effect(() => {
    const raw = css && css.trim() && !prefs.hideCustomStyling ? css : null;
    if (!raw) return;
    let cancelled = false;
    loadCustomCss().then((m) => {
      if (cancelled) return;
      const out = m.sanitizeCss(raw, scope);
      if (!out.css) return;
      const el = document.createElement('style');
      el.setAttribute('data-ft-sheet', scope);          // devtools-visible provenance
      el.textContent = out.css + m.motionGuard(scope);  // textContent: no HTML parsing, </style>-proof
      document.head.appendChild(el);
      styleEl = el;
    });
    return () => { cancelled = true; styleEl?.remove(); styleEl = null; };  // C12: lifecycle-bound
  });
  onDestroy(() => { styleEl?.remove(); styleEl = null; });
</script>
```

`customCss/loader.ts` exports `loadCustomCss(): Promise<typeof import('./index')>` behind a module-level cached promise, plus the pure `motionGuard(scope): string` builder (the §5.7 block from one source, shared by outlet and tests). The Studio panel preloads the loader on mount so debounced sanitize calls stay fluid; unit tests import the sanitizer statically (Node — no chunk budget). The boundaries test bans static imports of the `customCss` sanitizer module outside the loader, the Studio panel, and tests — so `css-tree` can never leak into an initial route chunk unnoticed.

Mount points: the character page root (beside `style={showcaseStyle}`), `ChatViewport` root, and `ShellSurface` — exactly one outlet mounts per active surface, so **at most one sheet is ever active on a page**. Setting `textContent` (never `innerHTML`/`{@html}`) means a `</style>` sequence inside a `content:` value can never break out — it is a text node, not parsed HTML; the sanitizer's integrity pass additionally rejects any `<` in regenerated output, so the case never even reaches the DOM. Future cross-surface composition (e.g. character sheets styling Foyer cards) requires amending this blueprint — it must not be smuggled in via extra outlets.

**Sanitize-report UX (save path).** `CustomCssPanel` (§8 Slice 3) runs `sanitizeCss` + `lintSheet` on every edit (debounced 150 ms). The preview pane always renders the **sanitized** result (what viewers see). On save: `parse-fatal` blocks the save with the parse error surfaced like any schema issue (P5 parity); every other report/lint entry is shown as a collapsible list (kind, selector/property, reason, offending snippet) above the Save button — **save proceeds, storing the raw** (comments preserved; nothing silently rewritten). This is the Janitor two-editor trap designed out: one editor, one save path, raw is canonical, sanitized is derived.

---

## 7. Graduation batch 1 (tokens)

### 7.1 Decor layers (`CharacterTheme.decor`)

```ts
decor: Type.Optional(Type.Array(Type.Object({
  image: AssetPath,                                  // /assets/backgrounds/… or character-owned asset
  position: Type.Optional(Type.Union([Type.Literal('top-left'), Type.Literal('top-right'),
    Type.Literal('bottom-left'), Type.Literal('bottom-right'), Type.Literal('center')])),
  opacity: Type.Optional(Type.Number({ minimum: 0, maximum: 1, default: 1 })),
  blur: Type.Optional(CssToken)
}), { maxItems: 2 }))                                  // C13
```

Rendered by a new `DecorLayers.svelte` (chat + character surfaces) as `position: fixed` layers — **our code, not author CSS**, so the chat sanitizer's fixed-position block costs nothing (D7's "sanctioned replacements"): `pointer-events: none`, `aria-hidden`, `z-index: 0`, above `Backdrop`, below content. This is the page-doll / scenery-pin pattern, safe by construction. AestheticPanel gains a two-slot decor editor (image pick from GalleryManager, position select, opacity/blur sliders).

### 7.2 Motion presets (`CharacterTheme.fx`)

```ts
fx: Type.Optional(Type.Object({
  bubble: Type.Optional(Type.Union([Type.Literal('none'), Type.Literal('breathe'),
    Type.Literal('float'), Type.Literal('glow')], { default: 'none' }))
}))
```

Implemented as a `data-fx` attribute on `ft-turn` bubbles mapping to **static keyframes in `app.css`** (compositor-only: `transform`/`opacity`; `breathe` = 6 s scale 1↔1.01, `float` = 8 s translateY ±2 px, `glow` = 4 s opacity 0.9↔1 on the bubble's existing accent ring) — animation lives in our stylesheet (U2-clean), gated by the same `prefers-reduced-motion`/`data-ft-motion` guards, so presets are reduced-motion-safe by construction. AestheticPanel gains a four-way radio under a "Motion" heading.

### 7.3 Label overrides

`ShellTheme.labels.foyerTitle` (§4.2) renames the Foyer header ("The Tavern", "My Library", …). Character-side: `CharacterCard` gains `labels?: { startStory?: string ≤ 40 }` consumed by `ActionHub`'s primary button (default "Start New Story"). These are the first text-swap graduates — the `content:` pseudo-element recipe stays available in sheets for everything else.

### 7.4 Font assets

`AssetScope` gains `'fonts'`: uploads under `/assets/fonts/<ownerId>/<ulid>.<woff2|woff|ttf|otf>`; magic-byte sniff (`wOF2`, `wOFF`, `0x00010000`, `OTTO`), 4 MiB cap, same `nosniff` serving. `GalleryManager` (or a sibling `FontManager` list in the CSS panel) shows uploaded fonts; **insert** into the CSS editor a ready-made `@font-face { font-family: 'MyFont'; src: url('/assets/fonts/…'); font-display: swap; }` snippet. The font-family token/`CssToken` stays unchanged; `@font-face` lives in the sheet where the sanitizer polices it (§5.2). No remote font fetch ever occurs (P3).

### 7.5 HTML-gap ledger (D1)

`docs/history/reports/html-gap-ledger.md` — created in slice 3, a simple table: *date · desired effect · why showcase-markdown + sheet + tokens cannot express it · blocked-case link*. Reopen D1 when the ledger has two entries (or one the project owner calls load-bearing). The ledger is appended to whenever Studio lints or user reports demonstrate a blocked pattern; slice DoDs include a "ledger review" step.

---

## 8. Per-slice specifications (rollout order — D6 locked)

### Slice 1 — Hook contract retrofit
**Goal:** hooks and surface attributes exist; zero behavior change.
**Files:** `packages/shared/src/hooks/manifest.ts` (+ export from index); `ChatViewport`, `MessageLog`, `MessageTurn`, `SpeechBubble`, `NarratorBlock`, `composer/Composer`, `LoreDrawer`, `SwipeCarousel`, `TurnToolbar`, `StreamCaret`, `JumpToLatest`, `Backdrop`, `TopBar`, `NavDrawer`, `CharacterCard`/`CompanionCard`, `ShowcaseHero`, `ShowcaseBody` (add `ft-showcase-body` alongside `.showcase-body`), `ActionHub`, `TagChips`, `CreatorCredit`, `ResumeMenu`, Foyer `+page.svelte`, character `[id]/+page.svelte`, personas page, Studio pages (class additions only); root attrs on the three surface roots.
**Spec:** every component consumes `HOOKS.*` (C1); `data-ft-surface` lands on the three roots (§2.1); no styling logic changes.
**Tests:** `frontend/unit/hooksManifest.test.ts` — manifest shape/uniqueness/prefix; no `ft-` literals in `frontend/src` outside the manifest; per-component DOM presence (render each hooked component with minimal props, assert class present).
**Verify:** `bun run typecheck && bun run test` — all existing suites still green (nothing behavioral changed).

### Slice 2 — CSS sanitizer
**Goal:** `sanitizeCss` + policy tables + lints, fully tested, used by nothing yet.
**Files:** `packages/shared/src/customCss/{sanitizeCss.ts,policy.ts,lint.ts,index.ts}`; `bun add css-tree` in `packages/shared`; `packages/shared/test/customCss/{sanitizeCss,scope,keyframes,urlPolicy,chatProfile,lint,idempotency}.test.ts`.
**Spec:** §5 in full. The adversarial corpus (≥ 40 vectors) includes: `:root{}`/`html`/`body` selectors; `[data-ft-surface="shell"]` inside a chat sheet; `@import url(…)`; `url( https://evil )`, `URL("//x")`, `url("data:text/html,…")`; `position:fixed` in chat vs shell; `z-index: 99999` in chat vs `10` passing; `scroll-behavior:smooth` in chat; `overflow:hidden` on `.ft-message-log` in chat vs on `.ft-turn` passing; `@keyframes fadeIn` collision rename; `animation: fadeIn 2s` shorthand reference rewrite; `content: "</style><script>alert(1)</script>"` (value survives as text, output contains no `<`); `!important` passthrough; `var(--theme-accent)` read; `--my-var: 1` custom property write; `@media (prefers-reduced-motion: reduce)` wrapper; empty input; garbage input (`{{{`); exact-131 072-char sheet passes, +1 fails schema (tested at route level in slice 3).
**Verify:** `bun run --cwd packages/shared test` green; `bun run typecheck` clean.

### Slice 3 — Character sheet, end-to-end on the character page
**Goal:** the full authoring→storage→injection→viewer-control loop, character surface only.
**Files:** migration v5 in `backend/src/db/migrate.ts`; `CharacterCardSchema.customCss`; `repositories.ts` row/mappers/statements; `characters.ts` routes (schema flows via existing TypeBox validation — assert 422 on over-cap); `frontend/src/lib/components/custom/CustomStyleOutlet.svelte`; `studio/CustomCssPanel.svelte` (+ `StudioShell` tab `{ id: 'css', label: 'CSS' }`, `StudioTab` union); `prefs.svelte.ts` `hideCustomStyling`; SettingsSheet accessibility section toggle; character page root: `data-ft-surface="character"` + `<CustomStyleOutlet scope="character" css={character.customCss} />`; `boundaries.test.ts` A-U2b amendment; `frontend/unit/{customStyleOutlet,customCssPanel}.test.ts`; `backend/test/{migrations,repositories,routes/characters}.test.ts` additions.
**Spec:** save path = sanitize report + lints, raw stored, `parse-fatal` blocks (§6); LivePreview: `CustomCssPanel` embeds `SurfacePreviewMock` (static mock of hero + bubble + narrator using the real hooks under a `data-ft-surface="character"` root) with the outlet attached — the preview is the sanitized truth; kill-switch in the same release (C8 pairing is non-negotiable); element picker v0: a "Hooks" side list generated from the manifest, click-to-copy selector.
**Acceptance tests:** (a) p2-style `:target` carousel rebuilt in showcase markdown + a character sheet (two `#slide` anchor links, CSS-only scroll-snap row) — the D1 "majority" claim verified; (b) ledger file created with zero entries; (c) fresh-install demo character page shows the sanitized sheet.
**Verify:** §10.3 steps 1–4.

### Slice 4 — Global shell
**Goal:** shell routes are themeable; P1's global theme lands here, merged.
**Files:** `packages/shared/src/schemas/shellTheme.ts` + `shellToThemeOverrides` + `DEFAULT_SHELL_THEME`; `resolveTheme` `global` input (A-U1) + cascade tests; `SettingsRepository.getShellTheme/putShellTheme`; `routes/settings.ts` endpoints; `frontend/src/lib/state/shellTheme.svelte.ts`; `components/custom/ShellSurface.svelte` (attr + `--chrome-*` inline overrides + outlet + scrim); wrap Foyer/personas/Studio routes; `+layout.svelte` eager `shellTheme.load()` + `data-ft-motion` attr (C9); `prefs.forceSolidChrome` + SettingsSheet Appearance section (chrome tokens, labels, CSS editor reusing the panel component, scrim slider, solid-chrome toggle); `ThemeEngine` + character page pass `global`; `--chrome-text/--chrome-font/--chrome-card-radius` consumers in TopBar/NavDrawer/cards with fallbacks; `frontend/unit/{shellTheme,shellSurface,cssVars}.test.ts` updates.
**Spec:** §2.4 chrome-token mapping; absent doc = byte-identical chrome (fallback test); `forceSolidChrome` ⇒ `--chrome-scrim: 1` and no `backdrop-filter` on chrome; density token maps to the card padding/gap scale.
**Verify:** §10.3 steps 5–7.

### Slice 5 — Graduation batch 1 (D7 enablers — ships **before** chat)
**Files:** `CharacterThemeSchema.decor` + `fx`; `CharacterCardSchema.labels`; `DecorLayers.svelte` (chat + character roots); `app.css` preset keyframes + `data-fx` mappings; AestheticPanel decor/motion/label controls; `AssetScope 'fonts'` (backend sniff/limits/store/routes; 4 MiB); font manager UI + `@font-face` snippet insert; `ActionHub` label; `ShellTheme.labels.foyerTitle` → Foyer header; schema/repo/API tests; `backend/test/assets/fonts.test.ts`.
**Verify:** §10.3 step 8.

### Slice 6 — Chat scope
**Goal:** the reading surface goes live under the conservative profile with full viewer protection.
**Files:** `ChatViewport` root: `data-ft-surface="chat"` + outlet (`scope="chat"`, `css={character.customCss}`); chat profile already in policy data (slice 2) — this slice is activation + UX: lint panel shows chat-specific explanations from the same tables (C7); `hideCustomStyling` verified to kill both surfaces' sheets; C-series lands in `AGENTS.md` §4 + `docs/development.md §6.3` + `docs/architecture.md` (§11.2 token bridge, §11.3 surfaces) + `docs/schema.md` v5; `boundaries.test.ts` final shape.
**Spec:** §5.3 chat profile enforced; guard block live (C9); U4–U7 suites re-run green (streaming scroll/CLS/frame tests are the regression net).
**Verify:** §10.3 steps 9–11.

### Slice 7 — Presets & the Alice showpiece
**Files:** `frontend/src/lib/custom/presets.ts` (four curated starter sheets: *Terminal*, *Manuscript*, *Window*, *Night Market* — each lint-clean, reduced-motion-safe, ≤ 8 KB); CSS panel "Start from a preset" row; `backend/src/db/seeds/characters.ts` Alice gains a ~60-line showpiece `customCss` (gothic gold: hero banner tint, `ft-bubble-char` parchment edge, slow `glow` preset complement, one `content:` label swap) + `seed.test.ts` asserts presence and `sanitizeCss`-clean; `db:seed` refresh instructions in the PR.
**Verify:** §10.3 step 12.

---

## 9. Tricky traps & failure modes

### 9.1 Sanitizer & policy

| Trap | Symptom | Guard |
|---|---|---|
| Sheet contains `</style>` inside a `content:` value | Breaks out of the style element under naive `innerHTML` injection | Outlet sets `textContent` (no HTML parsing — C2) **and** the integrity pass rejects `<` in regenerated output |
| Author `@keyframes fadeIn` vs the site's own keyframes (`sonner-*`, presets) | Last-defined wins globally; author confusion or broken site animation | Per-sheet rename `ftkf-<scope>-<n>-<name>` + reference rewrite (C5); duplicate same-name definitions renamed distinctly with a `note` |
| Selector casing/whitespace tricks (`[DATA-FT-SURFACE=…]`, `url( "https://…" )`) | Policy bypass via normalization gaps | css-tree parses and **regenerates** selectors/values before matching; policy runs on the canonical form |
| Author writes `[data-ft-surface="shell"]` inside a chat sheet | Cross-surface escalation | Selector dropped + `cross-surface` report (C4 step 1) |
| `@media { .ft-message-log { overflow: hidden } }` in chat | Scroll-follow breaks *inside* a media block | Policy recurses into `@media`/`@supports`/`@container` — there is no nesting depth at which the chat profile relaxes |
| `@font-face` with `src: url('/assets/characters/…')` | Font served from an image scope | `@font-face` src restricted to `/assets/fonts/` + `data:font/` + `local()` (§5.5) |
| `z-index: calc(1 + 10)` or `z-index: 99999` in chat | Sheet covers drawers/dialogs | Chat z-index accepts integer literal ≤ 10 or `auto` only; anything else drops (§5.3) |
| Author `--x` collides with a site custom property | Last-defined wins globally | Accepted (documented): custom properties are document-scoped by nature; author `--theme-*` writes additionally lose to the surface root's inline values (§2.3); prefix discipline on selectors is what matters |
| Sheet saved from a stale tab | Silent overwrite of CSS edits | `customCss` rides the existing `expectedUpdatedAt` OCC (P9) — stale write ⇒ 409 dialog, nothing merged |
| Author relies on `!important` against component styles | Escalation war | Allowed (D5); lints L6 count; hooks make it rare — a rising count is a hook-gap signal, not an author failing |

### 9.2 Save path & editor UX

| Trap | Symptom | Guard |
|---|---|---|
| Sanitizer silently rewrites the stored sheet | Author opens editor, sees different code than they wrote; comments gone | **Raw is canonical.** Storage keeps the authored text verbatim; sanitization is derived at save-report and render. Only `parse-fatal` blocks save |
| Report shown after save only | Author discovers strips after committing | Report + lints run live (150 ms debounce) on the same function the outlet uses — preview is the sanitized truth |
| Element picker suggests hashed/Toolwind classes | Brittle sheets; the 1,811-`!important` path | Picker lists **manifest hooks only** (C1) — the contract surface, nothing else |
| Two editors for the same sheet (Janitor's trap) | Overwrite loops, lost work | One editor (Studio CSS tab for characters; SettingsSheet Appearance for shell); one save path each; autosave + restore banner via existing `CharacterDraft` |
| `hideCustomStyling` confusion | "My theme vanished" vs "the app looks default" | Toggle copy distinguishes: *Hide custom styling* (sheets) vs *Neutral reading theme* (`disableCharacterThemes`, tokens) — both under "Accessibility & comfort" |

### 9.3 SPA & render lifecycle

| Trap | Symptom | Guard |
|---|---|---|
| Sheet injected for chat persists after navigating to Foyer | Shell gets chat styles (or vice versa) | Outlet lifecycle = surface lifecycle; `$effect` cleanup removes the element (C12); `data-ft-sheet` attr makes strays visible in devtools |
| Hot reload during dev leaves orphan style elements | Phantom styles in dev only | Acceptable; dev-only; document in troubleshooting |
| Shell theme fetched per-route | Flash of neutral chrome; wasted 128 KB refetches | Eager `load()` in `+layout.svelte` + module-level store cache + BroadcastChannel sync |
| `data-ft-surface` on a removed wrapper after refactor | Sheets silently stop matching | C1 DOM-presence tests bind hooks to components; a hooks-test failure catches the removal before release |
| Character page uses `resolveTheme` directly (not `ThemeEngine`) | Global layer forgotten on one surface | Character page's `$derived` gains `global` in the same slice that adds it to `ThemeEngine`; a cascade unit test in shared enumerates both entry points |

### 9.4 Performance (C13)

| Trap | Symptom | Guard |
|---|---|---|
| Animating `width`/`top`/`box-shadow` in keyframes | Layout/paint thrash mid-stream (U4 frame budget) | L1/L2 lints; presets demonstrate the compositor-only pattern; reduced-motion guard is the hard stop |
| `backdrop-filter` on large areas, mobile GPU | Jank on phones, battery drain | L8 lint + `(pointer: coarse)` guidance; scrim/solid-chrome toggle is the viewer's escape |
| 128 KB sheets × parse on every surface mount | Style recalc cost on navigation | Sanitize per (raw, scope) with a small memo (last sheet per surface); parse cost ~ms for 128 KB — measured in slice 6 DoD |
| Fixed decor layers repainting on scroll | Scroll jank in chat | DecorLayers are `pointer-events: none`, `will-change: auto` (no hint unless preset says so), capped at 2 (schema) |
| Themed CLS regressions | U6 violated by sheet (e.g., `content` swap changing layout) | DoD Lighthouse pass on themed pages; `text-wrap`/measure guidance in the hook reference |

### 9.5 Import & migration

| Trap | Symptom | Guard |
|---|---|---|
| Imported card carries hostile CSS (future importer) | Stored XSS-adjacent content | Render sanitization is unconditional (§4.3) — storage is never trusted; D4 strips on import regardless |
| Migration run on a DB with active WAL writer | Locking | Existing rules: stop `bun run dev` first (AGENTS.md §1); v5 is one `ALTER TABLE`, transactional, idempotent by version check |
| `custom_css` on `CharacterSummary` | List payloads balloon | Field excluded from summary (A-S8 pattern) — route test asserts absence |
| Export includes another author's CSS | License/attribution confusion (future sharing) | Export = the author's own card verbatim (C11); credit conventions deferred with sharing |

---

## 10. Definition of Done & verification

### 10.1 Global acceptance criteria

1. `bun run typecheck` 3/3 clean (`svelte-check` 0/0); `bun run test` green incl. all new suites; `bun run build` succeeds; chat route entry chunk unchanged ± 2 KB (the outlet carries only the cached-import loader — the parser loads on first sheet render, enforced by the boundaries test; panel code split into Studio/settings routes).
2. `bun run db:migrate` upgrades v4 → v5 in one transaction; `bun run db:check` reports `user_version=5`, `custom_css` column audit clean; a v5 database opened by a v4 build refuses (existing guard).
3. **Sanitizer proof:** the slice-2 adversarial corpus passes; idempotency case passes; `sanitizeCss` on the Alice showpiece yields zero `dropped-*` issues.
4. **Scope proof:** with a chat sheet containing `position: fixed` + `[data-ft-surface="shell"] .ft-topbar { … }`, DevTools shows neither rule matching anything in chat; the shell sheet's identical selector works on the Foyer.
5. **Viewer supremacy proof:** toggling *Hide custom styling* removes every `data-ft-sheet` element from the DOM (Elements panel) on all three surfaces; *Neutral reading theme* additionally forces neutral tokens; `prefs.reducedMotion = 'on'` freezes a `breathe`-preset sheet's animation.
6. **Prompt isolation (P4 unchanged):** a `SENTINEL-7731` inside `custom_css` never appears in a compiled prompt (`builder.test.ts` case extended).
7. **Perf:** Lighthouse on a themed character page (6 images + sheet) and a themed chat (streaming 200 tokens): CLS ≤ 0.02 (chat, U6) / ≤ 0.05 (page, P10), frame budget held during streaming (dev overlay shows no dropped-frame storms), A11y ≥ 95, axe 0 critical/serious on `/`, `/character/[id]`, `/chat/[chatId]`, `/personas`.
8. **Mobile:** 390×844 pass over Foyer (shell-themed), character page, chat with decor layers + fx preset; bottom sheets intact; no horizontal scroll from any preset.

### 10.2 Required tests (normative additions)

**`packages/shared/test/`** — `customCss/{sanitizeCss,scope,keyframes,urlPolicy,chatProfile,lint,idempotency}.test.ts` (corpus §8 Slice 2); `schemas.test.ts` (`customCss` maxLength, `decor.maxItems=2`, `fx` enum, `ShellTheme` shape, `CharacterPatch` flows `customCss`); `theme/cascade.test.ts` (`global` layer order; `global` + `disableCharacterThemes` short-circuit).

**`backend/test/`** — `migrations.test.ts` (v4→v5, nullable, idempotent); `repositories.test.ts` (customCss round-trip incl. comments preserved; duplicate carries it; summary excludes it; over-cap rejected); `routes/characters.test.ts` (422 over-cap; PATCH null clears); `routes/settings.test.ts` (shell-theme GET default `{}`, PUT round-trip, 422 on bad doc); `assets/fonts.test.ts` (woff2/woff/ttf/otf sniff; SVG/HTML rejected; 4 MiB cap).

**`frontend/unit/`** — `hooksManifest.test.ts` (C1); `customStyleOutlet.test.ts` (C2/C8/C9/C12 matrix, async loader: no sheet ⇒ no parser fetch; kill-switch ⇒ no element); `customCssPanel.test.ts` (report rendering, parse-fatal blocking save, raw-not-rewritten); `shellTheme.test.ts` (store sync, defaults); `shellSurface.test.ts` (chrome var overrides + fallbacks, scrim toggle); `boundaries.test.ts` amended (A-U2b, C2, no static `customCss` sanitizer imports outside loader/panel/tests); `studio.test.ts` parity scan extended (schema key `customCss` has an editor binding).

### 10.3 Step-by-step verification

```bash
bun install && bun run typecheck && bun run test
bun run db:migrate && bun run db:check                    # user_version=5, custom_css audit ok
bun run dev                                                # http://127.0.0.1:5173
#  1. Slice 1: grep any component → hooks come from HOOKS.*; no ft- literals; all suites green.
#  2. Slice 2: bun run --cwd packages/shared test — sanitizer corpus green (40+ vectors).
#  3. Slice 3: Studio → CSS tab: paste a sheet with one legal rule + one position:fixed-on-message-log rule;
#     report lists the chat-only block (as a lint note while on character scope it passes); preview shows sanitized truth;
#     Save → reopen editor → raw text + comments byte-identical.
#  4. Slice 3: showcase markdown with #slide anchors + sheet carousel → character page: arrows scroll the row (D1 proof).
#  5. Slice 4: SettingsSheet → Appearance: set chrome accent + foyer background + customCss (ft-foyer-header rename via content);
#     Foyer reflects it; navigate to a character page → shell styles absent, chrome neutral there.
#  6. Slice 4: two tabs: change shell theme in A; B converges via BroadcastChannel without reload.
#  7. Slice 4: forceSolidChrome on → chrome surfaces solid (no blur); off → frosted again.
#  8. Slice 5: AestheticPanel: 2 decor layers + fx=breathe + label override; fonts: upload woff2, insert @font-face snippet,
#     font-family token set → preview uses it; Network panel: zero remote requests.
#  9. Slice 6: chat with the same character: decor layers render fixed (our component), author position:fixed in sheet is
#     stripped (report confirms); z-index 11 dropped, 10 passes; streaming 200 tokens → scroll-follow + frame budget hold.
# 10. Slice 6: prefs.reducedMotion=on → all sheet + preset motion freezes; hideCustomStyling → all data-ft-sheet elements gone.
# 11. Slice 6: Lighthouse passes per §10.1.7; 390×844 pass per §10.1.8.
# 12. Slice 7: fresh db:seed → Alice showcase carries the showpiece sheet, sanitize-clean; preset row inserts editable starter.

bun run build && bun run start
curl -si http://127.0.0.1:3000/api/settings/shell-theme | head -1            # 200, {} default
curl -si -X PUT -H 'content-type: application/json' -d '{"customCss":"body{}"}' \
  http://127.0.0.1:3000/api/settings/shell-theme | head -1                    # 200 (stored raw; render strips body{})
curl -s http://127.0.0.1:3000/ | grep -c 'data-ft-sheet'                      # 0 in HTML (client-injected only)
# Attach to PR: sanitizer corpus output, themed-page Lighthouse reports (2), Elements-panel kill-switch clips (3 surfaces),
# migration db:check pre/post, 390×844 screenshots, Alice showpiece render.
```

---

## 11. Explicit scope boundaries — deferred

Not in this blueprint: author HTML beyond showcase markdown (D1 — ledger-gated); per-story (chat-instance) sheets; remote assets of any kind (P3 stands); theme marketplace/sharing infrastructure; a `themes` table with named themes (D3 — settings doc until named themes are wanted); AI-assisted authoring; code-mirror-class CSS editor (textarea + lints first); selector-level per-surface sub-scoping inside one sheet beyond `data-ft-surface` targeting; `@scope`/`@layer` support; untrusted-import hardening (designed for, implemented with the importer); sandboxed sheet previews in a worker.

Handed forward: the hook manifest (every future surface joins by declaring a scope key + hooks), the policy-as-data tables (new scopes/profiles are rows), the ledger (D1's tripwire), and the outlet pattern (one per surface, forever).

---

## 12. Execution order

1. **shared hooks:** `manifest.ts` + tests → 2. **shared sanitizer:** `css-tree` dep, `policy.ts` (data), `sanitizeCss.ts`, `lint.ts`, corpus tests → 3. **character end-to-end:** migration v5, schema, repo, routes, outlet, CSS panel + picker v0 + mock preview, `hideCustomStyling`, ledger file, boundaries amendment → 4. **shell:** `ShellThemeSchema`, settings repo + endpoints, `shellTheme` store, `ShellSurface`, `resolveTheme.global` (both entry points), chrome var wiring, Appearance editor, `forceSolidChrome`, `data-ft-motion` in layout → 5. **graduations:** `decor` + `DecorLayers`, `fx` presets, labels, font assets + snippet flow → 6. **chat activation:** chat outlet, lint explanations from policy data, C-series into `AGENTS.md`/`docs/*`, full DoD sweep → 7. **presets + Alice + polish.** Each slice ships green (`typecheck`, `test`, `db:check`) and independently.

---

## 13. Transcription flags (per the brief: one paragraph each, then move on)

**Stage 1 §5 says "store the sanitized sheet (the raw draft is kept for editing)" while §7 promises "comments preserved."** These conflict if taken literally — sanitization drops comments, so a stored-sanitized sheet would lose them on reload, recreating Janitor's most-complained-about editor behavior. This blueprint resolves the conflict as: **store the raw, derive the sanitized** (§4.3, §6), which preserves both locked intents (comments survive; injection is always sanitized) and makes the render-time sanitizer the single trust boundary. If the literal reading was meant — two stored columns — it is a one-line change to slice 3, flagged now rather than discovered mid-implementation.

**D5's "per-URL `data:` size sub-cap" is redundant as specified.** A `data:` URL cannot exceed the sheet it lives in, and the sheet is capped at 128 KiB — a separate per-URL cap adds a number that can only ever be ≥ the binding constraint. Transcribed as "bounded by the sheet cap by construction" (C10). If the intent was to keep *many small* URLs from bloating sheets toward the cap, the existing size meter in the editor already surfaces that.
