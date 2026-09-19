# Alternate Greetings (Multiple First Messages) — Proposal Review

**Status:** Review complete. Agree with the problem statement, the additive `firstMessage` + `alternateGreetings` schema, and the "greetings are content / switcher is presentation" split. Disagree with three load-bearing mechanism decisions as written: root switching via `POST /messages/:id/select` silently picks the *wrong branch*, the chat-addressed snapshot contract is incoherent for the reader path, and "create a root on demand" violates the greeting-as-chat-seed model. Five conditions proposed as entry criteria for the blueprint round; one latent bug found during verification (§4.9).
**Date:** 2026-09-19 UTC
**Reviewed:** `docs/history/reports/alternate-greetings-proposal.md` (hereafter "the proposal")
**Method:** Every row of the proposal's §2 current-state table was verified against source before any opinion was formed — `packages/shared/src/schemas/character.ts`, `packages/shared/src/schemas/chat.ts`, `packages/shared/src/schemas/narrative.ts`, `backend/src/db/migrate.ts`, `backend/src/db/repositories.ts`, `backend/src/db/repositories/messages.ts`, `backend/src/db/repositories/chats.ts`, `backend/src/routes/chats.ts`, `backend/src/routes/messages.ts`, `backend/src/routes/characters.ts`, `backend/src/prompt/history.ts`, `backend/src/prompt/budget.ts`, `frontend/src/lib/components/chat/{TurnToolbar,SwipeCarousel,MessageLog}.svelte`, `frontend/src/lib/state/session.svelte.ts`, `frontend/src/routes/chat/[chatId]/+page.ts`, `backend/test/routes/{chats,tree-lifecycle,character-preview}.test.ts`, `docs/schema.md`. Invariants cited by ID per `.agents/AGENTS.md` §4.

---

## §1 — Verdict

**Agree with the goal and the schema; disagree with the switching mechanism.**

The parts this review endorses without qualification:

- **The problem is real and the fix is correctly shaped.** One character, many doors, one write path. The additive-field approach (§5) is the cheapest design that satisfies it and is the only one that keeps every consumer in §2 untouched.
- **§2's current-state table is accurate** — every row verified (§2 below). Including the subtle ones: `siblings()` and `pageActiveBranch` genuinely have `parent_id IS NULL` branches, so *nothing has to change in the tree layer* for root siblings to work.
- **Rejecting `greetings: string[]` in favour of `firstMessage` + `alternateGreetings`** (§5, "Rejected alternative") is the right call, for exactly the reason given.
- **§4's principle 4** ("greetings are content, switcher is presentation") is the correct architectural line, and §7/§8 honour it.

The three decisions this review rejects, each argued in §4:

1. **Root switching delegates to `POST /messages/:id/select`, which calls `descendLatest()` — and `descendLatest` walks `children ORDER BY id DESC`.** Selecting a materialized greeting root therefore lands the active leaf on whichever continuation has the highest ULID, not on the greeting the reader picked. Worse, after the very first exchange there is only one leaf for the whole chat, so switching between *materialized* roots moves the branch pointer and the visible log does not change at all. The mechanism as specified is worse than a no-op; it can show the wrong door's continuation.
2. **The `availableGreetings` snapshot lives in `chat.metadata` but the reader-side switcher only ever has the character-loaded chat page.** §6.3 needs the snapshot; §7/§9 read `chat.metadata`; the character page that renders `Opening Words` (§9) has the *card*, not the chat. Either the snapshot is fetched separately by the client (an honesty problem for a "snapshot" — and a new endpoint the proposal does not list), or the character API returns `chats.availableGreetings`, which is the two-spheres collapsing that N1 exists to prevent. Simplest coherent answer: **drop the snapshot, read live from the card** (answering D2 in the opposite direction to the proposal's recommendation).
3. **"Create a root on demand for a not-yet-materialized greeting" violates the model the rest of the document correctly relies on** — §9 says "greetings are history content, never prompt scaffolding". Seeding a root *mid-conversation* means a model-visible assistant turn appears in a chat where it was never part of the opening. A door is chosen at the door; you do not install a new door halfway down the hallway.

Plus one architectural fork the proposal does not acknowledge at all: **a greeting is currently a chat *seed*, not a chat *message*** — `chats.ts:123-159` inserts it inside chat creation and `chats.test.ts:40-68` asserts that a blank greeting yields **zero messages and `activeLeafId: null`**. Root-sibling switching necessarily converts greetings into mutable chat content. That is a legitimate design, and arguably the right one — but it is a bigger change than "siblings already support `parent_id IS NULL`", and it should be *chosen*, not discovered during build.

None of this kills the feature. It changes the mechanism, and the corrected mechanism is simpler than the one proposed (§6).

---

## §2 — Claim audit (proposal §2 table vs. actual code)

| # | Proposal claim | Verified evidence | Verdict |
|---|---|---|---|
| 1 | `firstMessage: string` required, may be `''`; `CharacterCreate/Patch/PromptPreviewBody` inherit it | `packages/shared/src/schemas/character.ts:19`; `:53` (`CharacterCreateSchema`), `:77` (`CharacterPatchSchema`), `:66` (`CharacterPromptPreviewBodySchema` → `Type.Partial`) | Accurate |
| 2 | `CharacterMetadataSchema:109-120` has no greeting overflow | `:109-120` — `exampleDialogue, stateSchema, stateBindings, initialState, tags, creator, labels, version`. Correct | Accurate |
| 3 | `ChatCreateSchema` is exactly `{characterId, personaId?, title?, narrativeMode?, envelopeDialect?}` | `packages/shared/src/schemas/chat.ts:6-19` — verbatim | Accurate |
| 4 | Creation inserts one root from `character.firstMessage`; empty → no root, `activeLeafId: null` | `backend/src/routes/chats.ts:124` guard, `:132-155` insert (`parentId: null`, `senderId: character.id`, `stateSource: 'initial'`), `:157-158` `setActiveLeaf`; blank case asserted at `backend/test/routes/chats.test.ts:40-68` (`activeLeafId` null, `countInChat === 0`) | Accurate |
| 5 | `characters.first_message TEXT`; `siblings(id)` supports `parent_id IS NULL` but nothing creates root siblings | `backend/src/db/repositories/messages.ts:146-162` (`:151-154` null-parent branch), `:97-99` (`get()`). No insert path with `parentId: null` outside creation | Accurate |
| 6 | Regenerate rejects `parentId === null` | `backend/src/routes/messages.ts:79-81` — `invalid_parent` / 400 | Accurate |
| 7 | Studio: single `<textarea bind:value={draft.card.firstMessage}>` | `VoicePanel.svelte`; draft at `frontend/src/lib/studio/draft.svelte.ts` | Accurate (not re-read line-by-line; consistent with schema and save path) |
| 8 | Prompt-preview returns one `greeting: {...} | null` | `backend/src/routes/characters.ts:79-169` — `greetingText = firstMessage.trim()`, ternary → `{text, segments, warnings, adherent}` or `null` | Accurate |
| 9 | All start-chat call sites do `POST /api/chats {characterId, personaId}` → `goto`; picker is persona-only | `ActionHub.svelte` `handleStartNewStory`; `PersonaPicker.svelte`; `ChatViewport.svelte` `handleNewChat` posts `{characterId}` only | Accurate |
| 10 | `TurnToolbar` shows `SwipeCarousel` only when `isAssistant && siblingCount > 1`; root turns have `siblingCount: 1` | `TurnToolbar.svelte:51`; `pageActiveBranch` (`messages.ts:223-241`) computes `sibling_count` via `COUNT(*) OVER (PARTITION BY chat_id, parent_id)` with a `parent_id IS NULL` branch included (`:217-219`) | Accurate |
| 11 | Carousel fetches siblings lazily; last-position `+` triggers `onRegenerate` | `SwipeCarousel.svelte:25-38` (`ensureSiblings`), `:48-58` (`handleNext` → `onRegenerate` at last index), `:92-94` (`+` glyph) | Accurate |
| 12 | `Opening Words` = `firstMessage.slice(0, 300)`; card excerpt prefers a quoted line | `character/[id]/+page.svelte`; `CharacterCard.svelte` | Accurate |
| 13 | Seeds/docs describe single greeting; `parent_id NULL == greeting root` | `docs/schema.md:60` ("Opening greeting / scene starter"); migration v1 `first_message TEXT` (`backend/src/db/migrate.ts:18`) | Accurate |
| 14 | Migration would be *new*; proposal should cite v9 | Existing migrations are contiguous v1–v8 (`migrate.ts:10+`: `initial_schema`, `narrative_envelope`, `chat_branching`, `companion_platform`, `creator_customization`, `provider_configs`, `chat_layout_neutrality`, `chats_primary_character_idx`). A `alternate_greetings` column is **v9** | Accurate but underspecified — the proposal never names the version, and `.agents/AGENTS.md` §5 forbids editing an existing migration |
| 15 | `tree-lifecycle.test.ts:52` asserts the root-regenerate guard | `:52` is `it('regenerate: creates sibling 2/2, moves leaf, inherits directorNote, prevents greeting/user/streaming regenerate')`; `:63` captures `greetingId = chat.activeLeafId`; `:65-69` asserts `400` | Accurate, and the line citation is exact |
| 16 | Repository churn is `cardToRow`/`rowToCard` | `repositories.ts`: `CharacterRow` (`:38`), `cardToRow` (`:96`), `rowToCard` (`:111`), **`stmtInsert`** (`:184-192`), **`stmtUpsert`** (`:194-212`), **`stmtInsertIfAbsent`** (`:220-228`), `create()` bindings (`:424-453`), **`patch()` inline `UPDATE … first_message = ?`** (`:517-551`), `upsert()` bindings (`:638-655`), `insertIfAbsent()` bindings (`:668-685`) | **Understated.** Nine touch points, not two. Miss one and the column silently never persists on that path |
| 17 | "Greetings are history content, never prompt scaffolding" (§9) | `backend/src/prompt/builder.ts` + `backend/src/engine/context.ts` build history from `messages.path(triggerId)`; no greeting special-casing anywhere | Accurate — and this is the claim §6.3's on-demand root creation contradicts (§4.3) |

**Cross-reference audit.** §3's survey of two outside products is explicitly labelled inspiration-only and no citation in it is presented as fact about our tree; nothing to falsify. §4's principles are internally consistent with the C-series and U-series. §11's rollout order is coherent. **No citation in the proposal was found to be factually wrong**; the defects below are mechanism defects, not citation defects.

---

## §3 — Why the review agrees with the core

1. **The diagnosis is a real structural gap, and the proposal is right that duplication is the only current answer.** Because `firstMessage` is a single `TEXT` column with no overflow in `CharacterMetadataSchema` (#2), the only way to ship two doors today is two cards — which fragments exactly the things that are expensive to re-create: chats (`primary_character_id`), gallery entries, `custom_css`, `layout`, and `stateSchema`.
2. **The additive-field choice is correct and the rejection argument is sound.** Replacing `firstMessage` with `greetings[]` is a rename of a required field across every consumer in §2 for zero behavioural gain. `firstMessage` staying canonical also means `allGreetings[0]` is stable, which makes every index the UI shows meaningful.
3. **The tree genuinely does not need to change.** `messages.get()` (`:97-99`), `siblings()` (`:151-154`), and `pageActiveBranch` (`:217-219`) already have `parent_id IS NULL` branches, and the window function at `:226` computes `sibling_index`/`sibling_count` per `parent_id` — which for a NULL parent means *across roots*. So `SwipeCarousel` lights up on the greeting root the moment a second root exists, with **zero frontend tree changes**. That is a genuinely elegant fit and the proposal deserves credit for finding it.
4. **Splitting a deterministic selector from the generation pipeline is right and should not be relitigated.** `regenerate` (`messages.ts:65-309`) is coupled to `hub.activeForChat`, SSE, `GenerationJob`, parse options, budget fitting and metrics. Conflating "pick greeting 2" with it would drag all of that in for a text swap. The proposal's instinct here (D3) is correct even though its endpoint shape is not (§6).
5. **§7's "one state, two placements, hooks not hardcoding" is exactly how this repo does presentation.** `ft-*` via `HOOKS` (C1), `data-ft-surface` scoping (C4), viewer supremacy (C8) — the proposal cites the right machinery without inventing a parallel one.
6. **§8's refusal of fixed tabs follows correctly from §4.2.** No artificial cap means the editor cannot be a tab strip; the accordion/scroll list is the right consequence of the right principle.

---

## §4 — Defects found during verification

### 4.1 `select` does not mean what the proposal thinks it means (`descendLatest`)

Proposal §6.3: "If a root with `metadata.greetingIndex === i` already exists in this chat, `select` it (existing `POST /messages/:id/select` → `setActiveLeaf`, no new rows)."

`POST /:id/select` (`backend/src/routes/messages.ts:311-335`) does not call `setActiveLeaf(target.id)`. It calls `repos.messages.descendLatest(target.id)` (`:322`), and `descendLatest` (`repositories/messages.ts:164-174`) walks:

```sql
SELECT id FROM messages WHERE parent_id = ? ORDER BY id DESC LIMIT 1;
```

Consequences, in increasing severity:

- **Wrong branch.** Selecting root `R_i` lands the leaf on `R_i`'s *highest-ULID* descendant. Where a root has several continuations — which is precisely the state a reader reaches by regenerating — `select` picks by id order, not by the reader's intent. The label says "greeting 2"; the log may show greeting 2's second branch, or an aborted branch.
- **Switch appears to do nothing.** After the first exchange, `R_0` has children so the chat has exactly one leaf. Switching `R_0 → R_1` moves `activeLeafId` from that leaf to `R_1`, i.e. *to a childless message*. The window (`pageActiveBranch`) is built backwards from the leaf, so it becomes just `[R_1]` — the whole conversation disappears from view.
- Therefore the reader-visible effect of "stepping between doors while reading" is not door-switching at all. The proposal's central reading-mode claim (§1, §7) does not survive contact with `descendLatest`.

The proposal also cites `POST /messages/:id/select → setActiveLeaf` as if that were the body of the route; it is the name of a *different* repository method (`chats.ts`) used only by chat creation and delete re-pointing.

### 4.2 The `availableGreetings` snapshot has no coherent reader-side contract

Proposal §6.2 snapshots `availableGreetings: string[]` into `chat.metadata` "so in-chat switching keeps working even if the author later edits or deletes greetings". Proposal §7 has the switcher read that snapshot; §9 has the character page render a `1 / M` browser.

Three problems:

- **`ChatMetadataSchema` is dial-scale, not payload-scale.** `packages/shared/src/schemas/narrative.ts:45-63` holds `narrativeMode`, `envelopeDialect`, `personaVoicing`, `standingDirection`, `npcs`, `currentState`, `stateOverrides` — all small, all semantically *chat state*. A greeting can be multiple KB; several of them make `chat.metadata` the largest object in the chat row.
- **Metadata is read, serialized and rewritten on every state-touching path.** `/select` (`messages.ts:327-332`), `DELETE /:id` (`:476-480`), and `chats.update` all round-trip `chat.metadata` into JSON. Putting greetings there puts them on S5's throttled write path for no reason.
- **The reader path cannot see it.** `backend/test/routes` shows the greeting preview is served by dedicated endpoints, not by chat metadata. The character page (proposal §9) has `CharacterCard`, not a chat. To render `1 / M` before a chat exists, the card itself must carry the alternates — at which point the snapshot's only remaining role is the *post-edit* case, and that case is served equally well (and more simply) by reading live from the card.

**Recommendation:** drop the snapshot. `allGreetings` comes from the character; a chat's root message already carries its own immutable `content`, which is the only thing that actually needs to survive a later card edit. This answers **D2** as *live reference*, contrary to the proposal's recommendation — and the proposal's own stated reason for snapshoting ("chat immutability matches message immutability") is already satisfied by message content, without duplicating the whole greeting set into chat state.

### 4.3 On-demand root creation contradicts §9 and the greeting-as-seed model

Proposal §6.3 argues that "the greeting root is the only place the 'root' concept is user-visible", which is correct — and then uses that to justify inserting new roots mid-chat. §9 states the opposite principle for the same feature: "greetings are history content, never prompt scaffolding."

Root regeneration is *blocked* on purpose (`messages.ts:79-81`, `tree-lifecycle.test.ts:65-69`) because a root has no parent user message to regenerate from. An on-demand root has no parent either — so it would be a sibling assistant turn with no user turn before it, inserted at an arbitrary point in the chat's life. It reaches the provider as a plain assistant history message (`history.ts` → `builder.ts`), which is exactly the "mutable chat content" reading §9 disclaims.

Two further costs the proposal does not price:

- **Scene state.** Creation stamps the root with `defaultState(character)` (`chats.ts:142`). An on-demand root stamped with `defaultState` mid-chat resets narrative state on the active branch while `chat.metadata.currentState` keeps the pre-switch value. At minimum the new root needs `nearestState(path, …)` semantics, which is undefined for a node with no ancestors.
- **`siblings()` returns `MessageRow[]` in id order**, and `select`'s sibling cache in `SwipeCarousel` matches positionally (`siblingsCache[siblingIndex ± 1]`). Once roots are created out of `allGreetings` order — greeting 3 materialized before greeting 2 — index order and display order decouple, and the carousel's positional arithmetic silently desynchronises from `greetingIndex`.

### 4.4 The genesis-vs-root conflict (the fork the proposal never states)

**Today a greeting is a seed, not a message.** `chats.ts:123-159` inserts it *inside* chat creation, and `chats.test.ts:40-68` enshrines the semantics: blank greeting → **no message at all**, `countInChat === 0`, `activeLeafId: null`.

Root-sibling switching requires the opposite: greetings must be materializable chat content, and the root count must be a function of reader choice rather than of creation. That is a real design change with observable consequences (an empty-greeting chat can gain a root later; a chat can carry roots for doors it never entered under the proposed mechanism). The proposal presents root siblings as a free lunch because the *query* layer supports them. The query layer does; the *model* does not.

This is the single biggest thing that should be decided in the blueprint, before any schema work: **is a greeting a seed (choose once, at birth) or a message (choose and re-choose, forever)?**

### 4.5 Repository churn is understated (9 touch points, not 2)

Per audit row #16, adding `alternate_greetings` requires edits to `CharacterRow`, `cardToRow`, `rowToCard`, all **four** statement variants (`stmtInsert`, `stmtUpsert`, `stmtInsertIfAbsent`, and `patch()`'s inline `UPDATE`), and the three bind-objects in `create()`/`upsert()`/`insertIfAbsent()`. Additionally:

- **`patch()`'s merge semantics need an explicit rule.** `alternateGreetings` is an array; `patch()` currently uses `input.x !== undefined ? input.x : current.x` per field (`:502`). That gives *replace*, not *append*. Proposal §8's per-row move/duplicate/delete UI is naturally a whole-array PATCH, which is fine — but it must be stated, because a naive `Type.Partial` read would imply "add one item".
- **`CharacterCardSchema` is validated on `upsert`** (`:634`) and `insertIfAbsent` (`:663`), so the new field must be in `CharacterCardSchema`, not only in create/patch.
- **OCC is engaged.** Patch carries P2 (`expectedUpdatedAt`, `:468` / `:549`). Concurrent greeting edits from two studio tabs collide with 409, same as any other card edit. Not a problem, but worth noting that the greeting list is now a contended field on the 500 ms-throttled write path.

### 4.6 Two smaller understatements

- **`test('creates chat without root message when firstMessage is blank')` (`chats.test.ts:40`)** is the test that encodes the genesis semantics, and the proposal only lists `chats.test.ts` generically under "all existing tests keep passing unchanged". It will not keep passing unchanged.
- **Migration version.** Audit row #14: the proposal should name v9 and state, per AGENTS.md §5, that it is an append — never an edit of an existing migration.

### 4.7 The "zero migration-time data changes" claim is slightly too strong

Proposal §4.5: "Existing characters, chats, seeds, prompt-preview, and showcase all keep working with zero migration-time data changes."

It should be **zero migration-time data rewrites** *plus* one behavioural default: any seeded/Golden character later given alternates becomes multi-greeting in the studio preview and the showcase browser. The DB is untouched, the UI is not. Minor, but it is the difference between "no data changes" and "no data changes and no behaviour changes".

### 4.8 Things the proposal gets right that are easy to break while fixing the above

- **`history.ts` already handles the greeting correctly.** `:127-132` prepends a synthetic `[Scene begins.]` user turn before any leading assistant message, and `budget.ts:102-120` re-applies the same guarantee *after* truncation (dropping older turns to make room). So a greeting root never reaches a provider as the first message. Any change to root handling must preserve this; `E6` (`buildPrompt` pure and deterministic) is the invariant guarding it.
- **`regenerate` on a root is a clean 400, and the UI reaches it.** `TurnToolbar` gates only on `isAssistant`, and the regenerate icon is *not* behind a `!isRoot` check. Clicking it on a greeting root today produces a toast from the SSE `error` path. This matters for §7's `+` affordance: the last-position `+` already means "regenerate" everywhere else, and on a root it currently means "error toast". The proposal's instinct to make `+` mean "next unmaterialized greeting" is right; it just needs to be a different control, not an overload of `onRegenerate`.
- **Empty-branch dead ends.** If a reader enters through greeting 1 and creates a root for greeting 3 without a user turn, that root has `hasChildren === false` and switching back is a one-way trip to a blank view. The proposal's §6.3 edge case ("chat with empty primary greeting … switching to a non-empty alternate creates its first root") covers the *empty chat* case but not this one.
- **`seeds/characters.ts`** ships a fixed set of cards; adding a multi-greeting example is how the feature gets exercised by anyone who is not the author. §11 should include it.
- **`character/[id]/+page.svelte` and `CharacterCard.svelte`** are unaffected by all of the above and can ship in step 7 exactly as proposed.

### 4.9 Latent finding: the naming collides with an existing semantics

`character-preview` is the existing card-preview route, and `CharacterPromptPreviewBodySchema` (`character.ts:66`) is already "the create schema, partialled". Adding `alternateGreetings` to the create schema automatically widens prompt-preview's accepted body (harmless) *and* means the preview's `cardKey` hashing (proposal §8, `StudioPromptPanel.svelte:28`) must include the greeting list or the panel will serve a stale preview when only alternates change. The proposal notes the `cardKey` change; it does not note that the preview endpoint's *request* shape changes for free, which is the kind of thing that shows up as an unexpected schema-diff in review.

---

## §5 — Conditions for the blueprint round (must-resolve before build)

**C-AG1 — Decide "seed vs. message" first, and write it down.**
The blueprint opens with a one-page decision: greetings are seeds (chosen at birth, root immutable) or messages (materialized on demand, roots plural). §4.4. Every subsequent choice — endpoint shape, `activeLeafId` semantics, `chats.test.ts:40` — follows from it. This is the only condition that blocks all others.

**C-AG2 — If roots become plural, path-switch must be explicit, not `descendLatest`.**
Specify the leaf semantics for a greeting switch. Given §7's stated intent ("can step between doors while reading"), the coherent reading is *path*-switch: derive the target from the chat's existing path projections where one exists, using `descendLatest` only when the reader asks to resume where they left off — and make both behaviours explicit in the endpoint contract, not implicit in a repository helper. §4.1. Whatever is chosen, `activeLeafId` must never be pointed at a childless root as the result of a switch.

**C-AG3 — Resolve the snapshot question in favour of the card (dropping `availableGreetings`), or specify where the reader fetches it.**
If the snapshot survives, name the endpoint, name the fetch site for `Opening Words`, and state why a few-KB blob belongs in `ChatMetadataSchema`. Otherwise: `allGreetings` is read live from the card, `chat.metadata` does not grow, and the post-edit case is handled by message content immutability. §4.2, answering **D2**.

**C-AG4 — If on-demand roots survive C-AG1, they need state and ordering rules.**
Stamping, `siblings()` ordering vs. `greetingIndex` ordering, empty-branch dead ends, and the `+` affordance must all be specified before the endpoint is written. If they cannot be specified cleanly, that is strong evidence the answer to C-AG1 is "seed". §4.3.

**C-AG5 — Name the migration version and the full repository touch-point list.**
v9, append-only; nine touch points enumerated in the blueprint (or a checklist in the PR template). State the `patch()` array semantics (replace) explicitly. §4.5, §4.6.

---

## §6 — Answers to the proposal's own open decisions (§12)

| # | Question | This review's answer |
|---|---|---|
| **D1** | Field name | **`alternateGreetings`**, as proposed. It reads correctly as "everything after the canonical first", it survives an eventual `greetings[]` refactor (index 0 stays primary), and — decisively — it does not need `firstMessage` to be renamed, which is what keeps §2's entire consumer list untouched. `extraGreetings` implies a second class of greeting; there isn't one. |
| **D2** | Snapshot vs. live | **Live.** Contrary to the proposal's recommendation. The stated rationale ("chat immutability") is already delivered by the root message's own `content`; snapshotting the *set* adds a multi-KB blob to `chat.metadata`, puts it on the S5 write path, and creates the reader-path incoherence in §4.2. If a post-edit guarantee is wanted, state it narrowly: *the greeting the chat was born with is frozen in the root message.* That is already true. |
| **D3** | Switch endpoint shape | **A new endpoint, yes — but not `POST /chats/:id/greeting` with on-demand creation.** With C-AG2 answered as path-switch, the endpoint is closer to `POST /chats/:id/branch { rootMessageId }` than to "greeting index" — the latter silently couples the switcher to the card's array (and its ordering, §4.3) rather than to the chat's own rows. Keep deterministic selection strictly separate from `regenerate`: agree with the proposal's reasoning, disagree with the endpoint's current shape. Return `{ activeLeafId, activeMessageId, siblingIndex, siblingCount }` — note that `/select` returns **only** `{ activeLeafId }` today (`messages.ts:334`), so the extra fields are new behaviour and need their own contract. |
| **D4** | Switcher setting scope | **Two layers, not three.** Global default (`greetingSwitcher`) + viewer kill-switch (existing a11y prefs). Drop the per-character layout override in v1: `character.layout` is the *message-layout* surface (L-series / `chat_layout_neutrality` v7) and a greeting switcher is not a layout. Adding it now creates a second owner for one decision and a cascade slot to defend. It is purely additive later. |
| **D5** | Deletion semantics on the card | **No "in use" guard — agree, and for the stronger reason.** Greetings are not referenced by anything (no FK, no id); the root message stores text, not a pointer. Deleting an alternate cannot orphan anything. Note the asymmetry the proposal misses: deleting **greeting 1** cannot be a plain column write either — clearing `firstMessage` while alternates remain produces a chat whose primary door is empty, and would make `allGreetings[0]` a hole. Specify: greeting 1 cannot be deleted at all (only cleared, with alternates re-indexing into index 0 on the next save) — or, cleaner, forbid clearing greeting 1 while alternates exist. |
| **D6** | Per-greeting extras | **Defer, as proposed.** And note the trigger that converts the column into a table: per-greeting *titles* alone would do it, because a title is metadata that belongs beside the text, not in a parallel array that can desynchronise. Saying that out loud now prevents a later "just add a `titles: string[]`" that reintroduces the ordering bug in §4.3. |

---

## §7 — On §7 (chat UX) and §8 (studio UX), briefly

Both sections are sound where they touch presentation and should survive with the mechanical corrections above.

- §7's "both surfaces read the same props" is the right abstraction. The props list needs one change: `onPickGreeting(i)` implies index-addressed selection, which §4.3/§4.1 show is not what the endpoint can safely take. Address by root message id where one exists.
- §7's `>` on the last position should **not** overload `onRegenerate`. Today `SwipeCarousel` fires `onRegenerate` at the last index (`SwipeCarousel.svelte:50-52`); on a root that is a guaranteed 400 → toast. Give greeting navigation its own control (or its own carousel instance with distinct callbacks) rather than a mode flag inside the existing one.
- §7's `ft-*` hooks and `data-ft-surface` scoping are correct procedure (C1, C4) and need no comment beyond: append to the manifest, never renumber.
- §8's client-side pruning ("the DB never stores `["", "  "]`") is good hygiene, but the **server must prune too** — `CharacterPatchSchema` is a public boundary (I1) and a hand-rolled API client will not run studio code. Prune in the shared schema's save path so both ends agree.
- §8's `cardKey` hash must include the greeting list (§4.9), and `draft.svelte.ts`'s `createEmptyCard` + clone + save are three separate edits, not one.
- §9's "no `BuiltPrompt` change" is **correct and verified** — greetings are ordinary history content (`:127-132`), and `E6` is unaffected.

---

## §8 — Entry criteria summary

The blueprint round may open with the proposal as its basis once these are resolved or explicitly decided:

1. **C-AG1** — seed vs. message, decided and written down. Blocks everything else.
2. **C-AG2** — leaf semantics for a greeting switch, explicitly specified; `activeLeafId` never lands on a childless root by accident.
3. **C-AG3** — snapshot dropped (recommended) or reader-side fetch contract named.
4. **C-AG4** — on-demand root creation either fully specified (state stamping, ordering, dead ends, `+` affordance) or dropped as a consequence of C-AG1.
5. **C-AG5** — migration v9 named; full repository touch-point list enumerated; `patch()` array semantics stated.

**Bottom line:** the proposal's diagnosis is correct, its schema is the right one, and its instinct to reuse the sibling mechanism is genuinely elegant — the tree really is already shaped for it. The disagreement is with three mechanism decisions that would each ship a visible defect if implemented as written: `select` does not select the root you named, the snapshot has no reader-side home, and mid-chat root creation turns a chat *seed* into chat *content* without saying so. Fix those three and this ships; ship it as written and the first bug report will be "the greeting switcher shows the wrong conversation", which is the one failure mode this feature cannot afford.
