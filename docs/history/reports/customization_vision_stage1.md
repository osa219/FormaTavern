# Customization Vision — Stage 1 Report: From Token Theming to Creator-Grade Expressive Freedom

**Date:** 2026-09-11
**Status:** For discussion. Direction-level, not implementation. Decision points are marked **⏩ Dn** — these are the places I expect pushback.
**Revision:** 2026-09-11 **rev 2** — amended after the first discussion round: D1 given a concrete revisit trigger (§4.1), D6 reordered shell-before-chat (§10), D7 resolved as an enforced chat-conservative policy (§5, §10), performance posture added (§6.4), Alice/§1 overclaim corrected (§7).
**Inputs:** `docs/history/reports/janitor-profile-customization-study/` (evidence pack), `docs/history/reports/app_observations_and_proposals.md` (P1–P4), the Tolaria design vault (`ethos-and-chameleon-ui`, `styling-as-data-philosophy`, `ui-ux-theme-schema-and-component-binding`, ADRs), and the current codebase (`v0.5.x`, `user_version = 4`).

---

## 0. Executive summary

The vision: **any surface of FormaTavern — global shell, character pages, chat pages, future pages — can be independently restyled by its creator, as deeply as JanitorAI creators restyle their profiles.** The investigation shows that level of expression is achieved with one recipe: *scoped freeform CSS + limited HTML, no JS, stable hooks, a sanitizer, and a viewer kill-switch*. Nothing in that recipe conflicts with our architecture — but two of our current guardrails (invariant **U2** as written, and proposal **P1's "no custom CSS" cap**) do conflict with the vision and should be amended, deliberately and on the record.

The recommended model, in five lines:

1. **Two layers.** Keep design tokens (schema-safe, structured) as the default; add a **custom CSS document per scope** (one per character, one for the global shell) that powers everything tokens cannot express.
2. **Stable hooks.** Every surface ships documented `ft-*` classes + a `data-ft-surface` root attribute. Custom sheets target hooks, never Tailwind internals. Hooks become append-only public API.
3. **One pipeline.** Sanitize on save (with a visible report), sanitize again at render, inject through exactly one outlet component per surface root. This is the A-U2 showcase mechanism generalized — not a new trust boundary invented from scratch.
4. **Viewer supremacy.** A `hideCustomStyling` kill-switch, enforced reduced-motion, and the existing a11y cascade layer stay above all author styling, always.
5. **Progressive tokenization.** Whatever creators repeatedly do in custom CSS (text swaps, fonts, animations, decor layers) graduates into safe tokens over time. Custom CSS remains the permanent escape hatch.

Everything else in this report is the unpacking of those five lines, the honest list of what blocks them today, and the order of work.

> **Rev-2 amendments at a glance:** the rollout now lands the **global shell before chat scope** (the diagnosed §1 first-impression problem gets served sooner); chat scope ships with an **enforced conservative policy** — freedom in what the world looks like, restraint in what can fight the reader — with graduated tokens shipping first as the safe replacements for what gets curtailed; and D1's "revisit if needed" is replaced by a **concrete ledger-based trigger**.

---

## 1. The vision, operationalized

"Expressive freedom everywhere" decomposes into concrete claims this report designs for:

- **Every surface is a canvas.** The global shell (Foyer, navigation, drawers, settings, personas, the future library page), each character's page, and each character's chat are *independently* styleable. They do not have to share a style — a parchment-manuscript Foyer can coexist with an OLED-terminal chat.
- **Creators get capability, not taste.** We ship mechanisms (hooks, sheets, tokens, assets) and guardrails (sanitizer, viewer controls), not aesthetic judgments. The app provides no opinion about what a "good" page looks like beyond the neutral default.
- **The viewer is sovereign.** Anyone reading a page can reduce or disable custom styling at any time. Authors own expression; viewers own their eyes. (Today author and viewer are usually the same person; the model must not assume that forever.)
- **Non-goals for this direction:** author JavaScript (never), remote asset fetching (P3 stands), multi-user/marketplace infrastructure, and anything that touches the narrative engine, streaming, or persistence internals. Customization is presentation-only — it must be able to proceed in parallel with the three-track chat work without entangling it.

---

## 2. Where we stand today

An honest inventory of what exists, because much of the foundation is already built:

| Capability | Status today |
|---|---|
| Per-character design tokens (`CharacterTheme`, ~20 tokens: font, 10 colors, bubble geometry, background) | ✅ Working, schema-validated, consumed via 21 `--theme-*` CSS vars |
| Token cascade (`NEUTRAL → character → bindings → persona → a11y`, invariant U1) | ✅ Working (`resolveTheme` in shared; `ThemeEngine` in frontend) |
| Reactive state bindings (mood → token patch) | ✅ Working |
| Viewer a11y prefs (`disableCharacterThemes`, `disableReactiveTheming`, `reducedMotion`; localStorage only) | ✅ Working |
| Author-authored HTML: showcase markdown + inline-style allowlist (`renderShowcaseMarkdown` + `rebuildStyle`, invariant P4 / Amendment A-U2) | ✅ Working — **this is our existence proof that sanitized author content can live in the app** |
| Local-only asset pipeline (`/assets/*`, `FsAssetStore`, P3) | ✅ Working — fonts can ride this later |
| Studio authoring home (AestheticPanel, ShowcaseEditor, LivePreview, GalleryManager) | ✅ Working — the natural home for the new authoring UI |
| Global shell theming of any kind | ❌ Absent (diagnosed in observations §1, proposal P1) |
| Animations/keyframes, text swaps, custom sections, layout freedom, additional fonts | ❌ Inexpressible — the token schema is finite by construction |
| Stable styling hooks on components | ❌ Absent — components expose only Tailwind utility classes |
| Viewer kill-switch for custom styling | ❌ Absent (nothing to kill yet) |

**The gap is not architectural — it is one missing layer plus a contract.** The token pipeline, the sanitization pattern, the asset policy, and the authoring surface all exist. What does not exist is a sanctioned way for authored *stylesheets* (as opposed to inline styles and tokens) to reach the DOM.

---

## 3. What the reference evidence teaches

Condensed from the JanitorAI study (full pack: `docs/history/reports/janitor-profile-customization-study/`); cited here only where it drives a decision:

1. **The recipe is battle-tested at scale.** JanitorAI serves millions with: profile-scoped freeform CSS + limited HTML, zero JS, a tag/property blocklist, a viewer "disable custom CSS" toggle, and social enforcement. This is an existence proof for exactly the layer we are missing — not a theory.
2. **Stable hooks are the difference between clean customization and a framework war.** Creators targeting stable `pp-` hooks needed ~33 `!important`s; the creator fighting hashed framework classes needed **1,811**. If we ship custom CSS without stable hooks, we are choosing the 1,811 path for our own creators.
3. **No finite token schema can enumerate what creators want.** Text swaps via `::before { content }`, custom keyframes, CSS-only carousels, fake boot loaders, OS-window panels, horizontal-scroll rows — Janitor's community outran every schema, which is why their hook index and template library exist. Tokens must remain the *safe default*, not the *ceiling*.
4. **The depth is real but bounded.** Measured custom CSS was ~55–113 KB per profile. That calibrates storage caps (§8) — this is not an unbounded blob.
5. **Their editor pain is our opportunity.** Two editors that silently overwrite each other, no CSS comments, a buggy picker, no drafts, no mobile path. Every one of those is avoidable with decisions that are cheap *now* (one editor, one save path, comments preserved, OCC drafts) and painful to retrofit.

---

## 4. The target model

### 4.1 Two layers, clearly separated

**Layer 1 — Design tokens (keep, extend).** Structured, schema-validated, safe by construction, portable across imports. Remains the default authoring path and the contract that components consume (`--theme-*` vars). The `styling-as-data` philosophy is fully preserved: *no framework class strings in data, ever.* Tokens are where a11y guarantees live.

**Layer 2 — Custom CSS documents (new).** Authored text documents, sanitized, scoped, capped. This is *not* utility-class soup injected into data fields — it is a distinct document type with its own pipeline, stored beside (not inside) the token schema. It powers everything Layer 1 cannot: selectors, pseudo-elements, keyframes, media queries, layout.

The layers are complementary, not competing: tokens answer "what are this world's colors and typography"; custom CSS answers "what kind of *place* is this world."

**D1 — Author HTML beyond showcase markdown → resolved with a concrete trigger (rev 2).** Janitor's wildest sections (Win95 windows, the p2 carousel) are injected HTML — but note what our pipeline already covers: showcase markdown admits `div`/`span`/`a`/`img`/`details` **with `class` and `id` attributes**, and the character sheet can style those descendants under the character scope. On paper, p2's `:target` carousel is buildable *today* as markdown + sheet; the genuine remaining gap is author HTML **outside** the showcase body (shell chrome, chat chrome). Decision: no free author HTML on chat or shell surfaces now. The vague "revisit if demand proves the gap" is replaced by a concrete trigger: an **HTML-gap ledger** maintained with the blueprint — any creator-desired effect documented as unachievable via (showcase markdown + custom sheet + graduated tokens) is logged with its blocked case; **two logged cases** (or one the project owner calls load-bearing) reopens D1. To keep "covers the majority" verified rather than asserted, slice 3's acceptance tests include rebuilding a p2-style carousel in showcase + sheet.

### 4.2 Surfaces and ownership

Three initial surfaces, matching how content is owned:

| Surface | Scope key (`data-ft-surface`) | Stylesheet owned by | Applies when |
|---|---|---|---|
| Global shell — Foyer, nav, drawers, settings, personas, future library | `shell` | The user (global theme document) | Always (unless viewer kills it) |
| Character page | `character` | The character's author | Viewing that character |
| Chat page | `chat` | The character's author (persona + viewer overrides still apply) | Inside that character's chats |

Future surfaces (library, split-screen workspace, anything the three-track work adds) join by declaring a scope key and hooks — no model change.

**⏩ D2 — One sheet per character, or one per surface per character?** I recommend **one sheet per character**: authors target `[data-ft-surface="chat"]` vs `[data-ft-surface="character"]` explicitly within it. Shared rules (fonts, brand palette) don't get duplicated, and the data model stays boring. The alternative (separate showcase/chat CSS fields) is easier to discover but doubles storage, UI, and import surface for a distinction hooks already express.

### 4.3 The hook contract

Every surface root carries `data-ft-surface="<scope>"`; every styleable region carries a stable `ft-*` class. Initial inventory (full manifest is a Stage-2 deliverable):

- **Shell:** `ft-topbar`, `ft-navdrawer`, `ft-foyer-grid`, `ft-char-card`, `ft-settings`, `ft-library-*`
- **Character:** `ft-hero`, `ft-showcase-body`, `ft-action-hub`, `ft-tag-chips`, `ft-creator-credit`
- **Chat:** `ft-viewport`, `ft-backdrop`, `ft-message-log`, `ft-turn`, `ft-bubble-char`, `ft-bubble-user`, `ft-bubble-npc`, `ft-narrator`, `ft-composer`, `ft-lore-drawer`, `ft-swipe-carousel`, `ft-turn-toolbar`

Contract rules: hooks are **append-only public API** (removing/renaming one is a breaking change, treated like a DB migration); components keep Tailwind for the default look, but hooks are the *documented* styling surface; the manifest is machine-readable so the Studio element-picker and docs cannot drift from the code.

### 4.4 Composition and precedence

Tokens resolve exactly as today, with the P1-agreed addition of the global layer:

```
NEUTRAL → global(shell tokens) → character tokens → state bindings → persona overrides → a11y (supreme)
```

Custom sheets apply **after** token resolution, in document order: shell sheet first, character sheet second (character wins conflicts by order, not by specificity wars). A11y stays supreme by mechanism, not politeness: the kill-switch removes sheets from the DOM entirely, and neutral/a11y token values are applied inline, which beats any stylesheet.

The **token↔CSS bridge** (a genuine upgrade over the reference model): custom sheets may *read* every resolved `--theme-*` var — so a character's sheet automatically follows its own palette, persona overrides, mood bindings, and the `--theme-scheme` light/dark signal. Janitor creators hardcode colors; ours can write `border-color: var(--theme-accent)` and stay coherent with the cascade. Sheets may also define their own custom properties.

---

## 5. Architecture: where the layer lives and how it flows

**Data model (deliberately boring).**

- `characters.custom_css`: new nullable text column, capped (~128 KB — see §8). Sits beside `style` (tokens) and `showcase` (HTML), completing the character's presentation trio.
- Global shell: a settings-keyed JSON document (shell tokens + custom CSS). A named multi-theme library is deferred — single-user app, one active shell theme. **⏩ D3.**
- Import/export: character cards (JSON/PNG) gain `custom_css` when the feature is ready for it — with an "untrusted content" policy question attached (**⏩ D4**, §8).

**Save path.** Studio → validate + sanitize on save → store the *sanitized* sheet (the raw draft is kept for editing) → existing OCC (`expectedUpdatedAt`, P2) unchanged. If the sanitizer strips anything, the author gets a visible report of what and why — never silent mutation, never a hard reject of the whole document.

**Render path.** Exactly one new outlet component per surface root (working name `CustomStyleOutlet`): it receives the sanitized sheet for the active scope and mounts it while the surface is mounted. SPA route change unmounts it — sheets cannot leak across surfaces. The sheet is additionally **auto-scoped at sanitize time** by prefixing every selector with the surface root attribute, so even a malformed rule cannot style outside its surface. Sanitization runs again at render (a cheap pure function) as defense in depth.

**The sanitizer** is a new pure module (`render/customCss.ts`, unit-testable without DOM, in the spirit of `styleAllowlist.ts`) built on a **real CSS parser (AST), not regex**. Important: the existing `rebuildStyle` cannot be reused — it is inline-style-only and explicitly blocks `@keyframes` and `var()`, both of which sheets legitimately need. At-rule policy: `@keyframes` allowed (names rewritten with a sheet-unique prefix to prevent collisions), `@media` allowed (enables author responsive rules), `@font-face` allowed with local sources only, `@import` banned (remote fetch). Selector policy: `:root`/`html`/`body` selectors are neutralized by the prefixing; everything else passes through scoped.

**Asset policy: unchanged.** P3 stands — `url()` targets `/assets/*` or `data:` only. Custom fonts become *uploaded font assets* (GalleryManager gains a font type; `@font-face` with local `src`), which is strictly better than Janitor's Google-Fonts hotlinking: offline-capable, private, no third-party beacons.

**Backend impact: nearly zero.** One additive migration (nullable column + settings keys), one size guard, repository passthrough. The parser, envelope, streaming state machine, and prompt pipeline are untouched — the entire feature is presentation-layer, which is precisely why it can advance in parallel with the three-track chat work.

**Chat critical path, honestly.** Invariants U4–U7 (frame budget, scroll follow, CLS, terminal-event semantics) live in our JS/DOM behavior and are unaffected by stylesheets. A malicious or clumsy sheet *can* visually sabotage chat — and rev 2 strengthens the answer from linting to **enforcement**: the sanitizer's per-scope policy table blocks, in chat scope, raw `position: fixed|sticky`, `z-index` above a ceiling, and `scroll-behavior`/overflow overrides on `ft-message-log` (a sheet reintroducing smooth scrolling would mechanically violate U5 — exactly the class of damage the reading sanctuary must not depend on author discipline to avoid). The sanctioned versions of the curtailed patterns (decor layers, animation presets) ship as tokens *before* the chat slice (§10). Shell and character surfaces keep the permissive profile + lints, and the kill-switch remains the universal remedy everywhere. The principle: **freedom in what the world looks like; restraint in what can fight the reader.**

---

## 6. Theming model

### 6.1 The expression catalog, mapped to our mechanics

Everything observed in the study, and how we'd carry it:

| Creator move (evidence) | Our mechanism |
|---|---|
| Text swaps ("EXPEDITION 33" logo, "HAS MET 12,975 EXPEDITIONERS") | `content` on `::before/::after` against `ft-*` hooks — DOM text stays intact for screen readers |
| Full-bleed scenery, tinted overlays | `ft-backdrop` / `ft-viewport` backgrounds + existing token overlay/blur |
| Card/panel reskins, sepia masks, horizontal rows | Selectors on `ft-char-card`, `ft-turn`, `ft-showcase-body` children |
| Custom keyframes (heartbeat, glitch, ticker, loaders) | `@keyframes` in sheet; enforced reduced-motion guard (§9) |
| No-JS interactivity (accordions, `:target` carousels, hover reveals) | `details/summary` already legal in showcase markdown; `:hover/:target/:focus-visible` in sheets |
| Chrome relabeling, pagination/scrollbar restyle | `ft-topbar`, `ft-navdrawer`, shell-scope rules |
| Custom fonts | Local font assets + `@font-face` (§5) |

### 6.2 Progressive tokenization policy

Custom CSS is the discovery mechanism; tokens are the graduation path. A primitive graduates when it is (a) repeatedly wanted, (b) expressible declaratively, (c) a11y-relevant. First graduation candidates, straight from the evidence:

1. **Text/label overrides** (rename surface labels — the single most common Janitor move).
2. **Font assets as tokens** (`font.family` referencing an uploaded asset, not a hoped-for system font).
3. **Animation presets** (a small enum — `glow`, `float`, `fade-in` — each shipping with a guaranteed reduced-motion variant).
4. **Decor image layers** (fixed, `pointer-events: none` by construction — the page-doll / boot-overlay pattern, safe by schema).
5. **Scrim/chrome strength** (already proposed in P1).

Graduation never breaks sheets: when a token is set it wins (inline resolution); the equivalent custom CSS simply becomes unnecessary.

### 6.3 Reactive bindings × custom animation

Bindings only ever write `--theme-*` tokens; sheets animate presentation properties. The one strobing hazard is a sheet that `transition`s/`animate`s a property that a binding can also change (e.g. animating `color` on a mood-bound bubble). Rule: **lint, don't block** — Studio warns when a sheet targets animation on token-bound properties (the manifest knows which they are); `disableReactiveTheming` and the reduced-motion guard remain the viewer's hard controls. The existing 600 ms token transition anti-flapping measure stays.

### 6.4 Performance posture (added rev 2)

Custom CSS is where rendering jank will come from, and authors cannot be held to code review — so performance is enforced through **budgets + lints + the reduced-motion guard**, with the existing invariants (U4 frame budget, U6 CLS ≤ 0.02) as the acceptance bar. The blueprint will carry the concrete numbers; the posture:

- **Structural caps by design.** At most two sheets active on any page (shell + character), each within the §8 size cap — bounded parse/recalculate cost, orders of magnitude below the ~167-stylesheet chaos measured on the reference site.
- **Keyframe economy.** Lints steer authors to compositor-only properties (`transform`, `opacity`); animating layout/paint properties (`width`, `height`, `top`/`left`, `filter`, `backdrop-filter`, `box-shadow`) warns, and the enforced reduced-motion guard (§9) is the hard stop.
- **Fixed/decor layer budget.** The graduated decor-layer token caps concurrent fixed layers (proposal: ≤ 2 per surface); raw fixed positioning is exactly what the chat-conservative policy removes in the reading surface (§5).
- **Mobile GPU honesty.** `backdrop-filter` and large-area blurs (already in our token set) get area/count guidance plus a `(pointer: coarse)` lint; the 390×844 viewport from the phase-5 DoD stays the test fixture.
- **Per-slice verification.** Every slice's DoD includes a themed-page perf pass — frame budget during streaming, CLS, Lighthouse on a heavily-sheeted character page and chat — with numbers attached, as in phase 5.

---

## 7. Authoring experience

Sequenced in three capability tiers (each tier shippable independently; naming is doc-level, not source-level):

**Tier 1 — make it possible.**
- Studio gains a **Custom CSS panel** (next to Aesthetic/Showcase): plain editor with **comments preserved**, save-time sanitize with a visible strip-report, LivePreview applying the sheet. Character-scoped first.
- The **viewer kill-switch ships in the same release** — shipping author power without the viewer remedy is the one genuinely wrong sequencing option.
- Settings gains the **global shell editor** (same component, shell document).

**Tier 2 — make it good.**
- **Element picker**: click any element in preview → copies its hook selector (Janitor has this and creators rely on it).
- **Hook reference**, generated from the machine-readable manifest (§4.3), browsable in-app.
- **Drafts & conflict handling** via existing OCC: editing the same character in two tabs yields the stale-write dialog, never a silent overwrite. One editor per document, one save path — Janitor's two-editor trap is designed out, not documented around.
- **CSS-aware editing** (syntax highlighting/lint in the editor pane) is a Tier-2 nicety, not a Tier-1 blocker.

**Tier 3 — make it delightful.**
- **Preset sheets** shipping with the app ("terminal", "manuscript", "OS window") — our equivalent of their community template culture, seeding the design space on first install.
- **AI-assisted authoring** ("make my chat look like a snowed-in mountain lodge") — we are an LLM client; this is our home turf, and Janitor already proves creators want it.
- **Alice ships with a showpiece sheet** so character surfaces demonstrate the range on a fresh install. *(Corrected in rev 2: this alone does not resolve observation §1 — that complaint is about the shell itself; its real fix is the shell slice, now ordered before chat.)*

---

## 8. Safety model

**Honest threat model.** FormaTavern today: single-user, localhost-bound (ADR-006 delegated perimeter), content authored by the user or imported from cards they chose. The realistic risk now is *self-inflicted* pages and buggy sheets — not adversarial injection. That calibrates, but does not trivialize, the design: the sanitizer is built as if content were hostile, because the day cards-with-CSS circulate between strangers, it will be. JanitorAI runs exactly this model — blocklist + scoping + viewer toggle — for millions of strangers; it is comfortably sufficient for our personal-use phase and structured to harden later.

**Hard rules from day one (non-negotiable, phase-independent):**
- **No JS, ever**: no `<script>`, no event-handler attributes, no `javascript:`/`vbscript:` URLs, no `expression()`/`behavior`/`-moz-binding`. (HTML side already enforced by the showcase pipeline; the CSS sanitizer mirrors it.)
- **Local URLs only** in `url()` and `@font-face src` (P3); `@import` banned outright.
- **Scope containment**: every rule prefixed under its surface root; keyframes namespaced per sheet.
- **Size caps**: ~128 KB per sheet (evidence: real profiles need 55–113 KB), stored column + save guard. **⏩ D5** on exact numbers.
- **Single outlet**: the one sanctioned injection component per surface root — everywhere else, the existing "no runtime CSS injection" rule stands unchanged.

**Blocklist now, allowlist as the graduation path.** Blocklist (Janitor-proven: ban known-dangerous properties/at-rules/patterns, permit the rest) preserves creative range while risk is low. If shared/imported content ever becomes a real flow, imported sheets get an `untrusted` flag and a **stricter import-time policy** (candidate restrictions: no `position: fixed`, no `content` swaps, no `z-index` — decided in the blueprint). **⏩ D4: does v1 of this feature accept `custom_css` from imported cards at all?** My recommendation: local authoring first; import support lands in a later slice with the untrusted policy designed then.

**What we explicitly accept.** A determined author can make their *own* page ugly or unusable (hiding buttons, unreadable contrast). The remedies are the kill-switch, neutral tokens, and Studio lints — the same answer the reference implementation gives at a million times our exposure.

**Editor-side lints (warnings, not blocks):** fullscreen layers without `pointer-events: none` (shell/character scopes — chat blocks `position: fixed` in the sanitizer, so the lint is moot there); keyframes with strobe-like timing; `outline` removal without a `:focus-visible` replacement; `!important` count creeping up (the hook system's health metric — if lints show creators *needing* it, our hooks have a gap).

---

## 9. Accessibility

The a11y story must be *stronger* than the reference implementation's, not merely equal — it is a stated pillar (U8) and the viewer half of the vision.

- **New viewer pref `hideCustomStyling`** (localStorage, never server — standing rule). Distinct from `disableCharacterThemes`: one removes custom *sheets*, the other neutralizes *tokens*. Surfaced together under one "Accessibility & comfort" control area.
- **Enforced reduced-motion, by us, not by author discipline.** Every injected sheet gets an appended guard: `@media (prefers-reduced-motion: reduce)` + the `prefs.reducedMotion = on` state disables animations/transitions within the surface root. Janitor relies on community convention; we make it structural. Graduated animation presets (§6.2) ship reduced variants by construction.
- **Text swaps stay screen-reader-safe**: `content` replacement is visual-only; the DOM's original text remains in the a11y tree (confirmed mechanism in the study). Lints warn if a swap targets a semantic-critical label.
- **Contrast linting** in Studio: computed bubble/background pairs warn below WCAG AA; the app default remains axe-clean (U8 unchanged — custom sheets are author territory, but we lint rather than abandon).
- **Focus protection**: the sanitizer strips `outline: none`/`outline: 0` unless accompanied by a `:focus-visible` replacement (best-effort, lint-assisted).
- **A11y supremacy is mechanical** (§4.4): inline a11y tokens beat any sheet; the kill-switch removes sheets entirely. There is no author move that outranks the reader.

---

## 10. Migration & rollout

**What must change on the record (the flagged blockers):**

| Statement today | Disposition |
|---|---|
| **U2 — zero runtime CSS injection** (custom properties only) | **Amend** — same pattern as Amendment A-U2: sanitized sheets via the single outlet become legal; the anti-pattern (`createElement('style')` etc.) keeps its force everywhere except the outlet |
| **P1 — "a few designed layout variants, no custom CSS, no layout breaking"** | **Supersede the cap, keep the rest** — P1's cascade, global shell theme, and frosted-chrome toggle all survive; the study's §8 argues the cap permanently caps the vision |
| **`styling-as-data` — no class strings in data** | **Preserved intact** — custom CSS is a separate document type; the token schema never carries selectors or class names |
| **P3 — zero remote asset fetches** | **Preserved intact** — fonts become local assets instead of remote embeds |
| **U1 cascade order** | **Amended** to include the global layer (already P1-agreed); custom-sheet position documented as after-tokens/below-a11y |
| **U8, U4–U7, E/S/P invariants** | **Untouched** — presentation-layer work does not reach them |

**Data migration:** one additive, idempotent migration (nullable `characters.custom_css` + settings keys). No existing data transforms; when sheets are absent, behavior is bit-identical to today. Rollback = ignore the column.

**Suggested slices** (each independently shippable, each keeping the repo DoD — typecheck, tests, `db:check` — green):

1. **Hook contract retrofit** — `data-ft-surface` roots + `ft-*` classes + the machine-readable manifest. Zero behavior change; mechanical.
2. **CSS sanitizer module + tests** — pure, parser-based, no UI; **with per-scope policy tables from day one** (the chat-conservative profile is data in the sanitizer, not a special case). The riskiest single piece, so it lands before anything depends on it.
3. **Character-sheet end-to-end on the character page** — column, Studio panel, outlet, save-report, **viewer kill-switch** (same slice — non-negotiable pairing). Acceptance test includes **rebuilding a p2-style `:target` carousel in showcase markdown + sheet** (verifies the D1 "majority" claim empirically).
4. **Global shell** — shell document (merging P1's global tokens work), shell hooks, settings editor. *Moved up in rev 2: serves the diagnosed §1 first-impression problem sooner, reusing slice-3 machinery.*
5. **Graduation batch 1** — decor-layer token (fixed, `pointer-events: none` by construction, ≤ 2 concurrent), animation presets with reduced-motion variants, text/label overrides. *Moved before chat in rev 2: these are the safe replacements for what the chat policy curtails.*
6. **Chat scope** — outlet in chat under the **enforced conservative profile** (no raw `position: fixed|sticky`, `z-index` ceiling, `scroll-behavior`/overflow overrides on `ft-message-log` blocked — protecting U5/U6 mechanically), enforced reduced-motion guard, lint set v1.
7. **Preset sheets + Alice showpiece** — seeded template culture + character-surface demo content.

Slices 1–4 deliver expressive freedom on the shell and character pages (and fix the fresh-install first impression); 5–6 bring the reading surface online under its stricter profile; 7 polishes. **D6 — resolved (rev 2):** shell lands before chat. One sub-choice kept open: slice 3 remains the pipeline's proving ground (smallest blast radius, static content, single owner); if you prefer the shell as the literal first consumer, that's a viable 3↔4 swap, not a redesign.

---

## 11. What this direction deliberately does not do

- No author JavaScript, on any surface, ever.
- No free author HTML outside the existing showcase markdown pipeline (D1 — resolved with the ledger trigger, §4.1).
- No remote assets, no third-party font CDNs, no tracking-adjacent anything (P3).
- No per-story (chat-instance) stylesheets — character-level only; revisit only if real demand appears.
- No theme marketplace, sharing infrastructure, or multi-user/auth implications — the model is *compatible* with that future without committing to it.
- No changes to the narrative envelope, streaming, prompt, or storage engines.

---

## 12. Open questions — the pushback list

**Resolved in the first discussion round (rev 2):**

- **D1 — resolved.** No free author HTML outside showcase markdown for now; concrete revisit trigger = the HTML-gap ledger (two logged blocked cases, or one called load-bearing by the project owner). Slice 3 verifies the "markdown + sheet covers the majority" claim by rebuilding a p2-style carousel.
- **D6 — resolved.** Shell lands before chat (slice 4 before slice 6); character page remains the pipeline's proving ground at slice 3, with the 3↔4 swap noted as viable.
- **D7 — resolved.** Chat-conservative adopted and *enforced* (per-scope sanitizer policy, not lints): no raw `position: fixed|sticky`, `z-index` ceiling, scroll-mechanics protection on `ft-message-log`. Shell/character surfaces stay permissive. Graduation batch 1 ships first so curtailed patterns have sanctioned replacements. Principle: freedom in what the world looks like; restraint in what can fight the reader.

**Still open for Stage 2:**

- **D2** — One sheet per character (recommended) vs separate per-surface sheets?
- **D3** — Global theme as a settings document (recommended) vs a `themes` table anticipating named themes?
- **D4** — Do imported character cards carry `custom_css` in the first release (recommended: no; add later with untrusted-content policy)?
- **D5** — Caps and allowances: ~128 KB per sheet; `!important` permitted (recommended — needed against component styles; hooks keep it rare); `data:` URLs allowed in sheets with a per-URL size sub-cap?
- **D8** — Hook prefix `ft-` and the manifest-as-source-of-truth approach — fine, or do you want a different contract shape?

---

## 13. Stage 2 preview

Once the direction is agreed, the blueprint will follow the proven shape of `docs/history/blueprints/phase_5_blueprint.md` — explicitly including its **"tricky traps & failure modes"** section. Contents: new invariants (a customization series — hook contract, sanitizer policy, outlet singularity, viewer supremacy, enforced reduced-motion, chat-scope restraint), data model + migration DDL, full sanitizer policy tables (at-rules, properties, selectors, URL policy, **per-scope profiles**), the machine-readable hook manifest, the HTML-gap ledger (§4.1), **performance budgets** (sheet count/size, keyframe property policy, decor-layer cap, mobile GPU guidance, per-slice perf verification per §6.4), file layout, per-slice feature specs, traps (sanitize-report UX, keyframe collisions, SPA leakage, draft conflicts, import policy, scope-policy bypass attempts, mobile perf regressions), and a Definition of Done with verification scripts per slice. One document, execution-ordered by slice — unless the discussion reveals a better shape.
