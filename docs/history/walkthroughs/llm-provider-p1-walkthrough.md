# LLM Provider P1 Walkthrough: `OpenAICompatibleProvider` Base

Implements P1 of [`docs/history/reports/llm-provider-structure-proposal.md`](../reports/llm-provider-structure-proposal.md) §6 + amendments §12. No behavior change to any existing path.

## 1. What changed

* **New `backend/src/providers/openai-compatible.ts`** — `OpenAICompatibleProvider` implementing `LLMProvider`, carrying the proven `OpenRouterProvider` streaming core (SSE parsing, idle timeout, abort, usage, terminal contract) generalized per amendments:
  * A12.1 `normalizeBaseUrl()` + `joinUrl()`: trims, strips pasted `/chat/completions` or `/models` suffixes, keeps `/v1` prefixes, never emits `//`. Constructor throws on empty base.
  * A12.2 strict sampling: only `temperature/top_p/stop/max_tokens` sent by default; `top_k/min_p/repetition_penalty` gated behind `allowExtendedSampling` (default `false`).
  * A12.3 usage accounting modes: `stream_options` (default) vs `openrouter` vs `none`, mutually exclusive.
  * A12.4 reasoning: `delta.reasoning_content ?? delta.reasoning` wrapped in `<think>` tags (open-once, close on first content or stream end), which the envelope parser already strips from segments (`shared/src/envelope/outOfBand.ts`). Bare passthrough when the model manages its own tags. Reasoning is never yielded as bare story tokens, so `generation.ts` buffering stays clean.
  * A12.5 `capabilities.prefill=false` (strict default; OpenRouter opts into `true` in P2).
  * Keyless support: `Authorization` header omitted when no key (local Ollama/LM Studio).
  * A12.8-ready: key scrubbing on all error paths; `listModels()` tolerates both OpenRouter (`context_length`) and plain OpenAI (`{id}`-only) shapes.
* **`backend/src/providers/index.ts`** — re-exports the new module.
* **`backend/src/providers/openrouter.ts`** — `FetchFn` now imported/re-exported from `./openai-compatible` (single canonical definition; zero runtime change, existing tests untouched and green).
* **New `backend/test/providers/openai-compatible.test.ts`** — 13 tests: URL normalization, strict/extended sampling, usage modes, keyless headers, `extraBody`/`excludeKeys`, `<think>` wrapping + close-on-end + no-double-wrap, dual `/models` shapes, key scrubbing + 429 recoverability, pre-fetch abort, empty-base guard. All assert the stream contract via `assertStreamContract`.

## 2. What did not change

* `OpenRouterProvider`, `MockLLMProvider`, `ProviderRegistryImpl`, settings schemas, `settings.ts` repository, routes, `generation.ts`, frontend — untouched. Registry still resolves `mock | openrouter` only. P2 (OpenRouter-as-preset) and P3 (Custom + Gemini-compat + settings/UI) remain queued.

## 3. Verification

* `bun test test/providers/` — 49 pass, 0 fail (13 new + 36 existing).
* `bun test` (full backend) — 190 pass, 0 fail across 26 files.
* `bun run typecheck` (`tsc --noEmit`) — clean.

## 4. Deviations from proposal

* None in behavior. One structural note: the shared `FetchFn` type now lives in `openai-compatible.ts` with `openrouter.ts` re-exporting it, anticipating the P2 subclassing. Importers (`engine/providers.ts`) are unaffected.
* The no-double-wrap guard covers the case where model-owned `<think>` content arrives before reasoning-channel chunks; reasoning-first-then-inline-tags yields adjacent (never nested) think blocks, which the envelope extractor handles as sequential reasoning segments.
