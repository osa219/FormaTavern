# Generation Settings Proposal: Advanced Sampling + Settings UI Polish

**Status:** Implemented. Walkthrough: `generation-settings-walkthrough.md`.
**Date:** 2026-09-13 UTC
**Scope:** Global generation parameters (new advanced sliders), Provider↔Generation tab adjacency, filled slider tracks. No provider-protocol changes; no per-config overrides (see `provider-configurations-proposal.md` §1).
**Reference:** Janitor AI generation/advanced-settings panel (Temperature, Max tokens, Context size, Top K, Top P, Rep./Freq. penalty with filled-track sliders).

---

## §1 — Goal and non-goals

**Goal:** close the sampling gap with the reference UX (Top K, Rep. penalty, Freq. penalty controls), place Generation next to Provider, and give every range slider an accent fill up to the thumb.

**Non-goals:**
* Presence penalty, Min P UI (schema keeps them; no new controls — permanent UI surface is spent only on the reference panel's fields).
* Per-config sampling overrides (generation stays global per `provider-configurations-proposal.md` §1).
* Retuning existing defaults (Temperature 0.8, Max Tokens 1024, Context 16384, Top P unset→1 display — all unchanged).

---

## §2 — Current state (plumbed vs missing)

| Parameter | Schema (`shared/schemas/settings.ts`) | `LLMRequest` | Forwarding (`routes/messages.ts`) | Provider body | UI |
|---|---|---|---|---|---|
| Temperature | ✅ | ✅ | ✅ | base, always | ✅ slider |
| Max Tokens | ✅ | ✅ | ✅ | base, always | ✅ slider |
| Context Length | ✅ | n/a (budget) | n/a | n/a | ✅ number |
| Top P | ✅ optional | ✅ | ✅ | base, always | ✅ slider |
| Top K | ✅ optional | ✅ | ✅ | extended-gated | ❌ |
| Repetition penalty | ✅ optional | ✅ | ✅ | extended-gated | ❌ |
| Min P | ✅ optional | ✅ | ✅ | extended-gated | ❌ (stays) |
| Frequency penalty | ❌ | ❌ | ❌ | ❌ | ❌ |

Key point: Top K / Rep. penalty need **UI only**; Freq. penalty needs **full-stack plumbing** but is a standard OpenAI field, so it joins the always-sent base body (unlike the extended-gated trio).

---

## §3 — New and newly-surfaced fields

All optional (absent = not sent — current behavior preserved for existing users):

* **Top K** (surfaced): slider `0–100`, display default unset shown at neutral; `0` = off (param omitted, matching llama convention where `0`/ unset disables). Extended-gated (unchanged semantics).
* **Rep. penalty** (surfaced): slider `1.0–2.0` step `0.05`, neutral `1.0`; `1.0` written explicitly is a no-op upstream, so first touch is harmless. Extended-gated (unchanged semantics).
* **Freq. penalty** (new): slider `-2.0–2.0` step `0.05`, neutral `0.0` (OpenAI range/default). Schema `generation.frequencyPenalty`, `LLMRequest.frequencyPenalty`, forwarded in `messages.ts`/`chats.ts` job construction, sent unconditionally in `OpenAICompatibleProvider` base body as `frequency_penalty` (standard param — OpenRouter passes it through; strict OpenAI accepts it).

**Unset-display rule (applies to all three):** control renders the neutral position when the setting is `undefined`, and patches fire **only on user input** — opening Settings must never start sending previously-absent params. This is the acceptance check for the UI tests.

---

## §4 — UI changes (`SettingsSheet.svelte`, `app.css`)

* **Advanced section:** Generation tab gains an "Advanced settings" group (mirroring the reference panel) holding Top K / Top P (moved, not duplicated) / Rep. penalty / Freq. penalty. Basic group keeps Temperature / Max Tokens / Context Length.
* **Tab order:** Generation ↔ Appearance swap, yielding Provider → Generation → Appearance → Narrative → Accessibility → Shortcuts. No logic depends on tab order (verified: `activeTab` is display-only state).
* **Filled tracks (central fix, all sliders app-wide):**
  * Firefox: `::-moz-range-progress` rule (~5 lines, native).
  * WebKit: track paints `linear-gradient(to right, var(--theme-accent) var(--range-p, 50%), var(--chrome-line) var(--range-p, 50%))`; a tiny Svelte action sets `--range-p` from `(value-min)/(max-min)` on mount and on each `input` event. No per-slider code; tint/scrim sliders inherit the fill.
  * Disabled/hover/focus behavior keeps the existing rules in `app.css:189-279`; fill color follows `--theme-accent` (character themes recolor sliders automatically, matching current thumb behavior).

---

## §5 — Validation and edge cases

* Schema bounds enforced by TypeBox (Top K int `0–100`, Rep. penalty `1.0–2.0`, Freq. penalty `-2.0–2.0`); route PATCH returns existing 422 shapes on violation.
* `frequency_penalty: 0` and `repetition_penalty: 1.0` are upstream no-ops — safe first-touch values.
* `top_k: 0` must be **omitted**, not sent (llama convention: 0 disables); the provider maps `0 → undefined` before serialization.
* Native Gemini (`gemini-interactions`) ignores all three (documented P4 omission — transcript API takes temperature only); compat/Gemini-OpenAI path passes Freq. through like any OpenAI body.

---

## §6 — Tests (acceptance shape)

* Schema: bounds accept/reject matrix for the three fields; patch-cleaning unchanged.
* Provider: Freq. penalty present in base body (OpenRouter preset included); `top_k: 0` omitted; extended trio still absent without opt-in (existing tests extended, not rewritten).
* Routes: job construction forwards `frequencyPenalty` (mirror existing forwarding assertions).
* UI (frontend unit): unset→neutral display without patch-on-mount (assert `settingsStore.patch` uncalled on render); touch→patch payload shape; tab order snapshot; `--range-p` action sets/updates the var on input events.
* Full suites (`bun test` ×3, `tsc`, `svelte-check`) green.

---

## §7 — Build order

1. Full-stack Freq. penalty (schema → request → forwarding → base body + tests).
2. Top K / Rep. penalty sliders + Advanced group + unset-display rule.
3. Tab reorder.
4. Slider fill (CSS + action + unit tests).

Steps 3–4 are UI-only and can land in either order after 1–2.
