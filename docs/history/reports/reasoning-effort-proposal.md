# Reasoning Effort Proposal: Unified Control + Visible Thought Blocks

**Status:** Proposal — for review, no code changes yet.
**Date:** 2026-09-13 UTC
**Scope:** Global reasoning toggle (Basic group) + thinking level (Advanced group), per-path wire mapping, thought persistence in message metadata, collapsible thought blocks in chat. No new provider protocols; no per-config overrides; no `generation.ts` seam change (additive timestamps only).
**References:** Janitor-style generation panel; SillyTavern `public/scripts/reasoning.js` + `openai.js:237` + `style.css:424-528` (collapsible `details.mes_reasoning_details` pattern). Builds on the implemented series (`llm-provider-structure-proposal.md` P1–P4, `provider-configurations-proposal.md`, `generation-settings-proposal.md`).

---

## §1 — Goal and non-goals

**Goal:** expose the highest-impact ungated knob (reasoning) at the top of Generation, mapped correctly onto all four keyed paths, with thoughts visually separated from story text instead of silently stripped. Split placement: a **Thinking toggle** (Default | On | Off) in the Basic group next to Temperature — the everyday control — and the **Thinking level** (Low | Medium | High) in Advanced for power users.

**Non-goals:**
* `minimal` / `max` / `xhigh` levels, `max_tokens` budgets, `exclude` (OpenRouter's full `reasoning` object stays untouched — `enabled` is used for On, the three common levels for granularity; see §3). `minimal` is out for interop reasons: unknown to Ollama/vLLM and actively rejected by current Gemini Flash models.
* Thought summaries (`thinking_summaries`), signature round-tripping (stateless design already sidesteps it), agentic loops.
* Per-config effort overrides (generation stays global per `provider-configurations-proposal.md` §1).
* Retuning existing defaults (effort unset = model/server default — zero behavior change for existing users).
* Stripping `temperature/top_p` on the Gemini-compat path per the 3.8 migration guidance (observed risk, separate workstream — see §8).

---

## §2 — Research: one field works everywhere

All three OpenAI-shaped paths accept a top-level `reasoning_effort`. That is the unified wire format — no `extraBody` hacks required.

| Path | Effort in | Off | Notes (verified Sept 2026) |
|---|---|---|---|
| OpenRouter | `reasoning_effort: low\|medium\|high` (shorthand for `reasoning.effort`; full enum adds `max/xhigh/minimal/none`) | `reasoning_effort: "none"` — rejected when the model's `/models` entry says `mandatory: true` | Per-model `reasoning` object (`supported_efforts`, `default_effort`, `mandatory`) exists but needs a `/models` lookup; v1 sends blind and surfaces 400s on the existing error path. Effort maps 1:1 onto Gemini `thinkingLevel` through OpenRouter (`xhigh`→`high`). |
| Gemini compat (`…/v1beta/openai/`) | `reasoning_effort: low\|medium\|high` → `thinking_level` (documented mapping table) | **No true off.** `none`→`minimal` on Flash only; 3.8/3.7 Flash *reject* `minimal`; Pro/Flash/Flash-Lite cannot disable thinking at all (`minimal` ≈ "no thinking", not guaranteed) | `reasoning_effort` and `extra_body.google.thinking_config` are mutually exclusive — so v1 uses `reasoning_effort` alone and does not set `include_thoughts`. Thoughts still stream when the server emits them; our `<think>` pipeline handles whatever arrives. |
| Custom (Ollama / vLLM / LM Studio) | `reasoning_effort: low\|medium\|high` — emerging standard: Ollama maps it (and `reasoning.effort`) to `Think`; vLLM auto-injects `enable_thinking`; LM Studio honors `think`/`reasoning_effort` | `"none"` → thinking off (Ollama, vLLM) | Same strict-server caveat class as the sampling params: unknown-field 400s are possible on exotic servers. Absent = server/model default. |
| Native Interactions | `generation_config.thinking_level: low\|medium\|high` | Omit (dynamic default) | Thought steps are already first-class and already wrapped in `<think>` (P4). Per-model matrix (`3.5-flash`: all four; `3.8/3.7`: no `minimal`; `3.1-pro`: no off) means v1 exposes only the three safe levels. |

**Toggle + level semantics (two fields, one precedence rule):** unset (absent) = model/server default everywhere and is the fresh-install state. **Off wins over everything** (level ignored). Level is sent whenever set and toggle ≠ Off — so Default+Level and On+Level behave identically (level implies intent; the harmless kind of redundancy, avoiding the "I set a level and nothing happened" trap). On with no level sends OpenRouter `reasoning: {enabled: true}` (documented = medium, no exclusions) and nothing elsewhere (their defaults already think). Explicit **Off** maps per-path: OpenRouter → `"none"`; Custom → `"none"`; Gemini compat → **omitted** (cannot disable — documented in UI hint, not fake-mapped to `minimal`, which errors on current Flash); Native → omitted.

**SillyTavern UI lessons (studied, not copied):** per-message `<details class="mes_reasoning_details">` with summary header (title + think duration + arrow), `.mes_reasoning` body (accent left-border, muted text), `auto_expand` preference, `show_hidden` toggle, `extra.reasoning` + `reasoning_duration` persistence, template prefix/suffix/separator (default Think XML), edit/copy actions, streaming "thinking" state. Worth adopting: the `<details>` shape, duration in the header, streaming-open/completed-collapsed lifecycle. Deliberately not adopting: templates, per-message edit, regex placement hooks, separate show-hidden machinery.

---

## §3 — Data model and wire mapping

Schema (`shared/schemas/settings.ts`, all three shapes — stored with unions, view/patch mirrored):

```ts
generation: Type.Object({
  // ...existing fields...
  reasoning: Type.Optional(Type.Union([Type.Literal('on'), Type.Literal('off')])),
  // absent = Default (model/server default; send nothing)
  reasoningEffort: Type.Optional(Type.Union([
    Type.Literal('low'), Type.Literal('medium'), Type.Literal('high')
  ]))
  // absent = no level pinned. No 'minimal': not in the
  // Ollama/vLLM vocab and rejected by current Gemini Flash models.
})
```

`LLMRequest.reasoning` / `LLMRequest.reasoningEffort` carry the same shapes; `messages.ts` (×2) and `chats.ts` forward both like `frequencyPenalty`.

`OpenAICompatibleProvider` gains two flags; the mapping encodes the precedence rule (Off suppresses the level):

```ts
allowReasoningOff?: boolean; // default false
// generate():
const thinking = req.reasoning; // 'on' | 'off' | undefined
const level = req.reasoningEffort; // 'low' | 'medium' | 'high' | undefined
if (thinking === 'off') {
  if (this.allowReasoningOff) bodyPayload.reasoning_effort = 'none';
  // else omit (Gemini path cannot disable — see §2)
} else if (level !== undefined) {
  bodyPayload.reasoning_effort = level; // Default+Level and On+Level alike
} else if (thinking === 'on' && this.reasoningOnEnabled) {
  bodyPayload.reasoning = { enabled: true }; // OpenRouter only (see below)
}
```

* OpenRouter preset: `allowReasoningOff: true`, `reasoningOnEnabled: true` (top-level `reasoning_effort` shorthand is documented equivalent to `reasoning.effort`; `reasoning: {enabled: true}` is the documented enable-with-defaults form; no `max_tokens`/`exclude` upgrade in v1).
* Custom preset: `allowReasoningOff: true`, `reasoningOnEnabled: false` (On without a level = server default, which auto-enables thinking on capable models — nothing to send).
* Gemini-compat preset: both flags `false` — off omitted, On-alone sends nothing, levels pass through as `reasoning_effort`.
* `GeminiInteractionsProvider`: `thinking_level` in `generation_config` for levels (toggle On-alone/Off/Default all omit; existing omission pins unchanged).

---

## §4 — Thought persistence (no migration)

Current state, verified: providers already wrap reasoning-channel tokens in `<think>` tags; the envelope parser extracts them to `ParseResult.reasoning` — which `runGeneration` **drops** (never stored, never in metadata). Segments exclude reasoning, so thoughts are invisible end-to-end today. History re-injection is already safe (`prompt/history.ts:57` strips OOB incl. reasoning).

v1 stores thoughts on the message row's `metadata` JSON (no DDL, downgrade-safe):

```ts
// MessageMetadata additions (both optional):
reasoning?: string;            // full thought text, capped at 16_000 chars + truncation marker
reasoningDurationMs?: number;  // think-open → first-content-token (or stream end)
```

Duration tracking rides the existing protocol: `runGeneration` already sees the synthetic `<think>` open/close tokens in the stream, so it timestamps open → first content token without touching the provider seam or `StreamEvent`. No `generation.ts` signature change — internal timestamps only. Swipes inherit automatically (one row per version).

---

## §5 — Chat UI: collapsible thought blocks

New `ReasoningBlock` component in `MessageTurn`, fed from metadata (completed) and the live snapshot (streaming):

* `<details>` wrapper, theme-aware (accent left-border + muted text, same visual language as the slider fill: `var(--theme-accent)` / chrome vars, so character themes recolor it).
* Header: `Thinking…` (pulsing, while streaming with an unclosed `<think>`) → `Thought for {duration}` when done; hidden entirely when no reasoning exists (mirrors SillyTavern's `:has(.mes_reasoning:empty)` rule).
* Lifecycle: open while streaming, collapsed on completion (pure `<details>` state — no new setting in v1; a persisted auto-expand preference is the obvious follow-up if users ask).
* Rendering source: completed → `metadata.reasoning`; streaming → thought text extracted from the live snapshot buffer (which already carries the `<think>` tags). Story segments untouched — thoughts never enter `Segment[]` (no `SegmentKind` change, no parser change, prompt pipeline unaffected).

---

## §6 — Settings UI: toggle up top, level in Advanced

Generation → Basic group gains `Thinking` directly under Temperature: compact segmented control Default | On | Off, bound to `s.generation.reasoning ?? 'Default'`, patching `{ generation: { reasoning } }` on input only (same unset-display rule as §4 of the generation proposal; Default patches `null` → key cleared). Hint text carries the two load-bearing facts: "Applies to reasoning models; ignored otherwise" and "Off is best-effort — Gemini models always think a little."

Generation → Advanced group gains `Thinking level`: segmented control Default | Low | Medium | High, bound to `s.generation.reasoningEffort ?? 'Default'`, same patch-on-input rule. Sub-hint: "Sent whenever set unless Thinking is Off." Both controls render their Default position when unset and never patch on mount.

---

## §7 — Validation, edge cases, tests

* Schema union accept/reject for both fields (incl. `minimal`/`max` rejected, `null` clears via patch path); 422 shapes unchanged.
* Provider matrix per path × toggle {unset, on, off} × level {unset, low, medium, high}: OpenRouter `reasoning_effort` incl. `"none"` + `reasoning: {enabled: true}` for On-alone; Custom same minus the enabled form; Gemini-compat levels-only (off → absent, On-alone → absent); Native `thinking_level` for levels only; strict-base (no flags) sends levels but never `"none"` or `enabled`. Off-with-level asserts level suppressed on every path.
* Duration: think-open → first-content markers in `runGeneration`; no-think streams leave `reasoningDurationMs` undefined; metadata round-trips through finalize.
* UI (frontend unit, existing happy-dom pattern): toggle renders Default on unset without patch-on-mount; level renders Default on unset; `ReasoningBlock` states (hidden when empty, live-open while streaming, collapsed-done with duration); CSS snapshot for the thought-block rules.
* Full suites (`bun test` ×3, `tsc`, `svelte-check`) green; `generation.ts`/`StreamEvent` untouched (timestamps internal).

---

## §8 — Risks and explicit non-goals (revisited)

* **Gemini 3.8 guidance says strip `temperature/top_p/top_k`.** Our compat path always sends `temperature` (global default 0.8) and `top_p` once touched. Flagged, not fixed here — changing default-send behavior is its own workstream with regression risk.
* **Blind send on OpenRouter** (no `/models` capability pre-check): `mandatory:true` models 400 on `"none"`; non-reasoning models should ignore effort but this is server-defined. Errors surface on the existing path; a capability-aware upgrade (cache `supported_efforts`, grey out Off) is a clean follow-up.
* **Thought size:** 16k metadata cap bounds DB growth; full CoT fidelity beyond the cap is traded away deliberately.
* **No `include_thoughts` on compat** (mutually exclusive with `reasoning_effort`): if Google ever stops emitting thoughts by default on this endpoint, revisit with the `extra_body` form.

---

## §9 — Build order

1. Schema + `LLMRequest` + forwarding + base flags + three preset mappings + Native `thinking_level` + provider matrix tests (no UI impact; thoughts still invisible).
2. Metadata persistence + duration timestamps + round-trip tests.
3. Basic toggle + Advanced level + `ReasoningBlock` + CSS + frontend unit tests.
