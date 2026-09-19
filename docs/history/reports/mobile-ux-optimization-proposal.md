# Proposal: Mobile UI/UX Optimization (Mobile-Primary Shell)

**Status:** Proposed / Discussion Draft
**Audience:** FormaTavern Architects, AI Peer Agents, and Core Contributors
**Scope:** Making the app first-class on mobile phones (390px class viewports) without
regressing desktop. Four layers: global overflow hygiene, a header-collapse system,
a minimal bottom navigation bar, and a full-screen settings sheet on mobile.
**Invariants Touchpoints:** C14 (Surface completeness), U1/U2 (Theme cascade, zero
runtime CSS injection), P4 (Showcase containment) plus four new mobile invariants
M1–M4 defined in §8.
**Reference aids (local-only, git-ignored; load-bearing facts restated inline):**
`docs/history/reports/janitorai-behavior/responsive-layout/REPORT.md`,
`docs/history/reports/janitorai-behavior/my-chats-hub/REPORT.md`.

---

## 1. Executive Summary & Problem Statement

Mobile phone users are the primary audience for this app, and today the mobile
experience is broken, not merely unpolished. Screenshots taken on a real phone
(390px class viewport, app served from LAN) show four independent failures:

1. **Settings sheet overflows the viewport** — tab strip clipped at
   `Accessib…`, body rows clipped (`rovider configurations`, `+ New` cut off).
   The dialog shell already adapts (`SettingsSheet.svelte:316`: bottom sheet at
   `max-sm:max-h-[90vh]`, `max-sm:max-w-none`), so the defect is *inside* the
   sheet: the tab strip does not scroll and inner rows (provider cards,
   `grid-cols-[1fr_auto]`, fixed-height panels such as the `h-[420px]` block at
   `SettingsSheet.svelte:1572`) carry desktop min-widths into a 390px box.
2. **Chat top bar is overfull but surviving** — menu, back, name, `patch` pill,
   lore, lock, settings (7 controls in one `h-14`). It fits at 390px only by
   luck of short names. Any longer character name or pill text will clip.
3. **Foyer page is shifted off-screen** — `SANCTUARY` clipped left, `Discover
   Characters` clipped to `scover…`, cards clipped. This is page-level
   horizontal overflow: something forces `body` wider than the viewport and the
   screenshot catches the page mid-scroll. Prime suspect is the shell header
   convention itself: every page header is `flex … justify-between … px-6`
   (`+page.svelte:120`, `chats/+page.svelte:133`, `StudioShell.svelte:66`) with
   no mobile collapse, so logo + pills + `New Character` + settings cannot fit
   390px. `main` adds `max-w-6xl px-6` (48px of padding on a 390px phone).
4. **Studio new-character header overflows** — Back + `1 issue(s)` + Preview +
   Save + `Save & Open` in one `h-14 justify-between`. Same header disease as
   (3), worst case. The section tabs below already scroll
   (`StudioShell.svelte:145` has `overflow-x-auto`); the action row does not
   collapse.

The common thread in (3) and (4) is systemic, not per-component: headers built
for desktop widths with no declared mobile form. Fixing components one by one
will lose; the proposal fixes the system.

---

## 2. Reference Point: What JanitorAI Does (Measured, Not Assumed)

Reverse-observed in-repo (facts restated here because the studies are
git-ignored). JanitorAI is the quality-plus-efficiency model for this proposal:

- **Single breakpoint at 768px.** Probes at 390 / 678 / 768 / 935 / 959 / 1024:
  below 768 a mobile shell, at 768 and above the desktop shell. No intermediate
  tablet shell was found.
- **Mobile shell = bottom nav + collapsed top bar.** Bottom nav
  (`.pp-mnb-wrapper`, 52px, fixed) with three tabs (Home, Chats, avatar);
  top bar collapses to logo + search icon + bell. Desktop top bar (logo,
  `Home`, full `Search Ctrl K`, `Create a Character`, bell, avatar menu) only
  exists at ≥768px.
- **Search is essential in the hub, decorative in the foyer.** On mobile the
  homepage search collapses to an icon, but `/my_chats` keeps a full search
  box. Lesson applied in §5: the `/chats` hub keeps search on mobile.
- **The keyboard owns the bottom edge.** The chat view shows *no* bottom nav
  at 390px; the composer replaces it, with a mobile-specific hint (`Press
  button to send chat` vs desktop `Enter to send`). Lesson applied in §6:
  bottom nav hides on `/chat/:id`.

What is deliberately *not* copied: Janitor's purple cards, its offset
`?page=N` pagination, and its exact tab set. The breakpoint discipline and the
bottom-nav-plus-collapsed-topbar shell are copied; the visuals stay FormaTavern.

---

## 3. Goals and Non-Goals

**Goals (quality first):**

- G1: Zero horizontal scroll and zero clipped controls at 390px on every
  in-scope page.
- G2: Thumb-reachable primary navigation on phones (bottom nav), slimmer top
  bars as a consequence.
- G3: Settings usable on phones without a routing change (full-screen sheet).
- G4: A regression guard so desktop-tested work cannot silently break mobile
  again (new invariants M1–M4 + automated smoke test, §8–§9).

**Non-goals:**

- No visual redesign, no new theme, no desktop layout changes beyond what
  mobile hygiene requires.
- No settings *page* in this proposal (deferred; sheet-first per agreement).
- No tablet-specific (768–1024) shell; the 768px binary split is kept.
- SillyTavern is not a reference for this work; its mobile experience is out
  of scope by decision.

---

## 4. Layer 1 — Global Overflow Hygiene (All Pages)

The systematic fix for screenshot (3) and the precondition for everything else:

- **Shell guard:** `overflow-x: clip` on the app shell / `body` so one wide
  child can never shift the whole page. (Guard, not fix: overflowing children
  are still found and fixed; the guard only contains the damage.)
- **`min-w-0` audit:** every flex child that renders text or cards
  (headers, rows, dialog bodies) gets `min-w-0` so truncation works instead of
  forcing width. Known spots: foyer header children, `StudioShell` header
  (`StudioShell.svelte:66-67`), settings rows.
- **Padding discipline:** shell headers and `main` use `px-4` below `md:`,
  `px-6` at/above. Touches `+page.svelte:120/185`, `chats/+page.svelte:133/181`,
  `personas/*`, `character/[id]/+page.svelte:102/136`, `StudioShell.svelte:66`.
- **Tab strips scroll:** any horizontal tab/nav row (`SettingsSheet` tabs,
  `StudioShell.svelte:145` already does) gets `overflow-x-auto` +
  `flex-shrink-0` items plus a no-scrollbar utility (note: `scrollbar-none`
  does not exist — `app.css:139-161` only styles thin scrollbars, so the
  utility must be added; keep a visible scroll hint on touch rather than
  hiding affordance entirely). No tab label may wrap or push.
- **Dialogs fit:** every `dialog` gets `max-width: 100vw` (settings already has
  `max-sm:max-w-none`; verify `NavDrawer`, `ConfirmDialog`, `PersonaPicker`,
  lore/codex drawers the same).
- **Fixed-size audit:** remove or clamp fixed heights/widths that exceed
  phones (`h-[420px]` settings panel → `min-h` + internal scroll;
  `min-w-[140px]` inputs → `min-w-0 w-full` below `md:`).

**Acceptance:** at 390px, `document.documentElement.scrollWidth <= innerWidth + 1`
on every §10 page, verified by the §9 smoke test. The guard is applied to both
`html` and `body` (body overflow propagates to the viewport otherwise) and is
verified at the element the smoke measures (see M1 amendment in §8).

---

## 5. Layer 2 — Header Collapse System at `md:` (768px)

One convention, applied per page, instead of four bespoke fixes. Each shell
header declares what survives below `md:`; everything else hides behind an
existing menu or disappears:

| Page | Desktop (≥768, unchanged) | Mobile (<768) |
|---|---|---|
| Foyer (`+page.svelte:120`) | logo + Foyer pill + Chats link (`:133-140`) + Personas (`label hidden sm:inline`) + `New Character` (label kept, `:158`) + settings | logo + `New` icon-only + settings; Chats and Personas links hidden (both live in the bottom nav); Foyer pill hidden. Label rule: surviving `New` keeps its label only if ≤2 other tappables remain, else icon-only |
| Chats hub (`chats/+page.svelte:133`) | breadcrumb + Foyer + Personas + `New Character` (label already hides below `sm:`, `:165`) + settings | back/Foyer + settings + `New` icon-only; Personas hidden (bottom nav); search box **kept** (Janitor hub lesson) |
| Chat `TopBar` — explicit exception to the ≤4 rule below | menu + back + name + patch pill + lore + lock + settings (7 controls; names already `truncate` in `:61-81`) | same set, tightened: `px-3`, smaller gaps, `patch` pill collapses to status dot (StateHud glyph kept, label dropped; full HUD stays in the override popover); names keep existing `truncate`. Justification: the chat surface has different constraints than shell surfaces (all 6 controls are session-critical and the bar is already icon-only); the ≤4 rule applies to shell headers only |
| Studio (`StudioShell.svelte:66`) | back + Saved/Unsaved status pill (`:79-87`) + `1 issue(s)` + Preview + Save + `Save & Open` + conditional Discard (`:107-115`) | back + issues + `Save & Open` (primary) + overflow menu for Preview/Save/Discard; status pill collapses to dot. No sticky bottom action bar in v1 (it would compete with the bottom nav for the bottom edge; if crowding is later found, the bar must stack *above* the nav with explicit geometry — C-R1) |
| Character profile | header + actions | back + truncated title + primary action; meta stacks (matches Janitor 2-col → 1-col collapse) |

Rules: shell headers hold no more than 4 tappable elements below `md:`
(chat `TopBar` excepted above); every hidden action must remain reachable
(bottom nav, overflow menu, or drawer), never deleted. This table is the M4
oracle — the smoke asserts exactly the mobile column, so every tappable
control appears here with a disposition and a label rule.

---

## 6. Layer 3 — Bottom Navigation Bar v1 (New, Mobile Only)

**Recommendation: build it.** Rationale: the primary audience holds the phone
one-handed; core destinations (Foyer, Chats) are currently top-bar-only and the
top bars are already overflowing. A 4-destination bar fixes reachability *and*
unclutters headers (Layer 2 depends on Personas living here). Cost is one small
component over existing routes — no routing changes, no data changes.

- **Component:** `frontend/src/lib/components/nav/BottomNav.svelte`,
  mounted in `frontend/src/routes/+layout.svelte:42` (current layout renders
  only children, toaster, and PIN modal, so this is a clean insertion).
- **Destinations:** Home (`/`), Chats (`/chats`), Personas (`/personas`).
  A center `+` New action was tried and removed: creation is infrequent, the
  foyer and chats headers both keep a compact New button below `md:`, and the
  3-tab bar matches the measured JanitorAI pattern with larger targets.
- **Visibility:** `md:hidden`; hidden on `/chat/:id` (composer owns the
  bottom edge — Janitor rule) and hidden while any full-screen sheet/dialog
  that owns the bottom is open if overlap is found in review.
- **Mechanics:** 52–56px height, `env(safe-area-inset-bottom)` padding
  (resolves non-zero: `app.html:5` already ships `viewport-fit=cover`, and
  safe-area precedents exist in `PinPromptModal`, `ChatViewport`, `NavDrawer`),
  `backdrop-blur` chrome bar reusing the existing `chrome-bar` utility and
  `--chrome-*` tokens (U1; no new theming system), `aria-current` active
  states, ≥48px targets. Keyboard: `interactive-widget=resizes-content` is
  already in the viewport meta, so a fixed bar rides above the keyboard
  instead of fighting it; hide-on-focus-within-input is the fallback if
  review finds overlap.
- **C1/C14 mechanics (C-R4):** register a hook ID (e.g.
  `HOOKS.chrome.bottomnav`) in `packages/shared/src/hooks/manifest.ts` plus
  `hooksManifest.test.ts` expectations and `customCss/partition.ts`
  chrome-scope routing *before* the component exists; host the bar in
  `+layout.svelte` inside `<div data-ft-surface="shell" style="display:
  contents">` following the PIN-modal precedent (`+layout.svelte:49`),
  whose in-file comment documents why fixed positioning is unaffected —
  otherwise explicitly accept `:root` neutral chrome and say so.
- **Bottom-edge compensation (C-R1):** a fixed bar overlays the last ~52–68px
  of scrolling surfaces (`ShellSurface` roots are `min-h-screen` normal flow),
  so every scrolling page gets a bottom-padding token below `md:` (content
  clears the bar). Studio decision: **keep the nav visible and pad** —
  `StudioShell.svelte:64` is `h-[100dvh] overflow-hidden` with internally
  scrolling columns, so its columns get bottom padding of nav height +
  safe-area; hiding the nav on studio was rejected because the `+ New`
  destination would lose its active state on the very route it opens.
  Toaster (`fixed bottom-4 right-4`, `Toaster.svelte:7`) gets a bottom offset
  below `md:` so it renders above the bar, not inside it.
- **Explicitly deferred:** badges/counts, long-press menus, swipe gestures,
  tablet landscape treatment.

---

## 7. Layer 4 — Full-Screen Settings Sheet on Mobile (No New Route)

Per agreement: sheet-first, page only if review rejects the sheet.

- **Shell:** below `md:`, `SettingsSheet.svelte:316` goes from
  `max-sm:max-h-[90vh]` bottom-sheet to near-full-screen (`max-h-[100dvh]`,
  `h-[100dvh]`, square top corners, `max-w-[100vw]`), keeping the desktop
  centered `max-w-2xl` dialog untouched.
- **Tabs:** tab strip becomes horizontally scrollable (`overflow-x-auto`,
  no wrap, `flex-shrink-0`), so `Accessibility` et al. are reachable instead
  of clipped (screenshot 1).
- **Body:** inner rows wrap (`min-w-0`, grids collapse to one column below
  `sm:` — precedents exist at `SettingsSheet.svelte:1244/1437`), provider
  editor and config rows scroll internally (`overflow-y-auto`, never page
  width). Fixed `h-[420px]` panel becomes `min-h` + internal scroll.
- **A11y:** focus trap and `Esc`/backdrop close retained; tab state stays in
  the existing `activeTab` rune (no deep-linking, which is what a page would
  have added).

---

## 8. New Mobile Invariants M1–M4

| ID | Rule | Enforced by |
|---|---|---|
| M1 No horizontal overflow, un-gameable (C-R3) | At 390px, ~700px (breakpoint edge, both sides), and 768px, every in-scope page satisfies **both** `documentElement.scrollWidth <= innerWidth + 1` **and** a key-element rect sweep (every header control, card, tab, and dialog: right edge ≤ `innerWidth + 1`, left edge ≥ −1). Rationale: the Layer 1 `overflow-x: clip` guard alone turns the `scrollWidth` assertion green while content stays visually clipped — the rect sweep (the same primitive M4 needs) closes the loophole; per-container `scrollWidth` on scrolling regions is an accepted equivalent | Playwright smoke (§9) — hard gate |
| M2 Bottom nav discipline | Below 768px the bottom nav is visible with 3 destinations (Home, Chats, Personas), except on `/chat/:id` and open bottom-owned sheets; at ≥768px it is absent. Smoke asserts labels plus `aria-current` correctness | Smoke + review checklist |
| M3 Sheets fit | Every dialog/sheet fits `100vw × 100dvh`, scrolls internally, never pushes page width | Smoke + checklist |
| M4 Headers never clip | Every shell header shows all its §5 mobile-declared controls fully (no clipped text/buttons) at 390px | Smoke (key-control visibility against the §5 table) + checklist |

Static review checklist (fast, catches ~70%): headers declare mobile sets at
`md:`; tab strips scroll; dialogs `max-w-[100vw]`; flex children `min-w-0`;
no fixed `h-/w-/min-w-` exceeding phones without a mobile override.

---

## 9. Regression Guard: Why Current Tests Cannot Catch This (and What Will)

Stated plainly so agents plan correctly: the current frontend suite
(`frontend/unit/`, e.g. `surfaces.test.ts`) walks source text under happy-dom.
There is no layout engine, so overflow is invisible to it. Desktop-tested work
will keep breaking mobile until a real browser asserts geometry.

- **New: Playwright mobile smoke, local hard gate first (C-R5)** — one spec
  file, new devDependency, exposed as a root script (e.g.
  `bun run test:mobile`) alongside `bun run test`. No `.github/` workflow
  exists in this repo, so CI wiring is an explicit follow-up task, not part
  of this proposal's gate. Execution specifics the implementation plan must
  pin down: install via the Bun toolchain but run the runner explicitly
  (`bun x playwright` vs system Node — `@playwright/test` is a Node program,
  so the mode must be stated); `webServer` strategy of production build +
  `bun run start` on :3000 (adapter-static target, avoiding the Vite dev
  overlay); seeding via `bun run db:seed` against a scratch DB, never the
  developer's; auth PIN-free via localhost mode. Coverage: 390×844 plus
  ~700px and 768×1024 edge checks; visit `/`, `/chats`, `/personas`,
  `/character/new`, one seeded `/character/:id`, one seeded `/chat/:id`,
  and open Settings + NavDrawer on the foyer. Assert M1 (both halves),
  M2 visibility rules, M3 for open sheets, and visibility of the §5
  mobile-declared header controls.
- **Manual acceptance (once, on a real phone):** the six §10 pages at 390px,
  keyboard open and closed on `/chat/:id`, plus a standalone-PWA top-edge
  check (`black-translucent` status bar overlays sticky headers in installed
  mode; browser-tab mode is unaffected). Screenshots attached to the
  walkthrough.

---

## 10. Acceptance Scope

Must-pass (redesigned/verified): Foyer `/`, Chats hub `/chats`, Character
profile `/character/:id`, Studio new/edit (`/character/new`, `/edit`),
Settings sheet (opened from foyer), Chat view `/chat/:id`.
Regression-only (verify unbroken, no redesign): Personas `/personas` (already
clean on inspection), Dev `/dev`, auth PIN modal, toasters.

---

## 11. Verification Plan

1. `bun run typecheck` — shared + backend + `svelte-check`, 0 errors/warnings.
2. `bun run test` — full existing suite green (no behavior changes outside
   responsive classes and the new nav component).
3. New Playwright mobile smoke green at 390px (M1–M4) — the hard gate for this
   proposal.
4. `bun run db:check` — untouched DB, still pristine.
5. Manual phone pass over §10 with keyboard open/closed, screenshots kept
   next to the walkthrough.

---

## 12. Peer Agent & Review Topics

1. **Bottom-nav destination set:** Home / Chats / `+` New / Personas, or
   should the 4th slot be Menu (NavDrawer) instead of Personas? Recommendation
   is Personas (daily identity switching beats a drawer shortcut).
2. **Studio mobile actions:** header-overflow-menu only, or also a sticky
   bottom action bar with `Save & Open`? Recommendation: menu first, bar only
   if review finds crowding.
3. **Chat `TopBar`:** collapse `patch` to a dot below `md:`, or move state HUD
   into the lore drawer? Recommendation: dot, keep everything else.
4. **Playwright vs lighter harness:** Playwright is the recommendation, but if
   reviewers prefer reusing the headed-Edge CDP harness from the JanitorAI
   studies, the assertions (M1–M4) are harness-agnostic.
5. **Settings page graduation criterion:** graduate to a `/settings` route if
   **any** of these holds at 390px after Layer 4: (a) the active tab and the
   first interactive control of its panel cannot both be on-screen without
   scrolling more than ~50% of the sheet body; (b) any provider-editor input
   still clips or wraps into unusability; (c) tab-switch → first-control
   round trips exceed two scroll gestures on more than one tab. Any one
   triggers a `/settings` blueprint, carrying `?tab=` deep-linking from day
   one (the actual added value of a page over a sheet).

---

## 13. Next Steps & Artifact Registry

- **File Location:** `docs/history/reports/mobile-ux-optimization-proposal.md`
- **Reference aids:** `docs/history/reports/janitorai-behavior/responsive-layout/REPORT.md`
  (§2 shell facts restated above), `my-chats-hub/REPORT.md` (hub search/carousel).
- **Subsequent step:** on approval, draft the implementation plan (shell guard +
  header matrix + `BottomNav.svelte` + settings sheet + Playwright smoke), then
  a walkthrough with phone screenshots and smoke output.

---

## 14. Appendix — Breakpoint Inventory (C-R2)

Every shell-relevant responsive rule in the codebase with a move/stay decision
for the 768px (`md:`) shell standard. Unlisted `sm:`/`lg:` rules inside panels
and grids are content layout, not shell, and stay as-is unless the smoke finds
otherwise.

| Location | Rule | Decision |
|---|---|---|
| `SettingsSheet.svelte:316` mobile sheet | `max-sm:` (640) bottom-sheet trigger | **Move to `md:`** — one shell breakpoint; the sheet becomes full-screen below 768 per Layer 4 |
| `NavDrawer.svelte` drawer form | was `max-sm:` bottom-sheet (80vh) | **Changed to a left slide-in at all widths** (`85vw` below `md:`) — the ☰ trigger promises a side panel, so the drawer keeps the desktop form instead of morphing into a bottom sheet; this also removes all `max-sm:` drawer rules |
| Foyer/chats `New Character` label | foyer keeps label all widths (`+page.svelte:158`); chats hides below `sm:` (`chats/+page.svelte:165`) | **Stay, then converge** — §5 matrix declares per-page label rules; the drift is documented, not silently kept |
| Header `hidden sm:inline` labels (Personas etc.) | `sm:` toggles | **Stay** — hiding *earlier* (larger screens) is harmless; the matrix only constrains what survives below `md:` |
| `SettingsSheet.svelte:1244` grids (`md:`) vs `:1437` (`sm:`) | mixed collapse points | **Stay** — inner content may collapse earlier than the shell; shell standard governs chrome, not panel grids |
| Studio editor/preview split (`StudioShell:102, 141-143`, `lg:`) | `lg:` two-pane | **Stay** — content density decision, orthogonal to the shell |
| New: bottom nav, header collapse sets, sheet full-screen | — | **`md:`** — the single shell breakpoint, matching the measured JanitorAI split |
