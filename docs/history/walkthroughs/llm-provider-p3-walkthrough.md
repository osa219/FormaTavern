# LLM Provider P3 Walkthrough: Custom + Gemini-compat Presets, Settings, UI

Implements P3 of [`docs/history/reports/llm-provider-structure-proposal.md`](../reports/llm-provider-structure-proposal.md) §6–§8 with amendments §12. `generation.ts` and the `StreamEvent` contract untouched.

## 1. What changed

* **Presets (`backend/src/providers/presets.ts`, new)** — `CustomProvider` (`id 'custom'`, user `baseUrl`, optional key, `stream_options` accounting, `prefill:false`) and `GeminiProvider` (`id 'gemini'`, default `https://generativelanguage.googleapis.com/v1beta/openai/`, default model `gemini-3.5-flash`, `stream_options` accounting). Reasoning-effort mapping (`thinking_level`) deferred: `LLMRequest` has no such field yet, and the compat endpoint works without it.
* **Registry (`backend/src/engine/providers.ts`, `contracts.ts`)** — resolves `custom` (409 unless `baseUrl` set; key from settings or `CUSTOM_API_KEY`; keyless allowed; small `baseUrl::key` cache) and `gemini` (409 unless key from settings or `GEMINI_API_KEY`). OpenRouter/mock paths unchanged.
* **Settings (`packages/shared/src/schemas/settings.ts`)** — `provider.id` gains `custom|gemini`; new `custom {baseUrl?, apiKey?}` and `gemini {apiKey?}` stored objects, mirrored in view (hint-last-4 + `settings|env|none` source, `custom.baseUrl` echoed) and patch (null clears; partial inner objects so single-field patches validate).
* **Persistence (`backend/src/db/repositories/settings.ts`)** — `custom`/`gemini` registered in both `getAll()` `subSchemas` and `patch()` branches (amendment A12.6); `baseUrl` trimmed on write.
* **Routes (`backend/src/routes/settings.ts`)** — `toSettingsView` shares one `keyStatus()` helper across all three keyed providers; PATCH rejects empty-string keys (all providers) and non-`http(s)` custom base URLs with 422.
* **Boot (`backend/src/index.ts`)** — startup log reports `custom`/`gemini` readiness alongside openrouter.
* **UI (`frontend/.../settings/SettingsSheet.svelte`)** — provider selector gains both options; per-provider model placeholders; Custom block (base-URL save + optional-key save/clear with keyless hint); Gemini block (key save/clear + Auth-key note). No changes to generation/narrative tabs or the settings store.

## 2. Verification

* shared: 192/192 (+3 new assertions), `tsc` clean.
* backend: 201/201 (13 P1 + 6 registry + repo roundtrip + 4 route tests new), `tsc` clean.
* frontend: 180/180, `svelte-check` 0 errors / 0 warnings.

## 3. Deviations and fixes during implementation

* **Patch-schema partials (bug caught by new test):** the first `custom` patch object declared both inner keys required, so Elysia returned 422 for single-field patches (`baseUrl`-only). Fixed with `Type.Partial` on `custom`/`gemini` patch objects; the keyless-custom end-to-end test now asserts its setup PATCH status so regressions surface at the setup line instead of a downstream timeout.
* **Flaky-timing guard:** the custom end-to-end route test polls up to ~2s for the background generation's upstream call instead of asserting immediately.
* **Deferred to P4:** native `GeminiInteractionsProvider`, `thinking_level` wiring, per-model reasoning controls.
