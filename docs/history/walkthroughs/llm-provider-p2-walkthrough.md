# LLM Provider P2 Walkthrough: OpenRouter as Preset

Implements P2 of [`docs/history/reports/llm-provider-structure-proposal.md`](../reports/llm-provider-structure-proposal.md) §6. Zero behavior change by test.

## 1. What changed

* **`backend/src/providers/openrouter.ts`** — rewritten from 371 lines of standalone logic to a ~45-line `OpenRouterProvider extends OpenAICompatibleProvider` preset: pinned `baseUrl https://openrouter.ai/api/v1`, `HTTP-Referer`/`X-Title` headers, `usageAccounting: 'openrouter'`, `allowExtendedSampling: true`, `errorLabel: 'OpenRouter'`, `prefill: true` capability override, same `anthropic/claude-3.5-sonnet` default model and `OpenRouterConfig` surface. `FetchFn` re-export preserved for existing importers (`engine/providers.ts`).
* **`backend/src/providers/openai-compatible.ts`** — one additive option: `errorLabel` (default `'Upstream'`), used in the three upstream-error message sites. No change to defaults or streaming behavior; P1 tests unaffected.

## 2. Parity evidence

* All 12 existing `test/providers/openrouter.test.ts` tests pass unmodified, including the behavioral pins: `usage == {include:true}`, stop cap at 4, user-first + coalescing + prefill message shaping, `OpenRouter 429/401` labels with key scrubbing, SSE edge cases, abort and idle-timeout handling.
* Full backend suite 190/190, `tsc --noEmit` clean.

## 3. Queued

* P3: Custom + Gemini-compat presets, settings schema/repository/routes, frontend inputs.
