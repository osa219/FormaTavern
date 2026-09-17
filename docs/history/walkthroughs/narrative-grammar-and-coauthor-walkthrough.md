# Narrative Grammar, Dialect Overhaul, and The Co-Author Paradigm Walkthrough

As-built engineering record and architectural roadmap for [`docs/history/reports/narrative-grammar-and-dialect-overhaul-proposal.md`](../reports/narrative-grammar-and-dialect-overhaul-proposal.md).

- **Phase A (As-Built):** Response format isolation, concrete per-dialect grammar instructions, neutral 1-on-1 template, global preamble transparency, and conditional classic settings. Committed in `f2b7f5e`.
- **Phase B (Architecture & Roadmap):** Comprehensive design for Co-Authoring and Persona Voicing across all four enforcement layers of the engine.

---

## 1. Context & Motivation

FormaTavern's core technical differentiator is its **Single-Request Narrative Envelope protocol**: within one generation stream, an LLM emits scene narration, character dialogue, multi-NPC interactions, and dynamic scene state updates (mood, location, inventory). The parser unpacks these into reactive UI components: distinct speech bubbles, narrator prose blocks, and live state sheets.

### The Problem Space
Prior to this overhaul, an audit of the prompt architecture revealed four friction points:
1. **Internal Code Leaks:** Block `1b` injected internal software enum names (`[Narrative Mode: ${dialect}]`) and abstract schema jargon (`Use XML tags (<kind name="name"> ... </kind>)`) into the LLM context. Models frequently echoed these headers or emitted literal `<kind>` tags.
2. **Thematic Bleed in Default Templates:** The hardcoded syntax example (`"The morning mist clears over the valley... scouts spot us..."`) primed models with medieval/fantasy scouting tropes across non-fantasy chats. Furthermore, using `"Side character"` as a name placeholder caused open-source models to hallucinate an actual character named `"Side character"`.
3. **Instruction Confusion & State Mismatch:** Block `1b` instructed the model to include `mood` and `scene` in the state block, but the example provided only `{"mood":"calm"}`. Small models mimicked the example and dropped `scene`.
4. **Settings UI Opacity & Clutter:** The global system preamble textarea was blank with no indication of what the built-in prompt was, and offered no reset button. Meanwhile, selecting Classic Roleplay mode continued to display dialect selectors and narrative template accordions that had no effect on flat prose.

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

### 2.2. Verification & Test Integrity

- **Test Suites:** `bun run test` passes **275/275 tests** across 36 files (shared, backend, frontend unit).
- **Type Checking:** `bun run typecheck` produces **0 errors and 0 warnings** across all three packages (`shared`, `backend`, `frontend`).
- **Database Integrity:** `bun run db:check` passes all audits:
  - WAL journal mode active
  - Foreign keys enabled (`foreign_keys = 1`)
  - `user_version = 8`
  - FTS5 full-text search parity ok (3/3)
  - Zero orphan tags, valid character and persona records.

---

### 2.3. Key Insights from Phase A

1. **Separation of Concerns:**
   Block 1b is responsible exclusively for syntax boundaries. Injecting behavioral constraints (*"Never speak for {{user}}"*) into Block 1b conflated grammar with personality/behavior and duplicated constraints already present in character cards.
2. **The Classic Mode Agency Gap:**
   In Classic mode, Block 1b is omitted by design (`if (mode !== 'narrative') return null;`). When the agency clause lived inside Block 1b, Classic chats had *zero* agency protection. Moving agency to Block 1 (`PREAMBLE_DEFAULT`) restored protection to Classic mode without polluting Block 1b.
3. **Prompt Cache Friendliness:**
   Because Block 1b no longer changes based on behavioral nuances, the prefix remains stable across chats that share the same dialect, improving KV-cache utilization on modern LLM providers.

---

## 3. Phase B: The Co-Author Paradigm & Persona Voicing (Architecture & Plan)

Phase B expands FormaTavern from a strict 1st-person sparring client into a flexible **Collaborative Writing Studio**, giving creators and users full control over whether the AI can co-author lines and actions for the user's persona.

### 3.1. The Quadruple Agency Gate

In the current codebase, user agency is enforced across four separate, defense-in-depth layers:

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

Simply editing the prompt is insufficient: if the prompt allows the model to speak for `{{user}}`, the provider stop sequence cuts off the stream, the streaming monitor aborts the job, or the parser chops off the text.

Phase B coordinates all four layers behind an explicit, creator-controlled setting.

---

### 3.2. Architecture & Design Specification

#### A. Configuration Schema (`packages/shared/src/schemas/`)
Add a new setting to `AppSettingsSchema` (and optionally per-chat or per-character metadata):

```typescript
export const PersonaVoicingPolicy = Type.Union([
  Type.Literal('prohibited'), // Traditional strict 1st-person: AI never speaks for {{user}}
  Type.Literal('allowed'),    // Co-Author mode: AI may advance the scene or speak for {{user}} when narrative flow calls for it
  Type.Literal('encouraged')  // Collaborative writing: AI actively contributes to both sides of dialogue
]);
export type PersonaVoicingPolicy = Static<typeof PersonaVoicingPolicy>;
```
- **Default:** `'prohibited'` (maintains 100% backward compatibility with existing expectations).
- **Inheritance:** `chat.metadata.personaVoicing ?? character.metadata.personaVoicing ?? settings.personaVoicing ?? 'prohibited'`.

#### B. Layer 1: Prompt Assembly (`backend/src/prompt/`)
- In `backend/src/prompt/builder.ts`, evaluate the active `personaVoicing` policy:
  - If `'prohibited'`: inject `AGENCY_CLAUSE` into Block 1 (or retain the negative constraint in `PREAMBLE_DEFAULT`).
  - If `'allowed'` or `'encouraged'`: omit the negative muzzle and optionally inject collaborative co-author guidelines:
    > *"You are a collaborative co-author. While {{user}} is the lead director, you may describe {{user}}'s reactions, physical presence, or dialogue when it propels the scene forward, using the `<persona>` / `:::persona` tag."*
- In `backend/src/prompt/blocks.ts` (Block 1b):
  - When `personaVoicing !== 'prohibited'`, add the persona tag to the dialect instruction list:
    - Directive: `- :::persona[{{user}}] ... ::: for {{user}}'s spoken dialogue and actions.`
    - XML: `- <persona name="{{user}}"> ... </persona> for {{user}}'s spoken dialogue and actions.`
    - Prefix: `- {{user}}: ... for {{user}}'s spoken dialogue and actions.`

#### C. Layer 2: Provider Stop Sequences (`packages/shared/src/text/stop.ts`)
- Update `buildStopSequences(dialect, personaVoicing)`:
  - When `personaVoicing === 'prohibited'`: include `':::persona'`, `'<persona'`, `\nPersona:`, and `\n{{user}}:`.
  - When `personaVoicing !== 'prohibited'`: remove persona tokens from the stop list so the provider does not prematurely terminate the generation.

#### D. Layer 3: Streaming Monitor (`backend/src/engine/generation.ts`)
- In `runAgencyCheck(chunk, context)`:
  - If `context.personaVoicing === 'prohibited'`, continue monitoring for unauthorized persona tags and abort generation if detected.
  - If `context.personaVoicing !== 'prohibited'`, bypass agency abort logic, allowing the stream to proceed uninterrupted.

#### E. Layer 4: Envelope Parser (`packages/shared/src/envelope/index.ts`)
- In `parseEnvelope(text, options)`:
  - `options` receives `allowPersonaSegments: boolean`.
  - When `allowPersonaSegments: true`: the parser does **not** set `truncatedAt = 'persona'`. Instead, it extracts the segment as `{ kind: 'persona', name: speakerName, text: body }`.
  - The resulting `ParseResult` preserves the co-authored text in the message's `segments` array.

#### F. Layer 5: Frontend Presentation & Theming (`frontend/src/lib/components/chat/`)
- In `MessageTurn.svelte` and `MessageBubble.svelte`:
  - A segment with `kind: 'persona'` generated by the assistant is rendered with the persona layout (e.g., right-aligned or persona accent colors), but with a subtle **"Co-authored"** indicator or style token to preserve transparency.
  - The author can edit or rewrite the co-authored segment inline using the Phase A pencil editor.

---

### 3.3. Phase B Implementation Roadmap

| Step | Area | Description | Invariants Preserved |
|---|---|---|---|
| **B1** | `packages/shared` | Define `PersonaVoicingPolicy` in settings schema; update `buildStopSequences` and `parseEnvelope` options. | I1, I5, E1, E3 |
| **B2** | `backend/prompt` | Thread `personaVoicing` into `PromptContext`; conditionally assemble Block 1 preamble and Block 1b syntax descriptions. | E6, E8 |
| **B3** | `backend/engine` | Pass policy into `runAgencyCheck`; allow streaming persona segments when enabled. | S1, S2, S3 |
| **B4** | `backend/routes` | Support `personaVoicing` in settings routes and chat generation options. | S7, S8 |
| **B5** | `frontend/ui` | Add Co-Authoring / Persona Voicing toggle in Settings and Chat About drawer; render co-authored persona segments with theme compliance. | U1, U2, U8, C14 |
| **B6** | `test` | Automated unit and integration tests covering all 4 enforcement layers in both `prohibited` and `allowed` modes. | All |

---

## 4. Summary Table: FormaTavern vs. SillyTavern

| Feature | SillyTavern | FormaTavern Phase A (Current) | FormaTavern Phase B (Planned) |
|---|---|---|---|
| **Core Paradigm** | 1-on-1 Chatbot | Hybrid Narrative Client | **Collaborative Narrative Studio** |
| **Multi-Voice Envelope** | No (flat prose only) | Yes (`directive`, `xml`, `prefix`) | Yes (`directive`, `xml`, `prefix`) |
| **Agency Muzzle** | Hardcoded in prompts | Consolidated in Block 1 Preamble | **Configurable Policy** (`prohibited` / `allowed` / `encouraged`) |
| **Stop Sequences** | Hardcoded user name | Static persona stops | **Dynamic Stops** based on voicing policy |
| **Streaming Abort** | N/A | Static agency regex | **Policy-Aware Abort** |
| **Parser Truncation** | Regex replace scripts | Truncates on persona | **Preserves Persona Segments** when permitted |
| **Preamble UX** | Monolithic text field | Transparent with "Edit" & "Reset" | Transparent with "Edit", "Reset" & Co-Author Presets |
