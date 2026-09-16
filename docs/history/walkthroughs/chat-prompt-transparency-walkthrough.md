# Chat Prompt Transparency Walkthrough: User Turns + Template Leak (Batch 1) + Inline Segment Editing (Batch 2) + Chat Prompt Preview (Batch 3) + Studio Prompt Preview (Batch 4) + Template Editor (Batch 5)

As-built record for [`docs/history/reports/chat-prompt-transparency-scope.md`](../reports/chat-prompt-transparency-scope.md) §2–§3 (Batch 1, built in the order: user-segment persistence → scroll-chain fix → template neutralization), §7 (Batch 2: inline per-segment editing), §5 (Batch 3: chat prompt preview), and §6 (Batch 4: Studio prompt preview). Scope §4 untouched; §8 remains scoped (not implemented) and deferred. Batch 1 commits: `051244c` (chat fixes), `5f4719d` (prompt fix); scope-doc status updates in `4718320`. Batch 2 commits: `c9bc1b8` (feat), `e3b49ce` (docs). Batch 3 commits: `83b0c7d` (feat), `c97d77c` (docs). Batch 4 commits: `1877c83` (feat), `57d5f55` (docs). Batch 5 (uncommitted at time of writing): §4 implementation + tests; scope-doc §4 status update.

## 1. What changed

* **User-turn persistence (`backend/src/routes/chats.ts`)** — new `buildUserSegments()` maps `narrativeRole` + `senderName` + `content` to a single stored segment (`persona` / `npc` / `narrator` / `character`; empty for director-only rows). Wired into both user-row inserts (`generate === false` and `generate === true` paths). Previously user rows stored `segments: []`, so `refetchState()` after streaming replaced the optimistic turn with an invisible one.
* **Self-healing fallback (`frontend/src/lib/components/chat/MessageLog.svelte`)** — new `displaySegments()` renders `content` as a single segment when stored `segments` are empty, so pre-fix rows display without a backfill migration.
* **Scroll-chain fix (`frontend/src/lib/components/chat/ChatViewport.svelte`)** — `main` was a plain block box, making `MessageLog`'s `flex-1 min-h-0` root unconstrained (auto height); the inner log's `h-full` resolved to content height, `overflow-y-auto` never engaged, and `main`'s `overflow-hidden` clipped everything past the fold with no scrollbar, zero console errors. One-class fix: `main` is now `flex flex-col`. This was the actual cause of "narrator lines never appear" — the rows existed at every layer (DB → API → DOM) but were unreachable.
* **Regression guard (`frontend/unit/boundaries.test.ts`)** — scroll-chain invariant: `main` must carry `flex flex-col min-h-0 overflow-hidden`; `MessageLog` must keep `flex-1 min-h-0` and `overflow-y-auto`.
* **Template neutralization (`backend/src/prompt/templates.ts`, `blocks.ts`)** — all three dialect examples replaced the concrete `Guide` / `mountain pass` NPC with an explicit placeholder (`Side character`, neutral prose) kept unconditional so NPC syntax is always taught; every example now demonstrates the state-block syntax (fence for directive/prefix, `<state>` for xml); added a format-only guard sentence and pointed the state instruction at the shown example. Golden `eldrin-narrative-directive.txt` regenerated via `UPDATE_GOLDEN=1`.
* **Workflow doc (`docs/workflows/ui-ux-testing.md`)** — §1b two-height captures, self-reporting + A/B probes, state-count/port-quarantine layers, three new gotchas (content-visibility placeholder signature, missing-scrollbar finding, mapped-drive watcher breakage).

## 2. Verification

* Suites: frontend 189/189 (incl. the new boundary test), backend 243/243, shared 193/193; `tsc` + `svelte-check` clean; `db:check` clean (`fts_parity=ok`).
* Headless Edge per the workflow doc: tall capture (all 6 turns paint), 900px capture (pre-fix: clipped top with no scrollbar, matching the report; post-fix: bottom-anchored with working scrollbar), static A/B skeleton probe (current chain clips, `flex-col` chain scrolls), exact-markup probe with embedded measurement readout. Probes deleted afterwards; `git status` showed only intended files.
* Human verification, issue at a time: §2 — persisted user turn survives stream + reload, narrator voice persists, DOM table showed 6/6 articles with real heights/text; §3 — fresh chat with the empty `test` card shows no `Guide`/`mountain pass`, replies end with a parseable state fence (TopBar badge flipped `inherited` → `patch`), Alice/Eldrin unaffected.

## 3. Deviations and fixes during implementation

* **§2 was two bugs, not one.** The agreed direction covered only missing segments; headless reproduction proved a second, independent defect (unscrollable log) that explained the exact reported symptom. Both fixed; the boundary test pins the layout half.
* **Two misdiagnoses owned, both from reading code instead of reproducing:** (1) a `provider_unconfigured` theory from a boot log line that described legacy env providers, not the active config row — killed by DB ground truth showing the rows existed; (2) "just scroll down" — killed by proving no scroller existed. Lesson already folded into the workflow doc (§1b, port quarantine).
* **`[state]`-as-text handled instruction-side only.** The parser intentionally recognizes fenced/XML/comment state blocks; plain `[state]` prose is a model-instruction failure, fixed by demonstrating the fence in §3. No parser change.
* **Backend restart required for template changes.** File watchers miss edits on this mapped-drive setup (see workflow gotchas); the §3 manual tests required an explicit backend restart.

## 4. Known limits / follow-ups

* §4–§6 (template editor, chat/Studio prompt previews) agreed but not started. §7 done in Batch 2 below.
* §8 (persona-label agency bypass: `WANDERING SCHOLAR` speaker) scoped and deferred; pending direction in scope §9 Q6. Still reproducible in Batch 2 verification data (the `test` chat used for probes contains a live `Wandering Scholar` bubble).
* Composer clears the draft before the send is accepted, so a rejected send (e.g. busy/failed POST) eats the user's text — found during §2 verification, not fixed.
* Pre-fix assistant turns containing `[State]` prose remain as stored (historical data); only new generations follow the corrected prompt. No backfill was run.

---

## Batch 2 — §7 inline per-segment editing

As-built record for scope §7, built in the order: session `editSegments` → `SegmentEditor` → `MessageTurn` pencils → `MessageLog` single-edit state → toolbar touch-up → tests. Decides scope §9 Q5 as proposed: per-segment only in the first cut, raw `EditTurnDialog` kept as the advanced fallback (retitled `Edit raw turn`).

### 1. What changed

* **Save path (`frontend/src/lib/state/session.svelte.ts`)** — new `editSegments(messageId, segments)` PATCHes the `{ segments }` variant of `MessagePatchSchema` and refetches. The backend branch already existed (`backend/src/routes/messages.ts`, `serializeEnvelope` re-serialization, state preserved for segment edits); no backend production code changed.
* **Editor (`frontend/src/lib/components/chat/SegmentEditor.svelte`, new)** — plain-prose textarea prefilled with the segment text, check/cross buttons, `Esc` cancels, `Ctrl/ Cmd+Enter` saves, Save disabled until dirty or while saving, focus moved into the textarea on open.
* **Pencils (`frontend/src/lib/components/chat/MessageTurn.svelte`)** — each segment wrapped in a `group/seg` container with a per-segment pencil (`Edit segment N`); click swaps that segment for the editor. Pencils hidden while another segment edits, on streaming/error turns, and unless `editable` is passed (the live turn never gets it, so it stays non-editable). Touch affordance: visible by default below `md` plus `[@media(hover:none)]:opacity-100`; hover-reveal on desktop.
* **Single-active-edit (`frontend/src/lib/components/chat/MessageLog.svelte`)** — one `segEditing { messageId, index }` state for the whole log; starting a generation drops any open editor. Save builds the next array from `displaySegments(msg)` (so pre-fix segment-less rows edit cleanly too) with only the targeted text replaced, then calls `editSegments`. Optimistic `tmp-` rows, streaming/error turns, and `busy` block new edits.
* **Toolbar (`frontend/src/lib/components/chat/TurnToolbar.svelte`)** — raw-dialog button retitled to `Edit raw turn` to distinguish it from inline editing; added the same `[@media(hover:none)]:opacity-100` so the toolbar is reachable on touch (previously hover-only).
* **Regression guards** — `frontend/unit/segmentEdit.test.ts` (5 tests: one pencil per segment, none when not editable/streaming/error, editor swap hides pencils, editor affordances) and a segments-PATCH happy-path test in `backend/test/routes/tree-lifecycle.test.ts` (re-serializes content, preserves state, bumps `edited.count`).

### 2. Verification

* Suites: frontend 194/194 (189 + 5 new), backend 244/244 (243 + 1 new), shared 193/193; `bun run typecheck` 3/3 clean; `bun run db:check` clean (`fts_parity=ok`).
* Headless Edge against the running dev servers on an existing `test` chat: DOM dump shows 5 `Edit segment N` pencils across settled turns (incl. all 4 segments of one multi-segment turn) plus `Edit raw turn` buttons, zero JS console errors; static A/B probe with a self-reporting readout proved the exact pencil markup paints (`rect 28x28, opacity=1, visibility=visible`); mobile + desktop chat screenshots show no visual regression. Probes deleted afterwards; `git status` shows only intended files.

### 3. Deviations and fixes during implementation

* **No backend production change needed.** The `{ segments }` PATCH branch already existed and was covered for the invalid case; Batch 2 added only the happy-path test for the exact flow the UI now uses.
* **Eden narrows the `MessagePatch` union body** (`kind: never` on the segments variant), so `editSegments` casts the body `as any` with a comment; runtime validation stays backend-side via `MessagePatchSchema`.
* **Two svelte-check warnings fixed properly, one owned:** `autofocus` attribute replaced with programmatic focus via a textarea ref; `state_referenced_locally` on the draft seed kept as-is (the seed is intentional for SSR/first paint, the `$effect` resyncs on retarget) and silenced with `svelte-ignore` + justification — verified by a test that renders the prefilled textarea through `svelte/server`, where effects never run.
* **One phantom "missing pencils" misdiagnosis, owned and killed by probe:** mobile screenshots showed no pencils despite them being in the DOM. A/B static probes proved the markup paints fine; the cause was headless Edge enforcing a ~496px minimum layout width while the capture bitmap stayed 390px, cropping the top-right pencils out of the image. Lesson: when DOM says present but paint says absent, check capture geometry before suspecting CSS — read the viewport off a self-reporting probe.
* **Tooling quirk:** `2>$null` on the Edge invocation swallowed the `--dump-dom` stdout in this host (0-byte files); piping through `Out-File` works. Screenshots also flush just after process exit, so check existence with a retry-tolerant step.

### 4. Deferred UI/UX polish (human-reported, Batch 2 verification)

Working as specified; look-and-feel follow-ups parked for a later polish pass, not gating §5:

* **P1 — pencil overlaps right-aligned bubbles.** The per-segment pencil sits `top-0 right-1` on every segment, so on right-leaning persona (user) bubbles it lands on top of the bubble instead of beside it. Fix direction: mirror/offset the pencil for right-tailed segments.
* **P2 — editor doesn't match bubble shape.** `SegmentEditor` renders as a dark rectangular box, not in the bubble's own shape/padding — the swap from bubble to black box feels unnatural. Fix direction: render the editor inside the bubble chrome (same radius/padding/background) instead of replacing it.
* **P3 — edit chrome looks unthemed, esp. always-visible on mobile.** The pencils (and editor) don't feel like part of the theme, which opens the larger question: what is the theming/customization model for edit chrome — theme vars, `HOOKS` hook classes for custom CSS, creator controls? To be decided alongside the broader customization work, not ad hoc per button.

---

## Batch 3 — §5 chat prompt preview

As-built record for scope §5, built in the order: shared draft schema → builder block text/reason → double-attach fix (below) → `POST prompt-preview` route → `PromptTab` → drawer tab → composer Preview button → viewport wiring → tests. Decides scope §9 Q3 as agreed: the drawer tab shows the base next-turn prompt; unsent draft text is folded in only via the explicit composer Preview button. Two further agreed deviations from the scope sketch: `POST` instead of the suggested `GET` (a GET cannot carry draft text), and 413 on over-budget preview, consistent with send.

### 1. What changed

* **Dry-run endpoint (`backend/src/routes/chats.ts`)** — `POST /api/chats/:id/prompt-preview` with optional `{ draft }` (`PromptPreviewDraftSchema` in `packages/shared/src/schemas/message.ts`). Same `assembleContext() + buildPrompt()` path as send with the active leaf as trigger; an explicit draft is appended as a synthetic (never persisted) row so history + the 9b director block reflect exactly what sending would do. No writes, no LLM call; `PromptBudgetError` surfaces as 413 like send.
* **Block reports (`backend/src/prompt/types.ts`, `builder.ts`)** — `BlockReport` gains `text` (rendered block, when included — powers per-block copy) and `reason` (static skip reasons per block id, e.g. `classic mode (narrative blocks off)`, `character description blank`). Block 8 now reports history exactly as sent (post-fit turns and tokens) instead of pre-fit counts.
* **Double bottom-block attach fixed (`backend/src/prompt/history.ts`, `builder.ts`)** — real bug found *by* the preview, not in it (see §3). Golden `eldrin-narrative-directive.txt` regenerated; the diff is exactly the de-duplication.
* **Preview UI (`frontend/src/lib/components/chat/PromptTab.svelte`, new)** — dialect badge, token budget bar (static/history/bottom vs available, dropped-turn count), warnings, all 15 blocks in canonical backend order as collapsibles with included dot / skip reason / token count / per-block copy, history-as-sent with a `+bottom` badge on the turn carrying 9a/9b/9c, full system prompt + copy, prefill/stops, raw JSON under `?dev=1`, and `Edit in Settings` / `Edit in Voice` links (they open the existing surfaces; the §4 template editor is still pending).
* **Entries (`LoreDrawer.svelte`, `Composer.svelte`, `ChatViewport.svelte`)** — new `Prompt` drawer tab (`initialTab` prop; drawer unmounts on close so the mount-time tab applies); composer `Preview` button (sparkles icon, enabled when there is something to preview) jumping straight to the tab with the draft; top-bar lore entry resets to `About`. New `ft-prompt-preview` hook (`HOOKS.chat`), manifest count 34 → 35.
* **Regression guards** — `backend/test/routes/prompt-preview.test.ts` (4 tests: shape + no-writes, draft in history + 9b, empty chat synthetic turn, 404) with single-closing assertions; new builder test pinning one closing instruction in canonical 9a/9b/9c order; `frontend/unit/promptPreview.test.ts` (5 tests: labels, response guard, tab/drawer/composer render states).

### 2. Verification

* Suites: backend 249/249 (243 + prompt-preview 4 + segments 1 + single-attach 1), frontend 199/199 (194 + 5 new), shared 193/193; `bun run typecheck` 3/3 clean; `bun run db:check` clean.
* Live API against the real dev DB: base preview 200 (15 blocks, 6 included for the near-empty `test` card, `total 384 / 13824`), draft preview folds message + note in (9b flips on), message count + active leaf unchanged (no writes), unknown chat 404, last history turn carries exactly one closing instruction. Same call through the Vite `:5173` proxy: 200 (browser-path layer).
* Headless Edge on the `test` chat: DOM shows the composer Preview button and intact §7 pencils (2 turns, 5 pencils — no regression), zero console errors; desktop screenshot shows the Preview button painted beside Director (correctly disabled with an empty draft) with no visual regression. The drawer tab content itself was verified via SSR mount tests + the live API (headless has no click driver to open the drawer).
* Probes/scratch removed; `git status` shows only intended files.

### 3. Deviations and fixes during implementation

* **Bottom blocks were attached twice on every narrative send.** `serializeHistory()` attached 9c to the last user turn and the builder then attached the full 9a/9b/9c over it — every sent prompt ended `…9c, 9a, 9b, 9c`, proven by the checked-in golden (line 81) and the first preview probe. Fix: `serializeHistory()` now returns plain messages and the builder is the single attach point after budget fitting (it already handled the empty-fit edge). This changes what gets sent (for the better: one closing line, canonical order) — flagged, not smuggled: golden diff is one line.
* **`triggerId` for leafless chats.** `assembleContext` requires a trigger id; empty chats pass a `'preview-root'` sentinel with empty `pathRows`, which the assembler already tolerates (empty history, default state).
* **Eden hyphenated route** uses the established bracket pattern (`api.api.chats({id})['prompt-preview']`, cf. `provider-configs`); no cast needed this time since the body schema is a single object, not a union.
* **Svelte `$state(initialTab)` warning** in the drawer handled the same owned way as Batch 2's editor seed: intentional (unmount-on-close makes mount-time correct), silenced with justification.

### 4. Manual-testing fixes (human-reported, fixed same round)

* **T3 — Preview landed on the last tab, not Prompt.** Root cause, owned: only the drawer's *inner content* unmounts on close (`{#if open}`); the `LoreDrawer` component instance — and its `$state` — persists across opens. So the mount-time `initialTab` seed applied exactly once and every later open kept the last tab. The `svelte-ignore`'d warning was pointing at the bug. Fix: the entry point owns the tab via `$effect(() => { if (open) activeTab = initialTab; })`, which also covers Preview-while-already-open. Lesson reinforced: SSR render tests cannot cover effect-driven behavior — the mount test passed while the real behavior was broken (same class as the Batch 1 backdrop). The drawer test now documents that boundary explicitly.
* **Director drawer lost typed standing direction.** Root cause: `handleStandingDirectionChange` PATCHed fire-and-forget while the field is uncontrolled, so the next re-render overwrote the typed text with the stale prop — while the server (and prompt 9a) already had it. Fix: optimistic local `session.chat.metadata` update first, PATCH second, toast only on failure. Follow-up noted (not fixed): the PATCH fires per keystroke with no debounce — freak out-of-order completions could still clobber a character.
* **Block 8 expanded to "Skipped - empty" despite green dot + tokens.** Real UI bug: block 8 is included but carries no inline `text` (its content *is* the history section), so it fell into the skipped branch. Fix: block 8's body now points at `History as sent` with turn/token counts.
* **Copy-block "takes other things" — not reproduced, integrity proven.** Live-API check: block 1b's text (716 chars) appears in the system prompt exactly once, so per-block copy moves exactly that block. 1b is legitimately large (format guide + example + agency clause + state instructions) — likely surprise at its size, or confusion with the Full-system-prompt copy button one section down. Awaiting a paste sample to close this out.
* **Bonus wart found during the copy check:** schemaless cards printed a dangling `State schema fields:` header with no fields in 1b. Fixed (`blocks.ts` falls back to the generic mood/scene line when the schema has no entries); golden untouched (Eldrin has fields).

---

## Batch 4 — §6 Studio prompt preview

As-built record for scope §6, built in the order: lenient draft schema → characters `prompt-preview` route → Studio panel + tab → shared `PromptBlocks` extraction → tests. Read-only aggregate as proposed (scope §9 Q4's inline-editing alternative not taken); the empty-card banner names the Voice tab in text, no cross-tab jump.

### 1. What changed

* **Dry-run endpoint (`backend/src/routes/characters.ts`)** — `POST /api/characters/prompt-preview` with `{ card?, personaId? }` (`CharacterPromptPreviewBodySchema` in shared `character.ts`). Builds a full card server-side with neutral defaults (blank name → `Character`, missing strings → `''`, default theme) so half-filled unsaved drafts preview; persona defaults to the default persona with a `Traveler` literal fallback. Same builder as send over empty history; scene state forced off (per-chat runtime, so 7b skips with reason); greeting parsed with `parseEnvelope` against the draft name. `CharactersRouterDeps` gains `providers` (wired in `app.ts`).
* **Lenient-name lesson:** `Type.Partial` keeps `minLength` on provided-but-empty strings, so a Studio draft (`name: ''`) 422'd against the first schema cut. The schema omits `name` from the partial and re-adds it without `minLength`; the handler's blank-fallback does the rest. Only `name` needed relaxing (all other card strings have no minimum).
* **Studio UI (`StudioPromptPanel.svelte`, new; 9th `StudioShell` tab)** — debounced live resolve (500 ms) keyed on prompt-relevant card fields only, so style/showcase edits don't refetch; `Updating…` indicator plus manual Refresh; empty-core banner (2–5 blank) pointing at the Voice tab; greeting section (segment chips, clean/needs-state badge, warnings, raw text, or a no-greeting note). New `ft-studio-prompt` hook, manifest count 35 → 36.
* **Shared presentational `PromptBlocks.svelte`** — the budget bar / warnings / block list / history / system / prefill / stops half of `PromptTab`, reused unchanged by both surfaces (one visual language for prompt internals; the open P3 theming question covers both). `PromptTab` slimmed to its fetch shell; suites confirm no behavior change. Shared `preview.ts` gains the `GreetingPreview` / `StudioPreviewData` shapes and guard.

### 2. Verification

* Suites: backend 252/252 (249 + 3 character-preview), frontend 202/202 (199 + 3 studio-panel), shared 193/193; `svelte-check` clean; `db:check` clean.
* Live API against the real dev DB: full draft 200 (9 static blocks, greeting parses to one clean `character` segment, history single synthetic turn with one closing), empty card 200 (2–5 skipped with reasons, greeting null), blank body 200.
* Headless Studio DOM/screenshot check pending: the frontend dev server was down at verification time, so the Studio tab button + panel paint are covered by SSR mount tests + the live API only.

### 3. Deviations and fixes during implementation

* **Stale-backend trap, caught live.** The first live probe returned 422 on the empty card while the suite passed — the running backend predated the schema relaxation (mapped-drive watcher miss, now confirmed to bite backend `--watch` too, not just Vite). Restarted the backend from `backend/` the same way it was launched (`bun --watch src/index.ts`) and re-probed green. Lesson: a passing suite plus a failing live probe means restart the server before doubting the code — in that order.
* **History is one synthetic turn, not empty** (same shape as the §5 empty-chat case): the test initially asserted `[]` and was corrected — the provider needs a user turn, so "no history" still sends `[Continue the scene.]` + bottom blocks.

---

## Batch 5 — §4 editable narrative template (reworked to single-source)

As-built record for scope §4. First cut built per-dialect overrides (three textareas); reworked before commit to a **single canonical example authored in directive syntax and rendered into every dialect** — per-dialect copies drift (Batch 1 fixed the same leak three times), and the envelope package already translates both directions. Per-character overrides stay deferred, as scoped.

### 1. What changed

* **Settings keys (`packages/shared/src/schemas/settings.ts`)** — `narrative.example` (optional string, 20k cap; PATCH accepts `string | null`, null clears). `SettingsView` exposes the stored example plus server-rendered `exampleRenderings` (directive/xml/prefix, override or built-in) so the UI shows translations without duplicating the render path.
* **Validation (`backend/src/prompt/templates.ts`)** — new structural `validateNarrativeExample(text)`, using the parser itself: must parse as directive (xml/prefix authoring rejected — it renders automatically), must contain segments + a state block (the Batch 1 lesson encoded), must not speak for the persona (checked via truncation signal, since the parser drops persona content before kind checks could see it), parser warnings surface as issues. Enforced in the settings PATCH route as 422. A lenient-body footnote: `Type.Partial` keeps `minLength`, so the schema omits `name`-style strictness where blanks are legitimate (same lesson as the §6 card schema).
* **Rendering (`backend/src/prompt/templates.ts`, `blocks.ts`)** — new `renderExampleForDialect(dialect, override, warnings)`: no override returns the hand-tuned built-in for that dialect verbatim (never round-tripped — prefix prose can collide with prefix speaker detection on re-serialize, found by test); a custom override is validated, parsed, and serialized into the target dialect; any failure falls back to built-in with a warning instead of emitting a broken block. Block 1b is the single call site; `PromptContext` carries one optional `narrativeExample`, filled from settings in `assembleContext` (chat send, chat preview, Studio preview all honor it with no per-route code). `generateBlock` accepts an optional warnings sink for the fallback path.
* **Storage (`backend/src/db/repositories/settings.ts`)** — null/blank example deletes the key (mirrors the generation null-clears).
* **Editor (`SettingsSheet.svelte` narrative tab)** — collapsed "advanced" section under the preamble: safety note (agency rule + state instruction are fixed code around the example), one directive textarea with macro hints, `customized` badge, explicit Save (disabled unless dirty + valid) and Reset-to-default, plus read-only "renders as" panels for xml/prefix computed server-side (they track the *saved* example and refresh on save — the frontend may not import the parser, so live-draft translation stays server-side by design). Draft stays local until saved; a post-save sync drops to pristine on match, so a rejected save keeps the draft and inline issues. Client validator (`frontend/src/lib/settings/narrative.ts`) mirrors the rules string-wise for instant feedback; the server enforces structurally.

### 2. Verification

* Suites: backend 265/265 (252 + validator/render 11 + settings lifecycle 1 + builder per-dialect render 1), frontend 207/207 (202 + validator 5), shared 193/193; `typecheck` 3/3 clean; `db:check` clean; golden untouched (no override → byte-identical built-ins). The colon-heavy prefix collision is pinned as a unit test (valid directive example, per-dialect fallback + warning).
* The test suite earned its keep twice during the rework: it caught the prefix round-trip collision and the persona-truncation signal, both fixed before shipping.
* Live API against the real dev DB: built-in renderings per dialect, no-fence / xml-authored / persona saves rejected (422), valid custom example stored and honored end-to-end (block 1b + xml/prefix siblings), null-clear restores the built-in — settings left exactly as found.
* Headless settings-dialog capture not possible (dialog closed by default, no click driver): the editor UI is covered by validator tests + `svelte-check`, and awaits the human pass below.

### 3. Scope interpretation, flagged

* The scope sketch says per-dialect textareas with "agency clause + state instruction must survive". Built instead: one canonical textarea, because three copies reintroduce the exact drift Batch 1 eliminated. The guarantee is preserved in stronger form — agency + state live in fixed code, and validation is structural (parse-based) rather than substring-based. Saving the built-in text back counts as a reset, not an override.

### 4. Follow-up from manual testing: dialect visibility

* Dialect is per-chat, frozen at creation from the global default — changing the default does not rewrite existing chats (verified live: an old chat kept sending `directive` after the default moved to `xml`, and the preview badge said so honestly). Since nothing previously showed a chat's format, the Lore Drawer About tab now opens with a "This conversation speaks X — locked at creation" line (`LoreDrawer.svelte`, from the already-passed `chat` prop). A mid-story dialect converter was discussed and parked, not built.
