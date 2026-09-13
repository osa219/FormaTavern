# LLM Provider Walkthrough: OpenAI Base with OpenRouter, Custom, and Gemini Presets

As-built record for [`docs/history/reports/llm-provider-structure-proposal.md`](../reports/llm-provider-structure-proposal.md) §6–§8 with amendments §12. Landed as `b9b0e09` (P1) → `4c55ccd` (P2) → `cf2af57` (P3) → `fff60d9` (P4), plus `8df17df` (Gemini Native settings copy fix). Throughout, `generation.ts` and the `StreamEvent` contract stayed untouched — the acceptance check that the `LLMProvider` seam held.

Final verification: backend 210/210 (`tsc` clean), shared 192/192 (`tsc` clean), frontend 180/180 (`svelte-check` 0/0).

---

## P1 — `OpenAICompatibleProvider` base (`b9b0e09`)

No behavior change to any existing path.

### P1.1 What changed

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

### P1.2 Verification

* `bun test test/providers/` — 49 pass, 0 fail (13 new + 36 existing).
* `bun test` (full backend) — 190 pass, 0 fail across 26 files.
* `bun run typecheck` (`tsc --noEmit`) — clean.

### P1.3 Deviations from proposal

* None in behavior. One structural note: the shared `FetchFn` type now lives in `openai-compatible.ts` with `openrouter.ts` re-exporting it, anticipating the P2 subclassing. Importers (`engine/providers.ts`) are unaffected.
* The no-double-wrap guard covers the case where model-owned `<think>` content arrives before reasoning-channel chunks; reasoning-first-then-inline-tags yields adjacent (never nested) think blocks, which the envelope extractor handles as sequential reasoning segments.

---

## P2 — OpenRouter as preset (`4c55ccd`)

Zero behavior change by test.

### P2.1 What changed

* **`backend/src/providers/openrouter.ts`** — rewritten from 371 lines of standalone logic to a ~45-line `OpenRouterProvider extends OpenAICompatibleProvider` preset: pinned `baseUrl https://openrouter.ai/api/v1`, `HTTP-Referer`/`X-Title` headers, `usageAccounting: 'openrouter'`, `allowExtendedSampling: true`, `errorLabel: 'OpenRouter'`, `prefill: true` capability override, same `anthropic/claude-3.5-sonnet` default model and `OpenRouterConfig` surface. `FetchFn` re-export preserved for existing importers (`engine/providers.ts`).
* **`backend/src/providers/openai-compatible.ts`** — one additive option: `errorLabel` (default `'Upstream'`), used in the three upstream-error message sites. No change to defaults or streaming behavior; P1 tests unaffected.

### P2.2 Parity evidence

* All 12 existing `test/providers/openrouter.test.ts` tests pass unmodified, including the behavioral pins: `usage == {include:true}`, stop cap at 4, user-first + coalescing + prefill message shaping, `OpenRouter 429/401` labels with key scrubbing, SSE edge cases, abort and idle-timeout handling.
* Full backend suite 190/190, `tsc --noEmit` clean.

---

## P3 — Custom + Gemini-compat presets, settings, UI (`cf2af57`)

### P3.1 What changed

* **Presets (`backend/src/providers/presets.ts`, new)** — `CustomProvider` (`id 'custom'`, user `baseUrl`, optional key, `stream_options` accounting, `prefill:false`) and `GeminiProvider` (`id 'gemini'`, default `https://generativelanguage.googleapis.com/v1beta/openai/`, default model `gemini-3.5-flash`, `stream_options` accounting). Reasoning-effort mapping (`thinking_level`) deferred: `LLMRequest` has no such field yet, and the compat endpoint works without it.
* **Registry (`backend/src/engine/providers.ts`, `contracts.ts`)** — resolves `custom` (409 unless `baseUrl` set; key from settings or `CUSTOM_API_KEY`; keyless allowed; small `baseUrl::key` cache) and `gemini` (409 unless key from settings or `GEMINI_API_KEY`). OpenRouter/mock paths unchanged.
* **Settings (`packages/shared/src/schemas/settings.ts`)** — `provider.id` gains `custom|gemini`; new `custom {baseUrl?, apiKey?}` and `gemini {apiKey?}` stored objects, mirrored in view (hint-last-4 + `settings|env|none` source, `custom.baseUrl` echoed) and patch (null clears; partial inner objects so single-field patches validate).
* **Persistence (`backend/src/db/repositories/settings.ts`)** — `custom`/`gemini` registered in both `getAll()` `subSchemas` and `patch()` branches (amendment A12.6); `baseUrl` trimmed on write.
* **Routes (`backend/src/routes/settings.ts`)** — `toSettingsView` shares one `keyStatus()` helper across all three keyed providers; PATCH rejects empty-string keys (all providers) and non-`http(s)` custom base URLs with 422.
* **Boot (`backend/src/index.ts`)** — startup log reports `custom`/`gemini` readiness alongside openrouter.
* **UI (`frontend/.../settings/SettingsSheet.svelte`)** — provider selector gains both options; per-provider model placeholders; Custom block (base-URL save + optional-key save/clear with keyless hint); Gemini block (key save/clear + Auth-key note). No changes to generation/narrative tabs or the settings store.

### P3.2 Verification

* shared: 192/192 (+3 new assertions), `tsc` clean.
* backend: 201/201 (13 P1 + 6 registry + repo roundtrip + 4 route tests new), `tsc` clean.
* frontend: 180/180, `svelte-check` 0 errors / 0 warnings.

### P3.3 Deviations and fixes during implementation

* **Patch-schema partials (bug caught by new test):** the first `custom` patch object declared both inner keys required, so Elysia returned 422 for single-field patches (`baseUrl`-only). Fixed with `Type.Partial` on `custom`/`gemini` patch objects; the keyless-custom end-to-end test now asserts its setup PATCH status so regressions surface at the setup line instead of a downstream timeout.
* **Flaky-timing guard:** the custom end-to-end route test polls up to ~2s for the background generation's upstream call instead of asserting immediately.

---

## P4 — Native `GeminiInteractionsProvider` (`fff60d9`)

Wire format verified against Google's current docs (quickstart REST+SSE examples, text-generation guide, `Api-Revision` migration notes) before coding; no live-key calls were made — all coverage is fixture-driven.

### P4.1 What changed

* **New `backend/src/providers/gemini-interactions.ts`** — `GeminiInteractionsProvider` (`id 'gemini-interactions'`, `prefill:false`) speaking the native protocol, not OpenAI-shape:
  * `POST {base}/interactions?alt=sse` with `{model, input, system_instruction?, generation_config?{temperature?}, stream:true}`, auth via `x-goog-api-key` (never `Authorization`).
  * Stateless by design: history rendered to a `Role: content` transcript (`renderInteractionsTranscript`); no `previous_interaction_id` chaining since FormaTavern owns history.
  * Streaming: `step.delta` text → tokens, thought/reasoning deltas → `<think>`-wrapped tokens (same envelope-stripping contract as P1), `interaction.completed` / `requires_action` / EOF → `done{stop}`, `*.failed` / `error` payloads → terminal errors. Unknown event types ignored.
  * Deliberate omissions (unverified server fields, documented): `maxTokens`/`topK`/`minP` never sent; usage events never emitted (completed-event `usage` has no verified prompt/completion split — emitting zeros would corrupt metrics); `store`/`background`/tools untouched.
  * `listModels()` maps native `{models:[{name:'models/…', displayName, inputTokenLimit}]}`.
* **Registry** — `gemini-interactions` id shares the Gemini key section (settings or `GEMINI_API_KEY`, 409 otherwise), own small cache, default model `gemini-3.5-flash`. No new settings section, no DB change.
* **Schema/UI** — `provider.id` union gains the fifth id (stored/view/patch); SettingsSheet shows the existing Gemini key block and model placeholder for both Gemini ids (`8df17df` corrects the endpoint note per mode: compat vs native).
* **Tests** — 6 provider tests (text streaming, thought wrapping, requires_action/EOF termination, request shape + header + omission pins, native models mapping, 401 scrub, pre-fetch abort), 2 registry tests (409, native endpoint + key header), route 409 leg, shared patch acceptance. Stream contract asserted throughout.

### P4.2 Verification

* backend: 210/210, `tsc` clean. shared: 192/192, `tsc` clean. frontend: 180/180, `svelte-check` 0/0.

### P4.3 Known limits / follow-ups

* Requires live-key validation against `v1beta` (chat + thought streaming + 401/429 paths) before advertising it in release notes; fixture shapes track docs dated 2026-09.
* `thinking_level` wiring awaits an `LLMRequest` reasoning field; temperature is passed through although Gemini 3 guidance prefers defaults.
* Tool-call (`requires_action`) turns end the stream cleanly — no agentic loop by design.
* Operational note: the running dev backend must be restarted (not just Vite HMR) to pick up schema changes — `bun --watch` does not reliably reload cross-package edits. If the UI offers an id the API rejects with 422, restart the backend; `bun run stop` frees ports 3000/5173 when Ctrl+C is swallowed.
