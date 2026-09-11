# JanitorAI Profile Customization — Investigation Report

**Date:** 2026-09-10 UTC
**Status:** Evidence-backed study. All claims below derive from captured artifacts; no further page visits are needed.
**Companion doc:** `docs/history/reports/app_observations_and_proposals.md` (esp. §1 / proposal P1 — this report argues P1's "no custom CSS" constraint is the wrong direction; see §8).

---

## 0. DIRECTIVE FOR THE REVIEWING AGENT (read first)

**Do NOT re-visit the JanitorAI profile pages and do NOT re-run any browser investigation.**

- The four pages were already captured and inspected in this session. Re-fetching them costs real money/time (their firewall blocks bots aggressively — headless fetches get firewall-walled; only a slow human-like headed run passed) and adds nothing: every number cited here is preserved in the evidence pack.
- Work **only** from: (a) this report, (b) `evidence/` next to it (F12 probe JSONs, extracted styles, capture scripts), (c) screenshots viewable at their absolute temp paths via the `read` tool (it renders images), (d) `app_observations_and_proposals.md` for the connected improvement context (P1–P4).
- If a claim needs checking, check it against `evidence/p*-inspect2.json` or the style dumps — not against the live web. Re-running `evidence/*.mjs` requires the same headed-Edge + CDP setup and is unnecessary for review purposes.

---

## 1. Objective and context

FormaTavern's philosophy is maximal user control over what is on screen: not just a themed chat, but independently styleable **global shell, character pages, chat pages, and every other surface** — they do not all have to share one style. The demo character Alice already has a background image and button theming, which only hints at the range.

The question was: how far does JanitorAI — the reference implementation for creator customization — let creators go, *how* is it done technically, and what lessons transfer to our (larger) ambition? JanitorAI's customization is profile-page-only (not global, chat, or character theming), but within that one surface it is extremely deep. Four creator profiles were studied:

| Key | URL | Creator | Depth |
|---|---|---|---|
| p1 | `janitorai.com/profiles/6874ce55-bb26-4dce-8997-0ee837ef42c0` | @dizzyylua (12,975 followers) | Total conversion — "Expedition 33" theme |
| p2 | `janitorai.com/profiles/70d8bef9-497c-4be8-8f7a-9a8b1de8c05d` | @lonerlove (4,394 followers) | Total conversion — pixel visual-novel / Win95 |
| p3 | `janitorai.com/profiles/c0d395c1-42dc-46e7-b0a0-ccf7e3ae5da0_profile-of-heyaxo` | @heyaxo (40,567 followers) | Heavy conversion — terminal/Sephiroth |
| p4 | `janitorai.com/profiles/19e6816f-7d70-40ea-a3e1-20ececd48ed6_profile-of-mayu-0910` | @Mayu0910 (5,493 followers) | Baseline — no customization (control sample) |

---

## 2. Methodology (so the reviewer can trust the artifacts without redoing them)

1. **Firewall behavior.** Headless Edge screenshots (`--headless --virtual-time-budget`) returned an identical "Access Restricted / blocked by our firewall" wall on all four URLs; `webfetch` returned 403. The block fingerprints automation, not IP.
2. **Working method.** A headed Edge (real UA `Edg/152`, real timers) driven over CDP (`:9222`): homepage warm-up first (cookies/challenge), then per profile ~11s real settle wait, mouse moves, smooth scrolls, and captures at three scroll positions (top/mid/bottom — different animation frames) plus DOM dump plus extracted `<style>` text. Scripts preserved in `evidence/`.
3. **F12 inspection.** A first attempt with one giant `Runtime.evaluate` probe failed silently (no `result.value`); debugging showed small probes work fine (verified: title read, 138 stylesheets on p4, `cssRules` on cross-origin sheets correctly throws `Cannot access rules`). The successful approach was **12 tiny probes, one question each** (`evidence/inspect2.mjs`), all results in `evidence/p*-inspect2.json`. A follow-up micro-probe (`evidence/logo-probe.mjs`) confirmed the text-swap mechanism via computed `::before/::after`.
4. **Docs.** JanitorAI's official help articles (new profile editor guide, CSS guides, code collections) and the community CSS carrd were fetched and are summarized in §7 — they corroborate every mechanism observed live.

---

## 3. What the pages look like (view screenshots, don't re-capture)

All screenshots render with the `read` tool from these absolute paths:

- p1: `C:\Users\osama\AppData\Local\Temp\opencode\janitor-study\p1-human-{top,mid,bottom,full}.png`
- p2: `.../p2-human-{top,mid,bottom,full}.png`
- p3: `.../p3-human-{top,mid,bottom,full}.png`
- p4: `.../p4-human-{top,mid,bottom}.png` (baseline)
- (`warm-human-*.png` = homepage warm-up; `-full.png` files are 1.7–7.3MB.)

**p1 (@dizzyylua):** black + gold serif world. Site logo replaced by "EXPEDITION 33"; full-bleed painted backdrop with grunge/brush masks; STATUS / ABOUT THE PAINTRESS / BOUNDARIES / F.A.Q as accordion tabs; follower count rewritten as "HAS MET 12,975 EXPEDITIONERS"; bot cards sepia-graded in horizontal-scroll rows ("FAVORITES EXPEDITIONERS"); bespoke MY SERIES / UPCOMING RELEASES panels.

**p2 (@lonerlove):** pixel-art visual novel crossed with Windows 95. Pixel font throughout; hero scene with dialogue box offering clickable choices ("What do you write?" / "Tell me about yourself"); STATS heart row; giant "LONER LOVE" pixel masthead; fixed page-doll character art; fake `ALERT!! — Lolo asked you out on a date?! — ACCEPT` OS window; the standard bot grid replaced in part by a **CSS-only carousel** with `<`/`>` arrows; SERIES presented as Win95 windows with title bars (`X □ –`) and Characters/Lorebook buttons.

**p3 (@heyaxo):** green-on-grey terminal mood. Header reads `heyaxo.exe`; VT323 monospace; misty-forest fixed backdrop; about-me dossier panel; rules/status/questions tabs; creator-recommendation link lists; Kofi/server buttons; a **fake boot/loading overlay** with glitch effects (`scanGlitch`, `sephirothGlitch`).

**p4 (@Mayu0910, control):** stock Janitor dark UI. Left card (avatar, name, followers, member-since, bio, FOLLOW), right CHARACTERS tab with search/filter/Latest and a 3-column bot-card grid (cover, chat-count ribbon, title, description, tag pills, token count). This is the "before" that p1–p3 overwrite.

(NOTE: a "Malwarebytes Browser Guard" popup visible in p1 shots is the operator's own browser extension, not page content. Ignore it.)

---

## 4. Page structure (the skeleton everyone overrides)

Identical landmark tree on all four profiles (selectors from live probes):

- Header: `header._header_17iy7_1.profile-top-bar-flex-outer.pp-top-bar-outer` → `div._bar_17iy7_26.pp-top-bar.profile-top-bar`
- Main: `main._main_ckjfh_1._customPadding_ckjfh_16` → `div.chakra-stack.profile-page-container.css-14l6kwv`
- Profile card: `.pp-uc-background.profile-uc-background.profile-uc-background-flex` containing three background-box divs, then `.profile-info-wrapper-box` → `.profile-info-stack` → `.profile-info-hstack` → `.pp-uc-avatar-container` (+ `pp-uc-followers-count`, `pp-uc-member-since`, follow button)
- Stock bot card: `.chakra-stack.profile-character-card-stack.css-1s5evre` → `a.profile-character-card-stack-link-component` → `.pp-cc-name…`, `.profile-character-card-stats-box`, `.pp-cc-ribbon` / `.pp-cc-chats`, tag wraps, token count

The site is Chakra UI (hashed `css-*` classes, ~140 stylesheets, ~100–150 inline `<style>` blocks of compiled CSS). Crucially, Janitor **also ships stable semantic hooks prefixed `pp-`** on every region: `pp-top-bar-*`, `pp-uc-*`, `pp-cc-*`, `pp-tabs-*`, `pp-pg-*` (pagination), `pp-fl-*` (filter), `pp-tag-*`. All deep customization targets the `pp-` hooks (plus custom classes for injected HTML), never the hashes.

---

## 5. Measured customization depth (probe numbers)

| Signal | p1 | p2 | p3 | p4 (baseline) |
|---|---|---|---|---|
| Stylesheets / inline `<style>` / inline CSS KB | 167 / 146 / ~210 | 163 / 142 / ~163 | 158 / 137 / ~153 | 139 / 118 / ~97 |
| Extra CSS vs baseline | **~+113KB** | ~+65KB | ~+55KB | — |
| `pp-` hook references in CSS | 81 | 106 | 106 | **0** |
| `content:` declarations | 104 | 74 | 69 | 33 (site's own) |
| `!important` count | **1811** | 33 | 35 | 13 |
| `animation:` / `transition:` / `:hover` rules | 39 / 133 / 139 | 26 / 98 / 80 | 33 / 92 / 76 | 24 / 41 / 29 |
| Custom `@keyframes` | `fadeIn, inkToMagic, slideInRight, artifactFloat, tickerScroll, goldHeartbeat, deckPulse, logoPulse, bellRing, openMenu` (+ site libs) | `typingEffect, fadeInOptions` | `scanGlitch, sephirothGlitch, shimmer, float, blink, hideLoader, loading` | none (only site libs) |
| Custom media queries | max-width 1200/768/600/380, `(hover:none)+(pointer:coarse)`, `prefers-reduced-motion` | max-width 920/660/620/768/600 + coarse-pointer | max-width 768/480 | none |
| Custom fonts | Cormorant Garamond, Share Tech Mono, Cascadia Code (via Google Fonts embed) | VT323, Press Start 2P, Poppins | VT323 | system stack |
| `<img>` count | 125 | 128 | 80 | 26 |
| `<details>` accordions | 4 (STATUS/ABOUT/BOUNDARIES/F.A.Q) | 0 (uses `:target` carousel instead) | 3 (rules/status/questions) | 0 |
| `tabindex` (keyboard tabs) | 43 | 43 | 41 | 17 |
| Bot/character links found | 34 | 39 | 35 | 12 |

Full per-profile data: `evidence/p1|p2|p3|p4-inspect2.json`. Extracted custom CSS: `evidence/p*-human-styles.css.txt`.

---

## 6. Mechanism catalog (how each effect is done — the transferable lessons)

1. **Text replacement without JS.** The canonical recipe, confirmed via computed styles: set the hook to `font-size: 0; color: transparent`, then inject text with `::before/::after { content: "..." }`. Observed: `.pp-top-bar-logo::before → "EXPEDITION 33"` (p1), `.pp-top-bar-logo-name::after → "heyaxo.exe"` with sub-label hidden (p3), followers `::before → "HAS MET  "`, member-since `::before → "EXPEDITION ZERO"` (p1). Original links stay in the DOM (clicks/a11y tree intact).
2. **Full-bleed scenery.** The fixed `.pp-page-background` layer gets a new `background-image` (their CDN `ella.janitorai.com/media-approved/…`, one per profile) plus tint overlays; content images ride in `<img>` (official CDN, imgur, file.garden, ibb).
3. **Bot-card reskin.** Backgrounds, borders, sepia/mask filters (`.pp-cc-avatar { mask-image: linear-gradient(…) }`), tag pills recolored/repositioned, hover-reveal tags (opacity/visibility transitions), star/ribbon icons hidden or emoji-swapped, horizontal-scroll rows (`flex` + `overflow-x: auto`). p2 goes further: the stock card is abandoned and hand-written `.carousel-slide` HTML (standee image + name + creator + `#slideN` arrows) takes its place.
4. **Custom sections via injected HTML.** Series grids (`.seriesbox/.series-scroll`), tag pills (`.tags-wrap/.tag`), image-link directories, creator-rec lists (`.radi-creators-list`), tab systems (`.tab-containerio/.tabio/.contentio`), Win95 windows — all plain divs/anchors styled by the custom sheet.
5. **Animation.** Pure CSS: looping keyframes (heartbeat/pulse/float/breathing/ticker), hover transitions, a fake loader overlay (`.loading-screen`, `position: fixed`, z-index 999999, `pointer-events: none` so it can never trap users), glitch effects. `prefers-reduced-motion` guards are community convention.
6. **JS-free interactivity.** `<details>/<summary>` accordions, `:focus`-driven tabs, `:target`-driven carousel (`#slide5`/`#slide2` arrows + `.target-anchor` spans + `.dropdown-close-overlay` closers), `:hover` reveals. No `<script>` exists in any custom code — it is stripped/disallowed.
7. **Responsive + touch.** Custom breakpoints plus `(hover: none) and (pointer: coarse)` adaptations; creators accept minor mobile/desktop divergence (element hooks differ slightly).
8. **Chrome edits.** Nav restyled and relabeled, search box re-skinned ("Searching for something else…?"), notification bell given a shake keyframe, tooltips/footers/pagination recolored, scrollbars and page counter restyled.

---

## 7. JanitorAI's editor, rules, and limits (from their official docs, corroborating the above)

- **New profile editor = 3 tabs:** HTML ("about me" user-card section: text/images/sections/divs), CSS (colors, fonts, borders, spacing, animations, backgrounds, effects), and AI redesign (full-remake prompts, click-to-mention elements like `@pp-uc-title`, drafts/history/publish flow, daily AI-edit limit).
- **Two manual editors:** About Me in Settings (stable, supports comments, mobile-usable, no preview) and the in-page CSS editor behind the palette icon (element picker, selector dropdown, live preview; known buggy, no comments, desktop-only). Saving in the wrong one can overwrite the other — creators keep backups.
- **Disallowed (sanitized):** `<script>` and JS entirely; `<input> <svg> <button> <label> <video> <audio>`; `url()`/scrollbar props/`@container`/CSS variables/nesting/`attr()`/`@property`/`offset-path`/ARIA attributes in the strict editor (About Me is the more permissive path; images still flow through `<img>`).
- **Scope:** profile page only. Character/bot surfaces allow a little HTML, no CSS. Viewers can disable custom CSS. Copying others' CSS without permission/credit can get customization revoked; malicious CSS (blocking buttons/site use) is removed. Accessibility etiquette (flashing, contrast, readability-first) is enforced socially.

Takeaway: JanitorAI runs this for a huge audience on exactly the recipe — **scoped-to-one-surface freeform CSS + limited HTML, no JS, a tag/property blocklist, a viewer kill-switch, and social rules**. That is an existence proof, not a theory.

---

## 8. Why proposal P1's constraint is the wrong direction

`app_observations_and_proposals.md` §1/P1 correctly diagnoses the disease (fresh install hides our visual range; no app-shell theming) and correctly proposes the cascade (`neutral → global → character → bindings → persona → a11y`). But it then caps the cure: *"A few designed layout variants … no custom CSS, no layout breaking"* with tokens limited to colors, one font, card shape/density, one background image + overlay + blur, and frosted scrim strength.

The evidence against that cap:

- **Nothing in §6 is expressible in P1's token set.** Our `CharacterTheme` (`packages/shared/src/schemas/theme.ts`) is ~20 tokens: one font family/size/line-height, 10 colors, bubble radius/padding/tail, background image/overlay/blur. That buys *tints* — the Alice-demo level. p1–p3's conversions (custom sections, text swaps, keyframes, carousels, loaders, layout changes like horizontal rows and OS windows) require arbitrary selectors, injected HTML, and animations. A token schema can never enumerate them in advance; JanitorAI's own index of hooks and community template library (dozens of full-profile templates) exists precisely because creators outrun any schema.
- **The `!important` data shows what the alternative costs.** p1 fights hashed framework classes (1811 `!important`s); p2/p3 target stable hooks (30s). The lesson is not "forbid custom CSS" but **"ship stable hooks so custom CSS stays clean"** — i.e. our own `pp-` equivalent.
- **Safety does not require the cap.** JanitorAI's threat model (millions of strangers, copy-paste code from anyone) is far harsher than ours (personal use, long runway, vault rules explicitly not hardened yet, app in early development), and they ship it with scoping + sanitization + viewer toggle. For us the risk is currently negligible, and the cost of the cap is permanent: every surface limited to tints forever.
- **Keep P1's good parts:** the global-theme concept, the cascade with character-over-global priority and a11y supremacy, the frosted-chrome accessibility toggle (generalize it to a "reduce/重的 custom styling" switch).

---

## 9. Agreed direction (for discussion — not implementation)

From the session discussion, both sides converged on:

1. **Ambition stands:** per-surface styling (global shell, character page, chat page, all future pages), each surface independently styleable; creators get full control of what is on screen, we provide capability, not taste.
2. **Two-layer model:** keep styling-as-data tokens as the safe, structured default; add a **scoped custom layer per surface** (sanitized HTML+CSS, no JS) that powers everything tokens cannot.
3. **Stable hook contracts** on every surface (the `pp-` lesson) so custom sheets target documented classes, never framework hashes.
4. **Progressively tokenize the observed primitives** (label/text overrides, animation budget with mandatory reduced-motion handling, fixed decor layers with `pointer-events: none`, disclosure/tab/section patterns) so common desires graduate from custom CSS into safe schema.
5. **Viewer safety from day one:** per-user "hide custom styling" toggle; a11y overrides keep supreme priority; sanitizer blocklist (no script/event-attributes; URL policy for assets); personal-use phase stays permissive, hardening grows with audience.
6. **Later:** steal the good editor UX (HTML/CSS tabs, element picker, live preview, drafts/history/publish; AI assist optional) and the template/credit culture.

---

## 10. Open questions for the reviewing agent

1. Where should the custom layer live in our stack (per-character data blob like `style`, separate surface-theme documents, or both), and how does it compose with the existing token cascade?
2. What is the minimal hook contract (`ft-` classes / data attributes) for Foyer, character page, and chat viewport that covers §6's catalog?
3. Sanitizer design: blocklist now (Janitor-style) vs allowlist later; asset-URL policy for backgrounds/images/fonts in each phase.
4. How do state bindings (mood-reactive theming) interact with custom keyframes/animations without strobing or a11y violations?
5. What is the smallest safe subset to prototype first (e.g. one surface + text-swap + keyframes + viewer toggle) to validate the model?

---

## 11. Evidence manifest (what to open instead of the live web)

Repo pack (`docs/history/reports/janitor-profile-customization-study/`):

- `REPORT.md` (this file) — the whole study, standalone.
- `evidence/p1|p2|p3|p4-inspect2.json` — the 12 F12 probes per profile (landmarks, profile-card HTML, bot-card HTML+counts, style-overview, custom-css counts, keyframes/anims, custom selectors, fixed layers, fonts, backgrounds, pseudo-swaps, no-JS interactivity). ~8–11KB each.
- `evidence/*-human-styles.css.txt` — full extracted `<style>` text per profile (p1 195KB, p2 160KB, p3 151KB, p4 96KB baseline, warm 47KB) for grepping any selector/keyframe/rule cited here.
- `evidence/human-capture.mjs`, `inspect2.mjs`, `logo-probe.mjs`, `debug-probe.mjs` — the exact capture/inspection scripts (re-run only if methodology itself is questioned; needs headed Edge + CDP).

Large files intentionally left in temp (too heavy for the repo; view via `read`):

- Screenshots: `C:\Users\osama\AppData\Local\Temp\opencode\janitor-study\p{1,2,3,4}-human-{top,mid,bottom,full}.png` (+ `warm-human-*.png`, `p*-human-dom.html` rendered DOMs).
- (Deleted as noise: the four firewall-wall `p*-desktop.png` captures and the failed first-round `p*-inspect.json` stubs.)

Every numeric claim in §5–§6 can be verified by grepping `evidence/`; every visual claim by viewing the PNGs. No live fetching required.
