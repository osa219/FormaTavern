# Reasoning Effort Walkthrough: Unified Controls + Collapsible Thought Blocks

As-built record for [`docs/history/reports/reasoning-effort-proposal.md`](../reports/reasoning-effort-proposal.md) §§1–9, built in the proposed §9 order (1. schema + forwarding + wire mappings → 2. metadata persistence + duration tracking → 3. chat UI + settings UI). `StreamEvent` contract and `generation.ts` signatures untouched (additive think-timestamps + metadata persistence only). No commits made during this work.

## 1. What changed

* **Schemas (`packages/shared/src/schemas/settings.ts`, `packages/shared/src/schemas/message.ts`)**:
  * `generation.reasoning` (`'on' | 'off'`) and `generation.reasoningEffort` (`'low' | 'medium' | 'high'`) added to `AppSettingsSchema` and `SettingsViewSchema`.
  * `SettingsPatchSchema` permits both fields along with `Type.Null()` for explicit key clearing back to "Default".
  * `DEFAULT_SETTINGS` keeps both fields absent (unset = model/server default; existing users unaffected).
  * `MessageMetadataSchema.reasoningDurationMs` added as optional integer. `reasoning?: string` retained.
* **Request Shape (`packages/shared/src/types/llm.ts`)**:
  * Added `reasoning?: 'on' | 'off'` and `reasoningEffort?: 'low' | 'medium' | 'high'` to `LLMRequest`.
* **Repository Null Guard (`backend/src/db/repositories/settings.ts`)**:
  * In `SQLiteSettingsRepository.patch()`, keys with `null` in `p.generation` are explicitly deleted from `current` before saving to SQLite, preventing `Value.Check` failure in `getAll()`.
* **Forwarding (`backend/src/routes/messages.ts` ×2 sites, `backend/src/routes/chats.ts` ×1 site)**:
  * `reasoning: settings.generation.reasoning` and `reasoningEffort: settings.generation.reasoningEffort` forwarded into all job request constructions.
* **Providers (`backend/src/providers/openai-compatible.ts`, `backend/src/providers/openrouter.ts`, `backend/src/providers/presets.ts`, `backend/src/providers/gemini-interactions.ts`)**:
  * `OpenAICompatibleProvider`: added `allowReasoningOff` and `reasoningOnEnabled` flags. Wire mapping encodes the rule that Off wins over Level:
    * `thinking === 'off'`: sends `reasoning_effort: 'none'` when `allowReasoningOff: true` (OpenRouter, Custom); omitted on Gemini-compat and strict-base.
    * `level !== undefined`: sends `reasoning_effort: level`.
    * `thinking === 'on' && reasoningOnEnabled`: sends `reasoning: { enabled: true }` (OpenRouter).
  * `OpenRouterProvider`: configured with `allowReasoningOff: true, reasoningOnEnabled: true`.
  * `CustomProvider`: configured with `allowReasoningOff: true, reasoningOnEnabled: false`.
  * `GeminiProvider`: defaults both flags to false (omits off / on-alone, passes levels).
  * `GeminiInteractionsProvider`: maps `thinking_level: req.reasoningEffort` in `generation_config` when `req.reasoning !== 'off'` and effort is present; omits otherwise.
* **Engine Persistence & Duration (`backend/src/engine/generation.ts`)**:
  * Records `thinkStartTime` on first `<think>` token/substring and `thinkEndTime` on `</think>` (or stream finish).
  * Persists `metadata.reasoning` capped at 16,000 characters with `\n\n[Reasoning truncated]` marker to prevent unbounded SQLite row growth, and persists `metadata.reasoningDurationMs`.
* **Frontend Thought Streaming & Session (`frontend/src/lib/state/stream.svelte.ts`, `frontend/src/lib/state/session.svelte.ts`)**:
  * `extractLiveReasoning(buffer)` parses live reasoning text from the buffer and detects whether thoughts are unclosed (`isThinking: true`).
  * `StreamController` passes `liveReasoning` to the rAF frame commit callback.
  * `LiveTurn` maintains `reasoning` and `isThinking` in reactive session state.
* **Chat UI (`frontend/src/lib/components/chat/ReasoningBlock.svelte`, `MessageTurn.svelte`, `MessageLog.svelte`)**:
  * Created `ReasoningBlock.svelte`: accessible `<details>` component that is auto-open with a pulsing indicator ("Thinking…") during streaming thoughts, and auto-collapsed with duration ("Thought for {time}") when completed. Styled with `border-l-2 border-accent`, `text-(--chrome-text)`, and zero runtime CSS injection (Invariants C14, U2, U8).
  * `MessageTurn.svelte` renders `ReasoningBlock` above story segments, and suppresses empty speech bubbles while thinking is actively underway.
  * `MessageLog.svelte` feeds metadata reasoning/duration on persisted turns, and live reasoning/thinking state on streaming turns.
* **Settings UI (`frontend/src/lib/settings/generation.ts`, `frontend/src/lib/components/settings/SettingsSheet.svelte`)**:
  * Generation tab Basic group: added `Thinking` segmented control (`Default` | `On` | `Off`) directly under Temperature with the hint: *"Applies to reasoning models; ignored otherwise. Off is best-effort — Gemini models always think a little."*
  * Generation tab Advanced group: added `Thinking level` segmented control (`Default` | `Low` | `Medium` | `High`) with the hint: *"Sent whenever set unless Thinking is Off."*
  * Unset-display rule holds by construction: uses display helper resolvers and `queuePatch`, never `bind:value` with `$effect`. Mount never triggers patches.

## 2. Verification

* **Shared Schema Tests (`packages/shared/test/schemas-api.test.ts`)**:
  * Validated accept/reject matrix for `reasoning` ('on', 'off') and `reasoningEffort` ('low', 'medium', 'high').
  * Verified `null` clearing in `SettingsPatchSchema`.
  * Verified absent-stays-absent pin on `DEFAULT_SETTINGS`.
* **Backend Provider Tests (`backend/test/providers/openai-compatible.test.ts`, `backend/test/providers/gemini-interactions.test.ts`)**:
  * Full provider matrix tests for OpenRouter, Custom, Gemini-compat, and strict-base across all combinations of toggle and level.
  * Verified Off suppresses level on all paths.
  * Verified `GeminiInteractionsProvider` maps `thinking_level` in `generation_config`.
* **Backend Route & Settings Tests (`backend/test/routes/settings.test.ts`)**:
  * Verified patching and null-clearing of reasoning settings without corrupting stored settings or resetting defaults.
* **Backend Engine Tests (`backend/test/engine/generation.test.ts`)**:
  * Verified `metadata.reasoning` persistence and `reasoningDurationMs` calculation.
  * Verified 16k character truncation cap with `[Reasoning truncated]` marker.
* **Frontend Unit Tests (`frontend/unit/generationSettings.test.ts`, `frontend/unit/reasoningBlock.test.ts`)**:
  * Verified display resolvers, duration formatting (`800ms` → `0.8s`, `3400ms` → `3.4s`, `65000ms` → `1m 5s`).
  * Tested `extractLiveReasoning` for unclosed, closed, and non-thinking stream buffers.
  * Verified structural snapshots for `ReasoningBlock`, `MessageTurn`, and `SettingsSheet`.
* **Full Suite & Integrity Checks**:
  * `bun run typecheck`: **0 errors, 0 warnings** across `packages/shared`, `backend`, and `frontend`.
  * `bun run test`: **188/188 pass** across 25 files in frontend, all backend tests pass, all shared tests pass.
  * `bun run db:check`: SQLite WAL, FKs, schema integrity, and FTS parity all pass cleanly (exit 0).

## 3. Deviations and fixes during implementation

* **Settings Repository `null` deletion**:
  * Identified that `SQLiteSettingsRepository.patch` previously did `{ ...current, ...p.generation }`. If the client patched `{ reasoning: null }`, `null` remained in the JSON row, which failed `Value.Check(AppSettingsSchema.properties.generation)` and triggered a fallback reset of all generation settings to defaults. Fixed by deleting keys when patch values equal `null`.
* **Live Thought Extraction Seam**:
  * Because `parseEnvelope()` withholds unclosed reasoning tags from `segments` during streaming (per Invariant E4), `extractLiveReasoning` was added to `stream.svelte.ts` to inspect the raw stream buffer directly on rAF ticks, ensuring real-time thought text and the pulsing "Thinking…" header render while thoughts are actively streaming.
* **Empty Speech Bubble Guard**:
  * When streaming begins with a thinking model, `segments.length === 0` initially. `MessageTurn.svelte` previously rendered an empty speech bubble for `segments.length === 0`. Added `!reasoning && !isThinking` guard so only the active `ReasoningBlock` is visible during the thinking phase.

## 4. Known limits / follow-ups

* Gemini 3.8 temperature/top_p stripping remains a separate workstream per proposal §8.
* Capability caching for OpenRouter models (`mandatory: true` or supported efforts) remains a clean follow-up; v1 gracefully surfaces upstream 400 errors if an incompatible model rejects `"none"`.
* Auto-expand user preference for completed thoughts remains an optional future setting; v1 uses native `<details>` with open-on-stream and collapsed-on-finish.
