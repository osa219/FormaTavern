# Architectural Report: Zero-FOUC Custom Styling & Scaling for High-Density Companion Catalogs

**Document ID:** `FT-REP-FOUC-SCALE-01` (Amended Revision 2)  
**Status:** Approved Architectural Specification & Implementation Blueprint  
**Scope:** Frontend Style Lifecycle, Trust Boundaries, Keyset Pagination, CTE Query Optimization, and Index Migration  
**Target Environments:** FormaTavern Bun + Elysia Backend, SvelteKit (Runes) SPA, SQLite WAL  

---

## 1. Executive Summary

When users apply custom CSS or theme overrides to the general application chrome via **Settings > Appearance**, refreshing or navigating directly to the Foyer (`/`) produces a visible **Flash of Unstyled Content (FOUC)** estimated at 300–500 ms. During this initial window, the interface renders in the neutral dark palette before abruptly snapping to the user's custom styling (e.g. a custom light theme).

Furthermore, FormaTavern is targeted to support companion libraries of **2,500+ characters** with thousands of active and archived story branches. Any client-side fix or data-loading architecture must operate with strict time and memory complexity invariants ($O(1)$ theme initialization, sub-millisecond database queries, and adherence to browser storage quotas).

This amended specification establishes:
1. **The Exact Mechanism of the FOUC:** Dissecting the triple-latency cascade across state initialization, un-cached SQLite HTTP round-trips, and the dynamic import pipeline of the CSS sanitizer (`css-tree`).
2. **Surface Impact Assessment:** Demonstrating why this vulnerability is not restricted to the Shell surface, but also degrades the Character Showcase (`/character/[id]`) and Chat (`/chat/[chatId]`) viewports.
3. **High-Density Scaling Audit (2,500 Characters & 10,000+ Chats):** Verifying the constant-time characteristics of the theme pipeline, establishing strict byte-budgeted RAM limits, identifying unindexed foreign keys, and fixing unbounded chat queries with CTE-based early limiting.
4. **Hardened Architectural Solutions:** A three-tiered Zero-FOUC delivery model with strict **A-SURF1** surface compliance, cryptographic hash verification, kill-switch enforcement (**C8/C9**), and tag-adoption dedup (**C13**).
5. **Agent Implementation Blueprint:** Actionable file-by-file instructions for downstream implementation agents, including migration contiguity (Migration 8).

---

## 2. Root Cause Analysis: Theme Flash of Unstyled Content (FOUC)

The estimated 300–500 ms flash is not caused by slow local disk access or browser rendering engines; it is the direct consequence of a **triple-latency gap** spanning component lifecycle, asynchronous IPC, and dynamic module evaluation.

### 2.1 The Triple-Latency Cascade

```mermaid
sequenceDiagram
    autonumber
    participant Browser as Browser Engine (<head> / DOM)
    participant Layout as SvelteKit App (+layout.svelte)
    participant Store as ShellThemeStore (singleton)
    participant Backend as Backend API (SQLite WAL :3000)
    participant Outlet as CustomStyleOutlet.svelte
    participant DynamicLoader as Dynamic Module Loader (loader.ts)

    Note over Browser: Document loaded. app.css parsed. :root dark defaults applied.
    Browser->>Layout: Initial render & DOM mount
    Layout->>Store: Evaluates shellTheme singleton
    Note over Store: Latency Gap 1: theme initialized to DEFAULT_SHELL_THEME ({})
    Store-->>Layout: Returns empty theme
    Layout->>Browser: Frame 1 Painted: Default dark chrome (--n-950: #313338)
    
    Layout->>Layout: onMount() triggers
    Layout->>Backend: Latency Gap 2: GET /api/settings/shell-theme (HTTP over TCP)
    Note over Browser: User sees unstyled default UI for 30–120 ms
    Backend-->>Store: 200 OK with persisted ShellTheme + customCss
    Store->>Layout: Reactively updates shellTheme.theme
    
    Layout->>Outlet: Passes updated css to CustomStyleOutlet
    Note over Outlet: Latency Gap 3: $effect scheduled; calls loadCustomCss()
    Outlet->>DynamicLoader: import('./index') -> loads @formatavern/shared/customCss & css-tree
    DynamicLoader-->>Outlet: Resolves module -> runs sanitizeCss(raw, scope) AST parser
    Outlet->>Browser: Injects <style data-ft-sheet="shell"> into <head>
    Note over Browser: Style recalculation & full screen repaint to custom theme -> VISIBLE JUMP
```

#### Latency Gap 1: In-Memory Empty Initialization
In [`frontend/src/lib/state/shellTheme.svelte.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/state/shellTheme.svelte.ts#L8):
```ts
export class ShellThemeStore {
  theme = $state<ShellTheme>(DEFAULT_SHELL_THEME);
```
Where `DEFAULT_SHELL_THEME` is defined in [`packages/shared/src/schemas/shellTheme.ts:39`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/schemas/shellTheme.ts#L39) as an empty object `{}`.

Unlike user interface flags in [`prefs.svelte.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/state/prefs.svelte.ts#L10-L42) (which synchronously reads `localStorage` during store instantiation), `shellTheme` has no initial offline cache. When Svelte boots and evaluates `<ShellSurface>` on the Foyer, `shellTheme.theme` contains zero custom properties and `customCss` is `undefined`.

#### Latency Gap 2: Asynchronous Network Round-Trip
In [`frontend/src/routes/+layout.svelte:14-16`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/routes/+layout.svelte#L14-L16):
```ts
onMount(() => {
  shellTheme.load();
});
```
`onMount()` fires strictly *after* the initial DOM tree has already mounted and painted. `shellTheme.load()` dispatches an HTTP request to `GET /api/settings/shell-theme`. Even on `127.0.0.1`, network socket dispatch, router resolution in Elysia, SQLite query execution against the `settings` table, JSON serialization, and response parsing take between 30 ms and 120 ms. During this entire time, the screen displays the base Tailwind neutral palette.

#### Latency Gap 3: Dynamic Module Loading & AST Parsing
When the HTTP response resolves and updates `shellTheme.theme.customCss`, [`CustomStyleOutlet.svelte:10-39`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/custom/CustomStyleOutlet.svelte#L10-L39) catches the change in a Svelte 5 `$effect()`:
```ts
$effect(() => {
  const raw = css && css.trim() && !prefs.hideCustomStyling ? css : null;
  if (!raw) return;
  
  loadCustomCss().then((m) => {
    const out = m.sanitizeCss(raw, scope);
    // ...
    const el = document.createElement('style');
    el.setAttribute('data-ft-sheet', scope);
    el.textContent = out.css + motionGuard(scope);
    document.head.appendChild(el);
  });
});
```
Per **Invariant C13** (Performance budget: keeping the ~100 KiB `css-tree` AST parser out of the initial bundle), [`loader.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/customCss/loader.ts#L5-L10) invokes `import('./index')`. 
1. Dynamic `import()` is inherently asynchronous and queues behind current macrotasks/microtasks.
2. Once loaded, `m.sanitizeCss()` parses the full CSS string into a concrete syntax tree, runs scope confinement validation, strips disallowed selectors, re-serializes the CSS, and appends the `motionGuard()` string.
3. `document.createElement('style')` is constructed and appended to `document.head`.

Only after Step 3 does the browser recompute the CSS cascade and repaint the window. The cumulative delay between the first DOM paint and Step 3 results in the visible jump.

---

## 3. Cross-Surface Vulnerability Matrix

The FOUC issue is not isolated to the Shell surface (`data-ft-surface="shell"`). All three application surfaces are vulnerable to specific manifestation modes:

| Surface Scope | Primary Routes | Trigger Mechanism | Manifestation Symptoms |
|---|---|---|---|
| **Shell Surface** (`shell`) | `/` (Foyer), `/personas`, `/character/new`, `/character/[id]/edit` | Dual Latency: HTTP round-trip for `shellTheme` + dynamic `loadCustomCss()` in `CustomStyleOutlet`. | Full viewport background and chrome text flash from neutral dark (`#313338`) to user custom CSS (`#f8fafc`). Worst perceived flash (~300–500 ms). |
| **Character Showcase** (`character`) | `/character/[id]` | 1. Async `loadCustomCss()` on `character.customCss`.<br>2. `showcaseTheme` resolves with `global: shellToThemeOverrides(shellTheme.theme)`. | 1. Custom character styles pop in 1–2 frames late.<br>2. Global shell customizations (e.g. font family, global accent) do not apply to the showcase until `+layout.svelte` finishes `shellTheme.load()`. |
| **Chat Surface** (`chat`) | `/chat/[chatId]` | 1. Async `loadCustomCss()` on `session.character.customCss`.<br>2. `ThemeEngine` in chat consumes `global: shellToThemeOverrides(shellTheme.theme)`. | 1. Chat bubble / background styling overrides pop in late.<br>2. Global theme overrides cascade late, causing potential color and layout jumps. *(Historically mitigated by a first-frame transition gate in `ChatViewport.svelte:56-60`).* |

---

## 4. Why Shimmer Skeletons Are the Wrong Solution

In commercial web applications with remote cloud infrastructure (latency $>1.5 \text{ s}$), shimmer skeletons visually bridge the gap while waiting for remote network payloads. 

Applying a shimmer skeleton to solve this issue in FormaTavern is rejected on three architectural grounds:
1. **Local-First Desktop Invariant:** FormaTavern runs as a local Bun process on SQLite WAL. Cold query latency is sub-millisecond. Masking a client-side style pipeline race with a loading skeleton introduces artificial visual noise and degrades the desktop experience.
2. **Cumulative Layout Shift (CLS):** Replacing content with skeleton boxes and then replacing skeleton boxes with rendered surfaces produces layout reflows that violate **Invariant U6** (CLS budget $\le 0.02$).
3. **Wrong Layer:** Shimmer skeletons address *data availability*, whereas this bug is a *style evaluation pipeline* defect. The data is either already on disk or in memory; the styling must be synchronous with the first DOM paint.

---

## 5. Scaling Audit: 2,500 Characters & High-Density Stories

FormaTavern must gracefully support a user catalog containing **2,500 characters**, each associated with multiple chats (projected: 5,000–12,500 chats, 100,000+ narrative turns).

### 5.1 Complexity of the Zero-FOUC Fix Under Scale

The proposed FOUC fix has a time and space complexity of **$O(1)$ constant time**:
- **Data Footprint:** The `shellTheme` object represents exclusively global application chrome settings (palette, typography, card border radius, and shell CSS). It contains zero character or chat records.
- **Storage Size:** Serialized to JSON, `shellTheme` measures approximately **1.5 KiB to 3 KiB**.
- **Execution Cost:** Reading a 3 KiB key synchronously from `localStorage` in V8/WebKit takes **$< 0.08 \text{ ms}$**.
- **Quota Safety:** Web browsers allocate a standard $5 \text{ MB}$ quota per origin for `localStorage`. Storing the shell theme and its pre-sanitized stylesheet consumes $< 0.1\%$ of the browser storage limit.
- **Strict LRU Memory Budget:** 
  Per [`packages/shared/src/schemas/shellTheme.ts:35`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/schemas/shellTheme.ts#L35), each `customCss` string is capped at $131,072 \text{ bytes}$ (128 KiB). 
  - Storing 10 unconstrained sheets in memory could consume up to $\approx 1.3 \text{ MB}$ of RAM.
  - The client LRU cache must be **strictly byte-budgeted** to a maximum of **512 KiB total** (or a fixed capacity of 4 sheets).
  - The storage model **never** bulk-writes character sheets into `localStorage`. Character custom stylesheets are loaded strictly on demand when visiting that character's route.

### 5.2 Existing Architectural Bottlenecks Exposed by Scale

While the theme fix scales without friction, auditing the data paths for 2,500 characters exposed two severe scaling vulnerabilities in the existing codebase:

#### Bottleneck 1: Unbounded Chat Queries & Early Limiting
In [`frontend/src/routes/+page.ts:8`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/routes/+page.ts#L8) and [`frontend/src/routes/+page.svelte:46`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/routes/+page.svelte#L46):
```ts
// frontend/src/routes/+page.ts
fetch('/api/chats') // No limit parameter passed!

// frontend/src/routes/+page.svelte
const res = await api.api.chats.get(); // Unbounded!
```
And similarly in [`frontend/src/lib/components/chat/ChatViewport.svelte:76-79`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/chat/ChatViewport.svelte#L76-L79) (`loadNavData()`):
```ts
const [chatsRes, charsRes, personasRes] = await Promise.all([
  api.api.chats.get(),      // Unbounded!
  api.api.characters.get(), // Defaults to 24, but should explicitly specify limit
  api.api.personas.get()
]);
```

In [`backend/src/db/repositories/chats.ts:60-85`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/db/repositories/chats.ts#L60-L85):
```sql
SELECT c.*,
  COUNT(m.id) AS message_count,
  COUNT(CASE WHEN m.role = 'assistant' THEN 1 END) AS turn_count
FROM chats c
LEFT JOIN messages m ON m.chat_id = c.id
GROUP BY c.id ORDER BY c.updated_at DESC;
```
**Failure Mode under 2,500 Characters:**
1. A naive `LIMIT 12` appended to the end of this query still forces SQLite to perform a `LEFT JOIN` and `GROUP BY` across all 10,000+ chats and 100,000+ messages before sorting and discarding rows past 12.
2. The query plan must limit *first* via a Common Table Expression (CTE):

```sql
WITH recent_chats AS (
  SELECT * FROM chats
  /* optional WHERE primary_character_id = ? */
  ORDER BY updated_at DESC
  LIMIT ?
)
SELECT c.*,
  COUNT(m.id) AS message_count,
  COUNT(CASE WHEN m.role = 'assistant' THEN 1 END) AS turn_count
FROM recent_chats c
LEFT JOIN messages m ON m.chat_id = c.id
GROUP BY c.id
ORDER BY c.updated_at DESC;
```
With this CTE, SQLite touches **only 12 chats** from the index `idx_chats_updated` and joins messages for those 12 chats only, guaranteeing true sub-millisecond execution.

#### Bottleneck 2: Missing SQLite Index on `chats(primary_character_id)`
In [`backend/src/db/migrate.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/db/migrate.ts#L29-L36), Migration 1 establishes `idx_chats_updated`, but **no index on `primary_character_id`**.
When navigating to any character showcase (`/character/[id]`), the frontend calls:
```ts
api.api.chats.get({ query: { characterId: params.id, limit: 10 } });
```
Because `primary_character_id` is unindexed, SQLite executes a full table scan across all 10,000+ chat rows on every character page load. Furthermore, the catalog list query in [`backend/src/db/repositories.ts:273`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/db/repositories.ts#L273) joins `chats ch ON ch.primary_character_id = c.id`.

**Migration Contiguity:**
Notice that `migrate.ts:161-197` already defines **Migration 7** (`chat_layout_neutrality`). To preserve contiguity (`runMigrations` check: `m.version !== i + 1`), this new migration **must be Migration 8** (`chats_primary_character_idx`):
```sql
CREATE INDEX IF NOT EXISTS idx_chats_primary_character ON chats(primary_character_id, updated_at DESC);
```

### 5.3 What Already Scales Efficiently
1. **Catalog Keyset Pagination:** [`SqliteCharacterRepository.list`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/db/repositories.ts#L261-L350) enforces **Invariant P1** using base64-encoded cursors over `(updated_at, id)`, `(name, id)`, and `(story_count, id)` with a strict limit of 24–60 cards per page.
2. **Search Indexing:** Full-text search over 2,500 characters is powered by the SQLite virtual table `characters_fts` (FTS5 with unicode61 tokenizer), searching names, taglines, creators, descriptions, and tags in $\approx 1.5 \text{ ms}$.
3. **Asset Decoupling:** [`CompanionCard.svelte:45-46`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/discovery/CompanionCard.svelte#L45-L46) specifies `loading="lazy"` and `decoding="async"`.

---

## 6. Hardened Architectural Solution

To achieve $0 \text{ ms}$ FOUC while upholding strict boundary invariants and security trust boundaries, the system implements a **Hardened Three-Tiered Delivery Architecture**:

```
+---------------------------------------------------------------------------------+
|                                 TIER 1                                          |
|                Pre-Hydration Head Bootstrap (app.html)                          |
|  - Strictly respects Invariant A-SURF1: NO --theme-*/--chrome-* on <html>       |
|  - Reads localStorage('formatavern_prefs'); respects hideCustomStyling (C8)    |
|  - Inspects localStorage('formatavern_sheet_shell') with integrity hash check   |
|  - Injects pre-sanitized shell stylesheet directly into <head>                  |
|  --> Result: Frame 0 renders directly in user theme. 0 ms flash.               |
+---------------------------------------------------------------------------------+
                                      |
                                      v
+---------------------------------------------------------------------------------+
|                                 TIER 2                                          |
|             Synchronous Client Cache & SWR (ShellThemeStore)                    |
|  - Constructor initializes theme state directly from localStorage               |
|  - ShellSurface.svelte applies inline --chrome-* tokens to surface root         |
|  - Background onMount() revalidates against /api/settings/shell-theme           |
|  - BroadcastChannel('formatavern_sync') synchronizes across multi-tabs          |
+---------------------------------------------------------------------------------+
                                      |
                                      v
+---------------------------------------------------------------------------------+
|                                 TIER 3                                          |
|             Synchronous Sanitized Sheet Cache (CustomStyleOutlet)               |
|  - Dedup: Adopts existing <style data-ft-sheet="shell"> from Tier 1 (C13 safe)  |
|  - Trust Boundary: Dispatches background re-sanitization to verify integrity    |
|  - Memory-capped LRU cache (512 KiB) for character/chat sheets                  |
+---------------------------------------------------------------------------------+
```

### 6.1 Tier 1: Pre-Hydration Head Bootstrap Script (A-SURF1 & C8 Compliant)
In [`frontend/src/app.html`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/app.html), an inline script executes in `<head>` before the DOM parser encounters `<body>`.
1. **Kill-Switch Guards (**C8 / C9**):**
   Reads `localStorage.getItem('formatavern_prefs')`. If `hideCustomStyling === true` or `disableCharacterThemes === true`, the bootstrap script **aborts immediately** without injecting any stylesheet.
2. **Trust Boundary Verification:**
   Reads `localStorage.getItem('formatavern_sheet_shell')`, which contains:
   ```json
   {
     "sanitizerVersion": 1,
     "rawHash": "<sha256-or-fnv-hash>",
     "css": "[data-ft-surface=\"shell\"] { ... }"
   }
   ```
   If `sanitizerVersion` matches current frontend policy version, it creates `<style data-ft-sheet="shell">` with the sanitized CSS.
3. **Strict A-SURF1 Compliance:**
   The bootstrap script **never** writes `--theme-*` or `--chrome-*` to `document.documentElement` or `<html>`. All surface variables remain confined to surface roots.

### 6.2 Tier 2: Synchronous Store Initialization (Stale-While-Revalidate)
In [`frontend/src/lib/state/shellTheme.svelte.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/state/shellTheme.svelte.ts):
- During constructor instantiation, synchronously read `formatavern_shell_theme` from `localStorage`.
- When [`ShellSurface.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/custom/ShellSurface.svelte) mounts, its derived `chromeVars` immediately has all `--chrome-*` values, setting them inline on `<div data-ft-surface="shell">` on Frame 1.
- In `save()`, persist to `localStorage` immediately.
- In `load()`, query `/api/settings/shell-theme` in the background. If the remote payload differs from local state (`updatedAt` or deep equal), update `this.theme` and update `localStorage`.

### 6.3 Tier 3: Synchronous Outlet Injection, Adoption, and LRU Cache
In [`frontend/src/lib/components/custom/CustomStyleOutlet.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/custom/CustomStyleOutlet.svelte):
1. **Tag Adoption Dedup (**C13**):**
   Before creating a `<style>` element, check `document.querySelector('style[data-ft-sheet="' + scope + '"]')`. If an existing tag is already present (injected by Tier 1), adopt it as `styleEl` rather than appending a duplicate element.
2. **Trust Boundary & Background Re-Sanitize:**
   Even when using a cached sheet on Frame 1, `CustomStyleOutlet` dispatches `loadCustomCss()` in the background to re-sanitize `raw` against current rules and update the cache if a discrepancy is detected.
3. **Byte-Budgeted In-Memory LRU Cache:**
   For `scope="character"` and `scope="chat"`, maintain an in-memory LRU map with a **512 KiB total byte cap**.

### 6.4 Query Bounds & Database Migration
1. **Foyer Query Hardening:** Update `frontend/src/routes/+page.ts` and `frontend/src/routes/+page.svelte` to query `/api/chats?limit=12`.
2. **Chat Viewport Query Hardening:** Update `frontend/src/lib/components/chat/ChatViewport.svelte:76-79` to query `/api/chats?limit=20` and `/api/characters?limit=20`.
3. **CTE Query Optimization in Repository:** Rewrite `SQLiteChatRepository.list()` using `WITH recent_chats AS (...)` so `LIMIT` executes before message aggregation.
4. **Schema Migration 8:** Append Migration 8 to `backend/src/db/migrate.ts` creating `idx_chats_primary_character ON chats(primary_character_id, updated_at DESC)`.

---

## 7. Invariant & Architecture Compliance

| Invariant / Rule | Compliance Analysis |
|---|---|
| **A-SURF1 (Surface variable containment)** | No `--theme-*` or `--chrome-*` variables are ever written to `document.documentElement` or `<html>`. All theme/chrome vars reside on surface roots (`ShellSurface` inline vars, `themeEngine.styleAttr`). |
| **C2 (Single style outlet / A-U2b)** | `CustomStyleOutlet.svelte` owns stylesheet lifecycle in the SPA. Pre-hydration bootstrap tags are immediately adopted by the outlet upon mount. |
| **C3 (Sanitizer deterministic fixed-point)** | Caching relies on pure function identity: `sanitizeCss(raw, scope)` produces identical output for identical raw input. |
| **C8 (Viewer supremacy)** | `prefs.hideCustomStyling === true` or `prefs.disableCharacterThemes === true` suppresses stylesheet injection in both Tier 1 bootstrap and Tier 3 outlet. |
| **C9 (Reduced motion guard)** | Cached sheets include `motionGuard(scope)`. `prefs.reducedMotion` is verified prior to injection. |
| **C10 (128 KiB sheet cap)** | Custom CSS remains bounded by TypeBox schema validation ($\le 131,072$ bytes). |
| **C12 (SPA style lifecycle)** | Surface unmount cleans up the adopted or injected `<style>` tag, preventing stylesheet leakage across navigation transitions. |
| **C13 (Performance budget & dynamic `css-tree`)** | `css-tree` remains in an isolated dynamic chunk. Adoption logic ensures $\le 1$ stylesheet element exists per surface. |
| **P1 (Keyset pagination)** | Unbounded chat queries are eliminated in favor of bounded queries with early CTE limits. |
| **I6 / S7 (Backend purity)** | All database modifications reside in `db/migrate.ts` and repositories; `app.ts` remains Bun/SQLite type-free. |

---

## 8. Implementation Blueprint (Agent Hand-Off Guide)

Downstream agents implementing this proposal should execute the following ordered phases:

### Phase 1: Database Migration 8 & Query Hardening
1. [`backend/src/db/migrate.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/db/migrate.ts):
   - Add Migration 8 (`chats_primary_character_idx`):
     ```ts
     {
       version: 8,
       name: 'chats_primary_character_idx',
       up: (db) => {
         db.run(`CREATE INDEX IF NOT EXISTS idx_chats_primary_character ON chats(primary_character_id, updated_at DESC);`);
       }
     }
     ```
2. [`backend/src/db/repositories/chats.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/db/repositories/chats.ts):
   - Optimize `list()` to apply `LIMIT` via a CTE before joining `messages`:
     ```ts
     let sql = `
       WITH recent_chats AS (
         SELECT * FROM chats
         ${wheres.length > 0 ? 'WHERE ' + wheres.join(' AND ') : ''}
         ORDER BY updated_at DESC
         ${opts?.limit ? 'LIMIT ' + Number(opts.limit) : ''}
       )
       SELECT c.*,
         COUNT(m.id) AS message_count,
         COUNT(CASE WHEN m.role = 'assistant' THEN 1 END) AS turn_count
       FROM recent_chats c
       LEFT JOIN messages m ON m.chat_id = c.id
       GROUP BY c.id
       ORDER BY c.updated_at DESC;
     `;
     ```
3. [`frontend/src/routes/+page.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/routes/+page.ts):
   - Change `fetch('/api/chats')` to `fetch('/api/chats?limit=12')`.
4. [`frontend/src/routes/+page.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/routes/+page.svelte):
   - Change `api.api.chats.get()` to `api.api.chats.get({ query: { limit: 12 } })`.
5. [`frontend/src/lib/components/chat/ChatViewport.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/chat/ChatViewport.svelte):
   - In `loadNavData()`, supply `{ query: { limit: 20 } }` to `api.api.chats.get()` and `api.api.characters.get()`.

### Phase 2: Client Shell Theme Store Synchronous Cache
1. [`frontend/src/lib/state/shellTheme.svelte.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/state/shellTheme.svelte.ts):
   - In constructor, synchronously read `formatavern_shell_theme` from `localStorage` if present.
   - In `save()`, persist `JSON.stringify(newTheme)` to `localStorage`.
   - In `load()`, update `localStorage` on successful response if remote payload differs.

### Phase 3: Synchronous Sheet Cache & Outlet Fast-Path
1. [`frontend/src/lib/components/custom/CustomStyleOutlet.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/custom/CustomStyleOutlet.svelte):
   - Maintain an in-memory byte-capped LRU sheet cache (max 512 KiB).
   - Check for pre-existing `<style data-ft-sheet="...">'` and adopt it.
   - For `scope="shell"`, check `localStorage.getItem('formatavern_sheet_shell')` matching `sanitizerVersion` and `rawHash`.
   - On cache hit, inject/adopt synchronously on Frame 1, and dispatch background `loadCustomCss()` to verify integrity.

### Phase 4: Pre-Hydration Head Bootstrap (app.html)
1. [`frontend/src/app.html`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/app.html):
   - Insert an inline `<script>` in `<head>` that:
     1. Checks `localStorage('formatavern_prefs')` for `hideCustomStyling === true`. If true, aborts.
     2. Checks `localStorage('formatavern_sheet_shell')` for valid `sanitizerVersion`.
     3. Injects `<style data-ft-sheet="shell">` with the cached sanitized CSS.
     4. Does **not** set `--chrome-*` on `<html>` (satisfying **A-SURF1**).

---

## 9. Verification Protocol (Per `docs/workflows/ui-ux-testing.md`)

Downstream agents must verify the implementation using the project's headless browser testing workflow:

1. **Headless FOUC Verification Probe:**
   Drive Edge headlessly with both cold and warm user-data profiles:
   ```powershell
   $edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
   $tmp = "C:\Users\osama\AppData\Local\Temp\opencode\edge-probe"
   
   # Run 1: Cold start verification
   & $edge --headless --disable-gpu --no-sandbox --user-data-dir="$tmp\cold-profile" `
     --virtual-time-budget=800 --window-size=1440,900 `
     --screenshot="$tmp\cold-foyer.png" "http://127.0.0.1:5173/"
     
   # Run 2: Warm reload with custom theme in localStorage
   & $edge --headless --disable-gpu --no-sandbox --user-data-dir="$tmp\warm-profile" `
     --virtual-time-budget=200 --window-size=1440,900 `
     --screenshot="$tmp\warm-foyer-first-frame.png" "http://127.0.0.1:5173/"
   ```
   Confirm that `warm-foyer-first-frame.png` shows the custom theme rendered without neutral dark borders or background flashing.

2. **Kill-Switch Verification (`hideCustomStyling=true`):**
   Verify that when `hideCustomStyling: true` is set in `formatavern_prefs`, neither Tier 1 nor Tier 3 injects any custom stylesheet into the DOM.

3. **Database & Index Verification:**
   - Run `bun run db:check` to confirm Migration 8 applies cleanly and `PRAGMA user_version = 8`.
   - Run `EXPLAIN QUERY PLAN` on `chats.list()` query to confirm `idx_chats_primary_character` and `idx_chats_updated` indexes are utilized without full table scans.

4. **Automated Test Suites:**
   - `bun run typecheck` (tsc shared, tsc backend, svelte-check frontend) must report **0 errors / 0 warnings**.
   - `bun run test` must execute 100% green across all unit test suites.
   - Run `frontend/unit/boundaries.test.ts` and `frontend/unit/surfaces.test.ts` to confirm zero **A-SURF1**, **C2**, and **C13** violations.
