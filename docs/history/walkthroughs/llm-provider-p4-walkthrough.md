# LLM Provider P4 Walkthrough: Native `GeminiInteractionsProvider`

Implements P4 of [`docs/history/reports/llm-provider-structure-proposal.md`](../reports/llm-provider-structure-proposal.md) §6–§8. Wire format verified against Google's current docs (quickstart REST+SSE examples, text-generation guide, `Api-Revision` migration notes) before coding; no live-key calls were made — all coverage is fixture-driven.

## 1. What changed

* **New `backend/src/providers/gemini-interactions.ts`** — `GeminiInteractionsProvider` (`id 'gemini-interactions'`, `prefill:false`) speaking the native protocol, not OpenAI-shape:
  * `POST {base}/interactions?alt=sse` with `{model, input, system_instruction?, generation_config?{temperature?}, stream:true}`, auth via `x-goog-api-key` (never `Authorization`).
  * Stateless by design: history rendered to a `Role: content` transcript (`renderInteractionsTranscript`); no `previous_interaction_id` chaining since FormaTavern owns history.
  * Streaming: `step.delta` text → tokens, thought/reasoning deltas → `<think>`-wrapped tokens (same envelope-stripping contract as P1), `interaction.completed` / `requires_action` / EOF → `done{stop}`, `*.failed` / `error` payloads → terminal errors. Unknown event types ignored.
  * Deliberate omissions (unverified server fields, documented): `maxTokens`/`topK`/`minP` never sent; usage events never emitted (completed-event `usage` has no verified prompt/completion split — emitting zeros would corrupt metrics); `store`/`background`/tools untouched.
  * `listModels()` maps native `{models:[{name:'models/…', displayName, inputTokenLimit}]}`.
* **Registry** — `gemini-interactions` id shares the Gemini key section (settings or `GEMINI_API_KEY`, 409 otherwise), own small cache, default model `gemini-3.5-flash`. No new settings section, no DB change.
* **Schema/UI** — `provider.id` union gains the fifth id (stored/view/patch); SettingsSheet shows the existing Gemini key block and model placeholder for both Gemini ids.
* **Tests** — 6 provider tests (text streaming, thought wrapping, requires_action/EOF termination, request shape + header + omission pins, native models mapping, 401 scrub, pre-fetch abort), 2 registry tests (409, native endpoint + key header), route 409 leg, shared patch acceptance. Stream contract asserted throughout.

## 2. Verification

* backend: 210/210, `tsc` clean. shared: 192/192, `tsc` clean. frontend: 180/180, `svelte-check` 0/0.

## 3. Known limits / follow-ups

* Requires live-key validation against `v1beta` (chat + thought streaming + 401/429 paths) before advertising it in release notes; fixture shapes track docs dated 2026-09.
* `thinking_level` wiring awaits an `LLMRequest` reasoning field; temperature is passed through although Gemini 3 guidance prefers defaults.
* Tool-call (`requires_action`) turns end the stream cleanly — no agentic loop by design.
