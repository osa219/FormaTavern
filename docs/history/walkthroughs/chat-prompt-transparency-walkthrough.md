# Chat Prompt Transparency Walkthrough: User Turns + Template Leak (Batch 1)

As-built record for [`docs/history/reports/chat-prompt-transparency-scope.md`](../reports/chat-prompt-transparency-scope.md) §2–§3, built in the order: user-segment persistence → scroll-chain fix → template neutralization. Scope §§4–§8 untouched except §8, which was scoped (not implemented) during verification and is recorded deferred. Commits: `051244c` (chat fixes), `5f4719d` (prompt fix); scope-doc status updates in `4718320`.

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

* §4–§7 (template editor, chat/Studio prompt previews, inline per-segment editing) agreed but not started.
* §8 (persona-label agency bypass: `WANDERING SCHOLAR` speaker) scoped and deferred; pending direction in scope §9 Q6.
* Composer clears the draft before the send is accepted, so a rejected send (e.g. busy/failed POST) eats the user's text — found during §2 verification, not fixed.
* Pre-fix assistant turns containing `[State]` prose remain as stored (historical data); only new generations follow the corrected prompt. No backfill was run.
