# Chat Message Layout Neutrality — General Proposal

**Status:** Agreed direction (no code changes yet — blueprint next). Updated with review findings and header/classic decisions.
**Date:** 2026-09-16 UTC
**Scope:** How turns render in `/chat/[chatId]` — alignment, container shape, color, narrator treatment, avatars, name labels, header granularity. No prompt, parser, streaming, or storage-engine changes. No visual redesign beyond removing imposed assumptions and giving control back.
**Reference:** Test-chat screenshot (blue / dark-blue / red bubbles, centered narrator, right-aligned user), JanitorAI screenshot (uniform left rows with per-turn avatars), `docs/history/reports/chat-prompt-transparency-scope.md` §7 + P1–P3, `docs/history/reports/chat-dialect-conversion-scope.md`, `docs/history/blueprints/customization_blueprint.md` (2-track pattern), `docs/history/reports/chat-message-neutrality-review.md` (verification + conditions, all accepted), `docs/workflows/ui-ux-testing.md` (verification).

---

## §1 — Intent (your words, kept explicit)

FormaTavern does not impose themes or styles on the creator. The creator chooses.

Today the chat page breaks that promise. A blank new character with no custom CSS still renders strong opinions:

- narrator centered in the middle of the page, italic, dim;
- some bubbles blue / dark-blue, some red;
- user turns pushed right, model turns pushed left (except narrator);
- SMS-style bubbles that grow/shrink with text length;
- no per-turn avatars, no way to opt into them.

None of those should be the default. Customization should be real: if the creator wants right/left split, they choose it. If they want everything left like JanitorAI / SillyTavern, they choose that. Avatars on or off — their choice. Bubbles or fixed full-width rows — their choice. Single header or per-voice headers — their choice. The blank slate must be neutral so that adding CSS or flipping a simple control *adds* character instead of fighting the built-in look.

This proposal follows the same 2-track system used everywhere else in the app: **an easy control for common choices + full CSS control for everything else.**

---

## §2 — Current assumptions inventory (what we stop imposing)

All references are to the current implementation, so there is no ambiguity about what "neutral" removes. Verified against source in the review doc.

1. **Split alignment.** `frontend/src/lib/components/chat/SpeechBubble.svelte:41` — `justify-end` for `persona`, `justify-start` for everything else. The turn's side is decided by role, not by the creator.
2. **Bubble container.** `SpeechBubble.svelte:43-47` — `max-w-[85%] md:max-w-[70%]`, `shadow-md`, `rounded-bubble`, `p-(--theme-bubble-padding)`. Width follows text length (SMS/WhatsApp behavior). Janitor-style fixed full-width rows are not expressible without overriding structure.
3. **Tails hard-coded by role, and the theme control for them is dead.** `SpeechBubble.svelte:29` computes `data-tail` from role (`right` for user, `left` otherwise); `frontend/src/app.css:414-440` paints from that attribute. Separately, the schema offers `bubble.charTail` / `bubble.userTail` (`packages/shared/src/schemas/theme.ts:25-26`), Studio binds one (`AestheticPanel.svelte:249-252`), the persona editor binds the other (`PersonaEditor.svelte:320-323`), and they resolve to `--theme-char-tail` / `--theme-user-tail` (`cssVars.ts:20-21,84-85`, defaults `app.css:27-28`) — but no rule anywhere consumes those vars in chat. Only `BubblePreview.svelte:20,31` honors them. The app sells a tail control that silently does nothing in real chat. Filed separately as a standalone bug; the new `tails` field supersedes it and migration honors `none` as creator intent.
4. **Color distinction by role.** Theme defaults supply it: `packages/shared/src/theme/defaults.ts:10-18` (char dark slate, user darker navy, accent sky, narrator light slate), resolved to CSS vars in `frontend/src/lib/theme/cssVars.ts:67-90`. NPCs additionally hue-shift the character background in `SpeechBubble.svelte:34-38` (the reddish bubble in the screenshot comes from `npcHue()` + `color-mix`, hue supplied at `MessageTurn.svelte:86`). A blank card therefore still ships blue/dark-blue/red.
5. **Narrator as centered set-piece.** `frontend/src/lib/components/chat/NarratorBlock.svelte:17` (`mx-auto max-w-[62ch] text-center`), `:27` (italic + clamp font-size), separator `:18-24`. Narrator is treated as a different medium, not just another voice.
6. **Name label styling imposed.** `SpeechBubble.svelte:52-58` — uppercase, `tracking-[0.08em]`, `opacity-75`; accent color for character/persona labels, text color for NPC labels. No control over show/hide/format.
7. **No avatars.** `character.avatar` (`packages/shared/src/schemas/character.ts:13`) and `persona.avatar` (`packages/shared/src/schemas/persona.ts:8`) exist and render in TopBar / LoreDrawer / Persona cards, but `MessageLog` / `MessageTurn` / `SpeechBubble` never read them. The only avatar reader in the chat route is the drawer (`LoreDrawer.svelte:313-315`). There is no per-segment avatar slot, no NPC fallback.
8. **Turn-level-only structure assumed.** `MessageTurn.svelte:69-105` renders one turn as N segments with per-segment `kind`/`name`, but the surrounding chrome offers no per-voice header slot — so multi-voice turns (character + NPC + narrator in one message) cannot label who speaks now without custom CSS.

Net effect: a creator who wants "all rows left, same width, same color, avatar + name on each, narrator inline" must *undo* six opinions before adding one of their own. That is the issue this proposal fixes.

---

## §3 — Neutral baseline (agreed)

For a blank character/chat with no custom CSS and default layout settings:

- **Uniform rows.** Every turn — persona, character, npc, narrator — renders the same way: left-aligned, full-width row (content constrained by the log's readable max-width, not by bubble shrink-wrap). No `justify-end` for users. No left/right split.
- **No color coding.** All bodies use the same surface and text color (inherited chrome/text tokens, readable in both schemes). The old blue/dark-blue/red distinction becomes an *opt-in preset*, not the default.
- **No tails, no shrink-wrap bubbles.** The default container is a flat row: no tail pseudo-element, no shadow, no pill radius that tracks length. `rounded-bubble` / `bubble-tail` styling remains available as an explicit container choice (see §5), but nothing selects it by default.
- **Narrator plain and in flow.** Left-aligned, same width, dimmed text, no centering, no italic, no separator. Centering / italic / separator become creator options (see §7 crisp modes), not the baseline.
- **Names plain.** Name (when shown) renders in the same text color at normal weight/case — no forced uppercase + accent color. Which voices show names follows the header default in §4.
- **Avatars OFF by default, available to all three voices.** No avatar element renders unless the creator enables it (not a hidden placeholder). When enabled, character, persona, and NPC each resolve independently (see §6).

What neutral does **not** mean: unstyled or unreadable. Spacing, line-height, readable measure, focus states, streaming caret, toolbar, and accessibility contrast stay. Neutral means *no voice gets a louder visual than another unless the creator asks for it.*

This matches the JanitorAI reference (uniform rows, avatar + name per turn, fixed-width body) while staying quieter than it: Janitor still makes choices; our default makes fewer.

---

## §4 — Two-track control (same pattern as shell / character / chat CSS)

Track 1 and Track 2 compose exactly like the existing customization system (`docs/history/blueprints/customization_blueprint.md` §2.2): **tokens/controls (inline, easy) → sheet (one active custom-CSS sheet, expressive) → accessibility supremacy (viewer kill-switches win over everything).** Message layout follows the same layering so creators meet one mental model everywhere.

### Track 1 — Easy layout controls on the card (Studio), v1 set locked

A new `layout` group beside `style` (colors/fonts) in the character card, edited in Studio with the same binding style as `AestheticPanel.svelte`. v1 keeps the set small; every deferred field is additive later (schema enum + Studio binding), so nothing is foreclosed:

- `align`: `uniform-left` (default) | `split` (user right, others left). Deferred: `uniform-right` (one enum value away later).
- `container`: `row` (default, flat full-width) | `bubble` (shrink-wrap + radius + padding) | `flat` (no container chrome). Deferred: `card` (its header-row chrome overlaps the avatar work; graduates separately).
- `headers`: `single` | `voices` — one header per turn showing the turn owner vs one header per segment row showing the voice that speaks now. **Mode-dependent default (decided): narrative chats default to `voices` for names (like a novel's dialogue tags — narration flows unnamed, speakers sign their lines); classic chats default to `single` (every turn is one segment there anyway, so both render identically).** Unset means "follow the mode"; an explicit choice beats the default in either mode. Honesty rule: `single` collapses chrome, never identity — non-owner segments in a multi-voice turn keep a tiny inline voice tag so NPC lines are never misattributed to the turn owner.
- `avatars`: three independent toggles — `character`, `persona`, `npc` — plus `shape` (circle/rounded/square) and `size`. Default: all off. Follow the `headers` granularity when on (one avatar in `single`, per-voice avatars in `voices`).
- `narrator`: `dim-only` (default: inline + dimmed, left-aligned, no separator/italic/centering) | `inline` (identical to other rows) | `centered` (today's `NarratorBlock` look verbatim). Crisp definitions per review; fine detail stays in CSS.
- `names`: `show` (per kind: character/persona/npc; narrator unnamed by default) + `format` (`plain` default | `uppercase` | `accent`). `uppercase + accent` restores today's label as an opt-in.
- `tails`: on/off, only meaningful in `bubble` container. Default off. Side follows computed alignment, never hard-coded role → side. Supersedes the dead `charTail`/`userTail` config (see §2.3).
- Deferred to graduate on demand: `card` container, `uniform-right`, `density` (addressable via `--msg-*` vars in CSS until demand is shown), per-chat overrides.

Ownership follows the existing rule — **the character owns its chat look** (blueprint §2.1). The card's layout is the default for all its chats. Per-chat override is *deferred, not rejected*. Layout stays out of persona `styleOverrides` in v1 (`ThemeOverridesSchema` does not grow layout fields), so the cascade stays five-layer and layout has one owner. Custom CSS per character already overrides everything regardless.

Mode matrix (decided): `align`, `container`, `headers`, `avatars`, `names`, `tails`, log measure apply in **both** modes. `narrator` treatment and NPC avatar/name controls are **inert in classic** (no parsed narrator/NPC segments exist there) — Studio disables them with an explanation instead of offering dead toggles. The render path builds over the segments array uniformly (`MessageLog.svelte:112-122` already normalizes classic/plain rows to a single segment), so classic needs no separate markup contract.

### Track 2 — Full CSS via stable markup + hooks (Studio CSS tab)

Track 1 covers common choices; Track 2 covers everything else with no ceiling:

- **Per-voice rows inside the turn article (corrected per review).** The primitive is the segment row, not the turn: `article.ft-turn[data-role]` contains N `div.ft-row[data-kind]` (or equivalent named hook), each with its own header slot (avatar + name) and body slot. `single` is a collapsed *presentation* over those rows, not a different data shape. Today's `HOOKS.chat` classes (`ft-turn`, `ft-bubble-char/user/npc`, `ft-narrator`, `ft-message-log`, `ft-turn-toolbar` in `packages/shared/src/hooks/manifest.ts:31-49`) stay stable (append-only public API); new slots gain hooks (`ft-row`, `ft-avatar`, `ft-turn-name`, `ft-turn-body`, plus a container hook such as `ft-row` alongside the bubble hooks) so authors never target bare elements. Alignment, width, and color come from CSS reading `data-*`, not from conditional Tailwind classes like `justify-end`.
- **Layout as data attributes + vars, not branches.** `data-align`, `data-container`, `data-headers`, `data-avatar` on turn/row plus `--msg-*` vars for width/radius/padding/avatar-size. A creator's sheet can then do Janitor (`[data-container=row] …`), SMS (`[data-align=split] …`), or anything unanticipated, with the same sanitizer/policy/outlet pipeline as today (chat-conservative profile unchanged).
- **Presets as starting points.** The same "Start from a preset" pattern as the CSS panel ships tiny layout sheets (*Uniform rows*, *Split bubbles*, *Centered narrator*) so Track 2 is discoverable without reading the manifest.
- **Viewer supremacy unchanged.** `hideCustomStyling` / `disableCharacterThemes` keep beating both tracks, exactly as today. Layout mechanics sensitive to restructuring (`content-visibility: auto; contain-intrinsic-size: auto 6rem` on off-screen turns at `MessageTurn.svelte:65`, the absolute edit pencil at `:92-101`) are preserved and checklist-verified.

Neither track alone is sufficient: Track 1 without Track 2 caps expression (the current complaint in a new form); Track 2 without Track 1 forces every creator to write CSS for "just put everyone on the left." Both ship together.

---

## §5 — Container model (kills the bubble assumption explicitly)

| Container | Behavior | When to use |
|---|---|---|
| `row` (default) | Full log-width row, no tail/shadow, width capped by log measure | Janitor-like reading flow; long prose; mixed voices |
| `bubble` | Shrink-wrap to content up to max-width, radius + padding + optional tail | SMS/Telegram feel; short exchanges; explicit opt-in |
| `flat` | No container background/border at all — text on log surface | Manuscript / transcript feel; maximum CSS freedom |

Deferred: `card` (full-width bordered card with header row) graduates with the avatar/header work it overlaps. Container and alignment are orthogonal. `bubble + uniform-left` (all bubbles left, e.g. SillyTavern group style) and `row + split` (full-width rows but users right-aligned) are both legal — the old code fused them (`bubble` implied `split`), which is why creators could not express one without the other. Width: one log-level readable measure token, with container-local exceptions via CSS only.

---

## §6 — Avatars (all three voices, both granularities)

Data already exists — this is a render + control task, not a storage task:

- **Sources.** Character segments use `character.avatar`; persona segments use the active persona's `persona.avatar`; NPC segments use the per-NPC image when the card defines one (`chat.metadata.npcs[name].avatar`), else a fallback (initials + stable hue — the existing `npcHue()` logic minus the full-bubble tint, so the fallback reads as an avatar ring, not a red bubble). v1 fallback is initials + hue ring; registry images graduate with the NPC manager.
- **Controls.** Independent on/off per voice, plus shape/size tokens. In `single` mode one avatar (turn owner) renders at the top; in `voices` mode each segment row renders its own. When off, no avatar element renders at all, so CSS-free rows stay clean and screen readers skip nothing. A creator with only a main-character avatar picks `single` (or `voices` with automatic monogram fallbacks doing the rest — zero configuration, no broken images).
- **Placement.** Avatar lives in the segment/turn header slot beside the name (Janitor pattern), aligned to the first line, not overlaid on the bubble corner (avoids the Batch-2 P1 pencil-overlap class of bug). Edit pencils and toolbars keep their current slots relative to the body, unaffected by avatar presence.

---

## §7 — Narrator, names, and tails (opt-in character, not default character)

- **Narrator.** Crisp modes: `dim-only` (default) = inline row + dimmed text, left-aligned, no separator/italic/centering; `inline` = identical to other rows; `centered` = today's `NarratorBlock` look verbatim. Separator color/width, italic, and measure stay CSS-addressable. Inert in classic (see §4 mode matrix).
- **Names.** Default plain and honest: show who speaks per the `headers` default (§4), in body text color, normal case/weight, narrator unnamed. `uppercase + accent` restores today's label as an opt-in format. Hiding any voice's name is a checkbox, not a CSS hack.
- **Tails/borders/shadows.** Only in `bubble` containers, default off. Tail side follows computed alignment (not hard-coded role → side), and `none` is a first-class value so CSS `display:none` hacks are unnecessary.

---

## §8 — Back-compat and migration (no silent restyles — locked)

- **Existing theme tokens keep working.** `charBubbleBg/Text`, `userBubbleBg/Text`, `accent`, `narratorText`, `bubble.radius/padding` (`packages/shared/src/schemas/theme.ts:10-28`) continue to resolve to the same CSS vars. In the new default they simply *apply to fewer properties* (e.g. no split backgrounds unless `split` or `bubble` is selected) — values are never discarded, so a creator's palette survives the transition.
- **Existing custom CSS keeps matching.** `ft-turn`, `ft-bubble-char/user/npc`, `ft-narrator`, `ft-message-log` remain in the DOM with the same meanings; the sanitizer, scoping (`[data-ft-surface="chat"]`), chat-conservative profile, and single-outlet lifecycle are untouched. Sheets that replicate today's look keep painting it.
- **Migration is mechanical backfill (decided, not deferred).** Every existing card gets its *effective current look* stamped as explicit layout values (`split + bubble + tails on + centered narrator + accent names + single-equivalent headers`), preserving appearance byte-for-byte. "Re-select the Classic preset" is rejected as an option because it restyles every chat until its creator acts — a silent restyle with extra steps. Unset `headers` on old rows follows the mode default (§4), which reproduces current behavior in classic and approximates it in narrative until backfill lands. The migration vehicle (metadata vs style extension, versioned per repo conventions, server-side, idempotent, no client PATCH storm) is named in the blueprint.
- **Today's look becomes a preset, not a regression.** `split + bubble + tails + centered narrator + accent names` reproduces the current screenshot pixel-close. It ships as a one-click Track-1 combination (and as a Track-2 preset sheet). Blank new cards start neutral. The Classic preset is layout-only — it never writes color tokens.
- **No prompt/parser/storage impact.** Segments, `narrativeRole`, state vectors, and the envelope package are untouched. This is presentation over the same `MessageWithTree` contract.

---

## §9 — Verification (per `docs/workflows/ui-ux-testing.md`)

- **Reproduce in headless Edge first:** tall + short captures of a seeded chat showing today's imposed style (split, colored bubbles, centered narrator, no avatars) before any edit. Cover both narrative and classic chats.
- **Probe before editing:** static `.html` probes in `frontend/static/` (deleted afterwards) proving each neutrality axis in isolation — uniform-left vs split, row vs bubble width behavior, `single` vs `voices` headers, avatar on/off slots, narrator inline vs centered — with self-reporting readouts (`scrollHeight`, rects, `innerWidth` ≥ 500px per the workflow gotchas).
- **Layers in order:** DB avatar paths → API card/persona payloads → Vite-proxy payloads → rendered DOM (`data-*` + hooks present at row level) → paint (screenshots at both heights). DOM-present ≠ painted; missing scrollbar is itself a finding.
- **Definition of done:** fresh captures of affected routes showing the neutral default + each Track-1 option in both modes; static guards for the new markup contract (row-level hooks present, `data-kind` on rows, no hard-coded `justify-end` by role at turn or row level, no `ft-` literals outside the manifest, `content-visibility` + pencil placement preserved); `typecheck` 3/3, full test suites, `db:check` clean; probes removed, `git status` shows only intended files.

---

## §10 — Decisions locked in this round (were open questions)

1. **Per-chat override:** later. Card-only in v1 (matches "character owns its chat look"); graduates on demand.
2. **Width ownership:** one log measure + container-local exception via CSS only.
3. **NPC avatar source in v1:** initials + hue ring; registry images graduate with the NPC manager.
4. **Classic preset scope:** layout only — colors live in theme tokens and are never written by a layout preset.
5. **Header granularity:** `single` | `voices` creator choice; mode-dependent default — narrative defaults to `voices` for names, classic defaults to `single`; unset follows the mode; explicit choice beats it; `single` never drops voice identity (inline tags for non-owner segments).
6. **Classic/narrative matrix:** §4 table is normative — narrator/NPC layout controls inert in classic with disabled-with-explanation UI.
7. **Migration:** mechanical backfill, locked (see §8).
8. **v1 field set:** trimmed per §4 (deferred: `card`, `uniform-right`, `density`, per-chat, persona layout overrides).
9. **Build order:** markup contract (per-voice rows) first → neutral default → Track-1 layout group + Studio bindings → avatar slots → presets + hook docs → backfill → guards + headless verification in both modes.

---

## §11 — What this unlocks (and what it deliberately does not)

Unlocks: true creator choice of chat reading experience with a neutral starting point; Janitor/SillyTavern parity (uniform rows, per-turn avatars) without losing the SMS-bubble style as an option; `single` for quiet pages and `voices` for multi-NPC stories with a novel-like default in narrative mode; edit-chrome theming (Batch-2 P3) finally has a coherent surface to theme against instead of per-bubble exceptions.

Does not: change what the model writes, how history is stored, how prompts preview, or how dialects convert. Does not add per-message custom CSS, free HTML, new providers, or a prompt manager. Those stay out of scope until this lands and is verified.
