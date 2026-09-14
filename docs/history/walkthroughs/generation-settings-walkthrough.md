# Generation Settings Walkthrough: Advanced Sampling + Settings UI Polish

As-built record for [`docs/history/reports/generation-settings-proposal.md`](../reports/generation-settings-proposal.md) §§1–7, built in the proposed §7 order (1. frequency plumbing → 2. sliders → 3. tab reorder → 4. slider fill). `generation.ts`, hub, and the `StreamEvent` contract untouched throughout. No commits made during this work.

## 1. What changed

* **Schema (`packages/shared/src/schemas/settings.ts`)** — `generation.frequencyPenalty` added to stored/view/patch shapes (`-2–2`, OpenAI range); bounds added to the two newly-surfaced fields in stored + patch (`topK` int `0–100`, `repetitionPenalty` `1–2`). `topP`/`minP` untouched per the non-goals. `DEFAULT_SETTINGS` unchanged (absent = not sent — existing users unaffected).
* **Request (`packages/shared/src/types/llm.ts`)** — `LLMRequest.frequencyPenalty` added.
* **Forwarding (`backend/src/routes/messages.ts` ×2 send/continue sites, `backend/src/routes/chats.ts` ×1)** — `frequencyPenalty: settings.generation.frequencyPenalty` added to every job construction, mirroring the existing lines.
* **Provider (`backend/src/providers/openai-compatible.ts`)** — `frequency_penalty` sent unconditionally in the base body (including `0`, which is an upstream no-op), so the OpenRouter preset inherits it via the base path; `top_k: 0` is now omitted before serialization (llama convention: 0 disables) while non-zero `top_k` still requires `allowExtendedSampling`. Extended trio otherwise unchanged and still absent without opt-in.
* **UI (`frontend/.../settings/SettingsSheet.svelte`)** — Generation tab split into Basic (Temperature / Max Tokens / Context Length, unchanged) and a new "Advanced settings" group (Top K `0–100` / Top P moved, not duplicated / Rep. penalty `1.0–2.0` / Freq. penalty `-2.0–2.0`), each with a neutral hint (`0 = off`, `1.0`/`0.0` upstream no-ops). Unset-display rule holds by construction: sliders use `value={…Display(…)}` + `oninput → queuePatch`, never `bind:value` with an effect, so mount never patches. Tab order is now Provider → Generation → Appearance → Narrative → Accessibility → Shortcuts.
* **Slider fill (`frontend/src/lib/actions/rangeFill.ts`, `frontend/src/lib/settings/generation.ts`, `frontend/src/app.css`)** — new `rangeFill` Svelte action owns `--range-p` (`(value-min)/(max-min)`, set on mount, on each `input`, and on param change for async loads/echoes); neutral display positions live in a tested helper module. WebKit track paints the `linear-gradient(to right, var(--theme-accent) var(--range-p, 50%), var(--chrome-line) var(--range-p, 50%))` fill; Firefox uses native `::-moz-range-progress`. All sliders app-wide inherit it (generation + tint/scrim); fill follows `--theme-accent`, so character themes recolor it like the thumb.

## 2. Verification

* shared 193/193 (`tsc` clean) — new bounds accept/reject matrix for all three fields + stored-schema mirror + absent-stays-absent pin.
* backend 238/238 (`tsc` clean) — provider: freq present in base body incl. `0`, OpenRouter-preset passthrough, `top_k: 0` omitted / `40` sent with opt-in; routes: freq forwarded into the upstream body (`0` included), 422 matrix for out-of-range patches.
* frontend 185/185 (`svelte-check` 0 errors / 0 warnings) — new `unit/generationSettings.test.ts` (5 tests): neutral-display helpers, `rangeFillPercent` incl. clamping/degenerate, action mount/input/update/destroy against happy-dom, tab-order + Advanced-group + patch-only-on-input structural snapshot, CSS fill snapshot.
* `db:check` exit 0 (no migration — settings keys only, no DDL).

## 3. Deviations and fixes during implementation

* **Action `update` on param change (extension).** Proposal specified mount + `input` only; the action also re-syncs when its bound value changes, covering async settings loads and server-echoed patches that rewrite `value={…}` without an input event. No per-slider code — one `use:rangeFill={…}` per input.
* **Neutral rule extracted to `$lib/settings/generation.ts`.** Proposal described the rule inline; the constants/resolvers are a separate tested module so the unset→neutral mapping is unit-pinned rather than markup-only.
* **UI acceptance via happy-dom + structural snapshot.** The repo has no client-side component mount harness (frontend tests cover stores plus SSR `svelte/server` renders), and the generation tab is internal `$state` unreachable from SSR output — so "no patch on render / payload shape / tab order" are asserted as source snapshots plus helper/action behavior tests, not DOM mounts. The no-patch-on-mount property itself is structural (`value` + `oninput`, zero `$effect` touching `generation`).
* **No behavior deviations.** Defaults (0.8 / 1024 / 16384 / Top P→1 display), extended-gating, `stream_options` vs `usage.include` accounting, and per-config scoping (generation stays global) all preserved.

## 4. Known limits / follow-ups

* Presence-penalty / Min P UI remain out (schema keeps the fields; native Gemini still sends temperature only, so all three new params are ignored there by existing omission pins).
* Per-config sampling overrides remain out per `provider-configurations-proposal.md` §1.
* `topK: 0` patched explicitly by the user is stored as `0` and omitted at serialization — deliberately not cleared back to `undefined`, so the slider stays where the user left it.
