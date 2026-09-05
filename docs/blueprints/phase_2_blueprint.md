# Phase 1 Review → Approved

All nine criteria met; the test list matches the normative set. Three notes, none blocking:

1. **`AbortSignal` in `types/llm.ts`.** You had to declare it because it isn't in the ES2022 lib. Keep it a *minimal structural* type (`{ readonly aborted: boolean; addEventListener(type: 'abort', cb: () => void, opts?: { once?: boolean }): void; removeEventListener(...): void }`) exported under a distinct name (e.g. `AbortSignalLike`) — never `declare global`. Both the browser's and Bun's real `AbortSignal` must satisfy it structurally; Phase 2 depends on that.
2. **"Monotonic ULIDs … down to the microsecond"** — precision nit: `monotonicFactory` increments the random component within the same millisecond; it doesn't add clock precision. The guarantee you need (strict ordering within one process) holds. Wording only.
3. **`HealthResponse.db` is now load-bearing** for the vertical slice; keep it stable through Phase 2 (only `sharedVersion` changes).

Proceed.

---

# FormaTavern — Phase 2 Blueprint: Core LLM Engine (Envelope Parser, Providers, Prompt Sandwich)

**Purpose:** Build the three pure engines every later phase drives: (a) the isomorphic **Narrative Envelope parser/serializer + state engine** in `shared`, (b) the **provider layer** (`MockLLMProvider`, `OpenRouterProvider`) emitting a normalized, contract-tested `StreamEvent` stream, and (c) the **`PromptBuilder`** that compiles a `CharacterCard`, `Persona`, chat metadata, and history into an `LLMRequest`. None of this touches SQLite. The vertical slice stays alive: `/api/chat/test-stream` is re-plumbed onto the mock provider, and the browser page runs the shared parser on the live stream — proving isomorphism and the provider→SSE pipe in one motion.

**New dependencies:** `jsonrepair` (shared), `gpt-tokenizer` (backend). Nothing else. **Not in this phase:** a settings repository / stored API keys (the live OpenRouter smoke reads `OPENROUTER_API_KEY` from env; persistence of keys is Phase 3 alongside the settings endpoint).

---

## 1. Invariants for this phase

| # | Invariant | Enforced by |
|---|---|---|
| E1 | `parseEnvelope` is a **pure function of the full string**. No module-level state, no incremental parse objects. `parse(concat(chunks)) ≡ parse(full)` for any chunking. | `properties.test.ts` (seeded random splits) |
| E2 | Any output with no recognized markers parses to `[{ kind:'character', name: primary, text }]` (superset invariant). Raw prose is never an error. | `parser.test.ts` |
| E3 | `parse(serialize(segments, patch)) ≡ { segments, patch }` for **normalized** segments, in all three dialects. | `properties.test.ts` |
| E4 | In streaming mode, no partial marker ever appears in rendered segment text, for **every prefix** of every fixture. | `properties.test.ts` ("no leaked marker") |
| E5 | Every provider stream ends with **exactly one terminal event** (`done` or `error`), emits nothing after it, never throws out of the iterator, and reacts to abort within one tick. | `contract.test.ts` over every mock script and the fake-fetch OpenRouter runs |
| E6 | The `PromptBuilder` is pure: `(PromptContext) → BuiltPrompt`. No DB, no network, no clock. Same input → byte-identical output. | Golden-file test |
| E7 | `shared` stays isomorphic; `jsonrepair` is allowed (pure JS). `gpt-tokenizer` is **backend-only**. | `shared/tsconfig.json` |
| E8 | `app.ts` stays Bun/SQLite-free. Providers reach it only as the `LLMProvider` interface from `shared`. | `svelte-check` traversing `App` |

---

## 2. `@formatavern/shared` — Envelope, State Engine, Macros, Fixtures

### 2.1 Layout additions

```
packages/shared/src/
├── index.ts                    # SHARED_VERSION = '0.2.0-phase2'
├── envelope/
│   ├── index.ts                # parseEnvelope, serializeSegments, stripOutOfBand, PARSER_VERSION = 1
│   ├── types.ts                # ParseOptions, ParseResult, ParseWarning, Dialect
│   ├── grammar.ts              # header/closer/fence regexes per dialect + classifyLine()
│   ├── outOfBand.ts            # extractReasoning(), extractStateBlock()
│   └── holdback.ts             # computeHoldBack()
├── state/
│   └── engine.ts               # defaultState(), resolveState()
├── text/
│   ├── macros.ts               # applyMacros()
│   └── stop.ts                 # buildStopSequences()
├── fixtures/
│   ├── stream.ts               # (renamed from fixtures.ts) TEST_STREAM_* — keep exports
│   └── envelope.ts             # ENVELOPE_SCRIPTS: scripts + adversarial chunkings + expectations
└── schemas/narrative.ts        # Amendment A3: npcs[k].voice?: string
```
`package.json`: add `"jsonrepair": "^3.8"`. Bump `SHARED_VERSION`.

### 2.2 Parser contract (`envelope/types.ts`)

```ts
export type Dialect = 'directive' | 'xml' | 'prefix';

export interface ParseOptions {
  primaryCharacter: string;          // name for unlabelled / default-character text
  dialect?: Dialect | 'auto';        // default 'auto' — see prefix gating below
  knownNames?: string[];             // prefix dialect: names allowed to open speaker lines (case-insensitive)
  personaName?: string;              // enables the "<Persona>:" agency rule; regex-escaped internally
  allowPersona?: boolean;            // default false: persona/user headers TRUNCATE. true: yield persona segments (user-authored rows)
  streaming?: boolean;               // default false: apply hold-back and withhold open out-of-band blocks
}

export type ParseWarningCode =
  | 'mixed_dialects' | 'state_unclosed' | 'state_unparseable' | 'state_repaired' | 'state_not_object'
  | 'multiple_state_blocks' | 'state_not_terminal' | 'npc_unnamed' | 'reasoning_unclosed'
  | 'empty_after_truncation' | 'header_name_ignored';
export interface ParseWarning { code: ParseWarningCode; line?: number; detail?: string; }

export interface ParseResult {
  segments: Segment[];               // normalized: trimmed, non-empty text, never adjacent-merged
  statePatch: StateVector | null;    // raw parsed object; NOT coerced against stateSchema (that is resolveState)
  reasoning: string | null;          // <think>…</think> content, stripped from segments
  truncatedAt: 'persona' | null;
  dialect: Dialect | 'none';         // detected, by first header seen
  adherent: boolean;                 // dialect !== 'none' && statePatch !== null && truncatedAt === null
  warnings: ParseWarning[];
  heldBack: string;                  // streaming only; '' otherwise. Suffix withheld from segments.
  parserVersion: number;             // PARSER_VERSION; Phase 3 stores it in messages.metadata.parse
}
```

### 2.3 Normative algorithm (`parseEnvelope`)

Order is normative; each step is a pure function of its input string.

1. **Normalize**: `\r\n|\r` → `\n`. Strip a leading UTF-8 BOM.
2. **Hold-back cut** (streaming only): `held = computeHoldBack(text, opts)`; `text = text.slice(0, text.length - held.length)`. (§2.5)
3. **Reasoning out**: remove `<think>…</think>` / `<thinking>` / `<reasoning>` (case-insensitive, first occurrence, may be multi-line). Unclosed in non-streaming → everything from the tag to EOF is reasoning + `reasoning_unclosed`. Reasoning is extracted *first* so a model deliberating about "Traveler:" cannot trigger agency truncation.
4. **Agency truncation** (unless `allowPersona`): find the first line that is (a) a directive/xml header of kind `persona|user`, or (b) `^\s*(?:\{\{user\}\}|<personaName>)\s*:` (persona name escaped, case-insensitive). Drop that line and everything after. Set `truncatedAt: 'persona'`. If nothing remains → `empty_after_truncation`. Truncation precedes state extraction on purpose: a state block emitted *after* the model started puppeteering the player is not trusted (the turn inherits state instead).
5. **State out**: extract state blocks (§2.4). Last closed one wins (`multiple_state_blocks` if >1). Unclosed at EOF (non-streaming) → `statePatch: null` + `state_unclosed`. Non-whitespace text *after* the winning block → `state_not_terminal` (text is kept and parsed).
6. **Line scan**: classify each remaining line as `header(kind,name,inlineBody)`, `closer`, or `body` (§2.4 grammar). A header opens a block and implicitly closes the previous one; closers are noise; EOF closes the last block. Text before the first header is a block of `character[primary]`.
7. **Segments**: for each block, text = lines joined by `\n`, then trimmed of leading/trailing blank lines and trailing whitespace per line — **not** internal blank lines (paragraphs). Drop blocks with empty text. `char` → `character`; `character` without name → `primaryCharacter`; `narrator` → no name; `npc` without name → `name: undefined` + `npc_unnamed`; `persona`/`user` (allowPersona) → `kind:'persona'`, name as given or `personaName`.
8. **Result**: `dialect` = dialect of the first header (or `'none'`); any header from a different dialect → `mixed_dialects`. `adherent` per the formula above.

### 2.4 Grammar (`envelope/grammar.ts`) — regexes are normative

**Directive header** (spec regex + lenience L4 for inline body after the bracket; `i` flag):
```
/^\s*:{3,}\s*(narrator|character|char|npc|persona|user)\b\s*(?:\[([^\]]*)\]\s*(.*)|[:\-–]?\s*(.*?))?\s*$/i
```
Groups: 1 kind · 2 bracket name · 3 inline body after bracket · 4 bare tail.
- **L1** `char` ≡ `character`. `\b` prevents `:::characters`, `:::characterization` from matching (both fail `\b`; backtracking to `char` also fails `\b`).
- **L2** Bracket form: name = g2 (trimmed; empty → default), inline body = g3 (becomes the first body line if non-empty).
- **L3** Bare tail g4: for `narrator` it is always inline body. For `character|npc|persona`, it is a **name** iff length ≤ 40 and it contains none of `. ! ? " *` — otherwise it is inline body and the name defaults. (`:::character Alice` → name Alice; `:::character Alice draws her sword.` → default name, body starts with that line.)
- **Directive closer**: `/^\s*:{3,}\s*$/` — noise. Any other `:::`-prefixed line that doesn't match the header regex is **body text**.

**XML header / closer** (`i` flag):
```
header: /^\s*<(narrator|character|char|npc|persona|user)(?:\s+name\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?\s*>\s*(.*)$/i
closer: /<\/(narrator|character|char|npc|persona|user)\s*>\s*$/i
```
Trailing text on the header line is inline body. A closer is removed whether it is on its own line or at the *end* of a body line (`<character name="Alice">Run!</character>` single-line form).

**Prefix speaker line**:
```
/^\s*([A-Za-z][A-Za-z0-9 .'’\-]{0,39}?)\s*:\s+(.*)$/
```
Recognized only when the name passes the gate:
- `dialect: 'auto'` (default): name ∈ `knownNames` (case-insensitive), or name is exactly `Narrator` (→ kind `narrator`).
- `dialect: 'prefix'` (explicit): as above, **or** name is Capitalized, ≤ 3 words, and not in the stoplist `{Note, Warning, Summary, Scene, State, OOC, System, Hint, Tip}` (enables NPC auto-registration on small models).
- Name equal to `primaryCharacter` → `character`; `Narrator` → `narrator`; otherwise `npc`. Continuation lines belong to the current speaker until the next speaker line. There is no closer.
This gating is what keeps E2 true: "Note: the door is locked." in classic mode is prose, not an NPC.

**State block** (three forms; the block body is the text between open and close):
```
fence open : /^\s*(`{3,}|~{3,})\s*(?:state|json\s*state|state\s*json)\s*$/i   (close: same fence char, /^\s*(`{3,}|~{3,})\s*$/)
xml        : <state> … </state>            (case-insensitive, multi-line)
comment    : <!--\s*state\b … -->
```
Body → `jsonrepair(body)` → `JSON.parse`. If repair changed the string → `state_repaired`. If either step throws → `state_unparseable`, patch `null`. If the result is not a plain object → `state_not_object`, `null`. Values are kept raw (strings, numbers, booleans, null); coercion is `resolveState`'s job.

**Not handled (documented non-goal):** headers inside generic (non-state) code fences are still recognized. Roleplay output does not contain code fences in practice; add fence-awareness only if a real regression demands it.

### 2.5 Streaming hold-back (`envelope/holdback.ts`)

`computeHoldBack(text, opts): string` returns the suffix to withhold. Rules, in order; first match wins:

1. An **open** `<think|thinking|reasoning>` with no closer → from the tag's line start to EOF.
2. An **open** state block (fence / `<state>` / `<!--state`) with no closer → from its opening line start to EOF. (State is out-of-band; a half-written JSON must never render.)
3. Otherwise consider only `L` = text after the last `\n`:
   - `/^\s*[:<`~]/.test(L)` → hold `L` (spec rule: potential delimiter).
   - Prefix dialect active (explicit, or `knownNames` non-empty): `L` is non-empty, contains no `:`, ≤ 40 chars, and is a case-insensitive prefix of some `knownName` or of `Narrator` → hold `L` (so "Ali" doesn't flash as prose before becoming `Alice:`).
   - Else hold nothing.

Consequences to accept: a prose line beginning with `` ` `` or `<` (inline code, a stray tag) is withheld until its newline arrives — this is the jitter the spec trades for correctness. The bound is one line except for open out-of-band blocks; a test asserts `heldBack.length ≤ lastLine.length` whenever no out-of-band block is open.

### 2.6 Serializer (`serializeSegments(segments, statePatch, dialect = 'directive'): string`)

Deterministic canonical forms; blocks joined by one blank line; no trailing newline; state block last (omitted when `statePatch` is `null`):

| Dialect | Block | State |
|---|---|---|
| `directive` | `:::narrator\n<text>\n:::` · `:::character[Name]\n<text>\n:::` · `:::npc[Name]\n…` (`:::npc` if unnamed) · `:::persona[Name]\n…` | ```` ```state\n<JSON>\n``` ```` |
| `xml` | `<narrator>\n<text>\n</narrator>` · `<character name="Name">\n…\n</character>` · `<npc name="…">` · `<persona name="…">` | `<state>\n<JSON>\n</state>` |
| `prefix` | `Narrator: <text>` · `Name: <text>` (persona → `Name: <text>`) | ```` ```state ```` fence |

`<JSON>` = `JSON.stringify(patch)` (compact, insertion order; round-trip equality is deep-equal, not string-equal). Character name is **always** emitted explicitly even when it equals the primary. Names containing `]` (directive) or `"` (xml) are serialized with those characters removed — such names are rejected upstream anyway.

**Normalized segments** (the domain on which E3 holds): text trimmed, non-empty, and no line of text matches any header/closer/fence regex of the *target* dialect; names free of `]`, `"`, `\n`. `serializeSegments` throws `RangeError` on non-normalized input (a segment whose text contains a line that would parse as a header) rather than silently producing an unstable document. `PATCH /api/messages/:id { segments }` in Phase 3 relies on this.

`stripOutOfBand(text): string` — removes reasoning and state blocks, returns the prose with fences intact. Used by the PromptBuilder for history (Block 8) and by `/continue`.

### 2.7 State engine (`state/engine.ts`)

```ts
export function defaultState(card: Pick<CharacterCard,'stateSchema'|'initialState'>): StateVector;
//   schema defaults ⊕ initialState (initialState passes through the same coercion; invalid entries dropped with warnings ignored here)

export interface ResolveResult { state: StateVector; source: 'patch' | 'inherited'; warnings: string[]; }
export function resolveState(previous: StateVector, patch: StateVector | null,
                             schema: Record<string, StateField> | undefined): ResolveResult;
```
Rules:
- `patch === null` → `{ state: {...previous}, source: 'inherited' }`.
- With a schema, each patch key: unknown → dropped (`unknown key`); `enum` → `String(v).trim().toLowerCase()` matched against `values` then `aliases` (alias keys lowercased) else dropped; `int` → number or numeric string → `Math.round`, clamped to `[min,max]` (warning if clamped), NaN dropped; `string` → `String(v)` truncated to 200 chars. `null`/`undefined` values → dropped with warning (no deletion semantics in v1).
- Without a schema (classic character): keep patch keys whose values are primitives (`string|number|boolean`); drop objects/arrays.
- Result = `Object.assign({}, previous, coercedPatch)`; missing keys carry forward (spec). `source: 'patch'` even if every key was dropped (the model *did* emit a block).
- Never throws.

### 2.8 Macros and stop sequences (`text/`)

```ts
export function applyMacros(text: string, vars: { char: string; user: string }): string;
// single pass; /\{\{\s*(char|user)\s*\}\}/gi; also legacy <BOT> and <USER> exact tokens.
// One pass by design: a persona literally named "{{char}}" is not supported and not guarded against.

export function buildStopSequences(dialect: Dialect | 'classic', personaName: string): string[];
// directive → [':::persona', ':::user', `\n${personaName}:`]
// xml       → ['<persona', '<user', `\n${personaName}:`]
// prefix / classic → [`\n${personaName}:`]
// Always ≤ 4 entries (OpenAI-family hard limit). personaName is used verbatim (no macro).
```

### 2.9 Fixtures (`fixtures/envelope.ts`) — normative script set

```ts
export interface EnvelopeScript {
  id: EnvelopeScriptId;
  primaryCharacter: string;
  knownNames?: string[];
  dialect: Dialect | 'auto';
  text: string;                       // must equal chunks.join('')
  chunks: readonly string[];          // adversarial boundaries (authoring rules below)
  terminal: { type: 'done'; finishReason: 'stop'|'length' } | { type: 'error'; message: string; recoverable: boolean };
  expect: {                           // drives table-driven parser tests AND mock-provider tests
    dialect: Dialect | 'none';
    segments: Array<{ kind: SegmentKind; name?: string; textStartsWith: string }>;
    statePatch: StateVector | null;
    truncatedAt: 'persona' | null;
    warningCodes: ParseWarningCode[]; // exact set (order-insensitive)
  };
}
export const ENVELOPE_SCRIPTS: Record<EnvelopeScriptId, EnvelopeScript>;
export const ENVELOPE_SCRIPT_IDS = Object.keys(ENVELOPE_SCRIPTS) as EnvelopeScriptId[];
```

| id | Content | Purpose |
|---|---|---|
| `envelope-directive` | The spec's Eldrin fixture (narrator → character[Eldrin the Mage] → npc[Apprentice] → state). Contains an em dash `—` and one non-BMP character (e.g. `✨` is BMP; use `🜁` or an emoji) in narrator prose. | Happy path; non-ASCII through the SSE pipe |
| `envelope-xml` | Alice / tavern ambush in xml, one single-line `<npc name="Guard">…</npc>` | XML forms |
| `envelope-prefix` | Same scene in prefix dialect, `knownNames: ['Alice','Guard Captain']`, includes a `Narrator:` line and a `Note: …` line inside Alice's speech (must remain her speech) | Prefix gating |
| `classic` | Three paragraphs of plain prose, a line starting with `Note:`, no markers, no state | E2 superset invariant |
| `sloppy` | `::: character Eldrin` (spaced, bare name), `::::npc[Guard]:`, no closers, header with inline body after bracket, state with trailing comma + unquoted value + single quotes | Lenience L1–L4, `state_repaired` |
| `persona-violation` | Character block, then `:::persona\n"I draw my sword."`, then a state block | Truncation; state dropped → `statePatch: null`, `truncatedAt:'persona'` |
| `truncated` | Envelope that ends mid-JSON inside an open ```` ```state ```` ; terminal `done{length}` | `state_unclosed`, inheritance path |
| `reasoning` | `<think>The user (Traveler:) wants…</think>` then a directive envelope | Reasoning-before-agency ordering |
| `error` | Two tokens then terminal `error{recoverable:false,message:'mock upstream failure'}` | Error path through SSE and UI |

**Chunk authoring rules** (each script's `chunks` must include at least one of each, where applicable): split inside a header keyword (`:::nar` | `rator`); inside `[name]`; between `\n` and `:::`; inside the fence (```` `` ```` | ```` ` ````); inside the word `state`; inside the JSON; mid-word; and, in `envelope-directive`, **between the two UTF-16 code units of the non-BMP character**. That last one works through our SSE pipe only because `JSON.stringify` escapes lone surrogates (`"\ud83d"`) since ES2019 — a test pins this (§7.2) so nobody "optimizes" the frame to raw text later. Byte-level mid-multibyte splitting is exercised at the OpenRouter adapter (§3.3), where bytes actually exist.

A guard test asserts `chunks.join('') === text` for every script.

---

## 3. Backend — Provider Layer (`backend/src/providers/`)

### 3.1 Layout

```
backend/src/providers/
├── index.ts          # createProviders(env): { mock: LLMProvider; openrouter?: LLMProvider }
├── mock.ts           # MockLLMProvider
├── openrouter.ts     # OpenRouterProvider
├── utils.ts          # coalesceConsecutiveRoles, abortableSleep, ensureUserFirst
└── sse.ts            # parseSseBytes(): async generator ReadableStream<Uint8Array> → { data: string }[] (line/frame buffering, shared by adapters)
backend/scripts/smoke-openrouter.ts
```

### 3.2 Stream contract (E5, normative for every provider)

For `for await (const ev of provider.generate(req, signal))`:
- **P1** The sequence ends with exactly one **terminal** event: `done` or `error`. In Phase 2 `error` is always terminal; `recoverable` is advice to the caller (retryable request), not a promise of more events.
- **P2** No event of any kind after the terminal event.
- **P3** The iterator never throws to the consumer. Network/parse failures become `error` events. (Consumer-side `break` is allowed; `finally` must release upstream resources.)
- **P4** If `signal` aborts before or during generation: upstream fetch is aborted, and the next event is `done{finishReason:'aborted'}`, emitted within one macrotask (no waiting out a sleep).
- **P5** `usage` at most once, before the terminal.
- **P6** `token.text` is never `''`.
- **P7** `error.message` never contains an API key or `Authorization` header value.

`backend/test/providers/contract.ts` exports `collect(iterable)` and `assertStreamContract(events)`; every provider test runs it.

### 3.3 `MockLLMProvider` (`mock.ts`)

```ts
export class MockLLMProvider implements LLMProvider {
  id = 'mock';
  capabilities = { chatCompletion: true, textCompletion: false, listModels: true, prefill: true, nativeStateChannel: false };
  readonly calls: LLMRequest[] = [];                    // spy for builder→provider integration tests
  constructor(private opts: { intervalMs?: number; scripts?: typeof ENVELOPE_SCRIPTS } = {}) {}
  async listModels() { return ENVELOPE_SCRIPT_IDS.map(id => ({ id: `mock:${id}`, name: id, contextLength: 8192 })); }
  async *generate(req, signal) { /* below */ }
}
```
- Script selection: `req.model` of the form `mock:<id>`; missing → `envelope-directive`; unknown → single `error{recoverable:false, message:'unknown mock script'}`.
- Emits `token` per chunk with `await abortableSleep(intervalMs, signal)` between chunks (default 40 ms; tests pass `0`). `abortableSleep` resolves immediately on abort — P4.
- After the last chunk: `usage{promptTokens:42, completionTokens:98}`, then the script's `terminal`. For the `error` script the terminal is the error (no `usage`).
- Ignores prompt content entirely, but records `req` in `calls`.

### 3.4 `OpenRouterProvider` (`openrouter.ts`) — deltas from the spec draft

```ts
constructor(cfg: { apiKey: string; defaultModel?: string; fetch?: typeof fetch; idleTimeoutMs?: number /* 60_000 */; referer?: string; title?: string })
capabilities = { chatCompletion: true, textCompletion: false, listModels: true, prefill: true, nativeStateChannel: false };
```
- **`fetch` is injected** (default `globalThis.fetch`) — all tests use a fake returning `Response(ReadableStream<Uint8Array>)`.
- **Request body**: `model`, `messages` (see below), `stream: true`, `usage: { include: true }` (OpenRouter's flag for a final usage chunk), sampling params only when defined, `stop` **capped to 4** (log a warning if truncated), `max_tokens` when set.
- **Messages**: `[system?] + req.history` → `ensureUserFirst` (if the first non-system message is `assistant`, prepend `{role:'user', content:'[Scene begins.]'}` — Anthropic-family requirement) → append `{role:'assistant', content: req.assistantPrefill}` when prefill is set → `coalesceConsecutiveRoles`. Prefill thus becomes the trailing assistant turn (continuation semantics; honored by Anthropic and most open models via OpenRouter; models that ignore it degrade to a normal turn — acceptable).
- **Headers**: `Authorization`, `Content-Type`, `HTTP-Referer`, `X-Title`. Never logged.
- **HTTP errors**: read body; extract `error.message` if JSON; `401|402|403` → `recoverable:false`; `408|429|5xx` → `recoverable:true`; other 4xx → `false`. Message format: `OpenRouter <status>: <message>`. A `200` whose `Content-Type` is not `text/event-stream` (Cloudflare interstitial) → `error{recoverable:true, message:'unexpected content-type …'}`.
- **SSE parsing** (`sse.ts`): `TextDecoder('utf-8')` with `decode(bytes, { stream: true })`, line buffer split on `\n` with the last partial retained, `\r` stripped; lines starting with `:` are comments (OpenRouter emits `: OPENROUTER PROCESSING` keep-alives) → ignored; `data:` payload accumulated per frame (blank line delimits). Final `decoder.decode()` flush at EOF.
- **Frame handling**: `[DONE]` → finish. JSON with `error` → `error{recoverable: status-like mapping, default false}` and stop reading. `choices[0].delta.content` non-empty → `token`. `choices[0].finish_reason` → **record** (`length` → `'length'`, anything else → `'stop'`) but do **not** terminate — usage may follow. `usage` → `usage` event (once). `delta.reasoning` → dropped in Phase 2 (noted for Phase 3: could be re-wrapped as `<think>`).
- **Termination**: on `[DONE]`, reader EOF, or mid-stream error frame → emit `done{finishReason: recorded ?? 'stop'}` unless an error was emitted. Absence of `[DONE]` is tolerated.
- **Idle timeout**: a timer reset on every `reader.read()` resolution; expiry → `reader.cancel()`, emit `error{recoverable:true, message:'upstream idle timeout after Nms'}`.
- **Abort**: `signal.aborted` checked before fetch (→ immediate `done{aborted}`); fetch receives `signal`; `AbortError` anywhere → `done{aborted}`; `finally { reader?.cancel().catch(()=>{}) }` (releases the socket also when the consumer breaks).
- **Never emit empty tokens** (P6): OpenRouter sends `delta.content: ""` heartbeats.

`utils.ts`: `coalesceConsecutiveRoles` exactly as the spec; `ensureUserFirst` as above; `abortableSleep(ms, signal)`.

`index.ts`: `createProviders({ openRouterApiKey?: string })` returns `{ mock: new MockLLMProvider(), openrouter: key ? new OpenRouterProvider({ apiKey: key }) : undefined }`. Phase 2 sources the key from `process.env.OPENROUTER_API_KEY` in `index.ts` only; the settings table wires in Phase 3.

---

## 4. Backend — `PromptBuilder` (`backend/src/prompt/`)

### 4.1 Layout and contract

```
backend/src/prompt/
├── builder.ts        # buildPrompt(ctx): BuiltPrompt
├── blocks.ts         # one function per block id, each (ctx) => string | null  (null = omitted)
├── history.ts        # serializeHistory(ctx): { messages: MessagePayload[]; skipped: number }
├── budget.ts         # countTokens(), fitHistory()
├── templates.ts      # PREAMBLE_DEFAULT, narrative directive templates per dialect, reminder strings
└── types.ts          # PromptContext, HistoryTurn, BuiltPrompt, BlockReport
```

```ts
export interface HistoryTurn {
  id: string;
  role: 'user' | 'assistant' | 'system';
  narrativeRole: 'character' | 'persona' | 'npc' | 'narrator';
  senderName?: string;
  content: string;
  status: 'streaming' | 'complete' | 'aborted' | 'error';
  directorNote?: string;                 // from messages.metadata; NEVER serialized into history
}

export interface PromptContext {
  character: CharacterCard;
  persona: Persona;
  chat: ChatMetadata;                    // narrativeMode, envelopeDialect, standingDirection, npcs
  history: HistoryTurn[];                // chronological, active branch only, resolved by the caller (Phase 3)
  directorNote?: string;                 // one-shot for THIS generation (the parent user node's note)
  sceneState?: StateVector;              // resolved state of the parent turn (Block 7b)
  activeNpcs?: Array<{ displayName: string; voice?: string }>;   // caller-derived: npcs seen in last N turns
  lorebookEntries?: string[];            // pre-matched text; matching engine is future work
  preamble?: string;                     // global setting; default PREAMBLE_DEFAULT
  budget: { contextLength: number; reservedCompletion: number; safetyFactor?: number /* 0.9 */ };
  provider: { prefill: boolean };
  continuation?: { partial: string };    // /continue: partial assistant text (raw; builder strips out-of-band)
}

export interface BlockReport { id: BlockId; included: boolean; tokens: number; reason?: string; }
export type BlockId = '1'|'1b'|'2'|'3'|'4'|'5'|'6'|'6b'|'7'|'7b'|'8'|'9a'|'9b'|'9c';

export interface BuiltPrompt {
  systemPrompt: string;                  // blocks 1–7b, joined by '\n\n'
  history: MessagePayload[];             // block 8 + bottom blocks attached (see 4.3), user-first guaranteed
  assistantPrefill?: string;
  stop: string[];
  dialect: Dialect | 'classic';
  blocks: BlockReport[];                 // in canonical order, all 14 ids present
  tokens: { static: number; history: number; bottom: number; total: number; available: number; droppedTurns: number };
  warnings: string[];
}
export class PromptBudgetError extends Error { constructor(public report: BuiltPrompt['tokens']) {…} }
```

### 4.2 Block rules (normative)

Let `mode = chat.narrativeMode ?? 'classic'`, `dialect = mode === 'narrative' ? (chat.envelopeDialect ?? 'directive') : 'classic'`. Macros are applied to **every** outbound string (all blocks, history, prefill) with `{ char: character.name, user: persona.name }`; after building, a test asserts no `{{char}}`/`{{user}}` survives anywhere.

| Id | Included when | Content (shape is normative, prose is not) |
|---|---|---|
| 1 | always | `ctx.preamble ?? PREAMBLE_DEFAULT` |
| 1b | narrative | Dialect-specific directive: block syntax with one short example in that dialect; "one turn may contain narrator, `{{char}}`, and side characters"; agency clause verbatim: `Never write dialogue, thoughts, feelings, or actions for {{user}}. Stop and yield when {{user}} must react or decide.`; state instructions: `End every reply with a state block` + a field list generated from `character.stateSchema` (`mood: one of calm, curious, urgent, furious (default calm)` · `affinity: integer 0–10` · `scene: short string`). If no `stateSchema`: instruct a free-form state block with `mood` and `scene`. |
| 2 | `description` non-blank | `[{{char}}'s description]\n…` |
| 3 | `personality` non-blank | `[{{char}}'s personality]\n…` |
| 4 | `scenario` non-blank | `[Scenario]\n…` |
| 5 | `exampleDialogue` non-blank | `[Example dialogue]\n…` verbatim after macros. Dialect conversion of examples is **deferred** (warning `examples_not_converted` when dialect is directive/xml). |
| 6 | `lorebookEntries?.length` | `[World information]\n- …` one bullet per entry |
| 6b | narrative && `activeNpcs?.length` | `[Side characters present]\n- Guard Captain: gruff, clipped sentences` (`voice` or `no notes`) |
| 7 | always | `[User persona: {{user}}]\n{persona.description}` (description may be blank → line omitted, header kept) |
| 7b | narrative && `sceneState` | `[Scene state: k=v, k=v]` — keys in `stateSchema` order, only schema keys; values `String(v)` |
| 8 | always | history (§4.3) |
| 9a | `standingDirection` non-blank | `[Standing direction: …]` |
| 9b | `directorNote` non-blank | `[Director's note for this turn: …]` |
| 9c | narrative | `Reply using the {dialect} block format and end with a state block.` |

### 4.3 History serialization and the bottom sandwich (`history.ts`)

1. Iterate `ctx.history` chronologically. **Skip**: `status ∈ {error, streaming}`; director-only turns (`role:'user' && content.trim()==='' && directorNote`); `system` rows (Phase 2 has none; skip defensively with a warning).
2. **Assistant rows** → `stripOutOfBand(content)` (state + reasoning removed, fences kept). `aborted` rows included as-is after stripping (they are what the user saw).
3. **User rows**: `narrativeRole==='persona'` → `content` verbatim. Otherwise → `serializeSegments([{ kind: narrativeRole, name: senderName, text: content }], null, dialect==='classic' ? 'directive' : dialect)` — multi-track authoring (`:::narrator\nThree days pass…`). In classic mode a non-persona user row still gets a directive header (it's explicit authorial voice).
4. Past `directorNote`s are **never** serialized (one-shot semantics).
5. **Bottom blocks** (9a, 9b, 9c) are joined with `\n` and appended to the content of the **last user message** as `\n\n<bottom>`. Rationale: a trailing `system` message is rejected or silently reordered by several providers; a trailing user-appended note is universally honored and survives coalescing.
6. **Ending on assistant** (director-only trigger, or the greeting is the only turn): append a synthetic user message `[Continue the scene.]` + bottom blocks.
7. **Continuation** (`ctx.continuation`): `partial = stripOutOfBand(continuation.partial)`. If `provider.prefill` → `assistantPrefill = partial`, bottom blocks go on the last *existing* user message, and 9c is replaced by `Continue the reply exactly where it stopped, then end with a state block.` Else → synthetic user message `[Continue your previous reply exactly where it stopped. Do not repeat.]` + bottom blocks, and the partial is left in history as the last assistant turn.
8. **User-first**: if `history[0].role === 'assistant'`, prepend `{ role:'user', content:'[Scene begins.]' }` (the adapter also guards this; the builder is the source of truth so token accounting includes it).

### 4.4 Budgeting (`budget.ts`)

- `countTokens(text)` uses `gpt-tokenizer/encoding/cl100k_base` `encode`. Special-token strings in user text (`<|endoftext|>`, `<|im_start|>`) can make `encode` throw depending on options — call with `{ disallowedSpecial: new Set() }` (or the version's equivalent) and, if it still throws, fall back to `Math.ceil(text.length / 3.5)` and push a warning. cl100k is an **estimate** for non-OpenAI models; `safetyFactor` (default `0.9`) discounts the budget; the post-stream `usage` event is authoritative.
- `available = floor((contextLength − reservedCompletion) × safetyFactor) − tokens(systemPrompt) − tokens(bottom)`; per-message overhead `+4`.
- Walk history **newest → oldest** accumulating; stop when the next turn would exceed `available`; drop everything older; `droppedTurns` counts them. The **last user turn** (the trigger, with bottom blocks attached) is never dropped. If it alone exceeds `available` → throw `PromptBudgetError` with the report.
- Dropping never splits a turn; `ensureUserFirst` runs **after** truncation (truncation may leave an assistant turn first).

### 4.5 Determinism

No `Date.now()`, no randomness, no environment reads inside `buildPrompt`. Block prose lives in `templates.ts` as constants so the golden file is stable and reviewable. Golden: `backend/test/prompt/__golden__/eldrin-narrative-directive.txt` (systemPrompt, then `---`, then JSON of `history`, `stop`, `assistantPrefill`), asserted with `expect(rendered).toBe(await Bun.file(path).text())`; update by an explicit `UPDATE_GOLDEN=1` env in the test.

---

## 5. Keeping the slice alive (backend `app.ts`, `index.ts`, frontend)

- `AppDeps` gains `providers: { mock: LLMProvider }` — `LLMProvider` is the `shared` interface, so E8 holds.
- `POST /api/chat/test-stream?script=<EnvelopeScriptId>` (query optional, default `envelope-directive`; invalid → `400 { error }`): iterates `providers.mock.generate({ history:[{role:'user',content:'begin'}], model:`mock:${script}` }, request.signal)` and frames **every** `StreamEvent` as `data: <JSON>\n\n` (token, usage, done, error). The hand-rolled word loop is deleted; `TEST_STREAM_*` constants remain exported for the Phase 0 regression test only. Response headers unchanged from Phase 0.
- `index.ts`: `createProviders({ openRouterApiKey: process.env.OPENROUTER_API_KEY })`; log `[providers] mock ready, openrouter <ready|disabled (no key)>`.
- Frontend `+page.svelte` (still unstyled): a `<select>` over `ENVELOPE_SCRIPT_IDS`; on each `token` event run `parseEnvelope(buffer, { primaryCharacter: script.primaryCharacter, knownNames: script.knownNames, dialect: script.dialect, personaName: 'Traveler', streaming: true })`; on `done` re-run with `streaming:false`. Render raw text in the first `<pre>` and `JSON.stringify({ dialect, segments: segments.map(s => [s.kind, s.name, s.text.slice(0,30)]), statePatch, truncatedAt, warnings, heldBack }, null, 2)` in a second `<pre>`. `error` events set status `error` and show `message`. This is the isomorphism proof: `jsonrepair` + parser executing in the browser on the exact stream the backend produced.

---

## 6. Tricky Traps & Failure Modes

### 6.1 Parser

| Trap | Symptom | Guard |
|---|---|---|
| Incremental parser state "for performance" | Chunk-order-dependent results; E1 breaks silently | Module has no mutable state; property test with 50 seeded random chunkings per fixture |
| `$` in regexes with CRLF input | Headers unrecognized on Windows-authored cards / some models | Normalize `\r\n` first; test with CRLF fixture |
| Agency check before reasoning extraction | `<think>` mentioning `Traveler:` truncates a good turn | Fixed step order (§2.3), `reasoning` fixture |
| State extraction before agency truncation | State reflecting puppeteered actions is trusted | Fixed step order; `persona-violation` fixture asserts `statePatch === null` |
| `jsonrepair` on a partial body "succeeds" | `{"mood":"urg` → `{"mood":"urg"}` persisted | Unclosed block → `null` + `state_unclosed`; never repair an unclosed body |
| `jsonrepair` output is a JSON string, not an object | `"hello"` parses fine | `state_not_object` check |
| Persona name with regex metachars (`Dr. X (v2)`) | Regex throws / mismatches | Escape; test with such a name |
| Prefix false positives (`Note:`, `Warning:`) | NPC "Note" appears | Known-names gate in auto; stoplist in explicit prefix; `classic` + `envelope-prefix` fixtures pin both |
| Prefix dialect narrator text after a speaker | Attributed to the previous speaker | Serializer emits `Narrator:`; parser maps `Narrator:` → narrator |
| `:::` in prose ("Rating: :::") | Spurious header | Regex is line-anchored and keyword-gated; non-matching `:::` lines are body |
| Hold-back never releases | UI stalls on a line starting with `` ` `` | Hold-back is bounded to the last line; released on `\n`; at `done` the non-streaming parse is authoritative |
| O(n²) reparse per token | Sluggish long replies | Perf test: 50 KB envelope parses in < 5 ms; Phase 4 throttles to rAF; backend parses only every 500 ms |
| Segment merging "to tidy up" | E3 breaks (serialized ≠ input) | No merging in the parser; visual merging is a Phase 4 concern |
| Serializing text that contains a header-looking line | Round-trip corruption of edited messages | `serializeSegments` throws `RangeError` on non-normalized input |
| `Type.Literal` union for `SegmentKind` vs parser string | Type drift | Parser imports `SegmentKind` from `schemas/narrative.ts` |

### 6.2 Providers

| Trap | Symptom | Guard |
|---|---|---|
| Splitting SSE on `\n` without frame buffering | JSON parse errors on chunk boundaries | `sse.ts` retains the partial last line; test splits mid-`data:` |
| `TextDecoder` without `{stream:true}` | `�` in tokens when a multibyte char spans reads | Test feeds `—` / emoji bytes split across two `Uint8Array`s |
| Returning on `finish_reason` | `usage` (sent after) is lost | Record finish reason; terminate only on `[DONE]`/EOF |
| No `[DONE]` from upstream | Stream never emits `done` | EOF → `done{recorded ?? 'stop'}` |
| OpenRouter comment lines (`: OPENROUTER PROCESSING`) | Parsed as data / logged noise | Ignore `:`-prefixed lines |
| Empty `delta.content` heartbeats | Empty `token` events (P6) | Filter |
| `delta.content` in a `[DONE]`-less error frame `{"error":{…}}` | Silent truncation | Error frame → `error` event |
| Consumer `break`s the `for await` | Upstream socket stays open | `finally` cancels the reader |
| Abort waits out `setTimeout` in the mock | P4 latency | `abortableSleep` |
| `> 4` stop sequences | OpenAI-family 400 | Cap at 4 in adapter; builder emits ≤ 3 |
| Prefill + `coalesceConsecutiveRoles` | Prefill merged into a previous assistant turn | Intended for `/continue`; documented; test asserts the merged content ends with the prefill |
| API key in error text | Leak into DB/UI | P7 test: message must not include the key; fake fetch returns a body echoing the key to prove stripping |
| `HTTP 200` HTML body | Hang until idle timeout | Content-type check |
| `AbortSignal` type mismatch between `shared`'s structural type and Bun's | Type error in `generate(req, signal)` | Structural type per the Phase 1 note; `request.signal` from Elysia passes straight through |

### 6.3 PromptBuilder

| Trap | Symptom | Guard |
|---|---|---|
| `gpt-tokenizer` default import ambiguity (cl100k vs o200k, encode throwing on special tokens) | Wrong counts / crash on user text | Explicit `encoding/cl100k_base` import; special-token option + fallback estimate |
| Bottom blocks as a trailing `system` message | Anthropic-family rejection or reordering via OpenRouter | Append to last user message |
| Director note leaking into later turns | Model keeps obeying an old one-shot | `HistoryTurn.directorNote` never serialized; test asserts absence |
| Dropping the trigger turn under budget pressure | Model answers a stale message | Trigger never dropped; `PromptBudgetError` instead |
| Truncation leaving assistant-first history | Provider 400 | `ensureUserFirst` after truncation |
| Macros applied twice / not to history | `{{user}}` visible to the model | Single application point at the end of each block/turn; global "no macros survive" test |
| State block left in history | Model imitates stale state, wastes tokens | `stripOutOfBand` on assistant rows; test |
| `Date.now()` sneaking into a template ("It is now…") | Golden test flakes | Purity rule E6; golden test |

---

## 7. Definition of Done & Verification

### 7.1 Acceptance criteria (all must hold)

1. `bun install` adds only `jsonrepair` (shared) and `gpt-tokenizer` (backend); `bun pm ls --all | grep -i typebox` still shows one copy. `bun run typecheck` passes 3/3 with `svelte-check` at 0/0 (parser + `jsonrepair` now compiled into the browser bundle; `App` now carries `providers` via the shared interface).
2. `bun run test` passes: shared (parser, properties, serializer, state engine, macros/stop, fixtures guard) + backend (provider contract, mock, OpenRouter fake-fetch, utils, sse, builder, history, budget, golden).
3. Property tests are green with **≥ 50 seeded random chunkings per fixture** and **every prefix** of every fixture checked for leaked markers.
4. `bun run dev`: the page's `<select>` lists all 9 scripts; `envelope-directive` streams with paced chunks, the parsed panel shows `dialect: "directive"`, 3 segments (`narrator`, `character/Eldrin the Mage`, `npc/Apprentice`), `statePatch` with `mood/affinity/danger/scene`, `warnings: []`; the non-BMP character renders intact; `persona-violation` shows `truncatedAt: "persona"` and no persona text; `truncated` shows `state_unclosed` and `statePatch: null`; `error` sets status `error` with the mock message; `classic` shows one `character` segment and `dialect: "none"`.
5. `curl -sN -X POST 'http://127.0.0.1:5173/api/chat/test-stream?script=envelope-directive'` shows paced `data:` frames including exactly one `usage` and one `done`; `?script=bogus` → `400`.
6. The Phase 0 regression (5-word pacing) is replaced by the Phase 2 pacing check above; document the replacement in the PR.
7. `bun run --cwd backend smoke:openrouter` **with** `OPENROUTER_API_KEY` set streams a real Eldrin reply, prints live tokens, then the `ParseResult` summary and `resolveState` output. If no key is available, the PR states "live smoke: not run" explicitly — the offline suite is the gate; the live smoke is evidence, not a requirement.
8. Golden file committed and reviewed; `blocks` report shows all 14 ids in canonical order for the Eldrin narrative context.
9. Production path (`bun run build && bun run start`) still boots, migrates (2→2), and serves the SPA; the mock stream works at `:3000` with no proxy.

### 7.2 Required tests (normative list)

**`packages/shared/test/envelope/parser.test.ts`** (table-driven over `ENVELOPE_SCRIPTS[*].expect`, plus):
- Superset: `classic` → one `character[Eldrin…]` segment, `dialect:'none'`, `statePatch:null`, `adherent:false`.
- Text before first header → attributed to primary; second segment from header.
- Lenience table (each a separate case): `:::char[Alice]`, `::: character Alice`, `:::character Alice draws her sword.` (name defaults), `::::npc[Guard]:`, `:::Narrator`, `:::character[Alice] "Now!"` (inline body), `:::characters` (NOT a header), closers `:::` / `</character>` on own line and at line end, `<character name=Alice>` unquoted.
- State: fenced / `~~~state` / `<state>` / `<!--state -->`; trailing comma & single quotes (`state_repaired`); garbage (`state_unparseable`); array body (`state_not_object`); two blocks (last wins + warning); text after block (`state_not_terminal`); unclosed (`state_unclosed`, `null`).
- Reasoning: `<think>…</think>` extracted, `reasoning` populated, segments exclude it; unclosed → `reasoning_unclosed`.
- Agency: truncation via `:::persona`, `:::user`, `<persona>`, `<user name="x">`, `{{user}}:`, `Traveler:` (with `personaName`), a persona name with regex metachars; state after violation → `null`; `allowPersona:true` → persona segment, no truncation.
- Prefix gating: auto + unknown name → prose; auto + known → npc; explicit prefix + Capitalized unknown → npc; stoplist word → prose; `Narrator:` → narrator; `Alice:` when Alice is primary → character.
- CRLF input equals LF input result.
- Perf: a synthetic 50 KB envelope parses in < 5 ms (median of 20).

**`packages/shared/test/envelope/properties.test.ts`**
- **E1**: for each script, 50 chunkings from a seeded PRNG (log the seed): every prefix parses without throwing; `parse(chunks.join(''))` deep-equals `parse(text)`; also the fixture's own `chunks`.
- **E3**: for each script's non-streaming `segments` + `statePatch`, and for each of the three dialects: `parse(serialize(segments, patch, d), { …opts, dialect: d, knownNames: allNames, allowPersona: true })` yields deep-equal `segments` and `statePatch`. Plus a hand-made segment list containing a `persona` segment and an unnamed `npc`.
- **E4**: for **every prefix** (0..len) of every script with `streaming:true`: no throw; no segment text contains a line matching any header/closer/fence regex; `segments.map(s=>s.text).join('')` contains no `:::`, `<narrator`, `<character`, `<npc`, `` ```state ``; `heldBack.length ≤ lastLine.length` unless an out-of-band block is open.
- `parse(text, {streaming:true})` deep-equals `parse(text, {streaming:false})` for every script (full text has no open blocks except `truncated`, where `heldBack` equals the open state block and the rest matches).

**`packages/shared/test/envelope/serialize.test.ts`**: canonical strings for one three-segment example in each dialect (exact `toBe`); `RangeError` on a segment whose text contains `:::npc[X]` on its own line; `stripOutOfBand` removes state + reasoning, keeps fences.

**`packages/shared/test/state/engine.test.ts`**: `defaultState(eldrin)`; enum alias (`angry`→`furious`), case-insensitive; int from `"7"`, rounding, clamp + warning; unknown key dropped; `null` dropped; carry-forward; no-schema passthrough of primitives only; `patch:null` → inherited.

**`packages/shared/test/text.test.ts`**: macros (case/spacing variants, `<BOT>`/`<USER>`, single pass); `buildStopSequences` per dialect, ≤ 4.

**`packages/shared/test/fixtures.test.ts`**: `chunks.join('') === text` for all; `envelope-directive` has a chunk boundary between surrogate halves and `JSON.parse(JSON.stringify(a)) + JSON.parse(JSON.stringify(b)) === a + b` for that pair (pins the ES2019 well-formed stringify dependency).

**`backend/test/providers/contract.test.ts`**: `assertStreamContract` on every mock script (`intervalMs:0`) and on every OpenRouter fake-fetch scenario below.

**`backend/test/providers/mock.test.ts`**: script selection by `model`; unknown → single error; `terminal` per fixture; abort mid-stream → `done{aborted}` next, no further events, resolves in < 20 ms with `intervalMs: 1000`; `calls` records the request; token concat equals `text`.

**`backend/test/providers/openrouter.test.ts`** (fake `fetch` capturing the request and returning byte streams):
- Happy path: tokens concat, `finish_reason:'stop'`, usage in a later frame → `usage` then `done{stop}`.
- Bytes split inside `—` and inside a 4-byte emoji → tokens reassemble exactly.
- Frame split inside `data: {"cho` and inside `\n\n`.
- Comment lines and empty `delta.content` ignored; `\r\n` line endings.
- No `[DONE]` → `done{stop}` at EOF; `finish_reason:'length'` → `done{length}`.
- Mid-stream `{"error":{"message":"x"}}` → `error`, then nothing.
- HTTP 429 → `error{recoverable:true}`; 401 with body containing the key → message lacks the key; 200 `text/html` → recoverable error.
- Abort before fetch → `done{aborted}`, fetch never called; abort mid-stream → upstream `signal.aborted === true`, `done{aborted}`.
- Idle timeout (`idleTimeoutMs: 30`, stream that stalls) → `error{recoverable:true}` and reader cancelled.
- Request shape: `stream:true`, `usage.include:true`, `stop` capped at 4 when given 6, prefill appended as trailing assistant, consecutive user turns coalesced, assistant-first history gets `[Scene begins.]`.
- Consumer `break` after 2 tokens → reader `cancel` called.

**`backend/test/providers/utils.test.ts`**: `coalesceConsecutiveRoles` (spec behavior, `\n\n` join, system untouched); `ensureUserFirst`; `abortableSleep`.

**`backend/test/prompt/builder.test.ts`** (fixture context: Eldrin, Traveler, 6-turn history incl. one director-only turn, one aborted assistant turn with a state block, one user `narrator` row):
- Classic vs narrative: 1b/6b/7b/9c present only in narrative; `dialect` reported.
- 1b contains the agency clause and every `stateSchema` field with its enum values / int range; xml and prefix variants show their own example syntax.
- 2/3/4/5/6 omitted when blank/absent; 6b lists `activeNpcs` with `voice`; 7b `[Scene state: mood=calm, affinity=5, danger=low, scene=spire_observatory]` in schema key order, ignores non-schema keys.
- History: assistant state blocks stripped, fences kept; aborted turn included; error turn skipped; director-only turn skipped; user `narrator` row serialized with header; past `directorNote` absent from every message.
- Bottom sandwich: 9a/9b/9c appear once, at the end of the last user message, in that order; nowhere else.
- Ending on assistant → synthetic `[Continue the scene.]` carries the bottom blocks.
- Continuation with `prefill:true` → `assistantPrefill` = stripped partial, 9c replaced; with `prefill:false` → synthetic user nudge, partial remains as last assistant turn.
- Assistant-first history → `[Scene begins.]` prepended.
- Budget: with a small `contextLength`, oldest turns dropped, `droppedTurns` correct, trigger retained, user-first still holds; trigger alone too large → `PromptBudgetError`; `tokens.total ≤ contextLength − reservedCompletion`.
- Macros: no `{{char}}`/`{{user}}` in `systemPrompt`, any history content, or `assistantPrefill`; `stop` uses the persona name.
- Purity: two calls with the same context → `JSON.stringify` equal; golden file match.
- Builder→provider integration: `buildPrompt(ctx)` fed to `MockLLMProvider.generate`, output through `parseEnvelope` + `resolveState(defaultState(eldrin), patch, schema)` → expected state; `calls[0].stop` equals `buildStopSequences('directive','Traveler')`.

### 7.3 Step-by-step verification

```bash
bun install && bun pm ls --all | grep -i typebox        # one copy
bun run typecheck                                        # 3/3, svelte-check 0/0
bun run test                                             # all suites; note the printed PRNG seeds

bun run dev
curl -sN -X POST 'http://127.0.0.1:5173/api/chat/test-stream?script=envelope-directive' \
  | while IFS= read -r l; do printf '%s  %s\n' "$(date +%T.%3N)" "$l"; done
#   paced token frames … one usage … one done{stop}; non-ASCII intact in token text
curl -si -X POST 'http://127.0.0.1:5173/api/chat/test-stream?script=bogus' | head -1     # 400
curl -sN -X POST 'http://127.0.0.1:5173/api/chat/test-stream?script=error' | tail -2      # …error frame, then EOF
#   browser: cycle all 9 scripts; verify panel values listed in 7.1 #4; DevTools ▸ EventStream shows usage + done frames

# optional live evidence
OPENROUTER_API_KEY=sk-or-... bun run --cwd backend smoke:openrouter
#   live tokens → ParseResult summary (dialect, segment kinds, statePatch, warnings) → resolved state

bun run build && bun run start                           # prod: same page at :3000, mock stream works
```

### 7.4 Explicit scope boundaries — deferred

Do **not** introduce in Phase 2:
- **Phase 3 (API & state machine):** no `/api/chat/send`, `/stop`, `/regenerate`, `/continue`, `/api/characters`, settings endpoints; no chats/messages repositories; no message rows, no 500 ms flush, no `AbortController` map, no `metadata.parse` persistence; no settings-table API keys (env only); no NPC auto-registration *persistence* (the parser only reports names); no lorebook matching engine (builder accepts pre-matched entries); no example-dialogue dialect conversion; no `delta.reasoning` mapping; no local providers (Ollama/Kobold).
- **Phase 4 (UI):** no Tailwind, `<MessageTurn />`, theme injection, state-binding evaluation against the theme, markdown, or rAF throttling — the page stays two `<pre>`s and a `<select>`.
- **Anywhere:** no fence-aware header suppression, no persona-name macro recursion guard, no token-count caching.

What Phase 2 hands to Phase 3: a parser whose output (`segments`, `statePatch`, `truncatedAt`, `warnings`, `parserVersion`) maps 1:1 onto `messages.segments / state / metadata.parse`; `resolveState` for `metadata.stateSource`; providers that satisfy one contract so the state machine can be written once; and a `PromptContext` that names exactly the rows and metadata the route layer must assemble.

---

## 8. Execution Order

1. **shared**: `envelope/types.ts` → `grammar.ts` (write the lenience table test first) → `outOfBand.ts` → `holdback.ts` → `index.ts` (parse, serialize, strip). Then `fixtures/envelope.ts` with `expect` blocks. Run `parser.test.ts` + `fixtures.test.ts`.
2. **shared**: `properties.test.ts` — get E1/E3/E4 green before writing any backend code; they will reshape the parser more than any other test.
3. **shared**: `state/engine.ts`, `text/macros.ts`, `text/stop.ts`, tests; bump `SHARED_VERSION`; Amendment A3 (`npcs[k].voice`).
4. **backend**: `providers/sse.ts` → `utils.ts` → `mock.ts` → `contract.ts` + tests. Then `openrouter.ts` with the fake-fetch suite (bytes-level split cases first).
5. **backend**: `prompt/templates.ts` → `blocks.ts` → `history.ts` → `budget.ts` → `builder.ts`; tests; generate and review the golden file.
6. **wiring**: `AppDeps.providers`, test-stream re-plumb, `index.ts`, frontend `<select>` + parse panel. `bun run typecheck` — this is where a purity leak (e.g. importing `mock.ts` types into `app.ts`) would surface.
7. `smoke-openrouter.ts` script; run if a key exists.
8. §7.3 top to bottom; attach the browser panel output for `envelope-directive`, `persona-violation`, and `truncated`, the curl pacing capture, and the golden file to the PR.