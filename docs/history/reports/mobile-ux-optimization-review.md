# Mobile UX Optimization (Mobile-Primary Shell) — Proposal Review

**Status:** Review complete. Agree with the direction, the four-layer decomposition, the 768px breakpoint discipline, the bottom-nav recommendation, and the regression-guard diagnosis — the last being the single most valuable contribution of the document. Six conditions proposed as entry criteria for the implementation plan; one internal contradiction, two inventory inaccuracies, and three unstated mechanics gaps (bottom-nav content compensation, breakpoint reconciliation, M1 clip-detection) found during verification (§4). Environment verification also surfaced facts that make the proposal *more* feasible than it claims (§2.3).
**Date:** 2026-09-18 UTC
**Reviewed:** `docs/history/reports/mobile-ux-optimization-proposal.md` (hereafter "the proposal")
**Method:** Every current-state claim was verified against source — `frontend/src/routes/+page.svelte`, `routes/chats/+page.svelte`, `routes/character/[id]/+page.svelte`, `routes/personas/+page.svelte`, `routes/+layout.svelte`, `lib/components/settings/SettingsSheet.svelte`, `lib/components/studio/StudioShell.svelte` (plus `studio/IdentityPanel.svelte`), `lib/components/nav/TopBar.svelte`, `lib/components/nav/NavDrawer.svelte`, `lib/components/chat/ChatViewport.svelte`, `lib/components/ui/Toaster.svelte`, `lib/components/custom/ShellSurface.svelte`, `lib/components/hud/StateHud.svelte`, `lib/components/auth/PinPromptModal.svelte`, `frontend/src/app.html`, `frontend/src/app.css`, `packages/shared/src/hooks/manifest.ts`, `frontend/package.json`, root `package.json`, `frontend/unit/surfaces.test.ts`, `.gitignore`. The JanitorAI study was re-read from the local git-ignored checkout (`docs/history/reports/janitorai-behavior/responsive-layout/REPORT.md`; the ignore rule was verified at `.gitignore:15`). The proposal's phone screenshots are not in the repo, so each §1 failure symptom was re-derived from markup and width arithmetic before being accepted. Invariants cited by ID per `.agents/AGENTS.md` §4.

---

## §1 — Verdict

**Agree, conditionally.** The proposal is approved to proceed to the implementation-plan round, subject to the six conditions in §5 being resolved there. In summary:

- The four §1 failures are real, not rhetorical — each was re-derived from markup and arithmetic without the screenshots (§3.1).
- The systemic diagnosis (one undeclared header convention, not four component bugs) is correct, and the codebase itself contains the proof: the same "New Character" control hides its label below `sm:` in the chats hub but not in the foyer (§3.2).
- The JanitorAI §2 facts were re-verified against the study and are accurate row by row; nothing was misquoted, and the study's own caveats were inherited honestly (§2.2).
- The regression-guard diagnosis is literally true: `surfaces.test.ts` walks source text with `readFileSync` + string matching; happy-dom has no layout engine; desktop-tested work will keep breaking mobile until a real browser asserts geometry (§2.1 #14).
- The plan is *more* feasible than the proposal claims: the viewport meta already ships `viewport-fit=cover` + `interactive-widget=resizes-content`, three safe-area precedents already exist in the exact components being touched, and the `chrome-bar` utility already exists (§2.3).

The conditions are not objections to the direction; they are places where implementing the proposal *as literally written* would ship a hidden defect (a fixed bottom nav permanently covering studio content), a self-satisfied test gate (M1 passing under the clip guard while content stays invisible), or a broken convention chain (C1 hook manifest, C14 surface hosting). Each is argued in §4 and consolidated in §5.

---

## §2 — Claim audit (proposal claims vs. actual code)

### 2.1 FormaTavern current state

| # | Proposal claim | Verified evidence | Verdict |
|---|---|---|---|
| 1 | Settings dialog shell already adapts (`SettingsSheet.svelte:316`: bottom sheet at `max-sm:max-h-[90vh]`, `max-sm:max-w-none`) | `:316` class string matches verbatim | Accurate |
| 2 | The defect is *inside* the sheet: tab strip does not scroll | `:344` — `flex border-b` with no overflow rule; strip carries ≥5 tabs (provider, generation, appearance, narrative, a11y) | Accurate |
| 3 | Provider rows use `grid-cols-[1fr_auto]` | `:526` — `grid grid-cols-[1fr_auto] items-center …` | Accurate |
| 4 | Fixed `h-[420px]` settings panel at `SettingsSheet.svelte:1572` | `:1572` — wraps `CustomCssPanel scope="shell"` | Accurate |
| 5 | Grid-collapse precedents exist at `SettingsSheet.svelte:1244/1437` | `:1244` (`grid gap-2 md:grid-cols-2`), `:1437` (`grid grid-cols-1 sm:grid-cols-2`) | Accurate — but note the two precedents use *different* breakpoints (`md:` vs `sm:`), which feeds §4.4 |
| 6 | `min-w-[140px]` inputs need mobile override | Found at `IdentityPanel.svelte:226` (`flex-1 min-w-[140px]`) — in the **studio**, not settings | Accurate as a codebase fact; location differs from the §4 context |
| 7 | Foyer header `flex … justify-between … px-6` (`+page.svelte:120`); `main` adds `max-w-6xl px-6` | `:120`, `:185` | Accurate |
| 8 | Chats hub header same convention (`chats/+page.svelte:133`), `main` `px-6` | `:133`, `:181` | Accurate |
| 9 | Studio header `h-14 justify-between px-6` (`StudioShell.svelte:66`) | `:66` | Accurate — and **understated**: the live header also carries a Saved/Unsaved status pill (`:79-87`) and a conditional Discard button (`:107-115`) |
| 10 | Studio section tabs already scroll (`StudioShell.svelte:145`) | `:145` — `overflow-x-auto` present | Accurate |
| 11 | Chat top bar: menu, back, name, patch pill, lore, lock, settings — 7 controls in one `h-14`, `px-3` | `TopBar.svelte:38` (menu), `:48` (back), `:90` (StateHud), `:100` (lore), `:112` (lock), `:123` (settings), center name block `:60-85`; header `:32-34` | Accurate |
| 12 | TopBar names need `min-w-0 truncate` | Center block already has `overflow-hidden` + `truncate` spans (`:61-81`) | Partially pre-solved; the prescription is a tightening, not a from-scratch fix |
| 13 | `+layout.svelte:42` renders only children, Toaster, PIN modal — clean BottomNav insertion | `:42` `{@render children()}`, `:44-52` PIN modal, `:54` Toaster; nothing else | Accurate |
| 14 | Dialogs need `max-width` verification (NavDrawer, ConfirmDialog, PersonaPicker, lore drawers) | NavDrawer **already has** a mobile bottom-sheet form below `sm:` (`NavDrawer.svelte:100`: `max-sm:h-[80vh]`, `max-sm:max-w-none`, `max-sm:rounded-t-2xl`) plus safe-area padding (`:99`); the personas reassign modal is `w-full max-w-md` inside `p-4` (`personas/+page.svelte:125-126`) and fits 390px | Partially already done; the audit remains worthwhile for the remaining dialogs |
| 15 | Test suite walks source text under happy-dom; no layout engine; overflow invisible to it | `surfaces.test.ts:5-17` — literally `readdirSync`/`readFileSync` + string matching; `happy-dom` ^17.1.8 is the only DOM env | Accurate — the central §9 claim is verified verbatim |
| 16 | Playwright would be a **new** devDependency | Absent from root and frontend manifests; no e2e config anywhere in the repo | Accurate |
| 17 | Smoke "runs in CI on every PR" | No `.github/` directory exists; no workflow has ever been committed (remote exists: `github.com/osa219/FormaTavern`) | **Aspirational** — the infrastructure does not exist yet (C-R5) |

### 2.2 JanitorAI reference study (proposal §2)

| # | Proposal claim | Study evidence | Verdict |
|---|---|---|---|
| 1 | Single breakpoint at 768px; probes at 390/678/768/935/959/1024; no tablet shell | REPORT §1 table + "effectively 768px"; §5 documents the 768-run confound (measured 678) | Accurate |
| 2 | Mobile shell = bottom nav (`.pp-mnb-wrapper`, 52px, fixed, three tabs) + collapsed top bar (logo + search icon + bell); desktop top bar only ≥768px | REPORT §2 | Accurate |
| 3 | Search essential in the hub, decorative in the foyer — hub keeps the box on mobile | REPORT §6.1 (`searchInput: true` at 390 on `/my_chats`, unlike the homepage) | Accurate |
| 4 | Chat view shows no bottom nav at 390; the composer replaces it; hint text differs | REPORT §6.3 | Accurate |
| 5 | (Implicit) the bottom-nav safe-area padding is a Janitor-verified behavior | Not measured — REPORT §7 open question 1 explicitly lists "safe-area padding" as un-captured | **Not established** — the proposal's `env(safe-area-inset-bottom)` is our own design (a good one; see §2.3), but it should not be read as an observed JanitorAI fact |

### 2.3 Environment facts the proposal missed (all in its favor)

1. **The viewport meta already does the hard part.** `app.html:5` ships `viewport-fit=cover` and `interactive-widget=resizes-content`. Consequences: (a) `env(safe-area-inset-*)` resolves non-zero in both browser and standalone mode, so the Layer 3 safe-area padding is real, not theoretical; (b) the on-screen keyboard *resizes* the layout viewport instead of overlaying it, so a fixed bottom nav rides up above the keyboard rather than fighting it — exactly the property §6's "keyboard-safe" bullet asks for, already in place.
2. **Safe-area precedents already exist in the exact areas being touched:** `PinPromptModal.svelte:44`, `ChatViewport.svelte:415` (composer, with an explanatory comment at `:409`), `NavDrawer.svelte:99`. The `.agents/AGENTS.md` anti-pattern ("interactive modals or toolbars without safe-area inset protection") is already honored; BottomNav joins an established in-house pattern rather than introducing one.
3. **`chrome-bar` already exists** with frosted/solid variants (`app.css:93, 99-100`), driven by the existing `data-ft-chrome` attribute — the "backdrop-blur chrome bar with `--chrome-*` tokens" is reuse, not a new system.
4. **PWA install metadata exists** (`app.html:7-9`: manifest, `apple-mobile-web-app-capable`, `black-translucent`). In standalone mode the status bar overlays content, making `safe-area-inset-top` for sticky headers a real (unmentioned) consideration — see §7.

---

## §3 — Why the review agrees

1. **The four failures are real.** Without the screenshots, each symptom was re-derived from markup and arithmetic at 390px: the foyer header demands ≈ 480-490px (left cluster ≈ 190-200px: logo + uppercase title + Foyer pill; right cluster ≈ 280-290px: icon-only Chats + icon-only Personas — labels are already `hidden sm:inline` at `:139/:149` — plus "New Character" *with* its label, plus settings) against 342px of available width (390 − 48 `px-6`): certain overflow, matching screenshot (3). The settings tab strip demands ≈ 500px+ (≥5 tabs × ~90-110px) against ~342px: certain clipping, matching "Accessib…". The `h-[420px]` panel plus dialog chrome inside a 90vh/844px sheet: certain internal squeeze. The chat top bar's six 36px icon buttons + gaps + name: fits only with short names, matching "surviving by luck."
2. **The systemic diagnosis is correct, and the codebase proves it.** The same "New Character" control hides its label below `sm:` in the chats hub (`chats/+page.svelte:165`) but keeps it in the foyer (`+page.svelte:158`) — one control, two behaviors, no declared mobile form. That drift *is* the disease the header matrix cures; per-component patching would replicate it.
3. **The layer ordering is correct.** Overflow hygiene is a precondition for the header collapse (hidden actions must become reachable, not merely invisible), and both are preconditions for meaningful M1/M4 assertions. The shell guard is honestly framed as containment ("guard, not fix") rather than a fix.
4. **The JanitorAI transfer is disciplined.** Measured facts copied (breakpoint, bottom-nav-plus-collapsed-topbar, hub-search, composer-owns-bottom), visuals not copied, deviations declared, and — because the studies are git-ignored (verified) — load-bearing facts restated inline so the document stands alone. Re-verified row by row (§2.2): nothing misquoted.
5. **Bottom nav is load-bearing within the proposal's own logic, not a preference.** Layer 2 *depends* on Personas relocating to the nav; without it the header matrix cannot get below four tappables. The cost claim verifies: no routing, no data, one component mounted at a confirmed-clean insertion point (`+layout.svelte:42`).
6. **Sheet-first settings is the right scope cut.** NavDrawer already demonstrates the mobile bottom-sheet pattern below `sm:`, so Layer 4 extends an in-house pattern rather than importing one; deferring deep-linking is honestly priced as the cost of not building a page.
7. **The regression-guard section is the most valuable part of the document.** Verified literally: the suite walks source text; happy-dom has no layout engine; the failure mode (desktop-tested work silently breaking mobile) is structural. A geometry-asserting browser gate is the only real fix, and the M1-M4 invariant set is the right shape (with the §4.5 amendment).
8. **Invariant alignment holds as claimed.** U2 satisfied by construction — the plan uses only static Tailwind utilities (`md:hidden`, arbitrary `env()` values); no runtime CSS injection anywhere. U1 via existing `--chrome-*` tokens and `chrome-bar`. U5/U6 untouched (nothing transitions layout properties or re-engages scroll follow). C14 is not violated by a fixed nav (it is chrome, not a dialog) — but its hosting must follow the PIN-modal precedent (C-R4). P3/P4, the E-series, S-series, and the DB are untouched; `bun run db:check` staying pristine is a given.

---

## §4 — Defects found in the proposal as written

### 4.1 Internal contradiction: the ≤4-tappables rule vs. the chat TopBar row

§5's rule: "no header may contain more than 4 tappable elements below `md:`." §5's chat TopBar mobile column: "same set, tightened" = menu + back + patch-dot + lore + lock + settings = **six** tappable elements. Either the rule needs an explicit chat-surface exception (defensible — the bar is already `px-3` and icon-only, and the chat surface has different constraints than shell surfaces), or the row is wrong. As written, the plan's own M4 acceptance gate cannot be evaluated for the chat bar, because the oracle (the §5 table) contradicts the rule it is supposed to enforce. Fix in C-R6.

### 4.2 Foyer inventory errors

The §5 foyer desktop column lists a "layout icon" — **no such control exists** in the foyer header (no layout-related markup anywhere in `+page.svelte`). Meanwhile the actual header contains a Chats quick-access link (`:133-140`) that the column omits entirely, and whose mobile disposition (presumably hidden, covered by the bottom nav's Chats destination) is never stated. Minor in isolation, but the §5 table is the M4 oracle — every tappable control must appear in it with a mobile disposition, or the smoke test asserts against a fiction.

### 4.3 Content compensation for the fixed bottom nav is unaddressed

Shell surfaces are `min-h-screen` normal-flow documents (`ShellSurface.svelte:82`) — a fixed 52-56px bar overlays the last ~52-68px of scrollable content on `/`, `/chats`, `/personas`, `/character/:id`. The worst case is Studio: `StudioShell.svelte:64` is `h-[100dvh] overflow-hidden` with internally scrolling columns, meaning the covered strip is *interactive* content (editors, the custom-CSS panel), not a scroll tail — and the proposal keeps the nav visible on studio routes (the `+ New` destination is active on `/character/new`). The proposal's only gesture is hiding the nav "while any full-screen sheet/dialog that owns the bottom is open" — that covers sheets, not page content. Additionally, the Toaster already collides by construction: `fixed bottom-4 right-4` (`Toaster.svelte:7`) renders inside the nav's band. The plan must add: (a) a bottom-padding token for scrolling surfaces below `md:`; (b) an explicit studio decision (pad its columns by nav height, or hide the nav on studio and drop the `+ New` active state there); (c) a Toaster bottom offset below `md:`.

### 4.4 Breakpoint reconciliation is implied but never inventoried

The proposal standardizes the shell at `md:` (768) but never inventories the existing responsive rules it must coexist with: SettingsSheet's mobile form is `max-sm:` (640, `:316`), NavDrawer's bottom-sheet form is `max-sm:` (`:100`), header labels toggle at `sm:` (`hidden sm:inline`), settings grids use both `sm:` (`:1437`) and `md:` (`:1244`), and studio's editor/preview split is `lg:` (`StudioShell.svelte:102, 141-143`). Un-reconciled, the 640-768 band gets a mobile shell (bottom nav, collapsed headers) whose NavDrawer still opens as a side drawer and whose settings sheet has two different mobile triggers. Not fatal, but the "one convention" claim requires a one-page inventory with a move/stay decision per rule (C-R2).

### 4.5 M1 as specified is satisfiable by the guard alone

`documentElement.scrollWidth <= innerWidth + 1` goes green the moment `overflow-x: clip` lands — clipped-but-broken content does not expand `scrollWidth`. The proposal knows the guard "contains the damage" (§4 of the proposal), then makes a damage-containing property its hard gate. Amendment (C-R3): M1 must additionally sweep key elements' bounding rects (right edge ≤ `innerWidth + 1`, left edge ≥ −1) — the same primitive M4 already needs — or measure `scrollWidth` on the scrolling containers themselves rather than only on `documentElement`. Otherwise the suite can pass while screenshot (3) reproduces visually.

### 4.6 The C1/C14 mechanics for BottomNav are unstated

(a) **C1:** the HOOKS manifest (`packages/shared/src/hooks/manifest.ts`) is the sole source of `ft-*` strings. A nav bar authors may want to style needs a hook ID (e.g. `HOOKS.chrome.bottomnav`) registered there, plus the `hooksManifest.test.ts` expectations and `customCss/partition.ts` chrome-scope routing — three files, all touched before the component exists. (b) **C14/token resolution:** `+layout.svelte` sits outside every `data-ft-surface`, so `--chrome-*` vars there resolve to `:root` defaults. The PIN modal solves exactly this by hosting in `<div data-ft-surface="shell" style="display: contents">` (`+layout.svelte:49`) — with an in-file comment explaining why fixed positioning is unaffected by `display: contents`. BottomNav should follow that precedent, or the proposal should explicitly accept neutral chrome and say so (C-R4).

### 4.7 The CI claim references infrastructure that does not exist

No `.github/` directory; no workflow has ever been committed. The gate must first exist as a **local** hard gate (a root script alongside `bun run test`) before any CI claim. Also unspecified: how Playwright executes under the Bun-only toolchain (`bun add -D` installs fine, but `@playwright/test`'s runner is a Node program — AGENTS.md's "Node … never invoke directly" rule is about app runtime, yet the plan should still make the execution mode explicit: `bun x playwright` vs. the system Node); the `webServer` strategy (recommendation: `bun run build` + `bun run start` on :3000 — the adapter-static production target, avoiding the Vite dev overlay); seeding (`bun run db:seed` against a scratch DB, not the developer's); and auth (localhost mode per N9 leaves the shell ungated, so the smoke runs PIN-free) (C-R5).

### 4.8 Minor

- (a) `scrollbar-none` does not exist — `app.css` has custom thin/WebKit scrollbar styling (`:139-161`) but no hide utility. It must be added; also consider whether fully hidden scrollbars are the right affordance for tab strips (a scroll hint matters on touch).
- (b) The §1(4) studio inventory understates the live header: it also carries the Saved/Unsaved status pill and the conditional Discard button (see §2.1 #9).
- (c) The 768×1024 spot-check is fine, but the study's own 678-confound note argues for also asserting at ~700px to pin the breakpoint edge from both sides.

---

## §5 — Conditions (entry criteria for the implementation plan)

| ID | Condition | From |
|---|---|---|
| C-R1 | Specify bottom-edge compensation: per-surface bottom padding below `md:` for scrolling pages, an explicit studio decision (pad vs. hide nav), and a Toaster offset below `md:`. | §4.3 |
| C-R2 | Produce the breakpoint inventory: every existing `sm:`/`md:`/`lg:` shell-relevant rule with a move-to-`md:` / stay decision and a one-line rationale. | §4.4 |
| C-R3 | Amend M1 with key-element rect sweeping (or per-container `scrollWidth`) so the clip guard cannot satisfy the gate alone. | §4.5 |
| C-R4 | Specify BottomNav's C1/C14 mechanics: HOOKS manifest entry + `hooksManifest.test.ts` + `partition.ts` routing; surface hosting via the PIN-modal `display: contents` precedent (or an explicit neutral-chrome decision). | §4.6 |
| C-R5 | Specify the smoke harness as a local hard gate first: root script name, Playwright execution mode under the Bun toolchain, `webServer` (build + start), seed strategy, auth posture; CI wiring as a separate follow-up task. | §4.7 |
| C-R6 | Make the §5 header matrix literal and internally consistent: resolve the ≤4-tappables rule vs. the chat TopBar row (exception or redesign), fix the foyer inventory (remove "layout icon," add the Chats link and its mobile disposition), and state the label rule for every surviving control. The smoke asserts against this table — it must be the truth. | §4.1, §4.2 |

---

## §6 — Answers to the proposal's §12 review topics

1. **Bottom-nav 4th slot — agree: Personas, not Menu.** Persona switching is a repeated primary action (daily identity selection before chatting); the NavDrawer is already one tap away from the chat TopBar's menu button, so a Menu slot duplicates reachability that exists, while a Personas slot removes a trip. JanitorAI's own third slot is the avatar menu — the 4-destination bar is a declared deviation, which the proposal already frames correctly. Corollary worth encoding in C-R6: the foyer and chats-hub Personas links become redundant below `md:` and should hide (their function moves to the nav — "reachable, never deleted" is preserved).
2. **Studio mobile actions — agree: overflow menu first.** The header is more crowded than the proposal's own inventory admits (§4.8b), and a menu (Preview / Save / Discard) with `Save & Open` primary matches existing dropdown patterns. A sticky bottom action bar would compete with the bottom nav for the bottom edge; if crowding is later found, the bar must stack *above* the nav with explicit geometry — it cannot simply be added.
3. **Chat TopBar — agree: patch pill → status dot.** StateHud already renders glyph + label chips (`StateHud.svelte:44-51`); dropping the label below `md:` is a small class change, and the full HUD remains available in the override popover and lore drawer. Moving the HUD wholesale into the lore drawer would hide *live* state behind a drawer — strictly worse.
4. **Playwright vs. the CDP harness — agree: Playwright.** The JanitorAI evidence scripts were exploratory page sweeps; M1-M4 need repeatable assertions, fixtures, and CI-grade reporting — a test runner's job, not a probe script's. The assertion set is harness-agnostic as claimed; the runner choice is about ergonomics and the CI story. Subject to C-R5 (Bun execution detail).
5. **Settings graduation criterion — propose concrete triggers.** After Layer 4 lands, at 390px, graduate to a route if **any** of: (a) the active tab and the first interactive control of its panel cannot both be on-screen without scrolling more than ~50% of the sheet body; (b) any provider-editor input still clips or wraps into unusability; (c) tab-switch → first-control round trips exceed two scroll gestures on more than one tab. Any one → blueprint `/settings`, and since the actual added value of a page is deep-linkable tabs, the route should carry `?tab=` from day one.

---

## §7 — Residual risks (walkthrough checklist items, not blockers)

- **Standalone PWA top edge:** `viewport-fit=cover` + `black-translucent` means sticky headers sit under the status bar in installed mode. Add an explicit safe-area-top check to the manual phone pass (browser tab mode is unaffected).
- **`overflow-x: clip` propagation:** body overflow propagates to the viewport unless the html element also clips. Implement the guard on the element the smoke actually measures, and verify at both `documentElement` and shell level in the same assertion.
- **M2's "4 destinations" literal** couples the smoke to the §12.1 decision. Assert "≥3 items + `aria-current` correctness" instead, or update M2's literal if the slot decision ever changes.
- **Pre-hydration styling:** the `app.html` bootstrap targets `[data-ft-surface="shell"]`; if BottomNav's host carries that attribute (C-R4), the bootstrap vars will style it pre-hydration — verify no flash in the walkthrough screenshots.

---

## §8 — Bottom line

**Agree.** Proceed to the implementation plan with C-R1 through C-R6 folded in as entry criteria. The diagnosis is verified correct, the reference discipline is exemplary, and the regression-guard insight — that the current test suite cannot see layout at all — is the most important sentence in the document and justifies the whole M-series. The conditions exist to make the plan's own acceptance oracles (M1-M4 and the §5 header matrix) literal and un-gameable *before* any code is written; none of them change the direction.
