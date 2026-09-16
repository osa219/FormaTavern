# Chat Frontend + Prompt Transparency Scope

**Status:** §2–§3 implemented and user-verified; §7–§5–§6–§4 implemented and agent-verified (human check pending); §8 scoped, deferred.
**Date:** 2026-09-14 UTC
**Scope:** Chat page frontend readability, user-turn persistence, narrative template leakage, prompt preview per chat and per character. No streaming, parser, or storage engine changes beyond what is listed; no visual redesign beyond readability fixes.
**Reference:** Screenshots of `test` chat showing Guide-only history with leaked `[state]` text, and empty `test` Studio card.

---

## §1 — Goal and non-goals

**Goal:** make the chat log truthful (user turns never vanish, state never leaks into bubbles), stop the global narrative example from inventing NPCs/scenes for empty characters, and make the compiled prompt inspectable per chat and per character.

**Non-goals:**
* New model providers or sampling tuning.
* Full prompt-manager with drag-drop reordering (fixed canonical order stays; see §5).
* Per-character template overrides in the first cut (global default first; override deferred, see §4).
* Chat visual redesign (readability fixes only).

---

## §2 — Issue 1: user turns flash then disappear

**Status:** Done — implemented, user-verified. Commits `051244c` (segments persistence) plus the scroll-chain fix below.

**Observed:** sent `Traveler` message appears for ~1s then vanishes; log shows only assistant (Guide) bubbles; sibling indicator (e.g. `3 / 3`) suggests turns exist but are not rendered. `[state]` key-values render inside the Guide bubble as plain text.

**Root causes found (two, not one):**
* Missing segments: optimistic turn builds `segments` locally — `frontend/src/lib/state/session.svelte.ts:135-155` — but `POST /chats/:id/messages` inserted the user row without `segments` — defaulting to `[]` in `backend/src/db/repositories/messages.ts:43`. `done` → `refetchState()` replaced the list with the segment-less server version, and `MessageTurn.svelte` (segments-only rendering) collapsed the turn to an empty toolbar slot.
* Unscrollable log: `main` in `ChatViewport.svelte` was a plain block box, so `MessageLog`'s `flex-1 min-h-0` root took unconstrained auto height, the inner log's `h-full` resolved to content height, `overflow-y-auto` never engaged, and `main`'s `overflow-hidden` clipped everything past the fold. No scrollbar existed anywhere, so later turns were unreachable with zero console errors. Proven by headless A/B skeleton probes (current chain clips without scrollbar; `flex-col` main scrolls).

**Fixes applied:**
* Backend stores a single segment for user rows (`persona` / `npc` / `narrator` / `character` per `narrativeRole` + `senderName`) — `backend/src/routes/chats.ts` (`buildUserSegments`, both insert sites).
* Frontend `displaySegments()` fallback in `MessageLog.svelte` renders `content` when `segments` is empty, so pre-fix rows self-heal.
* `main` in `ChatViewport.svelte` is now `flex flex-col`, restoring the scroll chain; guarded by a scroll-chain invariant test in `frontend/unit/boundaries.test.ts`.
* `[state]`-as-plain-text leak is addressed instruction-side in §3 (the example now demonstrates the fence format); the parser intentionally only recognizes fenced/XML/comment state blocks.

---

## §3 — Issue 2: Guide / misty-valley demo leaks into every character

**Status:** Done — implemented, user-verified on a fresh chat. Commit `5f4719d`.

**Observed:** empty `test` character (only name + tagline set) replies with narrator mist + `Guide` NPC + misty-valley state, even though the card defines no NPCs, no description, no scenario.

**Current mechanism (evidence):**
* Tagline is showcase-only and never sent to the LLM. Prompt uses `description / personality / scenario / exampleDialogue` — `backend/src/prompt/blocks.ts:85-107` — all empty for `test`.
* Block `1b` injects a hardcoded example into every narrative chat — `backend/src/prompt/templates.ts:7-35` assembled in `backend/src/prompt/blocks.ts:37-77`. Reference rendering in `backend/test/prompt/__golden__/eldrin-narrative-directive.txt:9-18`.
* With no grounding, a real provider copies and embroiders the example (mist + `mountain pass is just ahead` → Guide questioning a scholar in fractured realms).
* The example shows no state-block syntax while instructing `End every reply with a state block`, so the model invents `[state]` plain text.

**Fixes applied (matches the agreed direction with one decision):**
* NPC example is now an explicit placeholder (`:::npc[Side character]` / `<npc name="Side character">` / `Side character:`) with neutral prose (`The road ahead looks clear, for now.`), kept unconditional so the model always learns NPC syntax even in chats with no NPCs yet.
* Every dialect example now demonstrates the state-block syntax (fence for directive/prefix, `<state>` for xml); the state instruction reads `End every reply with a state block exactly as shown above.`
* Added a format-only guard sentence (`Never reuse its names, places, or lines`). Golden file regenerated; backend suite green.
* Deferred as agreed: empty-card Studio/chat warning, per-character template override.

---

## §4 — Editable narrative template: where it lives

**Status:** Done — implemented, agent-verified (suites + live API save/validate/clear cycle with restore); human in-browser check pending. Ships as a single canonical example under `narrative.example` (directive-authored, rendered per dialect; stronger than the sketched per-dialect textareas — no drift possible), with structural 422 guardrails (must parse as directive with segments + state block, no persona voice); agency clause + state instruction stay in fixed code. Per-character override still deferred.

**Agreed:** Settings → Narrative tab owns the global template (it already owns mode, dialect, preamble — `frontend/src/lib/components/settings/SettingsSheet.svelte:980-1025`).

* New collapsed `Narrative instruction template (advanced)` section under the existing preamble field.
* Per-dialect textarea (`directive / xml / prefix`) with `{{char}}` / `{{user}}` hints, `Reset to default`, and validation (agency clause + state instruction must survive or saving is blocked).
* Editing stays at the source; previews link back (`Edit in Settings`, `Edit in Voice`).
* Deferred: optional per-character override in Studio Voice tab. Global default ships first.

Existing edit points stay as-is: global preamble (Block 1), provider `custom_prompt` (Block 1c), character fields (Blocks 2–5).

---

## §5 — Prompt preview per chat

**Status:** Done — implemented, agent-verified (suites + live API/proxy + headless DOM/screenshot); human in-browser check pending. Ships as `POST /api/chats/:id/prompt-preview` (not the sketched `GET` — draft text needs a body) with optional `{ draft }` included only via the explicit composer Preview button. Also fixed alongside: bottom blocks were attached twice on every narrative send (closing instruction duplicated) — single attach point now, golden regenerated.

**Agreed:** read-only drawer inspection answering *what would be sent on the next turn*.

* Placement: `Lore Drawer` → new `Prompt` tab (has character/chat/persona/state context; slide-over keeps chat visible). Secondary entry: `Preview` button in Director drawer / composer jumping to that tab with the current draft note included (debounced). Raw JSON stays in `?dev=1`.
* Behavior: dry-run endpoint (e.g. `GET /api/chats/:id/prompt-preview`), same `assembleContext() + buildPrompt()` path as send, no writes, no LLM call. Returns `systemPrompt + history + assistantPrefill + stop + blocks + tokens + warnings` (`backend/src/prompt/types.ts:86-102`).
* Rendering: canonical block order collapsible (`CANONICAL_BLOCK_IDS`, `backend/src/prompt/types.ts:61-77`), each with included/skip reason, token count, copy button; history with bottom blocks `9a/9b/9c` highlighted; budget bar (static / history / bottom / dropped).
* Ordering: fixed order in the first cut. Position affects agency, state, stops, and budget accounting; reorder UIs graduate later with pinned blocks (`1 / 1b / 9c` locked) only if needed. Transparency first.

---

## §6 — Prompt preview per character (Studio)

**Status:** Done — implemented, agent-verified (suites + live API; headless Studio capture pending, frontend dev server was down). Ships as `POST /api/characters/prompt-preview` with lenient `{ card?, personaId? }`; 9th Studio tab with debounced live resolve, empty-card banner, and greeting parse. Read-only aggregate as proposed.

**Agreed:** smaller Studio-level dry-run answering *what will this card send before any history exists*. No history at this level.

* Placement: 9th left-rail tab `Prompt` in `StudioShell.svelte:23,143-152` (`identity / voice / showcase / aesthetic / css / state / bindings / gallery` today). Right `LivePreview` stays as the bubble/greeting renderer (`greetingPreview.ts`).
* Content: static blocks `1 / 1b / 1c / 2 / 3 / 4 / 5 / 7` resolved live from the unsaved `draft.card`, plus global preamble, current dialect, active provider prompt. Defaults noted: `Traveler` persona, `defaultState(card)`, no `6b` NPCs, no `7b` scene.
* Extras: `firstMessage` parse + token counts + warnings; empty-card banner when blocks 2–5 are blank.
* Implementation note: endpoint must accept unsaved `CharacterCreate` JSON (draft, not DB row) plus settings and return the static prompt via the same builder.

---

## §7 — Inline per-segment editing (Janitor parity)

**Status:** Done — implemented, agent-verified headlessly (suites + DOM/screenshot probes); human in-browser check pending.

**Agreed:** per-bubble inline edit in place, no modal for the common case. Reference: JanitorAI chat — pencil per bubble (top-right on hover), click turns that bubble into a textarea, check/cross commits/cancels.

**Current state:** pencil lives in `TurnToolbar.svelte:101-109` (bottom, hover-only) and opens `EditTurnDialog` with the raw turn (`:::narrator` / `:::npc[Guide]` / state syntax exposed). Powerful but intimidating and modal blocks context.

**Agreed behavior:**
* Pencil per rendered segment (`NarratorBlock` / `SpeechBubble` inside `MessageTurn.svelte`), hover on desktop plus an always-visible affordance on touch (current toolbar is `opacity-0` until hover — not reachable on mobile).
* Click swaps that segment for an inline textarea (plain prose, no envelope markers); check/cross buttons commit/cancel; `Esc` cancels, `Ctrl+Enter` (or `Cmd+Enter`) saves.
* Single active edit at a time (no simultaneous multi-bubble editing in the first cut).
* Save reuses `PATCH /messages/:id`: edited segment text re-serialized into turn content, backend re-parses and re-resolves state; downstream turns in the branch are not auto-regenerated (same rule as the dialog).
* Streaming / error turns stay non-editable; `busy` blocks new edits.
* Raw `EditTurnDialog` stays as `Edit raw` in toolbar overflow for restructuring (split narrator→NPC, state-fence fixes) and multi-segment edits.

---

## §8 — Persona-label agency bypass (paraphrased speaker)

**Status:** Scoped, deferred. Not part of the original chat-page scope (§1–§7); surfaced during post-§3 verification and recorded here so it is not lost. No code changes yet; direction undecided (see §9 Q6).

**Background for a reader without prior context:** FormaTavern roleplay chats have a user persona (e.g. name `Traveler`, description "wandering scholar seeking lost lore across fragmented realms"). A core safety rule is that the model must never write dialogue, thoughts, or actions for the persona — it must stop and yield when the persona should act. Two layers enforce this: (1) stop sequences sent with each LLM request, and (2) a parser pass that truncates any reply from the first persona-voiced line onward.

**Observed:** in a fresh chat with the near-empty `test` character, the user sent `hey there` as `Traveler`. The model replied with a speaker bubble labeled `WANDERING SCHOLAR` containing first-person user-voice dialogue ("Every ruin holds a story. I just need to find the right one."). The words come from the persona's *description*, repurposed as a *speaker name* — the persona speaks, but under a paraphrased label.

**Mechanism (all three layers miss it):**
* Stops — `packages/shared/src/text/stop.ts:8-17`: `[':::persona', ':::user', '\nTraveler:']`, capped at 4 entries by upstream provider limits. `WANDERING SCHOLAR` matches none, and unknown paraphrases cannot be enumerated in advance.
* Parser agency truncation — `packages/shared/src/envelope/index.ts:84-145`: checks `:::persona|:::user` headers plus `{{user}}:`/`personaName:` prefix lines only. A `:::character[Wandering Scholar]` header is a legitimate character segment by construction (`envelope/grammar.ts` accepts any bracket name, by design so that genuine NPCs work).
* Result: user-voice dialogue persists as an ordinary character bubble, and no warning is recorded anywhere (unlike a literal `Traveler:` line, which truncates with `truncatedAt: 'persona'`).

**Fix options (decision pending):**
* (a) Prompt-side: extend the agency clause with the persona's salient description aliases ("never write for them under any name, title, or description"). Cheap, no parser change; models can still slip.
* (b) Parser-side `persona_alias` warning (not truncation): flag character/npc segment names sharing significant tokens with the persona name/description. Backward compatible via the existing warnings array; would surface in the prompt preview (§5/§6) and dev diagnostics. Needs a stopword-filtered overlap threshold to avoid false positives on coincidental NPC names.
* (c) More stops: dead end as primary fix (4-slot cap, unknowns unlistable).
* Proposed: (b) + (a) — detect with visibility, never silently truncate on a fuzzy match.

---

## §9 — Open questions for next round

1. Confirm §2 secondary bug scope: is `[state]`-as-text purely an instruction failure, or also a parser gap worth closing?
2. Confirm §3 example wording: fully generic NPC (`[Side character]`) vs omitting NPC lines when no NPCs are registered?
3. Confirm §5 draft inclusion: should chat preview include the unsent composer text by default or only on explicit `Preview` click?
4. Confirm §6 editing: read-only aggregate with source links (proposed) vs inline editing of the global template from Studio?
5. Confirm §7 scope: per-segment only in the first cut (proposed) vs per-turn stacked textareas; keep raw dialog as advanced fallback (proposed)?
6. Confirm §8 approach: (a) prompt line, (b) `persona_alias` warning, or both (proposed)? Warn-only vs truncate on high-confidence match?
7. Priority order for implementation (proposed: §2 → §3 → §8 → §7 → §5 → §4 → §6).
