# LLM Provider Structure Proposal: OpenAI Base with OpenRouter, Custom, and Gemini Presets

**Status:** Implemented (P1 `b9b0e09`, P2 `4c55ccd`, P3 `cf2af57`, P4 `fff60d9`). Walkthrough: `llm-provider-walkthrough.md`.
**Date:** 2026-09-13 UTC
**Scope:** Backend API structure only. No UI mockups, no migration run.
**Reference code:** `SillyTavern` cloned at `S:\WorkSpace\Git Workspace\SillyTavern` (branch `release`, commit `8172dcd0e`), compared against `FormaTavern` at `v0.5.0` line.

---

## §1 — Where FormaTavern stands today

FormaTavern has the cleaner abstraction of the two projects, but it is locked to one vendor URL.

* `packages/shared/src/types/llm.ts:39` defines `LLMProvider { id, capabilities, listModels?, generate() }`. Generation (`backend/src/engine/generation.ts`) consumes it agnostically — this is worth keeping.
* `backend/src/providers/openrouter.ts:26` implements that interface, but hardcodes both endpoints:
  * `GET https://openrouter.ai/api/v1/models` (`:59`)
  * `POST https://openrouter.ai/api/v1/chat/completions` (`:129`)
* Config is `{ apiKey, defaultModel, referer, title, fetch, idleTimeoutMs }` (`:17-24`). There is no `baseUrl`, no header/body override, no keyless mode.
* `backend/src/engine/providers.ts:25` (`ProviderRegistryImpl.resolve`) and `packages/shared/src/schemas/settings.ts:6` (`provider.id`) only know `mock | openrouter`.
* One OpenRouter-only payload line leaks into the generic path: `usage: { include: true }` (`openrouter.ts:116`). Plain OpenAI servers expect `stream_options: { include_usage: true }` instead and strict ones reject unknown fields. Same risk applies to `top_k / min_p / repetition_penalty` pass-through.

Net effect: any OpenAI-shaped backend that is not OpenRouter (local Ollama / LM Studio / vLLM / llama.cpp, Together, corporate gateways) has nowhere to plug in, even though the SSE parsing, timeout, abort, and usage handling would work unchanged.

---

## §2 — How SillyTavern does it

SillyTavern has no `LLMProvider` class. It is a thin backend proxy with a fat frontend selection.

Core file: `SillyTavern/src/endpoints/backends/chat-completions.js` (~2896 lines). The frontend (`public/scripts/openai.js`, `public/scripts/custom-request.js`) POSTs a blob containing `chat_completion_source, model, messages, custom_url, reverse_proxy, proxy_password, custom_include_body/headers, custom_exclude_body`, and the backend forwards it.

The generic OpenAI family shares one fetch at `chat-completions.js:2590` (`fetch(${apiUrl}/chat/completions)`). Only `apiUrl / apiKey / headers / bodyParams` differ (`:2196-2498`):

* `OPENAI:2196` — `apiUrl = reverse_proxy || https://api.openai.com/v1`. Minimal body. Key from `SECRET_KEYS.OPENAI` or `proxy_password`.
* `OPENROUTER:2216` — `apiUrl = https://openrouter.ai/api/v1` (no proxy override). Adds `OPENROUTER_HEADERS` (`HTTP-Referer / X-Title`), `transforms, plugins, reasoning, provider.order, route=fallback, min_p/top_a/repetition_penalty`, plus Claude/Gemini cache helpers.
* `CUSTOM:2304` — `apiUrl = request.body.custom_url` (free-form). Key optional (exempted at `:2516`). Merges `custom_include_body/headers` via `mergeObjectWithYaml`, strips `custom_exclude_body` via `excludeKeysByYaml` at `:2572`. This is the escape hatch FormaTavern is missing.
* Siblings (`GROQ, FIREWORKS, NANOGPT, POLLINATIONS, MOONSHOT, ZAI, SILICONFLOW, WORKERS_AI`, …) are the same pattern with a different default URL plus small tweaks.

Two generic mechanisms worth copying:

1. `custom_url` — free base URL, only for `CUSTOM`.
2. `reverse_proxy + proxy_password` — per-request URL/key override for almost every other named source (e.g. point the Claude source at a Claude-compatible proxy).

Truly non-OpenAI APIs get dedicated handlers with prompt converters from `src/prompt-converters.js`: `sendClaudeRequest:213`, `sendMakerSuiteRequest:420` (Gemini/Vertex native), `sendMistralAIRequest:838`, `sendCohereRequest:928`, `sendDeepSeekRequest:1028`, `sendXaiRequest:1140`, dispatched at `:2175-2187`. Source enum at `src/constants.js:187-213` lists ~25 chat sources; text-completion sources add another ~10 (`:223-235`).

Lesson: OpenAI Chat Completions is the de-facto parent protocol. `CUSTOM` is "same protocol, different URL". Named sources are thin specializations. The weakness to avoid copying is the 2800-line switch with duplicated per-vendor branches — FormaTavern's `LLMProvider` interface already solves that.

---

## §3 — OpenAI vs OpenRouter as parent

OpenRouter **is** OpenAI plus extras, so OpenAI is the correct parent:

| Concern | OpenAI base | OpenRouter as base |
|---|---|---|
| `POST {model, messages, stream, temperature/top_p/penalties}` + SSE `data: [DONE]` | native | identical — inherited |
| Base URL | any `.../v1` | hardcoded `https://openrouter.ai/api/v1` |
| Auth | `Authorization: Bearer` (key optional for local) | key required, plus `HTTP-Referer / X-Title` |
| Usage accounting | `stream_options.include_usage` (strict servers) | `usage.include` (rejected by strict servers) |
| Sampling extensions | minimal set | `top_k/min_p/repetition_penalty/top_a` pass-through |
| Model listing | `{ data: [{ id }] }`, context length unknown | `{ data: [{ id, name, context_length }] }` |
| Router features | none | `provider.order, allow_fallbacks, route=fallback, transforms, plugins` |

Choosing OpenRouter as the first preset was a good product call (one key, hundreds of models). Keeping it as the code parent is what blocks custom providers. The fix is an inversion, not a rewrite: all current SSE/timeout/abort/retry code moves unchanged into the base; OpenRouter becomes a ~20-line preset.

---

## §4 — Gemini protocol status, verified 2026-09-13

Sources are Google AI for Developers docs, all updated early Sept 2026.

1. **Interactions API is now the default; `generateContent` is legacy but supported.** Since June 2026 new projects should use `POST /v1beta/interactions` (`{ model, input }`) or `/v1/interactions`. Docs: `https://ai.google.dev/gemini-api/docs` (2026-09-04), `.../docs/interactions-overview`, `.../docs/api-versions` (2026-09-02). Interactions had May 2026 breaking changes (new `steps` schema, streaming events, `Api-Revision: 2026-05-20`; legacy removed June 8, 2026): `.../docs/interactions-breaking-changes-may-2026`.
2. **OpenAI compatibility is still documented and is the correct Gemini v1 path for us.** `base_url https://generativelanguage.googleapis.com/v1beta/openai/`, `POST /v1beta/openai/chat/completions`, `Authorization: Bearer GEMINI_API_KEY`, e.g. `model gemini-3.7-flash / gemini-3.8-flash`. Supports chat, streaming, function calling, structured output, thought signatures, and reasoning via `extra_body.google.thinking_config`. Header differs from native (`x-goog-api-key` native vs `Authorization: Bearer` compat). If not already on OpenAI libraries Google recommends native; the compat page itself banners Interactions for newest features: `https://ai.google.dev/gemini-api/docs/openai`.
3. **Thinking parameter changed — do not copy old code.** 2.5 series uses numeric `thinking_budget`; 3.x uses enum `thinking_level: minimal|low|medium|high`. Sending both returns 400. Do not retune `temperature/top_p/top_k` on 3.x. SillyTavern still carries budget-era logic — do not port it verbatim. Docs: `.../docs/generate-content/thinking`, `.../docs/thinking`, `.../docs/whats-new-gemini-3.5` (2026-09-03/04).
4. **Models and keys need attention this month.** Dead or redirected: `gemini-2.0-flash` (shutdown 2026-06-01), `2.5-flash-preview-04-17`, `2.5-pro-preview-05-06`, `3-pro-preview` (→ `3.1-pro-preview`), Imagen 4 (2026-08-17). Current: `3.5-flash`, `3.6-flash`, `3.7-flash`, `3.8-flash`: `.../docs/changelog`. Keys migrate Standard → Auth (service-account-bound). New AI Studio keys are Auth by default; unrestricted Standard rejected since 2026-06-19; **all Standard rejected Sept 2026**; dormant unrestricted blocked since 2026-05-07: `.../docs/api-key`.

Implication: Gemini-via-OpenAI-compat covers chat for v1. Agents, computer use, and future tools will need native Interactions later — so the provider interface should reserve that slot now.

---

## §5 — Agreed scope: three providers, no SillyTavern-sized list

Deliberately not porting the ~25-source list. Three entries cover the real use cases:

* **P1 — Custom OpenAI-compatible** (`baseUrl + apiKey?`): unlocks local servers and every OpenAI-shaped cloud (including XAI/Groq/DeepSeek-shaped endpoints) with zero per-vendor code.
* **P2 — OpenRouter preset** of P1: keeps current behavior, adds router extras only when the id is `openrouter`.
* **P3 — Gemini via OpenAI-compat preset** of P1: different default `baseUrl`, Gemini key, `thinking_level` mapping. Native Interactions provider designed now (slot in the interface + settings), implemented as a follow-up workstream so v1 stays small.

Out of scope for this proposal: Anthropic Messages native, Vertex auth, Cohere/Mistral/AI21 natives, text-completion (`/completions`) legacy models, image/audio/video endpoints, per-user secret ids in the SillyTavern style.

---

## §6 — Proposal P1: `OpenAICompatibleProvider` base class

New file `backend/src/providers/openai-compatible.ts` (P1). Move the current `OpenRouterProvider` streaming implementation verbatim except for the points below.

```ts
export interface OpenAICompatibleConfig {
  baseUrl: string;
  apiKey?: string;
  defaultModel?: string;
  extraHeaders?: Record<string, string>;
  extraBody?: Record<string, any>;
  excludeKeys?: string[];
  fetch?: FetchFn;
  idleTimeoutMs?: number;
  referer?: string; // only used by presets that need it
  title?: string;
}

export class OpenAICompatibleProvider implements LLMProvider {
  id = 'openai-compatible';
  capabilities = { chatCompletion: true, textCompletion: false, listModels: true, prefill: true, nativeStateChannel: false };
  // listModels(): GET `${baseUrl}/models`, accept both shapes:
  //   OpenRouter { id, name, context_length } and OpenAI { id } -> fallback 8192.
  // generate(): POST `${baseUrl}/chat/completions`, minimal OpenAI body
  //   + {...extraBody} minus excludeKeys. Keep current SSE/timeout/abort/usage logic.
}
```

Rules for the base (drawn from §2–§3):

* No hardcoded host. No required key (local servers are keyless — mirror SillyTavern `CUSTOM` exemption).
* No `usage.include` in the base. Presets opt into `usage.include` (OpenRouter) or `stream_options.include_usage` (strict OpenAI) via `extraBody`.
* Unknown sampling keys (`top_k/min_p/repetition_penalty`) travel via `extraBody` only, never unconditionally.
* Header auth is `Authorization: Bearer` when a key exists; Gemini-compat reuses this, native Gemini (P4) will use `x-goog-api-key` in its own class.

### Proposal P2: OpenRouter becomes a preset

Rewrite `backend/src/providers/openrouter.ts` as a ~20-line subclass/factory (P2, backward compatible):

```ts
export class OpenRouterProvider extends OpenAICompatibleProvider {
  id = 'openrouter';
  constructor(cfg: { apiKey: string; fetch?: FetchFn; referer?: string; title?: string }) {
    super({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: cfg.apiKey,
      extraHeaders: { 'HTTP-Referer': cfg.referer ?? 'http://127.0.0.1:3000', 'X-Title': cfg.title ?? 'FormaTavern' },
      extraBody: { usage: { include: true } },
      fetch: cfg.fetch,
    });
  }
}
```

Router extras (`provider.order/allow_fallbacks, route=fallback, transforms, plugins, reasoning.effort, verbosity`) are added to `extraBody` only on this path later, mirroring SillyTavern `chat-completions.js:2222-2275`. Existing stored keys and models keep working; default model stays as configured.

### Proposal P3: Custom + Gemini-compat presets

Both are configurations of the P1 base, not new protocols:

```ts
// Custom: user-supplied, e.g. http://localhost:1234/v1, https://api.x.ai/v1, https://api.groq.com/openai/v1
new OpenAICompatibleProvider({ baseUrl: settings.custom.baseUrl, apiKey: settings.custom.apiKey || undefined })

// Gemini via OpenAI-compat:
new OpenAICompatibleProvider({
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  apiKey: settings.gemini.apiKey,
  extraBody: { /* thinking_level mapping via extra_body.google.thinking_config when set */ },
})
```

Gemini specifics for P3:

* Default model must be a current id (`gemini-3.5-flash` or newer); drop `2.0-flash` / `2.5-preview` defaults.
* Map FormaTavern `reasoning_effort low|medium|high` → `extra_body.google.thinking_config.thinking_level`; never send `thinking_budget` alongside it.
* Leave `temperature/top_p/top_k` at defaults for Gemini 3 unless the user explicitly overrides.
* Expect settings UX to warn about Auth vs Standard keys during Sept 2026 (see §4.4).

---

## §7 — Proposal P4 (designed now, built second): native `GeminiInteractionsProvider`

Include the slot in the interface from the start so P1–P3 do not paint us into OpenAI-only shapes. Implement after P1–P3 lands.

```ts
export class GeminiInteractionsProvider implements LLMProvider {
  id = 'gemini-interactions';
  capabilities = { chatCompletion: true, textCompletion: false, listModels: true, prefill: false, nativeStateChannel: false };
  // POST https://generativelanguage.googleapis.com/v1beta/interactions (later /v1/)
  // headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }
  // body: { model, input, generation_config: { thinking_level, ... }, tools? }
  // response: translate steps/outputs + SSE event types
  //   (interaction.created/completed/in_progress/requires_action, step.start/delta/stop)
  //   back into LLMProvider StreamEvent { token, usage, error, done }.
}
```

Why separate class rather than a flag on the base: auth header, request shape (`input` vs `messages`), streaming events, and tool format are all disjoint from OpenAI. Sharing the SSE parser would couple two protocols that Google is explicitly diverging (see §4.1).

`LLMProvider` needs no change for P4 beyond what P1 already guarantees: `generate()` returns the same `StreamEvent` union, so `generation.ts` stays untouched. Only the registry and settings gain a fourth id.

---

## §8 — Registry, settings, and wiring changes

* `backend/src/engine/contracts.ts:39` and `backend/src/engine/providers.ts:15` — widen `resolve()` input to:
  ```
  provider.id: 'mock' | 'openrouter' | 'custom' | 'gemini' | 'gemini-interactions'(P4)
  custom?: { baseUrl?: string; apiKey?: string }
  gemini?: { apiKey?: string; model?: string }   // compat preset (P3)
  openrouter?: { apiKey?: string }                // unchanged (P2)
  ```
  `openrouter` keeps its small apiKey-keyed cache. `custom` constructs per `baseUrl+key` (cap cache at 2 like today or skip caching — construction is cheap). `gemini` (compat) reuses the custom path with a pinned default `baseUrl`. Resolution errors stay as `ApiError('provider_unconfigured', 409, …)`.
* `packages/shared/src/schemas/settings.ts:4` — extend `AppSettingsSchema.provider.id` union and add `custom` / `gemini` objects; mirror in `SettingsViewSchema` (`apiKeySet/apiKeyHint/source` per provider, plus `custom.baseUrl`) and `SettingsPatchSchema` (allow `null` to clear keys, following the existing `openrouter.apiKey` pattern). `DEFAULT_SETTINGS` keeps `mock` default so fresh installs do not change behavior.
* `backend/src/routes/settings.ts:13` (`toSettingsView`) — report per-provider key status from stored value vs `OPENROUTER_API_KEY` / `GEMINI_API_KEY` env, same hint-last-4 pattern; never return raw keys.
* `backend/src/providers/index.ts:19` (`createProviders` / `ProviderEnv`) — export the new base + presets; add `geminiApiKey?` env passthrough.
* Frontend `frontend/src/lib/state/settings.svelte.ts` + settings page — add `custom` radio with `baseUrl + apiKey?` inputs and `gemini` radio with key input; reuse existing `patch()` flow and `BroadcastChannel` sync. Key inputs must be password fields with clear actions; invalid `custom.baseUrl` should block save with the same `isValidUrl`-style check SillyTavern uses on `CUSTOM` (`public/scripts/openai.js:4374`).
* No changes to `backend/src/engine/generation.ts`, `hub.ts`, message/chat routes, or the `StreamEvent` union — the whole point of keeping `LLMProvider` as the seam.

---

## §9 — Migration, compatibility, and testing

* Backward compatible: stored `{ provider.id: 'openrouter', openrouter.apiKey }` resolves identically via P2. Fresh installs default to `mock` as today. No DB migration beyond the additive settings fields.
* Validation: `custom.baseUrl` required when `provider.id === 'custom'`; trim trailing `/`; reject non-http(s); `gemini.apiKey` required when id is `gemini`; surface as 409 `provider_unconfigured` consistent with current OpenRouter behavior.
* Tests to add alongside code (not in this doc): unit tests for base URL joining (`/chat/completions` vs double-slash), header merge, `excludeKeys` stripping, OpenAI-vs-OpenRouter `/models` parsing, `thinking_level`-only mapping for Gemini-compat, keyless custom generate (mock fetch), and registry fallback to `mock` on unknown id.
* Manual checks: OpenRouter chat + model list (regression), local Ollama/LM Studio via custom (keyless), strict OpenAI endpoint (no `usage.include` leakage), Gemini-compat chat with `gemini-3.5-flash`+ Auth key, streaming abort/timeout parity with current provider.

---

## §10 — Risks and explicit non-goals

* OpenAI-compat Gemini is second-class by vendor design (§4.1). If chat needs agents, computer use, or new 3.x tools, P4 native becomes required — hence designing the slot now.
* SillyTavern's `reverse_proxy` is intentionally not proposed: per-request URL/key override complicates FormaTavern's stored-settings + registry model and secret handling. Revisit only if corporate-proxy users ask.
* No per-user secret ids, no `custom_include_body/headers` YAML, no text-completion `/completions` path, no media TTS/STT/image endpoints in this work. Those are SillyTavern features with real maintenance cost and no current FormaTavern caller.
* Key handling: follow existing pattern (env fallback, hint-only views, scrub keys in errors like `openrouter.ts:52`). Add a time-boxed settings notice about the Sept 2026 Standard-key cutoff for Gemini users.

---

## §11 — Suggested build order (proposal, not a roadmap commitment)

* P1 base class + unit tests (moves existing logic, no behavior change).
* P2 OpenRouter preset + regression tests (proves the inversion).
* P3 Custom + Gemini-compat presets + settings schema/view/patch + frontend inputs.
* P4 Native Interactions provider + `thinking_level`/streaming-event translation, behind the reserved id.

Each step leaves `generation.ts` and the `StreamEvent` contract untouched, which is the acceptance check that the seam held.

---

## §12 — Review amendments (accepted, 2026-09-13)

Independent review confirmed the architecture; the following refinements are accepted into the proposal. Each cites the exact seam it protects.

### A12.1 — URL normalization helper (accepted)

Users paste `http://localhost:11434`, `…/v1`, `…/v1/`, or the full `…/v1/chat/completions`. The base class must own a `normalizeBaseUrl(raw)` helper: trim whitespace, strip trailing slashes, strip a pasted `/chat/completions` or `/models` suffix, then join `/chat/completions` and `/models` without `//` doubles. Invalid input (`non-http(s)`) is rejected at settings validation (`§8`, SillyTavern `CUSTOM` check at `public/scripts/openai.js:4374`). Localhost stays allowed — it is the point of Custom.

### A12.2 — Strict sampling parameters (accepted, critical)

`backend/src/routes/messages.ts:160-165` forwards `topK/minP/repetitionPenalty` into every `LLMRequest`. Strict OpenAI/Azure servers return 400 on unknown fields. The base sends only `model/messages/stream/temperature/top_p/stop/max_tokens` by default; `top_k/min_p/repetition_penalty/top_a` travel via `extraBody` only, gated by `allowExtendedSampling=false` in the base and `true` in `OpenRouterProvider`.

### A12.3 — Usage accounting, mutually exclusive (accepted)

OpenRouter needs `usage: { include: true }`; standard OpenAI needs `stream_options: { include_usage: true }`. The base defaults to `stream_options`; the OpenRouter preset overrides to `usage.include`. Never send both. Gemini-compat stays on `stream_options` until proven otherwise.

### A12.4 — Streaming reasoning tokens (accepted with adjustment)

Current `openrouter.ts:293` reads only `delta.content`, so reasoning models (DeepSeek-R1, Gemini thinking, Ollama reasoning) stream silence until thinking ends. The base must also read `delta.reasoning_content ?? delta.reasoning`. Reasoning must **not** be yielded as bare story tokens — `generation.ts:99-107` appends every token to the narrative buffer and would corrupt story/state. Instead wrap reasoning in `<think>` tags, which the existing parser already strips from segments (`shared/src/envelope/outOfBand.ts:11`, `holdback.ts:4`, `index.ts:74-76`). Open items for implementation: open-once/close-on-first-content lifecycle, no double-wrap when the model emits its own tags, holdback/streaming test coverage.

### A12.5 — Prefill defaults to false (accepted)

Standard OpenAI and most gateways do not support trailing-assistant prefill; OpenRouter does. The existing no-prefill fallback (`backend/src/prompt/history.ts:98-116`, nudge at `prompt/templates.ts:40`) is already tested, so the base sets `capabilities.prefill=false` (vanilla OpenAI and Gemini-compat use the nudge path) and only `OpenRouterProvider` — plus explicitly proven local backends — opt into `true`. `MockLLMProvider` keeps `true` as the test fixture.

### A12.6 — SQLite settings persistence is two places, not one (accepted, extended)

`backend/src/db/repositories/settings.ts:24-30` (`getAll` `subSchemas`) **and** `patch():61-102` (per-key branches) both hardcode the known keys. Adding `custom`/`gemini` to `AppSettingsSchema` alone silently drops them on reload (getAll) or on save (patch). Implementation must register the new keys in both methods plus cases in `backend/test/repositories/settings.test.ts`.

### A12.7 — Phasing (accepted)

P1 base with contract tests (`backend/test/providers/contract.ts` + `contract.test.ts`), P2 OpenRouter-as-preset regression, P3 Custom + Gemini-compat + schema/repository/`SettingsSheet.svelte` UI, P4 native `GeminiInteractionsProvider` when tools/non-chat interactions require it.

### A12.8 — Key storage model (accepted, best choice)

Keys stay server-side under the existing FormaTavern pattern; no new scheme:

* At rest: SQLite `settings` table (`formatavern.db`, `FORMATAVERN_DB_PATH` override) holding `{ apiKey }` JSON per provider key (`openrouter`, plus new `custom`, `gemini`), registered in both `getAll()` `subSchemas` and `patch()` branches (`backend/src/db/repositories/settings.ts:24-30,61-102`). Plaintext at rest, same as today — a secret-store migration is out of scope.
* Env fallback at resolve time (`backend/src/engine/providers.ts:43` pattern): stored value wins, else `OPENROUTER_API_KEY` / `GEMINI_API_KEY` / custom env name. Fresh installs and keyless local servers resolve without a key; missing required keys surface as 409 `provider_unconfigured`.
* In transit/views: `toSettingsView` (`backend/src/routes/settings.ts:13`) returns `{ apiKeySet, apiKeyHint: last4, source: settings|env|none }` only — raw keys never leave the server, and error paths keep the existing scrub (`providers/openrouter.ts:52`).
* Users/phones: single-user, no SillyTavern-style per-handle `secrets.json` (`SillyTavern/src/endpoints/secrets.js:113-151`, `src/users.js:683`). The phone is just a browser: server runs on PC/home host, phone opens `http://<host>:3000`, key pasted once in any browser is stored in server SQLite. Consequences carry over: binding `FORMATAVERN_HOST=0.0.0.0` exposes chats and key settings to the LAN with no in-app auth (`backend/src/index.ts:21-25`) — remote access must go over Tailscale / Cloudflare Tunnel, and `.env`-only or phone-`localStorage` storage must not be introduced.
