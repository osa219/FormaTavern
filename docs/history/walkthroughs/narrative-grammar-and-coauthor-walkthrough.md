# Narrative Grammar, Dialect Overhaul, and The Co-Author Paradigm Walkthrough

As-built engineering record for [`docs/history/reports/narrative-grammar-and-dialect-overhaul-proposal.md`](../reports/narrative-grammar-and-dialect-overhaul-proposal.md).

- **Phase A (As-Built):** Response format isolation, concrete per-dialect grammar instructions, neutral 1-on-1 template, global preamble transparency, and conditional classic settings. Committed in `f2b7f5e`.
- **Phase B (As-Built):** The Co-Author Paradigm & Persona Voicing across all four enforcement layers (Prompt Preamble, Provider Stop Sequences, Streaming Agency Check, and Envelope Parser Truncation), along with Settings UI, Chat About drawer override, and visual transparency ("Co-authored" badge).

---

## 1. Context & Motivation

FormaTavern's core technical differentiator is its **Single-Request Narrative Envelope protocol**: within one generation stream, an LLM emits scene narration, character dialogue, multi-NPC interactions, and dynamic scene state updates (mood, location, inventory). The parser unpacks these into reactive UI components: distinct speech bubbles, narrator prose blocks, and live state sheets.

### The Problem Space
Prior to this overhaul, an audit of the prompt architecture and agency subsystem revealed four friction points:
1. **Internal Code Leaks:** Block `1b` injected internal software enum names (`[Narrative Mode: ${dialect}]`) and abstract schema jargon (`Use XML tags (<kind name="name"> ... </kind>)`) into the LLM context. Models frequently echoed these headers or emitted literal `<kind>` tags.
2. **Thematic Bleed in Default Templates:** The hardcoded syntax example (`"The morning mist clears over the valley... scouts spot us..."`) primed models with medieval/fantasy scouting tropes across non-fantasy chats. Furthermore, using `"Side character"` as a name placeholder caused open-source models to hallucinate an actual character named `"Side character"`.
3. **Instruction Confusion & State Mismatch:** Block `1b` instructed the model to include `mood` and `scene` in the state block, but the example provided only `{"mood":"calm"}`. Small models mimicked the example and dropped `scene`.
4. **Settings UI Opacity & Clutter:** The global system preamble textarea was blank with no indication of what the built-in prompt was, and offered no reset button. Meanwhile, selecting Classic Roleplay mode continued to display dialect selectors and narrative template accordions that had no effect on flat prose.
5. **The Rigid 1st-Person Chatbot Dogma:** User agency was enforced as an immutable, hardcoded negative muzzle across four separate engine layers ("never speak for the user"). For creators and users seeking a collaborative writing partner or director mode, there was no way to permit the model to advance the scene by voicing or acting for the persona.

---

## 2. Phase A: Response Format & Dialect Overhaul (As-Built)

Phase A resolved prompt quality, instruction clarity, and UI transparency while maintaining backward compatibility.

### 2.1. Codebase Changes

#### 1. Prompt Builder & Block 1b (`backend/src/prompt/blocks.ts`)
- **Neutral Header:** Replaced `[Narrative Mode: ${dialect}]` with `[Response Format]`.
- **Concrete Tag Definitions:** Replaced abstract schema descriptions with exact, concrete tag listings per dialect:
  - **Directive:**
    ```text
    Structure your response using directive blocks:
    - :::narrator ... ::: for scene description, environment, and physical actions.
    - :::character[{{char}}] ... ::: for {{char}}'s spoken dialogue and thoughts.
    - :::npc[Name] ... ::: when a side character speaks or acts (use their actual name).
    - ```state ... ``` at the very end with current mood and scene as JSON.
    ```
  - **XML:**
    ```text
    Structure your response using XML tags:
    - <narrator> ... </narrator> for scene description, environment, and physical actions.
    - <character name="{{char}}"> ... </character> for {{char}}'s spoken dialogue and thoughts.
    - <npc name="..."> ... </npc> when a side character speaks or acts (use their actual name).
    - <state> ... </state> at the very end with current mood and scene as JSON.
    ```
  - **Prefix:**
    ```text
    Structure your response using speaker prefix lines:
    - Narrator: ... for scene description, environment, and physical actions.
    - {{char}}: ... for {{char}}'s spoken dialogue and thoughts.
    - Name: ... when a side character speaks or acts (use their actual name).
    - ```state ... ``` at the very end with current mood and scene as JSON.
    ```
- **Block 1b Purity:** Removed the behavioral agency clause (`AGENCY_CLAUSE`) from Block `1b`. Block `1b` is now strictly responsible for response format and syntax grammar.

#### 2. Canonical Structural Templates (`backend/src/prompt/templates.ts`)
- Replaced the fantasy scouting trope with a clean, genre-neutral 1-on-1 interaction:
  ```text
  :::narrator
  {{char}} glances up from their work, noticing your arrival.
  :::

  :::character[{{char}}]
  "I wasn't expecting you yet, but I'm glad you're here."
  :::

  ```state
  {"mood":"curious","scene":"quiet room"}
  ```
  ```
- **Consistent State Keys:** The example demonstrates both `"mood"` and `"scene"`, aligning perfectly with the state instructions.
- **Relocated Universal Guidance:** Consolidated universal roleplay instructions and baseline agency into `PREAMBLE_DEFAULT` for Block 1:
  ```typescript
  export const PREAMBLE_DEFAULT =
    'You are an expert roleplay assistant. Stay in character, maintain fidelity to the world and established personalities, and craft vivid, engaging prose. Never write dialogue, thoughts, feelings, or actions for {{user}}. Stop and yield when {{user}} must react or decide.';
  ```

#### 3. Preamble Transparency & API (`backend/src/routes/settings.ts`, `packages/shared/src/schemas/settings.ts`)
- Added `preambleDefault: Type.Optional(Type.String())` to `SettingsViewSchema`.
- `GET /api/settings` now exposes `preambleDefault: PREAMBLE_DEFAULT`.
- `PATCH /api/settings` accepts `{ preamble: string | null }` to override or reset the preamble.

#### 4. Settings UI Polish (`frontend/src/lib/components/settings/SettingsSheet.svelte`)
- **Preamble First:** Reordered the settings form so System Preamble sits above dialect configuration.
- **Visual Feedback & Controls:**
  - Added a `customized` badge when the stored preamble differs from default or null.
  - Added an **"Edit default"** button when the preamble is untouched, copying the built-in default into the textarea for convenient editing.
  - Added a **"Reset to default"** button when customized, clearing the override via `{ preamble: null }`.
- **Conditional Visibility:**
  - When `s.narrative.defaultMode === 'narrative'`, shows dialect selection and the template accordion.
  - When `s.narrative.defaultMode === 'classic'`, hides envelope dialect selectors and displays an informational card explaining that plain prose without envelope tags is being generated.

#### 5. Golden Prompts & Tests
- Regenerated golden prompt file: [`backend/test/prompt/__golden__/eldrin-narrative-directive.txt`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/test/prompt/__golden__/eldrin-narrative-directive.txt).
- Updated test assertions in [`backend/test/prompt/builder.test.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/test/prompt/builder.test.ts) and [`backend/test/routes/settings.test.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/test/routes/settings.test.ts).

#### 6. Architecture Documentation (`docs/architecture.md`)
- Enshrined **Principle 8 (The Co-Author Paradigm)**:
  > *"FormaTavern treats the LLM as an expressive creative writing partner in a shared writer's room rather than an adversarial 1st-person chatbot. The human user acts as lead author and creative director; the model contributes multi-track dialogue, environmental narration, and scene progression. Conversational boundaries (such as 'never speak for the user') are creator-owned stylistic options, not immutable engine dogma."*

---

## 3. Phase B: The Co-Author Paradigm & Persona Voicing (As-Built)

Phase B expands FormaTavern from a strict 1st-person sparring client into a flexible **Collaborative Writing Studio**, giving creators and users full control over whether the AI can co-author lines and actions for the user's persona.

### 3.1. The Quadruple Agency Gate

Prior to Phase B, user agency was enforced across four separate, defense-in-depth layers:

```
[Layer 1: Prompt Builder]
     |  PREAMBLE_DEFAULT: "Never write dialogue, thoughts, feelings, or actions for {{user}}."
     v
[Layer 2: Provider Stop Sequences]
     |  stop.ts: ':::persona', '<persona', '\nPersona:', '\n{{user}}:'
     v
[Layer 3: Streaming Agency Check]
     |  generation.ts: runAgencyCheck() aborts generation if persona tags appear
     v
[Layer 4: Envelope Parser Truncation]
     |  envelope/index.ts: truncatedAt = 'persona' deletes any parsed persona segment
```

Under Phase B, all four layers dynamically coordinate around the active `PersonaVoicingPolicy` (`'prohibited'` vs `'allowed'`).

### 3.2. As-Built Technical Implementation

#### A. Shared Schema & Types (`packages/shared/src/schemas/`)
- **`packages/shared/src/schemas/narrative.ts`**:
  - Exported `PersonaVoicingPolicy = Type.Union([Type.Literal('prohibited'), Type.Literal('allowed')])`.
  - Added `personaVoicing: Type.Optional(Type.Union([PersonaVoicingPolicy, Type.Null()]))` to `ChatMetadataSchema`.
- **`packages/shared/src/schemas/settings.ts`**:
  - Added `personaVoicing: Type.Optional(PersonaVoicingPolicy)` to `AppSettingsSchema.properties.narrative`.
  - Added `personaVoicing: PersonaVoicingPolicy` to `SettingsViewSchema` (defaults to `'prohibited'`).
  - Added `personaVoicing: Type.Optional(PersonaVoicingPolicy)` to `SettingsPatchSchema`.

#### B. Layer 2: Provider Stop Sequences (`packages/shared/src/text/stop.ts`)
- Updated `buildStopSequences(dialect, personaName, personaVoicing: PersonaVoicingPolicy = 'prohibited')`:
  - When `personaVoicing === 'allowed'`: returns `[]` (empty list), allowing the model to emit persona blocks without provider-level stream cuts.
  - When `personaVoicing === 'prohibited'`: preserves the existing stop sequences (`:::persona`, `<persona`, `\n${personaName}:`, `\nPersona:`), capped at $\le 4$ items.

#### C. Layer 4: Envelope Parser & Grammar (`packages/shared/src/envelope/`)
- **`packages/shared/src/envelope/grammar.ts`**:
  - Added `personaName?: string` to `ClassifyOptions`.
  - Updated `classifyLine` and `passesPrefixGate` to recognize persona speaker prefix lines (e.g. `Adventurer: ...` or `Persona: ...`) when `allowPersona: true`.
- **`packages/shared/src/envelope/index.ts`**:
  - Passed `personaName: options.personaName` into `classifyLine`.
  - Reused the existing `ParseOptions.allowPersona` flag. When `allowPersona: true`, persona tags/lines are parsed into valid segments (`kind: 'persona'`) with `adherent: true` and `truncatedAt: null`.
  - **Prefix Truncation Coverage:** Extended `userMacroOrNamePattern` to match `{{user}}:`, `User:`, `Persona:`, and `<personaName>:` (`primaryCharacter` is exempted). This closes prefix leaks in prohibited mode while allowing them in co-author mode.

#### D. Layer 1: Prompt Assembly (`backend/src/prompt/`)
- **`backend/src/prompt/templates.ts`**:
  - Added `PREAMBLE_COAUTHOR_DEFAULT`:
    ```typescript
    export const PREAMBLE_COAUTHOR_DEFAULT =
      'You are an expert creative writing and roleplay partner. Maintain deep fidelity to the world, character motivations, and established lore, crafting vivid, engaging, and reactive prose. You collaborate as a co-author; while {{user}} directs their persona, you may describe {{user}}\'s reactions, movements, and spoken dialogue to advance the scene when natural.';
    ```
- **`backend/src/prompt/types.ts`**:
  - Added `personaVoicing?: PersonaVoicingPolicy` to `PromptContext`.
- **`backend/src/prompt/blocks.ts`**:
  - **Block 1 (Preamble):** When `ctx.personaVoicing === 'allowed'` and no custom preamble is set, uses `PREAMBLE_COAUTHOR_DEFAULT` instead of `PREAMBLE_DEFAULT`.
  - **Block 1b (Response Format):** When `ctx.personaVoicing === 'allowed'`, includes the persona tag in the dialect instruction list:
    - Directive: `- :::persona[{{user}}] ... ::: for {{user}}'s spoken dialogue and actions.`
    - XML: `- <persona name="{{user}}"> ... </persona> for {{user}}'s spoken dialogue and actions.`
    - Prefix: `- {{user}}: ... for {{user}}'s spoken dialogue and actions.`
- **`backend/src/prompt/builder.ts`**:
  - Passed `ctx.personaVoicing` into `buildStopSequences(dialect, personaName, ctx.personaVoicing)`.

#### E. Layer 3 & Engine Resolution (`backend/src/engine/` & `backend/src/routes/`)
- **`backend/src/engine/context.ts`**:
  - Resolved `personaVoicing` in `resolvePromptContext`:
    ```typescript
    const personaVoicing = (chat.metadata?.personaVoicing ?? settings.narrative?.personaVoicing ?? 'prohibited') as PersonaVoicingPolicy;
    ```
- **`backend/src/engine/generation.ts`**:
  - In `runAgencyCheck(chunk, context)`, the check delegates to `parseEnvelope(buffer, job.parseOptions)`. Because `job.parseOptions.allowPersona` is `true` when `personaVoicing === 'allowed'`, `parseEnvelope` returns `truncatedAt: null`, naturally bypassing agency abort without ad-hoc branching.
- **`backend/src/engine/convert.ts`**:
  - Added `allowPersona?: boolean` to `ConvertOptions` and passed it to `parseEnvelope`.
- **`backend/src/routes/messages.ts`**:
  - Set `allowPersona: personaVoicing === 'allowed'` on both `/regenerate` and `/continue` generation jobs.
- **`backend/src/routes/chats.ts`**:
  - Set `allowPersona: personaVoicing === 'allowed'` on the message send path and `/convert-dialect`.
  - Handled `personaVoicing` in `PATCH /api/chats/:id` metadata updates (deleting the key when set to `null` to revert to global default).

#### F. Frontend UI & Theming (`frontend/src/lib/components/`)
- **`frontend/src/lib/components/settings/SettingsSheet.svelte`**:
  - Added a dedicated **Persona Voicing (Co-Author Mode)** control under Narrative Settings:
    - Strict (Default): *"Never speak for user (prohibited)"*
    - Co-Author: *"Allow persona actions & lines (allowed)"*
- **`frontend/src/lib/components/chat/LoreDrawer.svelte`**:
  - Added a per-chat override selector in the About tab with three states:
    - *Default (inherit global setting)*
    - *Strict (Never speak for user)*
    - *Co-Author (Allow persona actions & lines)*
  - Handled null safety for `settingsStore.settings` on initial mount.
- **`frontend/src/lib/components/chat/ChatViewport.svelte`**:
  - Implemented `handleUpdatePersonaVoicing` calling `PATCH /api/chats/:id` to persist chat-level overrides.
- **`frontend/src/lib/components/chat/TurnRow.svelte`**:
  - For assistant-authored persona segments (`kind: 'persona'`), renders a subtle `Co-authored` indicator pill next to the speaker name:
    ```svelte
    <span
      class="rounded border border-accent/30 bg-accent/10 px-1 py-0.5 font-mono text-[9px] uppercase tracking-wider text-accent select-none"
      title="Co-authored by AI"
    >
      Co-authored
    </span>
    ```
  - **Preserving Invariant L8:** The speaker bracket `[{name}]` is kept strictly untouched as its own text node (`[{name}]`), ensuring tests and screen readers asserting exact speaker bracket formatting continue to pass 100%.

---

## 4. Verification & Test Integrity

### 4.1. Test Suite Results
Full monorepo test suite passed with zero failures:
```text
Shared Unit Tests:   215 passed
Backend Unit Tests:  280 passed
Frontend Unit Tests: 231 passed
Total:               726 / 726 tests passing (100% green)
```

### 4.2. Tests Added in Phase B
1. **`packages/shared/test/text.test.ts`**:
   - Verified `buildStopSequences` returns `[]` when `personaVoicing: 'allowed'`.
   - Verified `buildStopSequences` returns $\le 4$ items when `personaVoicing: 'prohibited'`.
2. **`packages/shared/test/envelope/parser.test.ts`**:
   - Verified `allowPersona: true` parses XML `<persona name="Adventurer">` without truncation.
   - Verified `allowPersona: true` parses Prefix `Adventurer: ...` without truncation and adheres to grammar.
   - Verified generic `Persona:` and `User:` prefix lines are properly truncated in prohibited mode (`allowPersona: false`) and accepted as persona segments in co-author mode (`allowPersona: true`).
   - Verified `allowPersona: false` truncates immediately on directive, xml, and prefix persona detection.
3. **`backend/test/prompt/builder.test.ts`**:
   - Verified Block 1 uses `PREAMBLE_COAUTHOR_DEFAULT` when `personaVoicing: 'allowed'` and preamble is default.
   - Verified Block 1b includes `:::persona[{{user}}]` for directive dialect when `allowed`.
   - Verified Block 1b includes `<persona name="{{user}}">` for XML dialect when `allowed`.
   - Verified Block 1b includes `{{user}}:` for prefix dialect when `allowed`.
   - Verified user custom preamble is preserved even when `allowed`.
4. **`backend/test/engine/generation.test.ts`**:
   - Verified streaming mock `mock:persona-violation` streams to completion with a full persona segment when `allowPersona: true`, whereas it aborts when `allowPersona: false`.

### 4.3. Typecheck & Integrity Checks
- **`bun run typecheck`**: **0 errors, 0 warnings** across `packages/shared`, `backend`, and `frontend` (`svelte-check` clean).
- **`bun run db:check`**: Clean WAL mode, foreign keys enabled, `user_version = 8`, FTS5 parity ok, zero orphan tags.

---

## 5. Invariants Preserved

| Invariant | Description | Preservation in Phase B |
|---|---|---|
| **I1** | One TypeBox schema per boundary | `PersonaVoicingPolicy` defined in shared schema; reused in settings and chat metadata. |
| **I5** | `shared` is isomorphic | No Node/Bun/DOM imports in `packages/shared`. |
| **E1** | `parseEnvelope` is pure function of buffer | Parsing logic remains pure and deterministic with `allowPersona` option. |
| **E3** | Parse/serialize round-trip identity | Segments round-trip accurately regardless of speaker kind. |
| **E6** | `buildPrompt` is pure & deterministic | Prompt assembly is a pure function of `PromptContext`. |
| **E8** | Providers reach engine only via interface | Stop sequences parameterized via standard provider options. |
| **S1** | Disconnect immunity | Hub abort controller isolated from client request signal. |
| **S2** | $\le 1$ active generation per chat | Synchronous check-and-insert unaffected. |
| **S7** | `app.ts` Bun/SQLite-free | Route handlers and contracts maintain strict purity. |
| **S8** | Secrets never logged or exposed | Persona voicing settings contain no sensitive data. |
| **U1** | Pure theme cascade order | Persona voicing badge uses semantic theme tokens (`amber-500/10`, `amber-500/80`). |
| **U2** | Zero runtime CSS injection | Static Tailwind classes only. |
| **U8** | High-contrast neutral chrome | Badge contrast meets WCAG AA standards. |
| **U10** | Monorepo purity boundaries | `svelte-check` 0 errors, 0 warnings. |
| **C14** | Surface completeness & dialog scoping | Controls live within `ShellSurface` and existing drawer containers. |
| **L8** | Single-header speaker layout | TurnRow renders `[{name}]` exact match; badge is a clean sibling element. |

---

## 6. Summary Table: FormaTavern vs. SillyTavern

| Feature | SillyTavern | FormaTavern Phase A | FormaTavern Phase B (Shipped) |
|---|---|---|---|
| **Core Paradigm** | 1-on-1 Chatbot | Hybrid Narrative Client | **Collaborative Narrative Studio** |
| **Multi-Voice Envelope** | No (flat prose only) | Yes (`directive`, `xml`, `prefix`) | Yes (`directive`, `xml`, `prefix`) |
| **Agency Muzzle** | Hardcoded in prompts | Consolidated in Block 1 Preamble | **Configurable Policy** (`prohibited` vs `allowed`) |
| **Stop Sequences** | Hardcoded user name | Static persona stops | **Dynamic Stops** (cleared when co-authoring) |
| **Streaming Abort** | N/A | Static agency regex | **Policy-Aware Abort** (bypassed when co-authoring) |
| **Parser Truncation** | Regex replace scripts | Truncates on persona | **Preserves Persona Segments** with `allowPersona` |
| **Preamble UX** | Monolithic text field | Transparent with "Edit" & "Reset" | Transparent with "Edit", "Reset" & Co-Author Default |
| **Visual Transparency** | None (opaque text) | Standard bubbles | **"Co-authored" badge** on AI-spoken persona lines |
