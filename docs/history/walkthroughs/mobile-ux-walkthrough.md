# Mobile UI/UX Optimization (Mobile-Primary Shell) — Walkthrough

This walkthrough documents the design, implementation, and verification of the
mobile-primary shell: overflow hygiene, a header-collapse system at `md:`
(768px), a minimal bottom navigation bar, a full-screen settings sheet on
mobile, and a Playwright geometry smoke test enforcing invariants M1–M4.
Implements `docs/history/reports/mobile-ux-optimization-proposal.md` with all
six review conditions (C-R1–C-R6) from `mobile-ux-optimization-review.md`
folded in; no separate implementation plan was written per user instruction.

---

## 1. Architectural Summary & Invariant Compliance

| Requirement / Invariant | Implementation Mechanism |
|---|---|
| M1 No horizontal overflow, un-gameable | `overflow-x: clip` guard on `html, body` (`app.css`) plus per-child fixes; smoke asserts **both** `scrollWidth` and key-element rect sweeps (C-R3) |
| M2 Bottom nav discipline | `BottomNav.svelte` (`md:hidden`, `ft-bottomnav`), hidden on `/chat/*`; smoke asserts visible-with-4-destinations below 768, absent at 1280 |
| M3 Sheets fit | Settings full-screen below `md:`, scrolling tab strip, internal scroll; smoke asserts open-dialog box inside viewport |
| M4 Headers never clip | §5 header matrix of the proposal (corrected per C-R6); smoke asserts header/main/nav/dialog rects inside viewport |
| C1 Hook contract | `HOOKS.chrome.bottomnav` registered in the shared manifest; no hardcoded `ft-` literals (existing test enforces) |
| C14 Surface hosting | BottomNav mounted in `+layout.svelte` inside `display: contents` `data-ft-surface="shell"` host — the PIN-modal precedent (C-R4) |
| U1/U2 | Only static Tailwind utilities (`md:`, `max-md:`, `env()` arbitrary values); new `scrollbar-none` via `@utility`; no runtime CSS injection |

Deviations from the proposal, all deliberate: `partition.ts` needed **no**
change — it only splits showcase/chat partitions and shell chrome was never
partitioned (the `ft-topbar` precedent confirms); the chat `TopBar` keeps all
six controls as the granted ≤4 exception; studio keeps the nav visible with
padded columns (C-R1 pad decision, not hide).

---

## 2. Changes Made

### 2.1 Shared Shell Foundation

- **File:** `frontend/src/app.css`
  - `overflow-x: clip` on `html, body` with `@supports not` fallback to
    `hidden` (guard on both elements: body overflow propagates to the viewport).
  - New `scrollbar-none` `@utility` (Tailwind v4 has no such utility; `app.css`
    only styled thin scrollbars) for tab strips.
- **File:** `packages/shared/src/hooks/manifest.ts`
  - `chrome.bottomnav: 'ft-bottomnav'` (44 → 45 hooks).

### 2.2 Headers & Mains (Layers 1+2, §5 matrix with C-R6 corrections)

- `routes/+page.svelte` — header `px-4 md:px-6`, `min-w-0` clusters; Chats and
  Personas links `hidden md:flex` (bottom nav covers them); `New Character`
  icon-only below `md:`; Foyer pill hidden below `md:`; main `px-4 md:px-6`,
  `max-md:pb-24` (nav clearance).
- `routes/chats/+page.svelte` — same treatment; search box kept on mobile;
  `New` icon-only below `md:` (converging the drift the review found: chats
  already hid the label below `sm:`, foyer did not).
- `routes/personas/*`, `routes/character/[id]/+page.svelte` — `px-4 md:px-6`,
  `min-w-0` + truncate, back-link text hidden below `md:`; character page
  Chats/Personas links `hidden md:flex`; mains `max-md:pb-24`.
- `nav/TopBar.svelte` + `hud/StateHud.svelte` — gaps tighten below `md:`;
  StateHud collapses to status dot (label, chips, sparkles `hidden md:`; full
  HUD stays in the override popover). The ≤4-tappables rule explicitly does
  not apply to this bar (granted exception, matrix states why).
- `studio/StudioShell.svelte` — header `px-4 md:px-6`; Foyer text, `/`
  separator, and full status pills hidden below `md:` (dot with `title`
  instead); issues badge compacts to count; Preview toggle kept; Save/Discard
  move to a `more-horizontal` overflow menu below `md:` (`mobileMenuOpen`
  state); primary becomes `Save & Open` on desktop, `Save` label below `sm:`;
  workspace grid gets `max-md:pb-[calc(3.75rem+env(safe-area-inset-bottom))]`
  so editors clear the nav (C-R1 pad decision).

### 2.3 Bottom Nav v1 (Layer 3)

- **New:** `frontend/src/lib/components/nav/BottomNav.svelte` — fixed
  `bottom-0 z-40 md:hidden` chrome bar, `env(safe-area-inset-bottom)` padding,
  Home / Chats / Personas, `aria-current`, ≥48px targets, `ft-bottomnav`
  hook. (A center `+` New action was removed after review: creation is
  infrequent and both headers keep a compact New button; 3 tabs match the
  measured reference pattern.)
- **Modified:** `routes/+layout.svelte` — mounts `<BottomNav/>` in a
  `display: contents` shell host; `showBottomNav` hides it on `/chat/*`
  (composer owns the bottom edge).
- **Modified:** `ui/Toaster.svelte` — `max-md:bottom-[calc(4.5rem+env(...))]`
  so toasts render above the bar.
- **Modified:** `ui/Icon.svelte` — `home` and `message` icons (lucide paths);
  no home/chat icon existed.

### 2.4 Settings & Drawers (Layer 4, C-R2 breakpoint moves)

- `settings/SettingsSheet.svelte` — mobile trigger `max-sm:` → `max-md:`;
  below `md:` the sheet is full-screen (`h/max-h-100dvh`, square, borderless,
  `p-4`); tab strip `overflow-x-auto scrollbar-none` with `shrink-0` tabs.
- `nav/NavDrawer.svelte`, `dialogs/ConfirmDialog.svelte` — bottom-sheet
  triggers `max-sm:` → `max-md:` (single 768px shell breakpoint); confirm
  dialog also `p-4` on mobile. Inner settings grids already collapse at
  `sm:` and stay (content, not shell, per §14).

### 2.5 Regression Guard (C-R5, local-first)

- **New:** `frontend/playwright.config.ts` + `frontend/e2e/mobile-shell.spec.ts`
  (24 tests, 3 projects: 390px mobile, 700px edge, 1280px desktop). Scratch
  config (`authMode: none`), scratch DB, production server
  (`bun src/index.ts --port 4317` over `frontend/build`), PIN-free loopback.
- **Scripts:** `frontend:test:mobile` (`bun x playwright test`),
  root `test:mobile` (build + smoke). CI wiring deliberately deferred —
  no `.github/` exists in this repo.
- **Updated:** `frontend/unit/hooksManifest.test.ts` (45 hooks + BottomNav
  source assertions), `frontend/unit/surfaces.test.ts` (layout hosts 2
  shell divs: PIN modal + BottomNav).

---

## 3. Verification & Test Results

1. **Typecheck:** `bun run typecheck` — shared, backend, `svelte-check`
   0 errors 0 warnings. (One transient mid-edit parse failure in StudioShell
   was re-checked clean; the flagged line was verified byte-correct.)
2. **Unit suites:** shared 215 pass; backend 350 pass / 46 files;
   frontend 248 pass / 36 files (includes updated C1/C14 invariant tests).
3. **Mobile smoke (new):** `bun run test:mobile` — **23 pass, 1 skip**
   (desktop settings-fit skip by design) across mobile-390, edge-700,
   desktop-1280: M1/M4 geometry on `/`, `/chats`, `/personas`,
   `/character/new`, `/character/eldrin-the-mage`, seeded `/chat/:id`;
   M2 nav visible-with-4-labels below 768, hidden on chat + desktop;
   M3 settings dialog inside viewport.
4. **Build:** `bun run build` clean (pre-existing chunk-size warning only).
5. **DB:** `bun run db:check` pristine (WAL, FKs, v8, fts5, parity ok).
6. **Manual phone pass:** not done in this session — no device harness here.
   Required before closing: the §10 six-page pass at 390px, keyboard
   open/closed, plus the standalone-PWA top-edge check. The smoke is the
   repeatable gate; the phone pass is the one-time acceptance.

---

## 4. Post-Implementation Fix: Settings Tab-Strip Collapse

User report (desktop, before any phone testing): opening Generation reshaped
the tab row; opening Appearance hid it almost entirely.

- **Reproduced** in headless Chromium via a temporary spec (since deleted):
  tab strip 14px tall against 24px scroll height with 18px buttons —
  vertically clipped, worse on taller tab bodies.
- **Root cause: my own Layer 1 change.** Adding `overflow-x-auto` to the
  strip turned it into a scroll container, which zeroes its flexbox automatic
  minimum size; the height-constrained dialog (`max-h-85vh` + `flex-1` body)
  then squeezed the strip instead of the body. Taller tab bodies squeezed
  harder — matching both symptoms exactly.
- **Fix:** `shrink-0` on the strip (one class). Verified: strip 35px, buttons
  full 34px, pixel-identical across Provider/Generation/Appearance/Narrative;
  screenshot confirmed. The `StudioShell` tab bar already carried `shrink-0`
  next to its `overflow-x-auto` — the precedent was in-repo all along.
- **Checklist amendment (applies to all future work):** any `overflow-*` added
  to a flex child of a height-constrained container must be paired with
  `shrink-0` (or an explicit height), or the container will eat the child.
- **Harness fix in passing:** `bun test` also scans `*.spec.ts`, so e2e specs
  are named `*.e2e.ts` with Playwright `testMatch` set accordingly; the
  temporary repro spec was deleted. Full suites re-verified after both fixes:
  frontend 248 pass, smoke 23 pass / 1 skip.

## 5. Follow-Up: Chats-Hub Truncation on Real Phones + Sheet Drag

User report after the above landed: foyer clean, but `/chats` still truncated
at the right edge on a real phone, and the full-screen settings sheet drifted
down while finger-scrolling its body.

### 5.1 Chats truncation: `mx-auto` disables flex stretch

- **Reproduced** with a 100-char unbroken character name: `main` measured
  **1152px** (exactly `max-w-6xl`) at a 390px viewport; every descendant
  inherited the width. Seed data never triggers it — short names fit.
- **Root cause, deeper than the first guess.** The first fix attempt
  (`min-w-0` on the row's truncate spans) changed nothing, because the break
  was ancestral: `ShellSurface` root is `flex flex-col`, and `main` carries
  `mx-auto`. Auto cross-margins disable flex stretching, so `main` sized to
  fit-content (longest unbroken word) instead of the container. The earlier
  `min-width: 0` shell rule was necessary but insufficient — nothing was
  squeezing `main`; it was never stretched to begin with.
- **Fix:** `w-full` next to every `mx-auto max-w-*` main (7 routes) — the
  classic centered-container pattern. Verified: `main` 390px with the wide
  data present; names/titles now ellipsis via the row-level `min-w-0`
  truncate fixes (hub name span, hub chat title, foyer card name, TopBar
  name/title), which were kept as defense-in-depth.
- **Checklist amendment:** centered containers are always
  `w-full mx-auto max-w-*`, never `mx-auto max-w-*` alone, inside any flex
  parent. The smoke now covers it: a permanent `M1 hardened` spec seeds a
  100-char unbroken name/title and sweeps all `main` descendants (26 pass
  / 1 skip across the three viewports).

### 5.2 Sheet drag: overscroll chaining + bottom-anchored recentering

- **Diagnosis (no repro possible headless):** `showModal()` already locks the
  page, so the drift is (a) finger scrolls chaining past the body scroller
  and panning the fixed sheet, and (b) `m-auto` centering reacting to
  Chrome's toolbar-driven `dvh` changes.
- **Fix:** dialog gets `overscroll-none` + `max-md:m-0` (width is already
  100vw, so centering is moot; the sheet pins instead of recentering); body
  gets `overscroll-contain` so scrolls end at the inner scroller. Same pair
  applied to `NavDrawer`, which shares the fixed-dialog drift risk. Real-phone
  confirmation still belongs to the user.

### 5.3 Drawer honesty + lock relocation (user-driven follow-ups)

- **NavDrawer is a left slide-in on mobile again.** The `max-sm:` 80vh
  bottom-sheet form contradicted its ☰ trigger, which promises a side panel;
  the drawer is now `85vw` full-height with a rounded right edge at all
  widths (desktop form unchanged). Verified by screenshot at 390px. The
  overscroll pair from §5.2 was kept (same drift risk, same pattern).
- **PIN lock moved TopBar → drawer header.** Per owner decision (rarely used,
  TopBar is session chrome): removed from `TopBar.svelte` (plus its now-unused
  `authStore` import), added next to **New** in the drawer header under the
  same PIN-configured condition and behavior. Trade accepted: 1-tap → 2-tap
  lock, status visible only with the drawer open.
- **Foyer/chats New buttons read `+ New` below `md:`** (full `New Character`
  on desktop): a bare `+` is ambiguous, but the full label risks overflow
  under long custom foyer titles. Same treatment in both headers.
