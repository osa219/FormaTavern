# Provider Configurations Walkthrough: Named, Swappable Endpoint Profiles

As-built record for [`docs/history/reports/provider-configurations-proposal.md`](../reports/provider-configurations-proposal.md) §§3–12. `generation.ts`, hub, and the `StreamEvent` contract untouched throughout.

## 1. What changed

* **Schema v6 (`backend/src/db/migrate.ts`)** — new `provider_configs` table (`id`, NOCASE-unique `name`, checked `provider_type`, nullable `base_url/api_key/model/custom_prompt`, timestamps) + updated index. Migration pins bumped 5→6; `scripts/check.ts` now expects v6 and audits the new columns.
* **Shared (`packages/shared/src/schemas/providerConfig.ts`)** — `ProviderConfig` stored shape plus `View` (hint-last-4 + `settings|env|none` source; full `customPrompt` returned as non-secret author text), `Create`, and `Patch` schemas; `provider.activeConfigId` added to stored/view/patch settings (null clears via delete-on-write in the settings repo).
* **Repository (`backend/src/db/repositories/providerConfigs.ts`, contracts, wiring)** — list/get/count/create/patch/remove with case-insensitive `name_taken` (create) and `missing`/`name_taken` (patch); blank names rejected, blank `baseUrl`/`model` treated as clear, `baseUrl`/`apiKey` trimmed on write.
* **Boot seeder (`backend/src/db/seeds/providerConfigs.ts`, wired in `index.ts`)** — one-shot, runs only on empty table: mints `OpenRouter`/`Custom`/`Gemini` (+`Gemini Native` iff legacy id was it) for types with stored *or env-provided* material; carries legacy `provider.model` onto the matching row; activates the legacy-matching credentialed row else the first credentialed row else null; never copies env keys into the DB; legacy rows untouched; idempotent; logged.
* **Registry (`backend/src/engine/providers.ts`, `contracts.ts`)** — `resolve(settings, activeConfig?)`: active id set → resolve from the row (per-type caches shared with the legacy path via extracted helpers; `configPrompt` surfaced on the resolution); stale/missing row → 409 `provider_unconfigured`; no id → legacy singleton path unchanged (kept as fallback). Blank (`''`) and non-`mock:` legacy models fall back to per-type defaults instead of reaching upstream.
* **Routes (`backend/src/routes/providerConfigs.ts`, mounted in `app.ts`)** — `GET /` (masked list), `POST /` (201; custom requires baseUrl, baseUrl rejected on other types), `GET /:id`, `PATCH /:id` (404/409 `slug_taken`), `DELETE /:id` (clears `activeConfigId` when it points at the row, transactionally), `POST /:id/activate`, `POST /:id/duplicate` (server-side so keys survive copying; numeric suffix on clash), `POST /:id/test` (one real completion, 25s cap, `{ok, latencyMs}` or scrubbed error; timeout reported distinctly).
* **Prompt (`1c`)** — `PromptContext.configPrompt` flows from `resolution.configPrompt` through all three `assembleContext` call sites into new Block `1c` (after preamble/grammar, before character blocks), macro-applied, budget-counted, omitted when blank. Golden file untouched (no prompt without a config).
* **UI (`SettingsSheet.svelte`, new `state/providerConfigs.svelte.ts` store)** — Mock-or-config radio list with `model · host` subtitles, New/Edit editor (name/type/URL/key/model/prompt, type locked after create), Test with inline result, server-side Duplicate, two-click Delete, auto-activate when nothing is active, `BroadcastChannel` cross-tab sync. Singleton key blocks removed; generation/narrative tabs untouched.

## 2. Verification

* shared 192/192, backend 234/234, frontend 180/180; `tsc` ×2 + `svelte-check` 0/0; `db:check` exit 0.
* Live end-to-end (scratch DB): legacy key → restart → seeder row served → activate → generation hits the config endpoint; keyless custom flow covered.
* Real-browser (headless Edge + CDP, dialog open): empty state, seeded/created rows, and Edit affordances screenshot-verified; resource timing used to prove request behavior.

## 3. Deviations and fixes during implementation

* **Infinite reload loop (the reported spinner).** The first auto-load effect re-fired on every settled load (empty list + `loading` flip = always-true condition), firing ~100 requests in 12s while the spinner never settled. Fixed by loading once per dialog-open (`configsRequested` flag, reset on close); Retry covers failures explicitly. Verified by resource-timing capture (exactly 1 request) plus screenshots.
* **Hang → visible error.** List fetch gained a 15s timeout and the tab renders store errors with Retry (previously error states were toast-only, so any stall looked identical to loading).
* **Env-backed seeding.** Proposal said stored-material-only; implemented stored-or-env so headless env deployments keep working after upgrade (rows store no key, env fallback resolves). Proposal §7 amended to match.
* **Duplicate moved server-side.** Views never carry keys, so client-side copy would silently drop them; `POST /:id/duplicate` copies the full row.
* **Blank/non-mock model hardening.** Empty-string models are dropped at settings write; legacy resolve falls back to per-type defaults (including non-`mock:` ids under Mock, which previously rendered an empty dropdown and errored at generation). Stored values are preserved, never rewritten.
* **No bulk export; delete-active → null** (no silent fallback), per proposal §§8/10.
* **Test-debug contamination (cleanup verified).** Headless probing against a scratch backend accidentally shared ports with a live dev stack; two probe writes landed in the dev database (a fake key + one test row). Both removed and verified gone via API; temp scripts, probe pages, and scratch DBs deleted; `git status` holds only feature files. Process rule going forward: scratch servers on scratch ports with boot-log proof before any write.

## 4. Known limits / follow-ups

* Per-chat/per-character pinning, presence-penalty/Min P UI, and `thinking_level` wiring remain explicitly out (see `generation-settings-proposal.md` for the next batch).
* `custom.baseUrl` has no env override by design (DB-only); keys keep per-type env fallback.
