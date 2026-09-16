# Chat Dialect Conversion Scope

**Status:** Built and agent-verified (suites + live API incl. atomic abort; drawer UI via render tests); human in-browser check pending.
**Date:** 2026-09-16 UTC
**Priority:** Above the polish batch (relative order vs §8 at the user's call).
**Scope:** Explicit per-chat conversion between narrative dialects (directive / xml / prefix), deterministic and reversible, plus a one-time nudge when the global default changes. No model involvement, no automatic conversion, no mode changes.
**Reference:** Dialect is per-chat frozen at creation (`chat.metadata.envelopeDialect`), surfaced in the Lore Drawer About line and the prompt preview badge. Envelope parse/serialize round-trip identity is invariant E3.

---

## §1 — Goal and non-goals

**Goal:** give a running chat an escape hatch when its frozen dialect stops fitting — e.g. the model that handled xml well is unavailable and the replacement wants directive. One explicit user action converts the chat's format and re-renders its history, with a report of what happened.

**Non-goals:**
* Model-assisted rewriting (no LLM paraphrase — re-rendering only, see §2).
* Automatic conversion on provider/model switch (always explicit, always per chat).
* Changing what the global dialect default means (still the format for *new* chats).
* Classic ↔ narrative mode conversion (mode changes alter blocks and state handling — a separate feature, if ever).

---

## §2 — Mechanism: re-render, not rewrite

Every stored turn already keeps a dialect-free canonical form: `segments` (narrator / character / npc + plain text) plus the resolved `state` vector (data, not syntax). Only `content` carries dialect packaging. Conversion is therefore mechanical:

1. Read the source dialect from `chat.metadata.envelopeDialect`.
2. For every message row in the chat: `parseEnvelope(content, source)` → `serializeSegments(segments, statePatch, target)`, replacing `content`. `segments` and `state` columns are already canonical and stay untouched.
3. Flip `chat.metadata.envelopeDialect` to the target.
4. Refresh `messages.metadata.parse` per converted row from the conversion parse itself (it records the detected dialect) — verified present in `MessageMetadataSchema`; never leave a stale dialect beside converted content.

**Safety properties:**
* Reversibility comes from E3 (parse/serialize round-trip identity, pinned by envelope tests): converting back restores the original text. No information is created or destroyed.
* Atomicity: the whole conversion runs in one transaction. If any turn cannot convert (e.g. prose colliding with the target speaker detection — the known prefix colon case), the endpoint rejects with 422 naming the offending turn and **nothing is written**. Fix the turn (inline segment edit exists for exactly this) and retry. No silent mixed-dialect histories.
* Blocked while a generation is active for the chat (409, like delete/regenerate guards).

---

## §3 — UI: one button where the dialect is shown

* Entry: a `Convert…` action next to the dialect chip in the Lore Drawer About line ("This conversation speaks X — locked at creation"). When the chat's dialect differs from the global default, the line additionally offers the concrete migration ("default is Y — convert?"), jumping straight to the confirm step with Y preselected; when aligned, only the generic action shows.
* Target picker offering the two other dialects, with a confirm step stating the conversion is mechanical and reversible by converting back.
* Result toast with the turn count; the prompt preview (§5 tab) is the natural place to verify — block 1b and history should show the new syntax immediately.
* Discovery nudge (decided, not optional): changing the global dialect default shows a one-time dismissible note — "You have N narrative chats in other dialects. Review them?" — leading to a per-chat list with Convert buttons. Convenience without coercion: the default change itself never rewrites anything.

---

## §4 — Verification

* Unit: round-trip stability for every dialect pair on fixtures (directive → xml → directive byte-identical), plus the known collision cases falling back to rejection, not corruption.
* Route tests: turn counts, atomic 422 with nothing written on failure, 409 while streaming, metadata flip.
* Headless: prompt-preview diff before/after on a expendable chat (same turns, new syntax); manual pass on a real chat with a backup mindset.

---

## §5 — Open questions for the build round

1. Convert all rows in the chat vs active branch only (proposed: all rows — branches share one format)?
2. Failure policy: abort-all atomic (proposed) vs convert-what-converts with kept-original warnings?
3. Entry placement: About line (proposed) vs a Settings-adjacent global action?
4. Should the confirm dialog offer an automatic backup (e.g. duplicate the chat first), or is reversibility via convert-back sufficient (proposed: sufficient, stated in the dialog)?

---

## Build record

As built: all proposed answers taken. `POST /api/chats/:id/convert` (`engine/convert.ts` + route; `MessageRepository.listInChat`; `ChatConvertBodySchema`), About-line two-step Convert flow (`LoreDrawer` + `ChatViewport` handler with refetch + toast), Settings nudge (mismatch count + expandable chat links under the dialect select).

Decisions and findings during the build:
* Content re-renders **from stored canonical segments**, not the fresh parse — a plain-prose narrator row stays narrator instead of becoming whatever the parser guesses (caught live; unit-pinned). Only segment-less legacy rows fall back to the fresh parse.
* Persona-voiced content is detected via the truncation signal (the parser drops it before kind checks) and aborts the plan naming the turn; serializer collisions abort the same way. Parse warnings are non-blocking and reported per turn.
* Reasoning blocks ride along re-wrapped in normalized `<think>` tags; `metadata.parse` is refreshed with the target dialect; the resolved `state` column and `edited` counters are untouched.
* Known edge, kept honest: a turn whose single segment embeds raw envelope markers (user-typed `:::` inside prose) nests rather than unwraps — unwrapping would mistranslate meta-text showing syntax. Converting *back* then aborts with the collision message; fix by editing the turn. Preservation beats cleverness.
* Guards: 404 unknown chat, 422 classic chat / same dialect / unconvertible turn (atomic — verified live that nothing is written), 409 while streaming.
