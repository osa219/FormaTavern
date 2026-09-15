# Chat Prompt Transparency Walkthrough: User Turns + Template Leak (Batch 1) + Inline Segment Editing (Batch 2)

As-built record for [`docs/history/reports/chat-prompt-transparency-scope.md`](../reports/chat-prompt-transparency-scope.md) §2–§3 (Batch 1, built in the order: user-segment persistence → scroll-chain fix → template neutralization) and §7 (Batch 2: inline per-segment editing). Scope §§4–§6 untouched except where noted; §8 remains scoped (not implemented) and deferred. Batch 1 commits: `051244c` (chat fixes), `5f4719d` (prompt fix); scope-doc status updates in `4718320`. Batch 2 (uncommitted at time of writing): §7 implementation + tests; scope-doc §7 status update.

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
