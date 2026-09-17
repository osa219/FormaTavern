# Narrative Grammar, Prompt Architecture, and Dialect Overhaul — Architectural Proposal

**Status:** Proposed Architecture & Review Specification (Ready for Review Agent)  
**Date:** 2026-09-17 UTC  
**Scope:** Backend Prompt Builder (Blocks `1` and `1b`), The Co-Author Paradigm vs. Chatbot Dogma, Narrative Dialect Grammar (`directive`, `xml`, `prefix`), Few-Shot Structural Templates, Optional User Agency, Envelope Parser Persona Handling, Settings UI Conditional Exposure, and SillyTavern Comparative Analysis.  
**Primary References:**
- Source Code:
  - [`backend/src/prompt/blocks.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/prompt/blocks.ts) (Block 1, 1b, 7b, 9c)
  - [`backend/src/prompt/templates.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/prompt/templates.ts) (Syntax examples, validation, rendering)
  - [`backend/src/prompt/builder.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/prompt/builder.ts) (System prompt assembly and budget fitting)
  - [`packages/shared/src/envelope/index.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/envelope/index.ts) (Envelope parsing and persona truncation)
  - [`frontend/src/lib/components/settings/SettingsSheet.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/settings/SettingsSheet.svelte) (Narrative settings tab)
  - [`backend/test/prompt/__golden__/eldrin-narrative-directive.txt`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/test/prompt/__golden__/eldrin-narrative-directive.txt) (Golden prompt reference)
- Benchmark Codebase:
  - SillyTavern (`S:\WorkSpace\Git Workspace\SillyTavern`)

---

## §1 — Executive Summary & The Co-Author Paradigm

FormaTavern's foundational differentiator in generative AI storytelling is its **Single-Request Narrative Envelope protocol**: in a single generation stream, an LLM emits scene narration, primary character dialogue, multi-NPC interactions, and dynamic scene state updates (mood, location, inventory), which the parser unpacks into reactive UI components (speech bubbles, narrator prose blocks, and live state sheets).

### The Core Philosophy: Co-Authoring vs. The "Chatbot" Dogma
Most contemporary roleplay interfaces (Character.AI, early Tavern forks, JanitorAI) are built around an adversarial **"Player vs. NPC" chatbot paradigm**:
- The human is strictly the "Player Character" (PC).
- The AI is an answering machine locked into a single character's skull.
- Any AI contribution toward the player's persona is branded as "godmoding" or "loss of agency" and treated as a critical failure.
- Consequently, engines inject aggressive negative muzzles (*"Never speak for {{user}}! Stop and wait!"*) and censor output.

**FormaTavern rejects this dogma.** FormaTavern is fundamentally a **Collaborative Narrative Studio / Living Manuscript**:
- The human is the **Lead Author and Director**.
- The AI is an **expressive Co-Author in the writer's room**.
- In collaborative fiction, a writer often *wants* their co-author to advance the scene, describe how the protagonist reacts, propose emotional friction, or carry the narrative momentum forward when the writer wants to be surprised.
- Restricting an LLM from speaking for {{user}} is **a subjective creative preference**, NOT a universal engine law. Forcing it universally cripples the model's creative versatility.

### Current Architectural Problems
An in-depth audit of the prompt architecture and dialect instruction system reveals four critical deficiencies:
1. **Internal Code Leaks into LLM Context:** Block `1b` outputs software enum names like `[Narrative Mode: xml]` and abstract programming terms like `Use XML tags (<kind name="name"> ... </kind>)`.
2. **Thematic Bleed in the Few-Shot Template:** The hardcoded default example (`"The morning mist clears over the valley... scouts spot us..."`) primes models with medieval/fantasy scouting tropes in non-fantasy genres, while the placeholder name `"Side character"` causes weaker models to literally spawn an NPC named `"Side character"`.
3. **Hardcoded Agency Muzzle & Aggressive Parser Truncation:** The agency constraint (*"Never write dialogue, thoughts, feelings, or actions for {{user}}..."*) was hardcoded into Block `1b`. Worse, the envelope parser (`packages/shared/src/envelope/index.ts:115-136`) actively **chops off and deletes** model text if it detects the model writing for the persona (`truncatedAt = 'persona'`), despite `SegmentKind` already defining `'persona'` as a legitimate first-class voice!
4. **Settings UI Exposure Disconnect & Preamble Opacity:** In `SettingsSheet.svelte`, choosing `Classic Roleplay` still displays envelope dialect controls. Furthermore, the global preamble initializes as a blank textarea with no visible default text and no "Reset to default" button.

This proposal overhauls Block `1b`, isolates response format from roleplay instructions, embraces the Co-Author paradigm, and establishes full UI transparency.

---

## §2 — Comparative Analysis: FormaTavern vs. SillyTavern

| Dimension | SillyTavern (`S:\WorkSpace\Git Workspace\SillyTavern`) | FormaTavern (Current) | FormaTavern (Co-Author Vision) |
|---|---|---|---|
| **Core Paradigm** | 1-on-1 Chatbot. AI is strictly an NPC sparring partner. | Hybrid. Multi-track envelope constrained by chatbot muzzles. | **Collaborative Narrative Studio**. Lead Author & AI Co-Author. |
| **Turn Paradigm** | Single-voice flat prose. Only `{{char}}` speaks in a given response. | Multi-track envelope: Narrator, `{{char}}`, NPCs, and State in one turn. | Multi-track envelope (`narrative`) OR flat prose (`classic`). |
| **Persona Voice (`{{user}}`)** | Hard-prohibited by convention and Main Prompt templates. | Hard-prohibited in 1b and **actively deleted** by the parser. | **Creator Choice**. Allowed by default; agency is an optional prompt directive. |
| **Group / NPC Chats** | Sequential multi-request round-robin: N characters require N separate LLM API calls. | Single-turn concurrent multi-voice: one generation request can interleave multiple speakers. | Preserved single-request multi-voice with cleaner tag definitions. |
| **Prompt Architecture** | Monolithic prompt builder with Main Prompt, Jailbreak, World Info, and Persona. | Segmented canonical blocks (`1`, `1b`, `1c`, `2`–`7`, `8`, `9a`–`9c`). | Segmented canonical blocks with strict separation of format vs. instructions. |
| **Format Instructions** | None by default (or user-defined regex macros). | Hardcoded internal enums (`[Narrative Mode: ${dialect}]`). | Natural, authoritative `[Response Format]` instructions. |
| **Few-Shot Examples** | Example dialogues (`<START>\n{{user}}: ...\n{{char}}: ...`). | Fixed 3-segment narrative example (`narrator`, `char`, `npc`, `state`). | Clean, genre-neutral 1-on-1 action/speech template with complete state keys. |

### Architectural Insight on Dialect Completeness: Do We Need a 4th Mode?
SillyTavern's standard roleplay output is purely raw, unenveloped markdown prose. In FormaTavern, this is already represented by `classic` mode. 

FormaTavern's multi-voice modes span three dialects:
1. `prefix`: Screenplay style (`Narrator: ...`, `Alice: ...`). Zero closing tags, lowest token overhead, easiest for small models.
2. `xml`: Semantic tags (`<narrator>`, `<character name="...">`, `<state>`). Highly structured, ideal for frontier models (Claude 3.5 Sonnet, GPT-4o).
3. `directive`: Markdown container blocks (`:::narrator`, `:::character[...]`). Human-readable, native markdown compatibility.

**Conclusion:** We do **not** need a 4th narrative mode. The four modes (`classic`, `prefix`, `xml`, `directive`) form a complete spectrum from raw prose to lightweight script to rigid semantic markup. The issue is purely prompt clarity, naming, and example design.

---

## §3 — Inventory of Current Deficiencies

### 1. Leaking Software Enums into LLM Context
In `backend/src/prompt/blocks.ts:71`:
```typescript
const content = [
  `[Narrative Mode: ${dialect}]`,
  syntaxDesc,
  'One turn may contain narrator, {{char}}, and side characters.',
  example,
  ...
```
- **Problem:** Emitting `[Narrative Mode: xml]` or `[Narrative Mode: directive]` treats the LLM as an application process rather than a creative co-author. 
- **LLM Impact:** LLMs frequently imitate this heading, outputting `[Narrative Mode: xml]` in their thoughts or before their first tag.

### 2. Cryptic & Incorrect Tag Descriptions
In `backend/src/prompt/blocks.ts:38-43`:
```typescript
let syntaxDesc = 'Use the directive block syntax (:::kind[name] ... :::).';
if (dialect === 'xml') {
  syntaxDesc = 'Use XML tags (<kind name="name"> ... </kind>).';
} else if (dialect === 'prefix') {
  syntaxDesc = 'Use prefix speaker lines (Speaker: text).';
}
```
- **Problem:** In XML, `<kind name="name">` is an abstract internal schema representation, **not a valid tag**! The valid tags are `<narrator>`, `<character name="{{char}}">`, `<npc name="...">`, and `<state>`.
- **LLM Impact:** Small/local models (Llama-3-8B, Qwen-2.5) frequently output literal `<kind name="character">` or `<kind name="narrator">` because the instruction directly instructed them to do so!

### 3. Thematic Contamination & Collisions in the Default Example
In `backend/src/prompt/templates.ts:11-25`:
```text
:::narrator
The morning mist clears over the valley.
:::

:::character[{{char}}]
We should press on before the scouts spot us.
:::

:::npc[Side character]
The road ahead looks clear, for now.
:::

```state
{"mood":"calm"}
```
```
- **Thematic Bleed:** Mentions "morning mist", "valley", "scouts", "the road ahead". In modern urban, slice-of-life, sci-fi, or intimate horror chats, small models anchor on these fantasy scouting tropes.
- **Literal Placeholder Collision:** The NPC is named `"Side character"`. Open-source models regularly invent an actual person named `"Side character"` in the story.
- **Forced Multi-Party Dynamics:** The example forces 3 distinct speakers into every turn, causing the model to believe every single reply must introduce a third party even in private 1-on-1 chats.
- **State Schema Inconsistency:** Block `1b` tells the model: *"Include mood and scene in the state block."* Yet the example only provides `{"mood":"calm"}`, omitting `scene` completely. Models mirror the example and drop `scene`.

### 4. Flawed Engine Dogma: Hardcoded Agency & Aggressive Parser Censorship
In `backend/src/prompt/blocks.ts:76`:
```typescript
AGENCY_CLAUSE = 'Never write dialogue, thoughts, feelings, or actions for {{user}}. Stop and yield when {{user}} must react or decide.';
```
And in `packages/shared/src/envelope/index.ts:115-136`:
```typescript
if (userMacroOrNamePattern.test(line)) {
  cutIndex = i;
  truncatedAt = 'persona';
  // Amputates the response!
}
```
- **Philosophical Error:** Assuming that the model must *never* write for {{user}} violates the Co-Author paradigm. In collaborative screenwriting, the AI frequently contributes lines or reactions for the protagonist to keep the creative momentum flowing.
- **Engine Bug:** The envelope schema in `packages/shared/src/envelope/types.ts` explicitly supports `'persona'` as a first-class segment kind (`export type SegmentKind = 'narrator' | 'character' | 'persona' | 'npc'`), yet the parser aggressively chops off generations if this voice is used!
- **Resolution:** Agency is an **authoring preference**, not an immutable engine law. The engine should not censor persona speech by default, and Block `1b` must focus strictly on **Response Format & Grammar**.

### 5. Settings UI Disconnect
In `frontend/src/lib/components/settings/SettingsSheet.svelte:1055-1180`:
- When a user selects `Classic Roleplay (Unenveloped prose)` as their Default Narrative Mode, the sheet continues to show `Envelope Grammar Dialect` and the full `Narrative instruction template (advanced)` editor.
- This creates UI cognitive noise: users configuring a classic roleplay client are confronted with directive syntax examples and dialect options that do not apply to their mode.

### 6. Block 1 Preamble Opacity & Missing "Reset to Default"
In `SettingsSheet.svelte:1104-1116`:
- The Global System Preamble textarea currently initializes **completely blank** with a vague placeholder (`"Optional guidance injected into Block 1 of the prompt..."`).
- **Opaque Default:** The actual built-in prompt (`PREAMBLE_DEFAULT`) is never shown to the user. A user who wants to slightly adjust the tone or add one writing guideline cannot see what they are starting from.
- **No Reset Button:** Unlike the narrative template editor below it (which provides a `"Reset to default"` button and a `"customized"` badge), the preamble textarea has **no reset mechanism** and **no customized badge**.

---

## §4 — Proposed Architecture & Specifications

### 4.1. Separation of Concerns: Block 1 vs. Block 1b

```
+-----------------------------------------------------------------------------+
| BLOCK 1: Universal Co-Author Foundation (Applies to BOTH Classic & Narrative) |
| - High-Fidelity Creative Writing & Roleplay Partner                         |
| - World, Lore, and Character Fidelity                                       |
| - Fully transparent & editable in UI with a "Reset to default" button       |
| - Zero negative muzzles; user agency instructions are optional/creator-owned|
+-----------------------------------------------------------------------------+
                                       |
                                       v
+-----------------------------------------------------------------------------+
| BLOCK 1b: Response Format & Grammar (Strictly NARRATIVE mode only)          |
| - Header: [Response Format]                                                 |
| - Tag / Grammar Specification (Concrete, no abstract <kind> jargon)         |
| - Clean, Genre-Neutral 1-on-1 Structural Template                           |
| - State Schema Specification (mood, scene, custom schema fields)            |
| - Strictly format only — no behavioral lecturing or agency rules           |
+-----------------------------------------------------------------------------+
```

### 4.2. Block 1 (Global Preamble & UI Transparency)

#### A. Backend Default Definition
The default preamble in `backend/src/prompt/templates.ts` is updated to embody the Co-Author philosophy:

```typescript
export const PREAMBLE_DEFAULT =
  'You are an expert creative writing and roleplay partner. Maintain deep fidelity to the world, character motivations, and established lore, crafting vivid, engaging, and reactive prose.';
```
*(Notice: No negative muzzles. If a creator or player wants strict 1st-person sparring where the AI never touches {{user}}, they can add that instruction to their custom preamble, Character Card, or Standing Direction).*

#### B. First-Class UI Transparency & "Reset to Default"
To eliminate prompt opacity and empower creator customization, the Preamble in `SettingsSheet.svelte` must match the UX polish of the template editor:
1. **Expose `preambleDefault` via API:** `GET /api/settings` returns `preambleDefault: PREAMBLE_DEFAULT` alongside `preamble` (stored override).
2. **Transparent Editor State:** The textarea displays the effective preamble (either the user's custom override or the built-in default text as placeholder/draft).
3. **"Customized" Badge:** When `s.preamble !== null` and differs from default, a small accent badge appears indicating that a custom preamble is active.
4. **"Reset to Default" Button:** An explicit button allowing the creator to clear their override (`patch({ preamble: null })`) and instantly restore the canonical baseline.

---

### 4.3. Block 1b Overhaul: Concrete Grammar per Dialect

Block 1b focuses **strictly and exclusively on Response Format**:

#### A. XML Tag Dialect (`dialect === 'xml'`)
```markdown
[Response Format]
Structure your response using XML tags:
- <narrator> ... </narrator> for scene description, environment, and physical actions.
- <character name="{{char}}"> ... </character> for {{char}}'s spoken dialogue and thoughts.
- <npc name="..."> ... </npc> when a side character speaks or acts (use their actual name).
- <state> ... </state> at the very end with current mood and scene as JSON.

Example structure:
<narrator>
{{char}} glances up from their work, noticing your arrival.
</narrator>

<character name="{{char}}">
"I wasn't expecting you yet, but I'm glad you're here."
</character>

<state>
{"mood": "curious", "scene": "quiet room"}
</state>

The example above teaches format only. Draw all characters, settings, and dialogue from the ongoing story.
End every reply with a state block exactly as shown above.
State schema fields:
...
```

#### B. Directive Block Dialect (`dialect === 'directive'`)
```markdown
[Response Format]
Structure your response using directive blocks:
- :::narrator ... ::: for scene description, environment, and physical actions.
- :::character[{{char}}] ... ::: for {{char}}'s spoken dialogue and thoughts.
- :::npc[Name] ... ::: when a side character speaks or acts (use their actual name).
- ```state ... ``` at the very end with current mood and scene as JSON.

Example structure:
:::narrator
{{char}} glances up from their work, noticing your arrival.
:::

:::character[{{char}}]
"I wasn't expecting you yet, but I'm glad you're here."
:::

```state
{"mood": "curious", "scene": "quiet room"}
```

The example above teaches format only. Draw all characters, settings, and dialogue from the ongoing story.
End every reply with a state block exactly as shown above.
State schema fields:
...
```

#### C. Prefix Dialect (`dialect === 'prefix'`)
```markdown
[Response Format]
Structure your response using speaker prefix lines:
- Narrator: ... for scene description, environment, and physical actions.
- {{char}}: ... for {{char}}'s spoken dialogue and thoughts.
- Name: ... when a side character speaks or acts (use their actual name).
- ```state ... ``` at the very end with current mood and scene as JSON.

Example structure:
Narrator: {{char}} glances up from their work, noticing your arrival.

{{char}}: "I wasn't expecting you yet, but I'm glad you're here."

```state
{"mood": "curious", "scene": "quiet room"}
```

The example above teaches format only. Draw all characters, settings, and dialogue from the ongoing story.
End every reply with a state block exactly as shown above.
State schema fields:
...
```

---

### 4.4. The New Canonical Default Template
The built-in canonical example (authored once in `directive` and rendered into `xml` and `prefix` via `renderExampleForDialect`) is updated to:

```text
:::narrator
{{char}} glances up from their work, noticing your arrival.
:::

:::character[{{char}}]
"I wasn't expecting you yet, but I'm glad you're here."
:::

```state
{"mood": "curious", "scene": "quiet room"}
```
```

#### Key Improvements of This Template:
1. **Zero Genre Contamination:** Does not mention valleys, morning mist, scouts, horses, or swords. Works seamlessly in high fantasy, a coffee shop, a police station, or an orbital station.
2. **Eliminates the "Side character" Trap:** Avoids introducing an artificial NPC into 1-on-1 dialogue, preventing models from feeling obligated to hallucinate a third party.
3. **Full State Alignment:** Includes both `"mood"` and `"scene"`, directly matching the written state instructions.
4. **Natural Turn Pacing:** Accurately models the most common high-quality roleplay turn: situational narration followed by dialogue.

---

### 4.5. Parser & Agency Alignment (Collaborative Script Support)
- **Parser Persona Handling:** In `packages/shared/src/envelope/index.ts`, the hardcoded truncation (`truncatedAt = 'persona'`) should be relaxed or governed by an optional `strictAgency` configuration. When the model co-authors and voices a scene including the persona, the envelope parser should parse it into a `{ kind: 'persona', text }` segment instead of amputating the response.
- **Template Validation:** In `backend/src/prompt/templates.ts`, remove the check that rejects custom templates containing persona segments.

---

### 4.6. Settings UI Conditional Visibility (`SettingsSheet.svelte`)

In `frontend/src/lib/components/settings/SettingsSheet.svelte`, under the `narrative` tab:
1. If `s.narrative.defaultMode === 'classic'`:
   - Hide the `Envelope Grammar Dialect` selector.
   - Hide the `Narrative instruction template (advanced)` collapsible accordion.
   - Display a clean informational note:
     > *"Classic Roleplay mode outputs standard prose without narrative envelope tags or state blocks. Envelope dialects and instruction templates apply when Three-Track Narrative Envelope is enabled."*
2. If `s.narrative.defaultMode === 'narrative'`:
   - Show `Envelope Grammar Dialect` and the template editor as normal.

---

## §5 — Implementation & Migration Plan

### Step 1: Shared & Backend Templates Update
- In [`backend/src/prompt/templates.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/prompt/templates.ts):
  - Update `PREAMBLE_DEFAULT` to the Co-Author foundation (removing negative muzzles).
  - Update `DIRECTIVE_SYNTAX_EXAMPLE`, `XML_SYNTAX_EXAMPLE`, and `PREFIX_SYNTAX_EXAMPLE` to the new genre-neutral 1-on-1 template.
  - Relax `validateNarrativeExample` to allow collaborative templates while retaining strict schema fences.
- In [`backend/src/routes/settings.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/routes/settings.ts) and [`packages/shared/src/schemas/settings.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/packages/shared/src/schemas/settings.ts):
  - Expose `preambleDefault: PREAMBLE_DEFAULT` in `SettingsView` so the frontend knows the canonical baseline.

### Step 2: Prompt Builder Block 1b Refactor
- In [`backend/src/prompt/blocks.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/src/prompt/blocks.ts):
  - Replace `[Narrative Mode: ${dialect}]` with `[Response Format]`.
  - Replace `syntaxDesc` with explicit, concrete tag/prefix guidelines per dialect.
  - Remove `AGENCY_CLAUSE` from Block `1b` assembly (format only).
  - Assemble: `[Response Format]`, tag guidelines, `example`, disclaimer, state instructions.

### Step 3: Frontend Settings UI Update
- In [`frontend/src/lib/components/settings/SettingsSheet.svelte`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/frontend/src/lib/components/settings/SettingsSheet.svelte):
  - **Preamble Editor Polish:** Display the default preamble text, show a `"customized"` badge when overridden, and provide an explicit `"Reset to default"` button that patches `{ preamble: null }`.
  - **Conditional Narrative Controls:** Wrap dialect selection and template accordion in an `{#if s.narrative.defaultMode === 'narrative'}` block.
  - Provide clear helper text when `classic` mode is active.

### Step 4: Golden Prompt Tests & Unit Test Updates
- Update [`backend/test/prompt/__golden__/eldrin-narrative-directive.txt`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/test/prompt/__golden__/eldrin-narrative-directive.txt) to reflect the new `[Response Format]` header, concrete syntax definitions, and clean template.
- Update unit tests in [`backend/test/prompt/builder.test.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/test/prompt/builder.test.ts) and [`backend/test/prompt/templates.test.ts`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/backend/test/prompt/templates.test.ts).
- Run `bun run test` and `bun run typecheck` across all monorepo workspaces.

---

## §6 — Invariant & Boundary Checklist

| Invariant | Status | Verification Detail |
|---|---|---|
| **E1 (Pure Envelope Parser)** | Preserved | Parser grammar in `@formatavern/shared` remains pure; persona segments supported natively. |
| **E2 (Raw Prose Fallback)** | Preserved | Classic mode outputs raw prose; parser treats as `character[primary]`. |
| **E6 (Deterministic Prompt)** | Preserved | `buildPrompt` remains a pure, deterministic function of `PromptContext`. |
| **I5 (Shared Isomorphism)** | Preserved | No node/bun imports introduced in shared domain or prompt contracts. |
| **I6 / S7 (Purity Boundaries)** | Preserved | `app.ts` and contracts remain strictly free of `Bun.*` or `Database` types. |
| **S1 (Disconnect Immunity)** | Preserved | Generation hub lifecycle is untouched. |
| **Co-Author Philosophy** | **Established** | Engine treats the LLM as an uninhibited writing partner; agency rules are creator preferences. |

---

## §7 — Reviewer Sign-off & Recommendation

This proposal eliminates internal software jargon from prompt contexts, protects against thematic contamination across roleplay genres, replaces chatbot dogma with the empowering Co-Author paradigm, and declutters the user settings interface. 

It is recommended for adoption and ready for review agent sign-off.
