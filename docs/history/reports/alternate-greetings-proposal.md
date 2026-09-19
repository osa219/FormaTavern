# Proposal: Alternate Greetings (Multiple First Messages)

**Status:** Proposed / Discussion Draft
**Revision:** 2026-09-19 **rev 2** — incorporates `alternate-greetings-review.md` and resolves the seed-vs-message fork: **greetings are chat seeds, chosen at birth** (review C-AG1). Mid-chat root switching and the `chat.metadata` snapshot are dropped; §6–§7 rewritten accordingly. Decisions D1–D6 updated with resolutions.
**Audience:** FormaTavern Architects, AI Peer Agents, and Core Contributors
**Scope:** Letting a character define more than one first message ("greeting"), and letting the reader pick one when a chat starts (plus re-pick while the chat is still just a greeting).
**Non-goals:** Copying any single outside product. Import/export interop with third-party card formats is explicitly out of scope for the schema decision (it can be an adapter later). A general "switch door mid-conversation" mechanism is explicitly out of scope for v1.

---

## 1. Problem statement

A character today has exactly one opening line. Authors who want multiple entry points (different moods, scenes, power levels, SFW/NSFW doors into the same character) must currently duplicate the whole character, which fragments chats, galleries, aesthetics, and state schemas across copies.

What we want: one character, many doors. The reader picks the door when a chat starts, and may re-pick only while the chat is still just a greeting (no user reply yet). Once the conversation has begun, the greeting is immutable history — the same immutability every other message already has.

## 2. What exists today (single greeting everywhere)

All paths below are verified against the current tree. No `alternateGreetings` / `greetings[]` field exists anywhere.

| Layer | Location | Current behavior |
|---|---|---|
| Schema | `packages/shared/src/schemas/character.ts:10-36` | `firstMessage: string` (required, may be `''`). `CharacterCreateSchema`, `CharacterPatchSchema`, `CharacterPromptPreviewBodySchema` inherit it. `CharacterMetadataSchema:109-120` has no greeting overflow. |
| Chat creation | `packages/shared/src/schemas/chat.ts:6-19`, `backend/src/routes/chats.ts:77-163` | `ChatCreateSchema` is `{characterId, personaId?, title?, narrativeMode?, envelopeDialect?}` — no greeting selector. Creation inserts one root `assistant` message from `character.firstMessage` (`parentId: null`, `senderId: character.id`, envelope-parsed segments), sets `activeLeafId`. Empty greeting → no root, `activeLeafId: null`. |
| Persistence | `backend/src/db/migrate.ts:15-19`, `backend/src/db/repositories.ts:26-43,71-138`, `backend/src/db/repositories/chats.ts`, `backend/src/db/repositories/messages.ts:20,95-107,146` | `characters.first_message TEXT`. Messages form a tree (`parent_id`, `active_leaf_id` on chats). `siblings(id)` already supports `parent_id IS NULL` (root siblings), but nothing creates them today. |
| Regenerate guard | `backend/src/routes/messages.ts:65-80` | `POST /messages/:id/regenerate` rejects `parentId === null` (`Cannot regenerate root message`). Unchanged by this proposal: greetings are seeds, so no greeting path touches regeneration. |
| Studio editing | `frontend/src/lib/components/studio/VoicePanel.svelte:124-147`, `frontend/src/lib/studio/draft.svelte.ts:17-35,93-100,230-263` | Single `<textarea bind:value={draft.card.firstMessage}>` with token count. Draft clones/saves the single string straight through to `POST/PATCH /characters`. |
| Preview | `frontend/src/lib/studio/greetingPreview.ts:7-25`, `frontend/src/lib/components/studio/LivePreview.svelte:55,67,74-86,267-297`, `frontend/src/lib/components/studio/StudioPromptPanel.svelte:21-31,33-56,137-162`, `backend/src/routes/characters.ts:79-169`, `backend/src/prompt/types.ts:111-119` | Greeting preview parses the single `firstMessage` via `parseEnvelope`. Prompt-preview returns one `greeting: {text, segments, warnings, adherent} | null`. |
| Start-chat | `frontend/src/lib/components/showcase/ActionHub.svelte:32-52`, `frontend/src/lib/components/showcase/PersonaPicker.svelte:1-62`, `frontend/src/routes/+page.svelte:55-76`, `frontend/src/routes/chats/+page.svelte:71-80`, `frontend/src/lib/components/chat/ChatViewport.svelte:163-180` | All call sites do the identical `POST /api/chats {characterId, personaId}` → `goto /chat/:id`. Picker is persona-only. |
| Reading | `frontend/src/routes/chat/[chatId]/+page.ts:6-54`, `frontend/src/lib/state/session.svelte.ts:42-117`, `frontend/src/lib/components/chat/MessageLog.svelte:162-229`, `frontend/src/lib/components/chat/MessageTurn.svelte`, `frontend/src/lib/components/chat/TurnToolbar.svelte:49-60`, `frontend/src/lib/components/chat/SwipeCarousel.svelte:1-96` | Chat renders the persisted branch. `TurnToolbar` shows `SwipeCarousel` only when `isAssistant && siblingCount > 1`. Carousel shows `N / M`, fetches siblings lazily via `GET /messages/:id/siblings`, last-position `+` triggers `onRegenerate`. Root turns have `siblingCount: 1` today, so no carousel ever appears on a greeting. |
| Showcase | `frontend/src/routes/character/[id]/+page.svelte:173-182`, `frontend/src/lib/components/nav/CharacterCard.svelte:39-48` | `Opening Words` blockquote (`firstMessage.slice(0, 300)`); card excerpt prefers a quoted line. |
| Seeds/docs | `backend/src/db/seeds/characters.ts:9,56`, `docs/schema.md:54-68`, `docs/architecture.md:137,273` | Document `first_message — opening greeting`, `parent_id NULL == greeting root`. |

## 3. Outside approaches surveyed (inspiration only, not spec)

Two reference behaviors were studied from screenshots. Neither is adopted wholesale; each contributes one idea.

**Reference A — tabbed greeting list in the editor, bottom pager in chat.**
Editor shows an `Initial messages (first messages) * (1/10)` section: a tab strip (`Message 1` + `+` to add), up/down reorder affordances, one large textarea for the selected message, token counts. Chat shows a bottom-docked pager (`< 3 / 10 >`) above the composer, detached from the message bubble. Strength: the bottom pager is a large thumb-friendly target on phones. Weaknesses for us: the hard `10` cap is an abuse-control number for a multi-million-user hosted service and has no meaning for a self-hosted single-user app; fixed tabs do not scale to long lists; a detached pager duplicates the swipe affordance we already own.

**Reference B — inline turn toolbar counter in chat.**
The greeting renders as a normal first turn; its header row carries an inline `1 / 6` counter plus icon actions (more, speak, forward, delete, edit). Strength: contextual — the control lives on the thing it controls, works for every turn uniformly, and composes with existing per-turn actions. Weakness: smaller touch targets than a docked pager; on a phone the header row competes with avatar, name, and action icons.

**Takeaway for FormaTavern:** both products agree on the core interaction (a greeting is a selectable variant, `N / M` counter, choice at the door). They differ only in *placement*. That is a presentation preference, which per our customization philosophy (§7) should be configurable, not hardcoded. Neither product's mid-chat door-swapping is adopted: rev 2 limits in-chat changes to the pre-reply re-pick (§6.3).

## 4. Design principles (binding on this proposal)

1. **FormaTavern-native first.** The schema serves our engine, editor, and chat tree. Third-party card fields are not constraints; if interop is ever wanted, it ships as an import/export adapter, not as schema mimicry.
2. **No artificial caps.** There is no `10` (or any N) limit on greeting count. We are a self-hosted app; storage is a local SQLite `TEXT` column and rendering cost is bounded because only one greeting is materialized per chat. The editor UI must therefore scale without fixed tabs (scrollable list/accordion, §8).
3. **Seed, not message (decided, review C-AG1).** A greeting is a chat seed: chosen once at creation, materialized as the single root, immutable afterwards. There is deliberately no mechanism for installing a new root halfway down the hallway — that would convert a seed into mutable chat content and inherit the `descendLatest`, state-stamping, and ordering defects documented in the review (§4.1–§4.4 of `alternate-greetings-review.md`). Branches (alternate replies *within* a door, via `regenerate`/`select`) stay orthogonal to greetings (*which* door was entered).
4. **Forks stay orthogonal.** FormaTavern has no chat-fork feature today (only character-duplicate); when one arrives, it copies a path, and the copy inherits the root's `greetingIndex` message metadata. Nothing in this proposal creates fork-specific cases: a forked path carries exactly one root like any other chat.
5. **Greetings are content, picker is presentation.** Anything about *which words* persists in the DB and engine; anything about *where the choice sits* (picker step, showcase browser, pre-reply switcher, docked vs. inline) ships as settings/hooks and never touches persistence.
6. **Backward compatibility is total.** Existing characters, chats, seeds, prompt-preview, and showcase keep working with zero migration-time data rewrites. `firstMessage` remains the canonical primary greeting. Seeded characters later given alternates become multi-greeting in Studio/showcase UI only — no stored rows change.
7. **Viewer supremacy.** As with custom styling, the reader's accessibility needs (reduced motion, touch target size, hide/show chrome) outrank author presentation.

## 5. Data model

```ts
// packages/shared/src/schemas/character.ts (proposed delta)
firstMessage: Type.String()            // unchanged: greeting #1, canonical
alternateGreetings: Type.Optional(Type.Array(Type.String(), { minItems: 0 }))
// No maxItems. Empty strings are pruned on save; matching Janitor-style
// "Message 3 is blank" states is a validation warning, not persisted data.
```

Derived view used everywhere in UI: `allGreetings = [firstMessage, ...alternateGreetings]`. Index `0` is always the primary.

Rejected alternative: replacing `firstMessage` with `greetings: string[]`. It would churn every consumer listed in §2 (creation, preview, showcase, seeds, `Opening Words`, card excerpts) for no behavioral gain. Keeping `firstMessage` stable makes the migration purely additive.

Validation rules:
- `alternateGreetings` entries: any string; `trim() === ''` entries are pruned both client-side (Studio save, with a toast/note) and server-side (shared save path — `CharacterPatchSchema` is a public boundary and hand-rolled API clients never run Studio code). The DB never stores blank greetings.
- `patch()` array semantics are whole-array **replace**, not append (per-field `input.x !== undefined ? input.x : current.x`). Studio's per-row move/duplicate/delete UI always sends the full array.
- Envelope parsing (`parseEnvelope`) applies per greeting identically to today; a greeting that fails to parse cleanly produces the same warnings UI per item, not a blocking error.
- Effective greeting count for UI counters is `allGreetings.length` after pruning.
- Greeting 1 (`firstMessage`) cannot be deleted while alternates exist: clearing it with alternates present would leave `allGreetings[0]` a hole. Studio forbids clearing greeting 1 while alternates remain (or demotes alternate 2 into the primary slot on save — implementation detail, specified at build).

## 6. Backend + persistence

### 6.1 Characters table (additive migration, v9)

Append-only migration **v9** in `backend/src/db/migrate.ts` (existing migrations are contiguous v1–v8; never edit one): `ALTER TABLE characters ADD COLUMN alternate_greetings TEXT` storing a JSON array, consistent with how `style`, `layout`, and `stateSchema` are stored as JSON text today. Null/missing reads as `[]`. Update `docs/schema.md`.

Full repository touch-point list (review audit — nine sites, miss one and the column silently never persists on that path) in `backend/src/db/repositories.ts`: `CharacterRow`, `cardToRow`, `rowToCard`, `stmtInsert`, `stmtUpsert`, `stmtInsertIfAbsent`, the bind-objects in `create()` / `upsert()` / `insertIfAbsent()`, and `patch()`'s inline `UPDATE … first_message = ?`. The new field must also be present in `CharacterCardSchema` itself (not only create/patch), because `upsert` and `insertIfAbsent` validate against it. Concurrent greeting edits collide under the existing OCC (`expectedUpdatedAt` → 409) like any other card edit.

Why a column, not a `character_greetings` table: greetings are small, always fetched with the card, never queried independently, and have no per-greeting metadata in this proposal. The trigger that converts the column into a table is per-greeting *titles* (metadata beside the text that a parallel array would desynchronise) — explicitly deferred (§9).

### 6.2 Chat creation (greeting choice at birth)

`ChatCreateSchema` gains `greetingIndex?: number` (0-based into `allGreetings`, clamped; out-of-range → `0`). `backend/src/routes/chats.ts` creation resolves the text through the identical envelope-parse → root-message path as today, stamping the root with `metadata: { greetingIndex, stateSource: 'initial' }` alongside the existing fields. The `greetingIndex` on the root is what preserves door identity for any future fork feature.

No snapshot: `allGreetings` is read live from the card (review C-AG3 / D2, decided **live**). The stated reason a snapshot was once wanted — surviving later card edits — is already satisfied by the root message's own immutable `content`. `chat.metadata` (`ChatMetadataSchema`, `narrative.ts:45-63`) stays dial-scale state and off the greeting path.

All existing call sites keep sending no index → behavior unchanged (greeting #1). The blank-greeting semantics are unchanged: blank selected greeting → no root, `activeLeafId: null` (`chats.test.ts:40-68` keeps passing as-is).

### 6.3 Pre-reply re-pick (the only in-chat greeting write)

Because greetings are seeds, there is **no greeting-switch endpoint and no mid-chat root creation**. The single permitted in-chat write: while the chat consists of exactly one childless root (no user reply, no descendants), the reader may replace it with another greeting from the live card. Implementation is an in-place content swap on the existing root row (re-parse envelope, update `content`/`segments`/`metadata.greetingIndex`), not a new row — so no sibling roots are ever created, `siblings()` counts never change, `select`/`descendLatest` are never involved, and the regenerate guard (`messages.ts:79-80`, `tree-lifecycle.test.ts:65-69`) is untouched. After the first user message lands, the root is immutable like every other message.

Edge cases: chat born without a root (blank primary, alternate picked later) — the re-pick creates its first root through the creation path. Deleting the active root (`messages.ts:422-487`) follows existing re-pointing logic. `GET /:id/messages` with no `activeLeafId` still returns `[]`. Scene state needs no special rule: a childless root swap happens before any state has diverged from `defaultState(character)`.

## 7. Chat UX: choosing the door

With the seed model there are two choice surfaces, both presentation-only, both reading the live card:

- **Creation-time picker (primary).** Extend the existing start-chat flow (`ActionHub` → `PersonaPicker`) with a greeting step: `N / M` browser over `allGreetings` (excerpt + full text on expand), selection sent as `greetingIndex` in the existing `POST /api/chats`. All other call sites (`+page`, `chats/+page`, `ChatViewport`) gain the same optional step; sending no index preserves today's one-click behavior. This is where the request's thumb-reachability note applies most: the picker is a full-screen step, not a header-row icon, so no docked pager is needed to make it tappable.
- **Pre-reply re-pick (secondary).** While the chat is still a single childless root, the greeting turn shows a greeting browser (same component as the picker, read-only excerpt + `N / M` counter) that performs the §6.3 in-place swap. It disappears permanently once the first user message exists — no carousel, no `+` affordance, and deliberately *not* wired to `onRegenerate` (on a root that path is a guaranteed 400 → toast today; overloading it would ship a fake control).
- **Control layers** (presentation-only, in increasing precedence): global default in Settings (e.g. `greetingPicker: 'full' | 'compact' | 'hidden'` for the creation step — exact key bikesheddable) → viewer kill-switch via existing a11y prefs for reduced motion / larger targets. No per-character layout override in v1: `character.layout` owns message layout (v7 `chat_layout_neutrality`), and a greeting picker is not message layout — adding it now creates a second owner for one decision (review D4, decided **two layers**). It remains purely additive later. Both surfaces ship stable `ft-*` hooks (`HOOKS.chat.*`, e.g. `ft-greeting-picker`) under `data-ft-surface="chat"` so custom CSS can restyle them without touching logic.
- **Behavioral details:** counter format `N / M` matches both references and our existing carousel language. Keyboard: `Alt+Left/Right` (`actions/shortcuts.ts:41`, `SettingsSheet.svelte:545`) moves the picker selection. Reduced-motion: instant swap, no slide animation.

## 8. Studio editor UX (no fixed tabs)

Because greeting count is unbounded (§4.2), the editor must not use a fixed tab strip. Proposed `VoicePanel` redesign:

- Greeting list as a scrollable section: each item an expandable row (`Greeting 1 (primary)`, `Greeting 2`, …) with inline textarea, per-item token count, per-item envelope warnings, and row actions: move up/down, duplicate, delete. Greeting 1 cannot be deleted (it is `firstMessage`); deleting it clears its text instead.
- `+ Add greeting` appends at the end; rows are never paginated. For very long lists the section scrolls internally and collapses non-focused rows — the same accordion pattern as the chats hub mini-showcases.
- Draft (`draft.svelte.ts` — three separate edits): `createEmptyCard` gains `alternateGreetings: []`; constructor clones `initialCard.alternateGreetings ?? []`; `save()` prunes blank entries client-side before `POST/PATCH`. Server prunes independently (§5).
- `LivePreview`: greeting tab gains a selector across `allGreetings` (defaults to #1); switching previews that greeting's segments through the existing `TurnRow`/`SpeechBubble` path. `StudioPromptPanel`: `cardKey` includes a hash of the greeting list (otherwise the panel serves a stale preview when only alternates change); prompt-preview gains an optional per-greeting parse list (or selected-index echo) without changing the `BuiltPrompt` shape. Note the preview endpoint's *request* shape widens for free once the field joins the create schema — expected schema-diff, not a surprise.
- Discard/autosave behavior unchanged (whole-card snapshot already covers the new field).

## 9. Showcase, cards, and prompt-preview

- Character page `Opening Words` fallback (`character/[id]/+page.svelte:173-182`): with one greeting, unchanged. With several, render the primary plus a `1 / M` browser reusing the read-only carousel styling (no chat creation side effects).
- `nav/CharacterCard` excerpt (`CharacterCard.svelte:39-48`): keep preferring the primary greeting's quoted line; no change needed unless a future proposal wants rotating excerpts.
- Prompt-preview (`characters.ts:79-169`, `prompt/types.ts:111-119`): `greeting` field stays singular for the selected greeting; optionally add `greetings: Array<{index, adherent, warnings}>` summary so authors see which alternates parse cleanly. No `BuiltPrompt` change: greetings are history content, never prompt scaffolding.

## 10. Migration, back-compat, and testing

- Migration v9 is additive (`ADD COLUMN`, nullable, `[]` at read time). Downgrade-safe: old code ignores the column. `history.ts:127-132` (synthetic `[Scene begins.]` before a leading assistant message) and `budget.ts:102-120` are untouched — greetings stay ordinary history content and `BuiltPrompt` determinism is unaffected.
- All existing tests keep passing unchanged, including `backend/test/routes/chats.test.ts:40` (blank greeting → zero messages, `activeLeafId: null`) and `tree-lifecycle.test.ts:52` (root-regenerate guard — no longer needs any exception, since no greeting endpoint touches regeneration). `packages/shared/test/schemas.test.ts` gains optional-field cases; none modified.
- New tests: schema (prune/parse per item, server-side prune without Studio), repo round-trip with/without the v9 column on all four statement paths, chat creation with `greetingIndex` (clamped, `greetingIndex` stamped on the root), pre-reply re-pick (content swap, same row id, re-parse; forbidden after first user message), prompt-preview per-greeting parse list.
- Frontend checks: `svelte-check`, Studio save/discard/autosave round-trip with multiple greetings, picker step on all start-chat call sites, pre-reply browser appear/disappear transition, mobile viewport thumb reach. Seeds gain one multi-greeting example card so the feature is exercisable without authoring one.

## 11. Rollout order (each step independently shippable)

1. Shared schema + tests (`character.ts` field, `chat.ts` index field).
2. DB migration v9 + full nine-point repository round-trip + `docs/schema.md`.
3. Chat creation `greetingIndex` with root `greetingIndex` stamp (no UI; API-only, all existing call sites unchanged).
4. Studio editor list UI + draft save/prune (client + server) + LivePreview selector + `cardKey` hash.
5. Creation-time greeting picker step + showcase multi-greeting browser + prompt-preview summary + setting + hooks.
6. Pre-reply re-pick on childless roots.

## 12. Open decisions for reviewers (⏩ Dn) — rev 2 resolutions

- **D1 — Field name: `alternateGreetings` (decided).** Reads as "everything after the canonical first", survives an eventual `greetings[]` refactor with index 0 stable, and keeps `firstMessage` unrenamed so §2's consumer list is untouched. `extraGreetings` wrongly implies second-class greetings.
- **D2 — Snapshot vs. live: live (decided, reverses rev 1).** No `availableGreetings` in `chat.metadata`. The born-with greeting is frozen in the root message's own `content`; the *set* is always read from the card.
- **D3 — Switch endpoint: none (decided, replaces rev 1).** No `POST /chats/:id/greeting`, no `regenerate` extension. Deterministic selection lives at creation (`greetingIndex`) and in the pre-reply swap; generation stays untouched. If a future proposal re-opens mid-chat switching, it must answer review C-AG2/C-AG4 first.
- **D4 — Setting scope: two layers (decided).** Global default + viewer kill-switch. No per-character layout override in v1; purely additive later.
- **D5 — Deletion semantics: no "in use" guard (decided, strengthened).** Greetings are referenced by nothing (text, not pointers — deletion orphans nothing). Addition: greeting 1 cannot be deleted/cleared while alternates exist (§5).
- **D6 — Per-greeting extras: deferred (decided).** Titles, images, scenario triggers, greeting-specific state all out. Recorded trigger for a future table migration: per-greeting *titles*.
