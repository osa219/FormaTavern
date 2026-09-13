# Provider Configurations Proposal: Named, Swappable Endpoint Profiles

**Status:** Implemented. Walkthrough: `provider-configurations-walkthrough.md`.
**Date:** 2026-09-13 UTC
**Scope:** Named provider configurations with per-config key, model, and prompt; global-active v1. Generation parameters stay global (no change).
**Reference:** Janitor AI proxy-configurations UX (list + New/Edit/Duplicate/Delete/Test, per-config URL/key/model/custom prompt). Builds on the implemented provider series (`llm-provider-structure-proposal.md`, P1–P4).

---

## §1 — Goal and non-goals

**Goal:** users save any number of named endpoint profiles (e.g. "OpenRouter 1", "Local Ollama", "Gemini Native") — each with its own base URL, API key, model, and custom prompt — and switch the active one without retyping. One config active at a time, globally.

**Non-goals for v1:**
* Per-chat or per-character config pinning (global-active only; charts/messages routes keep reading one active config).
* Changes to generation parameters (temperature, tokens, sampling stay global in the existing generation section).
* New provider protocols (the five existing ids are the config `providerType` enum).
* Follow-up API/frontend ideas (see §13) — this proposal must not block them.

---

## §2 — Current state (what changes)

* Credentials are singletons: `openrouter.apiKey`, `custom.baseUrl+apiKey`, `gemini.apiKey` settings rows plus `provider.id` + `provider.model` (`packages/shared/src/schemas/settings.ts`, `backend/src/db/repositories/settings.ts`, `backend/src/engine/providers.ts:resolve`).
* Only one key/model per provider type can exist; switching endpoints means overwriting. Keys migrate 1:1 into seeded configs (§7), then the singleton fields go dead (parsed-but-ignored, never deleted — downgrade-safe).

---

## §3 — Data model

New table via migration v6 (`backend/src/db/migrate.ts`, contiguous versions enforced):

```sql
CREATE TABLE provider_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  provider_type TEXT NOT NULL
    CHECK (provider_type IN ('openrouter','custom','gemini','gemini-interactions')),
  base_url TEXT,
  api_key TEXT,
  model TEXT,
  custom_prompt TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

* `name` unique case-insensitively (one `UNIQUE` + `COLLATE NOCASE`); validated non-empty, length-capped (~64).
* Active pointer lives in settings (same pattern as today): `provider.activeConfigId: string | null`.
* **Mock stays outside the table** as a built-in pseudo-option (no key, always available, fresh installs usable). Configs are for keyed/remote endpoints only.

---

## §4 — Config fields and rules

* `providerType` — one of the four keyed ids. Determines defaults and validation; `mock` is not a config type.
* `baseUrl` — required for `custom` (validated `http(s)`, reuse `isValidBaseUrl` from `routes/settings.ts`); pinned defaults for the rest (`openrouter`, Gemini compat, Interactions base) with **no override in v1**.
* `apiKey` — optional (keyless local servers are the point of `custom`); never returned by any endpoint, only hint-last-4 + source per row.
* `model` — free text per config, per-type placeholder in UI (same strings as today's model inputs).
* `customPrompt` — plain instruction text, capped (~2000 chars), `{{char}}`/`{{user}}` macros only. Rule (docs + UI hint, not code): must not contain envelope blocks — it instructs *about* the format; anything echoed back is parsed as story.

---

## §5 — Prompt integration (Block 1c)

* New block after global preamble/grammar (`backend/src/prompt/blocks.ts`, `types.ts:BlockId` + `CANONICAL_BLOCK_IDS`): global preamble → grammar → **config prompt** → character blocks. Same `macro()` treatment as Block 1; token cost flows through the existing `BlockReport`/budget accounting, so oversized prompts surface as budget pressure, not silent truncation.
* Free across all provider ids: everything funnels through `systemPrompt` (including native Gemini's `system_instruction`), so no per-provider work.

---

## §6 — Registry resolution change

* `ProviderRegistry.resolve` switches from `settings.provider.id` to the **active config row** (type + baseUrl + key + model + customPrompt → `PromptContext.configPrompt`).
* Legacy `provider.id` becomes the migration-only signal (§7), then dead. Env fallback preserved **per providerType** (`OPENROUTER_API_KEY`, `CUSTOM_API_KEY`, `GEMINI_API_KEY`) when the active config stores no key — headless/docker setups keep working.
* `generation.ts`, hub, `StreamEvent`: untouched (same seam as P1–P4).

---

## §7 — Seed-from-existing-keys migration (one-shot, boot-time)

Schema in v6 DDL; data in a boot seeder beside `db/seeds/seed.ts` (runs only when `provider_configs` is **empty**):

* Mints `OpenRouter` / `Custom` / `Gemini` (plus `Gemini Native` only if legacy id was `gemini-interactions`) — **only for types with something stored** (a key, or a custom base URL) **or an env key available**. Env-backed rows store no key and keep resolving via env fallback (no empty husks: types with neither are skipped).
* Carries legacy `provider.model` onto the seeded config matching legacy `provider.id`; others get per-type defaults.
* Active = seeded config matching legacy id **if credentialed** (stored key *or* env present); else first seeded config with credentials; else null.
* **Env keys are never copied into the DB**; legacy rows are never deleted (ignored, downgrade-safe); seeder is idempotent and logs like the existing `[db] seeded:` line.
* Fresh installs seed nothing (Mock covers first-run); user creates the first config via New.

---

## §8 — Settings API surface

New endpoints under `/api/provider-configs` (frontend Eden client regenerates from the same treaty):
* `GET /` — all configs masked (hint-last-4 + source per row, `customPrompt` excerpt or length only — never full prompt? Decision: full prompt is user-authored non-secret text the editor must display; return it, it is not a key. Keys are the only redacted fields).
* `POST /` / `PATCH /:id` / `DELETE /:id` — create/edit/delete with 422 on bad URL, duplicate name, empty key-string.
* `POST /:id/activate` — sets `activeConfigId`.
* `POST /:id/test` — one tiny real completion through the config; returns `{ ok, latencyMs }` or scrubbed `{ ok:false, code, message }`. Never stores the test output.
* Deleting the active config → active becomes null (explicit, no silent fallback to another key).

---

## §9 — UI (Settings → Provider tab)

* Replaces today's single-key blocks: config list (name, `model · host` subtitle, active marker) + New; per-row Edit; editor with Name / URL (custom only) / key / Model / Custom prompt + Test / Duplicate / Delete / Cancel / Save — mirroring the reference UX.
* Provider-type picker inside the editor (determines URL editability + placeholders), not a separate top-level selector; Mock remains a top-level pseudo-option outside the list.
* Generation tab untouched. Key inputs stay password fields with clear actions; invalid states block save client-side with the same messages the API enforces.

---

## §10 — Secrets discipline (extends A12.8)

* Keys at rest in `provider_configs.api_key` (same plaintext-at-rest posture as today — secret-store migration stays out of scope); list/get views hint-only; every error path scrubs all known keys, not just the active one (test failures must not leak sibling keys in logs).
* No bulk export endpoint.

---

## §11 — Tests (acceptance shape)

* Seeder: legacy fixtures → expected rows + active; double-run idempotency; pre-existing user row → no-op; fresh → empty.
* Registry: resolve-by-active-config per type; 409-equivalents when active config lacks URL/key; env-fallback when row key empty.
* Routes: CRUD masking (no key material in any response), 422 matrix (bad URL, dupe name, empty key), test-endpoint scrub, delete-active → null.
* Prompt: Block 1c ordering (after preamble/grammar, before character blocks), macro application, budget accounting, empty-prompt → block omitted.
* Contract suites (`bun test`, `tsc`, `svelte-check`) stay green; no `generation.ts` changes expected.

---

## §12 — Build order within v1

1. Table (v6) + seeder + tests (no UI impact; legacy paths still live).
2. Registry by active config + tests (legacy `provider.id` read retired behind the seeder having run).
3. Config CRUD + test endpoints + validation.
4. UI list/editor, replacing singleton key blocks.
5. Block 1c prompt slot + builder tests.

---

## §13 — Deliberately left open (incoming ideas)

* Per-chat/per-character config pinning.
* Further API-request and frontend ideas (to be appended here before implementation starts — flag conflicts with §§3–8 early, especially any new settings entity or prompt slot).
