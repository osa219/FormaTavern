# Post-Blueprints Report & System Documentation — Walkthrough

## 1. Executive Summary

This walkthrough documents the actions taken to implement and resolve the requirements from [`docs/history/reports/post_blueprints_report.md`](../reports/post_blueprints_report.md), transition FormaTavern into feature-extension mode, establish living system documentation, optimize agent context efficiency, and create the definitive storage schema reference.

---

## 2. Review Notes & Implementation Details

### 2.1 Note 2: Pinning `CSS_VAR_NAMES` in Tests
- **Issue**: Report identified a drift between 20 registered CSS `@property` tokens and 21 tokens in `cssVars.ts` (due to unregistered tokens like `--theme-font-family`, `--theme-bg-img`, and `--theme-scheme`).
- **Resolution**: Updated [`frontend/unit/cssVars.test.ts`](../../../frontend/unit/cssVars.test.ts) to explicitly assert the exact array literal of the 21 variable names against `CSS_VAR_NAMES`, locking it as the single canonical source of truth and preventing unregistered additions or omissions.
- **Verification**: All 6 `cssVars` tests pass; frontend unit test count increased to 42.

### 2.2 Note 1: Reconciling Invariant Numbering (U1–U10)
- **Issue**: Identified invariant numbering drift where walkthrough U1 referenced "zero neutral flash" rather than the canonical blueprint definition of "cascade order".
- **Resolution**: Reconciled the invariant table in [`docs/history/walkthroughs/phase_4_blueprint_walkthrough.md`](phase_4_blueprint_walkthrough.md) to adhere strictly to the canonical blueprint numbering:
  - **U1**: Theme Cascade Order (`shared/theme/cascade.ts`: `NEUTRAL → character.style → stateBindings → persona.styleOverrides → accessibility`).
  - **U2**: Zero Runtime CSS Injection (Tokens reach DOM strictly via `--theme-*` custom properties on the theme root).
  - **U3**: Parser Boundary Encapsulation (`parseEnvelope` strictly imported in `stream.svelte.ts`).
  - **U4**: Frame Budget & rAF Throttled Rendering.
  - **U5**: Pinned Scroll Ownership (48px threshold, pure gesture detection).
  - **U6**: Reserved Layout & Geometry Stability (CLS $\le 0.02$, zero `transition-all`).
  - **U7**: Server-Truth Reconciliation (wholesale turn replacement on terminal event).
  - **U8**: Accessibility Floor & Neutral Chrome (0ms on reduced motion, zero axe critical/serious violations).
  - **U9**: Route-Scoped Session Isolation (`{#key chatId}`).
  - **U10**: Monorepo Purity Boundaries (`svelte-check` 0/0 over `treaty<App>`).

---

## 3. Canonical Documentation Suite Adopted

Adopted and published the core documentation suite under [`docs/`](../../):

1. **[`docs/architecture.md`](../../architecture.md)**:
   - System topology (dev proxy at :5173 vs single-process production at :3000).
   - End-to-end message flow from `Composer.send()` through `GenerationHub`, streaming provider, to terminal reconciliation.
   - Narrative Envelope specifications across dialects (`directive`, `xml`, `prefix`) and hold-back algorithms.
   - Provider abstraction, PromptBuilder 14-block sandwich, and generation lifecycle.
   - Frontend Svelte 5 runes architecture and chameleon design token pipeline.

2. **[`docs/development.md`](../../development.md)**:
   - Developer handbook: prerequisites, scripts, SQLite workflows, and testing standards.
   - Invariant-to-test mapping index (§6.3).
   - Provider modes: offline Mock fixtures vs OpenRouter live smoke.
   - UI evidence set requirements (§9).
   - Added **Section 13 (Change Recipes)** for migrations, routes, providers, theme tokens, lenience, and mock scripts.

3. **[`docs/troubleshooting.md`](../../troubleshooting.md)**:
   - 9-category diagnostic runbook organized by symptom, likely cause, and fix (install/workspace, typecheck/svelte-check, dev server/proxy, SSE buffering, SQLite WAL/locks, engine errors, frontend transitions, production, and debugging techniques).

4. **[`docs/schema.md`](../../schema.md)**:
   - Definitive database and storage schema reference:
     - Full relational DDL for `characters`, `personas`, `chats`, `messages`, and `settings`.
     - Connection pragmas: `WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000`.
     - Contiguous migration lifecycle (v1 `initial_schema` $\rightarrow$ v2 `narrative_envelope` $\rightarrow$ v3 `chat_branching`).
     - Polymorphic JSON column mappings to `@formatavern/shared` TypeBox schemas.
     - Message tree DAG: recursive CTE active branch query, windowed pagination (`pageActiveBranch`), and sibling swipe math.
     - Database integrity contract audited by `bun run db:check`.

---

## 4. Agent Context Optimization (`.agents/AGENTS.md`)

- **Problem**: Inlining the full architecture, change recipes, and directory maps caused [`.agents/AGENTS.md`](../../../.agents/AGENTS.md) to balloon to 274 lines (~21 KB), consuming ~5,000 tokens on every prompt turn and diluting critical rule attention.
- **Solution**: Streamlined `.agents/AGENTS.md` down to **101 lines (~6.6 KB)** (a **~70% token reduction**):
  - **Preserved 100% of hard constraints**: all 4 dependency rules, `backend/src/app.ts` Bun-free purity boundary, and all 24 hard "NO" anti-patterns.
  - **Compact Invariant Cheat Sheet**: all 33 invariants (I1–I6, E1–E8, S1–S9, U1–U10) as high-density 1-liners linking to `docs/development.md §6.3`.
  - **Progressive Disclosure**: Relocated procedural change recipes to [`docs/development.md §13`](../../development.md#13-change-recipes).

---

## 5. README Documentation Alignment

- Populated [`README.md`](../../../README.md) with project overview, key features, prerequisites, development/production run instructions, keyboard shortcuts, and provider details.
- Updated repository structure tree to reflect `docs/` with `docs/history/` as an archive.
- Focused the documentation links strictly on active living guides (`architecture.md`, `schema.md`, `development.md`, `troubleshooting.md`), removing prompt pressure to consult historical phase blueprints as primary documentation.

---

## 6. Verification Results

All quality gates were verified cleanly across the monorepo:

1. **Diagnostics (`bun run typecheck`)**:
   - `packages/shared`: 0 errors
   - `backend`: 0 errors
   - `frontend`: `svelte-check` found **0 errors and 0 warnings**
2. **Automated Tests (`bun run test`)**:
   - `packages/shared`: 91 / 91 passed
   - `backend`: 127 / 127 passed
   - `frontend`: 42 / 42 passed
   - **Total**: **260 / 260 passed (0 failures)**
3. **Database Audit (`bun run db:check`)**:
   - `journal_mode=wal`, `foreign_keys=1`, `user_version=3`
   - `integrity_check=ok`, `foreign_key_check=empty`, `no_streaming_rows=ok`
   - `active_leaf_integrity=ok`, `current_state_integrity=ok`
   - `2/2 characters valid, 1/1 personas valid`

---

## 7. Atomic Commits Summary

| Commit | Description |
|---|---|
| **`b679863`** | `test(frontend): pin CSS_VAR_NAMES list in cssVars.test.ts` |
| **`654abd4`** | `docs: reconcile Phase 4 walkthrough invariant table with canonical numbering` |
| **`cedf23c`** | `docs: adopt canonical AGENTS.md, architecture, development, and troubleshooting guides` |
| **`4c57ce1`** | `docs: streamline AGENTS.md for prompt efficiency and move change recipes to development.md` |
| **`0ed118c`** | `docs: add database and storage schema reference docs/schema.md` |
| **`45e2fd6`** | `docs: focus README on active living documentation` |
