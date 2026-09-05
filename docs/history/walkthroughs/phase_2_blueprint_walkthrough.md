# Walkthrough — Phase 2: Core LLM Engine

FormaTavern's **Phase 2: Core LLM Engine** has been implemented, strictly verified against architectural invariants (E1–E8), and tested end-to-end.

---

## 1. What Was Built

### A. `@formatavern/shared` (Isomorphic Engine)
- **Narrative Envelope Parser & Serializer (`src/envelope/`)**:
  - Incremental streaming and non-streaming 8-step parser (`parseEnvelope`) with state extraction (```` ```state ````, `~~~state`, `<!--state`), reasoning extraction (`<think>`), agency truncation (`:::persona`, `:::user`, `<persona>`, `<user>`, `{{user}}:`), grammar lenience (L1–L4), prefix speaker gating, and holdback buffer (`computeHoldBack`).
  - Strict round-trip canonical serializer (`serializeSegments`) across directive, XML, and prefix dialects.
  - Out-of-band stripper (`stripOutOfBand`) to clean history messages without touching standard markdown blocks.
  - Isomorphic JSON tolerance via `jsonrepair`.
- **State Vector Engine (`src/state/`)**:
  - `defaultState` and `resolveState` implementing enum alias normalization, case insensitivity, numeric clamping `[min, max]`, string trimming, and primitive passthrough for schemaless modes.
- **Text Utilities (`src/text/`)**:
  - Single-pass `applyMacros` replacing `{{char}}`, `{{user}}`, and `{{persona}}` without recursive expansion.
  - `buildStopSequences` generating $\le 4$ dialect-specific stop sequences.
- **Normative Fixtures (`src/fixtures/`)**:
  - 9 normative scripts (`envelope-directive`, `envelope-xml`, `envelope-prefix`, `classic`, `sloppy`, `persona-violation`, `truncated`, `reasoning`, `error`) with adversarial chunk splits (including UTF-16 surrogate halves).
- **Schema Extensions**:
  - `ChatMetadataSchema.npcs` updated with optional `voice?: string` (Amendment A3).
  - Version bumped to `0.2.0-phase2`.

### B. `@formatavern/backend` (Provider & Prompt Engine)
- **Byte-Stream SSE Parser (`src/providers/sse.ts`)**:
  - Streaming UTF-8 line buffer handling comment lines (`: keep-alive`), frame splits across chunk boundaries, `\r\n` line endings, and clean reader cancellation on early termination.
- **LLM Provider Abstraction (`src/providers/`)**:
  - `MockLLMProvider`: Script playback, configurable token pacing (`intervalMs`), call spy, and strict Invariant E5 stream contract compliance.
  - `OpenRouterProvider`: Injected `fetch`, idle timeout (60s default), client abort handling, API key scrubbing in logs/errors, user-first role ordering, and role coalescing.
  - Provider factory `createProviders` wired in `src/index.ts`.
- **Prompt Builder (`src/prompt/`)**:
  - Pure, deterministic prompt compiler following the 12-block Prompt Sandwich (Blocks 1–9c).
  - Token budgeting via `gpt-tokenizer` (`cl100k_base` / `o200k_base`) with turn-dropping truncation under pressure.
  - Prefill support and `[Continue the scene.]` continuation handling.
  - Live smoke test script `scripts/smoke-openrouter.ts` (skips cleanly when `OPENROUTER_API_KEY` is not present).

### C. Vertical Slice Alive
- **Backend API**:
  - Re-plumbed `/api/chat/test-stream?script=<id>` driven by `MockLLMProvider`.
  - HTTP 400 validation rejecting invalid script IDs with helpful lists of valid options.
  - Paced SSE stream emitting `token`, `usage`, `done`, and `error` events.
  - Static SPA fallback serving production Vite bundle with directory traversal guards.
- **Frontend Bare Canvas (`frontend/src/routes/+page.svelte`)**:
  - Script selector for all 9 normative scripts.
  - Start / Abort controls.
  - Live telemetry dashboard displaying raw token stream and iterative streaming envelope parse results (segments, state patch, parse warnings, truncation status, holdback buffer).

---

## 2. Test & Verification Results

### A. Full Test Suite Summary
Ran `bun test` across the monorepo:
```text
135 pass
0 fail
32015 expect() calls
Ran 135 tests across 16 files. [521.00ms]
```
- **`packages/shared`**: 68 tests passing
  - `properties.test.ts`: 31,695 property assertions across 50 seeded random chunkings per fixture verifying Invariant E1 (chunk invariance), Invariant E3 (serialization round-trip), and Invariant E4 (zero partial marker leakage).
  - 50 KB envelope benchmark: Parsed in $\approx 2.5\text{ ms}$ (median under $5\text{ ms}$ limit).
- **`backend`**: 67 tests passing
  - `contract.test.ts`: Validates Invariant E5 stream contract on all 9 fixtures.
  - `openrouter.test.ts`: 12 tests verifying UTF-8 multibyte boundary splits, frame splits, comment heartbeats, 429 backoff, 401 key scrubbing, idle timeouts, and client aborts.
  - `builder.test.ts`: 14 tests including golden file test against `test/prompt/__golden__/eldrin-narrative-directive.txt`.

### B. Typecheck & Svelte Diagnostics
Ran `bun run typecheck`:
```text
$ bun run --cwd packages/shared typecheck && bun run --cwd backend typecheck && bun run --cwd frontend check
$ tsc --noEmit -p .
$ tsc --noEmit -p .
$ svelte-kit sync && svelte-check --tsconfig ./tsconfig.json
Loading svelte-check in workspace: s:\WorkSpace\Git Workspace\FormaTavern\frontend
Getting Svelte diagnostics...

svelte-check found 0 errors and 0 warnings
```

### C. Live End-to-End API Verification

#### 1. Valid Script Stream (`envelope-directive`)
```bash
curl -sN -X POST "http://127.0.0.1:3000/api/chat/test-stream?script=envelope-directive"
```
**Output received**:
```text
data: {"type":"token","text":":::nar"}
data: {"type":"token","text":"rator\n"}
data: {"type":"token","text":"The night wind howls across the high peaks—carrying the scent of ozone and ancient dust \ud83d"}
data: {"type":"token","text":"\udf01 as the observatory awakens.\n"}
data: {"type":"token","text":":::\n"}
data: {"type":"token","text":"\n:::"}
data: {"type":"token","text":"character[Eld"}
data: {"type":"token","text":"rin the Mage]\nThe convergence is beginning. Keep your focus steady on the crystal lens.\n:::\n\n"}
data: {"type":"token","text":":::npc[Apprentice]\nMaster, the secondary rings are vibrating out of alignment!\n:::\n\n"}
data: {"type":"token","text":"``"}
data: {"type":"token","text":"`st"}
data: {"type":"token","text":"ate\n{\"mo"}
data: {"type":"token","text":"od\":\"calm\",\"affinity\":5,\"danger\":\"low\",\"scene\":\"spire_observatory\"}\n```"}
data: {"type":"usage","promptTokens":42,"completionTokens":98}
data: {"type":"done","finishReason":"stop"}
```

#### 2. Invalid Script Rejection (HTTP 400)
```bash
curl -si -X POST "http://127.0.0.1:3000/api/chat/test-stream?script=bogus"
```
**Output received**:
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json;charset=utf-8

{"error":"Invalid script \"bogus\". Valid scripts: envelope-directive, envelope-xml, envelope-prefix, classic, sloppy, persona-violation, truncated, reasoning, error"}
```

#### 3. Error Script Handling (`script=error`)
```bash
curl -sN -X POST "http://127.0.0.1:3000/api/chat/test-stream?script=error"
```
**Output received**:
```text
data: {"type":"token","text":"I can"}
data: {"type":"token","text":"not"}
data: {"type":"error","message":"mock upstream failure","recoverable":false}
```

#### 4. Production Build & Static Asset Serving
```bash
bun run build
NODE_ENV=production bun src/index.ts
curl -s "http://127.0.0.1:3000/" -> 200 OK (1,301 bytes HTML)
curl -s "http://127.0.0.1:3000/_app/immutable/entry/start.CppQqYog.js" -> 200 OK (text/javascript)
```

---

## 3. Invariants Maintained
- **`E1` (Chunk Invariance)**: 50 random chunkings per fixture produce identical ASTs to monolithic text.
- **`E2` (Superset)**: Raw untagged prose parses as a single primary character segment without error.
- **`E3` (Round-Trip)**: Normalized segments serialize and re-parse idempotently.
- **`E4` (Holdback Safety)**: No incomplete delimiter tokens leak to segment texts while streaming.
- **`E5` (Stream Contract)**: Provider streams emit zero or more `token`, optional `usage`, and exactly one terminal `done` or `error`.
- **`E6` (State Validation)**: State engine clamps integers, normalizes enum aliases, drops unknown keys, and warns.
- **`E7` (Agency Preservation)**: Hallucinated user/persona turns are strictly truncated.
- **`E8` (Zero Prompt Leak)**: All macros (`{{char}}`, `{{user}}`, `{{persona}}`) are replaced in a single pass.
