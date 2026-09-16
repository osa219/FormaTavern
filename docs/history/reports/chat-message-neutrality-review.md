# Chat Message Layout Neutrality — Proposal Review

**Status:** Review complete. Agree with direction, two-track structure, and scope; three conditions proposed as entry criteria for the blueprint round; one independent latent bug found during verification (§5).
**Date:** 2026-09-16 UTC
**Reviewed:** `docs/history/reports/chat-message-neutrality-proposal.md` (hereafter "the proposal")
**Method:** Every claim in the proposal's §2 assumptions inventory was verified against source before any opinion was formed. Cross-references (blueprint, prior reports, workflow docs) were spot-checked for accuracy. Invariants cited by ID per `.agents/AGENTS.md` §4.

---

## §1 — Verdict

**Agree.** The proposal is approved to proceed to the blueprint round, subject to the three conditions in §6 being resolved there. In summary:

- The diagnosis is factually accurate — all seven inventory claims verify against the current implementation (§2 below).
- The remedy (neutral baseline + two-track control) is architecturally consistent with the customization system the app has already committed to, not a new concept.
- The back-compat strategy respects the right invariants (C1, C2, C8; §4 below).
- The scope boundary (presentation-only over `MessageWithTree`) is correct.

The three conditions: (1) the turn header slot must be re-specified as per-voice/segment, not per-turn; (2) the migration decision must be locked to mechanical backfill now, not deferred to build time; (3) the v1 Track-1 field set should be trimmed. Each is argued in §6.

---

## §2 — Claim audit (proposal §2 inventory vs. actual code)

| # | Proposal claim | Verified evidence | Verdict |
|---|---|---|---|
| 1 | Split alignment decided by role | `frontend/src/lib/components/chat/SpeechBubble.svelte:41` — `justify-end` for `persona`, `justify-start` otherwise | Accurate |
| 2 | SMS-style shrink-wrap bubble container | `SpeechBubble.svelte:43-47` — `max-w-[85%] md:max-w-[70%]`, `shadow-md`, `rounded-bubble`, `p-(--theme-bubble-padding)` | Accurate |
| 3 | Tails always on, side hard-coded by role | `SpeechBubble.svelte:29` (`tailSide = isUser ? 'right' : 'left'`), `:48` (`data-tail`), `frontend/src/app.css:409-440` | Accurate, but **understated** — an existing tail control is dead config (§5) |
| 4 | Color distinction by role from theme defaults; NPC hue-shift | `packages/shared/src/theme/defaults.ts:10-18`; `SpeechBubble.svelte:34-38` (`color-mix` + `--npc-hue`), hue supplied via `npcHue()` at `MessageTurn.svelte:86` | Accurate |
| 5 | Narrator as centered set-piece | `frontend/src/lib/components/chat/NarratorBlock.svelte:17` (`mx-auto max-w-[62ch] text-center`), `:27` (`italic` + clamp font-size), separator `:18-24` | Accurate (italic is at line 27, not 26-29 as cited — immaterial) |
| 6 | Name label styling imposed | `SpeechBubble.svelte:52-58` — uppercase, `tracking-[0.08em]`; accent color applied to character/persona labels only (`style={isNpc ? '' : 'color: var(--theme-accent);'}`) — NPC labels inherit text color at `opacity-75`. The proposal's blanket "accent-colored" is accurate for the character voice; nuance noted. | Accurate with nuance |
| 7 | Avatars exist in schema, unused in chat flow | `packages/shared/src/schemas/character.ts:13`, `persona.ts:8` define the fields; grep of `frontend/src/lib/components/chat/` shows the only reader of any avatar in the chat route is `LoreDrawer.svelte:313-315` (persona avatar in the drawer). `MessageLog`/`MessageTurn`/`SpeechBubble` never read them. | Accurate |

**Cross-reference audit:** `docs/history/blueprints/customization_blueprint.md` §2.1 (chat renders the character's sheet — "character owns its chat look") and §2.2 (tokens → sheet → a11y composition) exist as cited and say what the proposal claims. `docs/history/reports/chat-prompt-transparency-scope.md` §7 ("Inline per-segment editing (Janitor parity)", line 101) and `docs/workflows/ui-ux-testing.md` both exist. `packages/shared/src/hooks/manifest.ts:31-49` contains exactly the chat hooks listed. No citation in the proposal was found to be wrong.

---

## §3 — Why the review agrees

1. **The proposal fixes a contradiction, not a taste.** FormaTavern's customization architecture (blueprint §2.1–2.2, C-series invariants) commits to "creator owns the look" with tokens/controls → sheet → a11y supremacy. The chat surface is the one place where the render path bypasses that system entirely: layout decisions live in hard-coded Tailwind branches (`justify-end`, `max-w-[85%]`, `data-tail` from role), unreachable by theme data or custom CSS without fighting the markup. Neutrality is the state consistent with what the app already promises.
2. **Alignment/container decoupling (proposal §5) fixes a genuine expressiveness bug.** Today `bubble` implies `split` — one component (`SpeechBubble.svelte:41-47`) fuses the outer flex alignment with the inner container styling. That is why "all bubbles on the left" (SillyTavern group style) and "full-width rows, user right" are both inexpressible today. Orthogonal `align` × `container` is the minimal model that makes the named reference layouts reachable without CSS.
3. **The two-track structure adds no new concepts.** Track 1 (card controls) + Track 2 (stable `ft-*` hooks + `data-*` attributes) mirrors blueprint §2.2 exactly, and Track 2's append-only hooks requirement protects C1 (manifest sole source of `ft-*` strings). Creators meet one mental model across shell / character / chat.
4. **Back-compat respects the right invariants.** Old theme tokens keep resolving (values never discarded), old hooks keep matching (C1 append-only), single-outlet lifecycle untouched (C2), viewer supremacy unchanged (C8). The "Classic preset" framing converts a would-be regression into an explicit re-selection.
5. **Scope discipline is correct.** Presentation-only over the same `MessageWithTree` contract; no parser, prompt, dialect, or storage changes. This keeps E-series and S-series invariants out of the blast radius entirely.

---

## §4 — Latent bug found during verification: the tail control is dead config

The proposal's claim #3 says tails are always on "unless CSS kills the pseudo-element." Verification found the situation is worse — and it is the strongest evidence for the proposal's thesis:

- **Schema offers the control:** `packages/shared/src/schemas/theme.ts:25-26` — `bubble.charTail: 'left' | 'none'`, `bubble.userTail: 'right' | 'none'`.
- **Studio exposes it:** `frontend/src/lib/components/studio/AestheticPanel.svelte:249-252` binds "Companion Tail" to `draft.card.style.bubble.charTail`; `frontend/src/lib/studio/bindingsModel.ts:37-38` lists both paths.
- **PersonaEditor exposes it:** `frontend/src/lib/components/persona/PersonaEditor.svelte:29,41,61,320-323` ("Tail Side").
- **It resolves to CSS vars:** `frontend/src/lib/theme/cssVars.ts:20-21,84-85` emits `--theme-char-tail` / `--theme-user-tail`; defaults at `app.css:27-28`.
- **Nothing consumes those vars.** Tail rendering is keyed off the `data-tail` attribute (`app.css:414-440`). No rule anywhere reads `var(--theme-char-tail)` or `var(--theme-user-tail)`.
- **The chat path hard-codes the attribute:** `SpeechBubble.svelte:29,48` computes `data-tail` from role — `'none'` is unreachable from chat. The `data-tail="none"` rule at `app.css:438-440` can only fire from the persona editor's preview bubble (`BubblePreview.svelte:20,31`), which *does* honor `userTail`.

Net effect: the app already sells a tail control that silently does nothing in the actual chat, and the persona editor's preview disagrees with the real render. This is not merely "no controls exist" — it is "the render path bypasses the controls that exist," which is precisely the failure mode the proposal describes. **Recommendation:** file this as a standalone bug (either wire the vars into the render path or remove the dead fields) independent of this proposal's fate. If the proposal lands, its `tails` field supersedes the dead config and the migration should treat `charTail: 'none'`/`userTail: 'none'` as evidence of creator intent.

---

## §5 — Conditions for the blueprint round (must-resolve before build)

### C-R1 — The header slot must be per-voice/segment, not per-turn

Proposal §4 sketches the markup as "`article.ft-turn[data-role][data-kind]` containing a header slot (avatar + name) and a body slot," and §6 places the avatar "in the turn header slot." This does not match the render reality:

- `MessageTurn.svelte:69-105` renders **one turn as N segments** — `{#each segments as seg, i}` dispatches each `seg` to `SpeechBubble` (with per-segment `seg.name`, `seg.kind`) or `NarratorBlock`.
- `data-role` on the article (`:62`) is the message's primary narrative role; segment kinds vary *within* a turn. A single model message routinely contains character + NPC + narrator voices (the envelope parser's whole point — E2/E3).
- JanitorAI's per-message header works because one message = one speaker there. FormaTavern's multi-segment turns break that assumption.

A turn-level header cannot answer "who speaks now" for turns 2..N segments. The blueprint must specify **per-voice rows inside the turn article**: each segment row carries its own header slot (avatar + name), with `data-kind` on the *row*, not the article. This changes the markup contract and the placement of the new hooks (`ft-avatar`, `ft-turn-name`, `ft-row`), and it must be resolved in the markup-contract step — the first build step per proposal §10.5 — because C1's append-only rule makes hook contracts expensive to change after release. The §9 boundary guard ("no hard-coded `justify-end` by role") should extend to the row level.

### C-R2 — Lock the migration to mechanical backfill now

Proposal §8 leaves migration as "mechanical backfill … or documented as 're-select the Classic preset' — build-round decision." This should not stay open, because the two options are not equivalent:

- "Re-select the Classic preset" means every existing chat changes appearance on upgrade until its creator acts. That is a silent restyle with extra steps — it violates §8's own heading ("no silent restyles of existing work").
- Mechanical backfill (stamp each existing card's *effective current look* as explicit layout values: `split + bubble + tails on + centered narrator + accent names`) preserves appearance byte-for-byte and honors the proposal's principle.

Backfill also has design consequences that must enter the schema round, not trail it: the layout fields most likely live in `characters.metadata` (`CharacterMetadataSchema`, `character.ts:106-118`), so this is a versioned migration (append v(N+1); never edit an existing migration), idempotent per I3, and server-side — no client PATCH storm, so P2/OCC is not engaged. Deciding this after the schema is locked invites a rework.

### C-R3 — Trim the v1 Track-1 field set

Eight control groups (align, container, width, avatars, narrator, names, tails, density) is a large Studio surface with a combinatorial state space to bind, default, and test. Recommended v1 cut:

- **Keep:** `align` (`uniform-left` | `split`), `container` (`row` | `bubble` | `flat`), `narrator`, `names`, `avatars`, `tails` (bubble-only).
- **Defer:** `card` container (its distinguishing value — the header-row chrome — overlaps the avatar work anyway, and it is the only container that adds structural markup rather than removing it), `uniform-right` (rare aesthetic; one enum value away later), `density` (addressable via `--msg-*` vars in CSS until demand is shown).

This cut still expresses every named reference: Janitor (`uniform-left` + `row` + avatars), SillyTavern group (`uniform-left` + `bubble`), SMS (`split` + `bubble` + tails), and the Classic preset. Every deferred field is additive later (schema enum + Studio binding), so nothing is foreclosed.

---

## §6 — Minor notes for the blueprint

- **Narrator mode definitions are fuzzy as written.** §3 says the default narrator is "distinguished only by a subtle treatment (e.g. slightly dimmed text)" while §7 defines `inline` as "slightly dimmed text" — leaving `dim-only` indistinguishable from `inline`. Suggest crisp definitions: `inline` = identical to other rows; `dim-only` = inline + dimmed; `centered` = today's `NarratorBlock` look verbatim.
- **Preserve layout-adjacent mechanics in the markup rework.** `content-visibility: auto; contain-intrinsic-size: auto 6rem` on off-screen turns (`MessageTurn.svelte:65`) and the absolutely-positioned edit pencil (`:92-101`) are both sensitive to the row/header restructuring. The proposal's §6 already shows awareness of the pencil-overlap class (Batch-2 P1); both belong on the §9 verification checklist.
- **Persona overrides should stay out of layout in v1.** Personas carry `styleOverrides` (color/font) today. The proposal implicitly makes layout card-owned; the blueprint should state explicitly that `ThemeOverridesSchema` does not grow layout fields in v1, so the cascade (U1) stays five-layer and layout has one owner.
- **Agreed as proposed:** one log measure + CSS exception (§10.2); NPC avatars as initials + hue ring in v1 (§10.3); Classic preset as layout-only, never touching color tokens (§10.4 — agree strongly; a layout preset that rewrote colors would destroy creator palettes and contradict §8's "values are never discarded").

---

## §7 — Answers to the proposal's §10 open questions

| # | Question | This review's answer |
|---|---|---|
| 1 | Per-chat override now or later? | **Later.** No use case surfaced that forces v1; card-only matches blueprint §2.1 ownership and avoids multiplying state. |
| 2 | Width ownership | **One log measure + container-local exception via CSS only**, as proposed. Two tokens would re-introduce the coupling §5 removes. |
| 3 | NPC avatar source in v1 | **Initials + hue ring**, as proposed. Registry images graduate with the NPC manager. |
| 4 | Classic preset scope | **Layout only**, as proposed. Colors live in theme tokens and must never be written by a layout preset. |
| 5 | Build order | **Agree, markup contract first** — with C-R1 folded into that first step, since it *is* the markup contract. Avatars before presets (presets exist to showcase the options). |

---

## §8 — Entry criteria summary

The blueprint round may open with the proposal as its basis, with these items resolved or explicitly decided in it:

1. Per-voice/segment header specification (C-R1) — changes hooks and markup contract.
2. Migration locked to mechanical backfill, with the migration vehicle named (C-R2).
3. v1 Track-1 field set confirmed (proposed cut in C-R3).
4. Separately filed, independent of this proposal: the dead `charTail`/`userTail` control (§4 here) — wire it or remove it.

**Bottom line:** the proposal's diagnosis is verified accurate, its remedy is consistent with the app's existing architecture, and its constraints protect the right invariants. The disagreement is not with the direction but with three under-specified decisions that would each get more expensive if they leak past the blueprint into the build.
