# FormaTavern — Chat Layout Neutrality Blueprint

**Purpose:** Make the chat log neutral by default and creator-owned by choice. A blank character renders uniform left-aligned rows with no color coding, no tails, no shrink-wrap bubbles, inline dimmed narration, plain names, and no avatars. Every imposed opinion becomes an explicit control (Track 1, Studio) or an expressible stylesheet over stable hooks (Track 2, custom CSS) — the same two-track composition the customization system already commits to. Multi-voice narrative turns label who speaks now per segment row; classic chats collapse to a single header with no special-casing.

Nothing in the engine changes. Every feature here is presentation over existing contracts: `MessageWithTree`, `CharacterCard`, `resolveTheme`, `ThemeEngine`, the `/api/characters` router, the single `CustomStyleOutlet` per surface, and the chat-conservative sanitizer profile. The one genuinely new capability is **layout as data** — and it rides the same card PATCH, OCC, and outlet lifecycle as everything else.

**New dependencies:** none. **SHARED_VERSION:** `0.7.0-chat-layout`. **Migration:** v7 `chat_layout_neutrality` (one additive nullable column + backfill; no existing theme, prompt, or message row is rewritten).

---

## 0. Carry-forward & amendments

No amendments to prior invariants are required. This blueprint is additive by design so `AGENTS.md` §4, the C/E/S/U/I/P series, and `boundaries.test.ts` gain cases without edits to existing rules:

- `HOOKS.chat` grows five append-only entries (C1: manifest stays the sole source of `ft-*` strings; removal/rename remains breaking).
- `boundaries.test.ts` gains layout-contract cases (L1–L2); no existing case is weakened.
- `CharacterSummary` does **not** gain `layout` — list payloads stay light, mirroring the `customCss` exclusion (A-S8 pattern).
- `ThemeOverridesSchema` does **not** gain layout fields in v1 — layout has one owner (the card), so the cascade stays five-layer.

Everything else (I1–I6, E1–E8, S1–S9, U1–U10, P1–P11, C1–C13) holds verbatim and is re-verified by the existing suites.

---

## 1. Invariants for the layout series

| # | Invariant | Enforced by |
|---|---|---|
| **L1** | **Per-voice rows are the primitive.** Every rendered segment is a `ft-row[data-kind]` inside `article.ft-turn[data-role]` with its own header slot (avatar + name) and body slot. `single` is a collapsed presentation over those rows, never a different data shape. | `frontend/unit/layoutContract.test.ts` (DOM presence per row); `boundaries.test.ts` row-hook case |
| **L2** | **No role-branched layout in components.** Alignment, width, tails, and color emphasis come from `data-*` attributes + `--msg-*` vars. Components never emit `justify-end`, side-specific tails, or role-specific backgrounds from role conditionals. | `boundaries.test.ts` source scan (no `justify-end`/`justify-start` in `chat/` outside tests); `layoutAttrs.test.ts` |
| **L3** | **Layout resolution is pure.** `resolveLayout()` lives in `@formatavern/shared`, imports no DOM/Node/Bun, and is deterministic: same `(layout, narrativeMode)` ⇒ same resolved document. The frontend never defaults layout inline. | `packages/shared/test/layout/resolve.test.ts`; shared import-surface scan |
| **L4** | **NULL means neutral; backfill means classic.** `characters.layout IS NULL` resolves to the neutral default (§2). The v7 backfill stamps every pre-existing row with explicit classic-equivalent JSON, so no existing chat changes appearance. | `backend/test/migrations.test.ts` (v6→v7); `db:check` `layout_valid` audit |
| **L5** | **The Classic preset is layout-only.** Selecting it never writes color, font, or background tokens. A layout preset that rewrote palettes would destroy creator work and contradict L4. | `layoutPresets.test.ts`; Studio test asserting preset payload has no `style` keys |
| **L6** | **Layout has one owner.** Only `characters.layout` feeds the chat layout path. Persona `styleOverrides`, state bindings (`THEME_PATHS`), and per-chat metadata carry no layout fields in v1. | `schemas.test.ts` (layout keys absent from `ThemeOverridesSchema`/`THEME_PATHS`); `studio.test.ts` parity scan |
| **L7** | **One measure, CSS exceptions.** The log owns a single readable measure; per-container width exceptions live in stylesheets only, never as a second token. | `cssVars.test.ts` (no `--msg-measure` token emitted); probe screenshots |
| **L8** | **`single` collapses chrome, never identity.** In `single` mode every non-owner segment keeps an inline voice tag. No multi-voice turn renders under one name with no per-voice attribution. | `layoutContract.test.ts` (multi-voice fixture in `single` mode keeps N voice tags); headless DOM dump |

---

## 2. Design language (normative)

### 2.1 Neutral default (what a blank card paints)

The log root carries the resolved document as attributes; rows inherit it. Concrete rendering with `layout IS NULL`:

- **Alignment:** `uniform-left`. All rows start at the same gutter. No `justify-end` anywhere.
- **Container:** `row`. Full log-width row, transparent background, no border, no shadow, no tail pseudo-element. Body width capped by the log measure (`72ch`, `--msg-measure` fixed in stylesheet per L7), not shrink-wrapped to text.
- **Color:** all bodies inherit the log surface/text. `charBubbleBg/userBubbleBg` and the NPC `color-mix` tint do not apply in `row` + `uniform-left` — the values still resolve (never discarded) and re-apply the moment `split` or `bubble` is selected.
- **Narrator:** `dim-only` — inline row, left-aligned, same measure, text dimmed via `color-mix(in oklab, var(--chrome-text) 72%, transparent)`, no separator, no italic, no centering.
- **Names:** plain — body text color, normal case/weight, `0.8125rem`, character/persona/npc shown, narrator unnamed. No uppercase, no tracking, no accent.
- **Avatars:** all off. No avatar element in the DOM (not a hidden placeholder).
- **Headers:** resolved `voices` in narrative chats, `single` in classic chats (§2.3). With avatars off and one voice per classic turn, both look identical: a quiet name line over body text.

### 2.2 Classic preset (today's look, opt-in)

One Track-1 combination reproduces the current screenshot pixel-close. Exact document:

```ts
export const CLASSIC_LAYOUT = {
  align: 'split', container: 'bubble', headers: 'voices',
  avatars: { character: false, persona: false, npc: false, shape: 'circle', size: '2rem' },
  narrator: 'centered',
  names: { showCharacter: true, showPersona: true, showNpc: true, format: 'classic' },
  tails: true
} as const;
```

`names.format: 'classic'` reproduces the existing nuance exactly: character/persona labels uppercase + tracked + `var(--theme-accent)`; NPC labels uppercase + tracked in text color at `opacity-75`; label hidden when the name equals the primary character name. `plain` is body color, normal case/weight, always shown per `show*`. Backfill stamps this document (with `tails` honored per §3.3), so existing chats keep per-segment labels, split alignment, bubbles, tails, and the centered narrator without any creator action.

### 2.3 Mode matrix (normative)

Layout resolves over the segments array uniformly — `displaySegments()` (`MessageLog.svelte:112-122`) already normalizes classic/plain rows to a single segment, so classic needs no separate markup contract:

| Control | Narrative | Classic |
|---|---|---|
| `align`, `container`, `tails`, log measure | live | live |
| `headers` | `single` \| `voices` (unset ⇒ `voices`) | forced `single` (every turn is one segment; `voices` renders identically) |
| `avatars` character/persona | live | live |
| `avatars` npc, `names` npc | live | inert — Studio disables with explanation, resolve notes it |
| `narrator` | live (`dim-only` \| `inline` \| `centered`) | inert — no parsed narrator segments exist; Studio disables with explanation |
| `names.format` | live | live (applies to the single row) |

Unset `headers` means "follow the mode" — no backfill needed for this field, and explicit choice beats the default in either mode. Avatars resolve live (current images): history text is immutable, avatar chrome is presentational. Missing image ⇒ initials monogram, never a broken `<img>`; NPC without image ⇒ monogram + hue ring from the existing `npcHue()` hash (ring only — the full-bubble `color-mix` tint stays a `bubble`-container NPC treatment, never the default).

---

## 3. Data model & Migration v7 (`chat_layout_neutrality`)

### 3.1 Schema additions (`shared`)

```ts
// packages/shared/src/schemas/layout.ts — new, pure (no DOM/Node/Bun)
export const LayoutAlignSchema = Type.Union([Type.Literal('uniform-left'), Type.Literal('split')]);
export const LayoutContainerSchema = Type.Union([Type.Literal('row'), Type.Literal('bubble'), Type.Literal('flat')]);
export const LayoutHeadersSchema = Type.Union([Type.Literal('single'), Type.Literal('voices')]);
export const LayoutNarratorSchema = Type.Union([Type.Literal('dim-only'), Type.Literal('inline'), Type.Literal('centered')]);
export const LayoutNameFormatSchema = Type.Union([Type.Literal('plain'), Type.Literal('classic')]);

export const CharacterAvatarsSchema = Type.Object({
  character: Type.Boolean({ default: false }),
  persona: Type.Boolean({ default: false }),
  npc: Type.Boolean({ default: false }),
  shape: Type.Union([Type.Literal('circle'), Type.Literal('rounded'), Type.Literal('square')], { default: 'circle' }),
  size: Type.Optional(CssToken) // default '2rem', applied as --msg-avatar-size
});
export const CharacterNamesSchema = Type.Object({
  showCharacter: Type.Boolean({ default: true }),
  showPersona: Type.Boolean({ default: true }),
  showNpc: Type.Boolean({ default: true }),
  format: Type.Optional(LayoutNameFormatSchema) // default 'plain'
});
export const CharacterLayoutSchema = Type.Object({
  align: Type.Optional(LayoutAlignSchema),
  container: Type.Optional(LayoutContainerSchema),
  headers: Type.Optional(LayoutHeadersSchema), // undefined = follow the chat mode (§2.3)
  avatars: Type.Optional(CharacterAvatarsSchema),
  narrator: Type.Optional(LayoutNarratorSchema),
  names: Type.Optional(CharacterNamesSchema),
  tails: Type.Optional(Type.Boolean())
});
export type CharacterLayout = Static<typeof CharacterLayoutSchema>;

// CharacterCard gains: layout: Type.Optional(CharacterLayoutSchema)
// CharacterSummary does NOT gain layout (A-S8 pattern — lists stay light; chat loads the full card).
// CharacterCreate/CharacterPatch derive automatically (existing Omit/Partial); PATCH semantics:
// undefined = keep, null = clear (back to neutral), object = whole-document replace (mirrors style).
// ThemeOverridesSchema and THEME_PATHS gain nothing (L6).
```

```ts
// packages/shared/src/layout/resolve.ts — pure
export interface ResolvedLayout {
  align: 'uniform-left' | 'split';
  container: 'row' | 'bubble' | 'flat';
  headers: 'single' | 'voices';       // mode default applied when unset
  avatars: { character: boolean; persona: boolean; npc: boolean; shape: 'circle' | 'rounded' | 'square'; size: string };
  narrator: 'dim-only' | 'inline' | 'centered';
  names: { showCharacter: boolean; showPersona: boolean; showNpc: boolean; format: 'plain' | 'classic' };
  tails: boolean;                      // effective: false unless container === 'bubble'
  inert: Array<'narrator' | 'npc'>;    // controls with no effect in the current mode (§2.3)
  warnings: string[];
}
export function resolveLayout(layout: CharacterLayout | null | undefined, narrativeMode: 'classic' | 'narrative'): ResolvedLayout;
export const NEUTRAL_LAYOUT_DOC: ResolvedLayout; // resolveLayout(undefined, 'narrative') with headers 'voices'
export const CLASSIC_LAYOUT: CharacterLayout;    // §2.2 document (headers 'voices', avatars off)
```

A separate `layout/attrs.ts` (frontend, pure, unit-tested) maps a `ResolvedLayout` to `data-align` / `data-container` / `data-headers` / `data-tails` plus `--msg-avatar-size` — the only place attribute names are constructed, so Track-2 authors get a documented contract instead of reverse-engineering class strings.

### 3.2 Migration v7 DDL + backfill

```sql
-- characters: layout as nullable JSON document (NULL = neutral default, L4)
ALTER TABLE characters ADD COLUMN layout TEXT;
```

Backfill runs in the same migration transaction as a JS loop (not pure SQL — it must read each row's `style` JSON to honor tail intent):

- For every row with `layout IS NULL`: write the §2.2 classic document as JSON, with `tails` set to `false` only when `json_extract(style, '$.bubble.charTail') = 'none'` (the dead control's intent, preserved); otherwise `true`. `headers` stamps `'voices'` (today's per-segment labels are preserved; avatars stay off so nothing new appears).
- New rows created after v7 keep `layout NULL` ⇒ neutral default. Explicit neutral choices store explicit JSON (so backfill semantics never revisit them).
- Idempotent: the loop touches only `layout IS NULL` rows; re-running changes nothing. No message, prompt, or theme row is touched.

`db:check` gains `layout_valid`: every non-NULL `layout` parses as JSON and validates against `CharacterLayoutSchema` (unknown enum values fail); reports `{ checked, invalid: n }`. NULL rows are legal and uncounted.

### 3.3 Repository contract additions

```ts
interface CharacterRow { …existing…; layout: string | null; }
cardToRow: layout === undefined ? null : JSON.stringify(layout)
rowToCard: if (row.layout) card.layout = JSON.parse(row.layout)  // NULL ⇒ field absent ⇒ neutral
create: mints slug (unchanged), stores layout NULL by default
patch: layout undefined = keep / null = clear / object = replace whole + expectedUpdatedAt OCC (P9 unchanged)
remove / duplicate: duplicate carries layout verbatim (same-author copy, C11 spirit)
summary: layout excluded (L0); detail routes return it
```

Writes touching `characters.layout` are single-row transactional like `style` — no FTS, no join table, no new failure modes.

---

## 4. API surface

No new endpoints. No new error codes. Layout rides the existing character router with the shared TypeBox schemas; the server re-validates and remains authoritative:

| Method | Endpoint | Body | Returns | Notes |
|---|---|---|---|---|
| `POST` | `/api/characters` | `CharacterCreate` (incl. optional `layout`) | `201 CharacterCard` | `layout` absent ⇒ NULL ⇒ neutral |
| `PATCH` | `/api/characters/:id` | `CharacterPatch` (`layout?: object \| null` + `expectedUpdatedAt`) | `CharacterCard` | whole-document replace; `409 stale_write { current }` (P9 unchanged) |
| `GET` | `/api/characters/:id` | — | `CharacterCard` (incl. `layout` when set) | chat route loads the full card (unchanged) |
| `GET` | `/api/characters` | list query (unchanged) | `CharacterSummary[]` (no `layout`) | lists stay light |

---

## 5. Render pipeline (normative)

### 5.1 Markup contract

```
MessageLog (data-align data-container — resolved chat-level values)
└─ article.ft-turn[data-role][data-headers]                     (turn owner scope)
   ├─ div.ft-row[data-kind]                                     (L1 primitive × N segments)
   │  ├─ div.ft-row-header                                      (omitted entirely when headers+avatars+names all suppress it)
   │  │  ├─ (avatar on?) div.ft-avatar > img[alt=""] | div monogram
   │  │  └─ (name shown?) div.ft-turn-name
   │  └─ div.ft-turn-body
   │     ├─ (narrator) div.ft-narrator (+ separator only in centered mode)
   │     └─ (char/npc/persona) div.ft-bubble-{char,npc,user}    (hooks retained; in row/flat modes they carry no bubble chrome)
   └─ div.ft-turn-toolbar slot (unchanged position relative to body)
```

- `HOOKS.chat` appends exactly: `row: 'ft-row'`, `rowHeader: 'ft-row-header'`, `avatar: 'ft-avatar'`, `turnName: 'ft-turn-name'`, `turnBody: 'ft-turn-body'`. All five render through `HOOKS.*` (C1); no `ft-` literal appears elsewhere.
- `data-role` stays on the article (turn owner); `data-kind` lives on each row (the voice speaking now). `single` mode renders the owner header once and appends inline `span.ft-turn-name.inline` tags on non-owner rows (L8) — same data, collapsed chrome.
- `SpeechBubble` / `NarratorBlock` become body renderers inside rows (props unchanged apart from receiving container/alignment via context instead of role branches). Their historical class names stay so existing sheets keep matching; in `row`/`flat` modes the bubble chrome declarations are gated behind `[data-container="bubble"]`, so old sheets that *add* chrome still paint while the default adds none.
- Streaming/live turns render rows as segments arrive; headers resolve from the turn owner + arrived segment kinds and never re-key existing rows (no flicker — rows are index-keyed as today).

### 5.2 Attribute + variable contract (the Track-2 surface)

| Writer | Emits | Consumers |
|---|---|---|
| `MessageLog` root | `data-align`, `data-container` | author sheets: `[data-ft-surface="chat"] [data-align="split"] …`, `[data-container="row"] …` |
| `article.ft-turn` | `data-role`, `data-headers` | `[data-headers="single"] .ft-row-header …`, per-role overrides without touching structure |
| `div.ft-row` | `data-kind` | `[data-kind="narrator"] …`, `[data-kind="npc"] …` |
| inline `style` on log root | `--msg-avatar-size` (from avatars.size) | author `width`/`height` derivations; shape via `data-avatar-shape` |

No new theme tokens (L7): radius/padding reuse `theme.bubble.*` but apply only under `[data-container="bubble"]`; `--msg-measure: 72ch` is a stylesheet constant. The chat-conservative sanitizer profile is unchanged — new hooks and `data-*` selectors already pass scoping (`[data-ft-surface="chat"] …`); no `policy.ts` change required.

### 5.3 What this permits authors to do

Everything in the named references with either zero CSS or a five-line sheet: Janitor rows (`uniform-left + row + voices avatars`), SillyTavern group (`uniform-left + bubble`), SMS (`split + bubble + tails`), manuscript (`flat + single + inline narrator`), plus anything unanticipated via `data-kind`/`data-headers` selectors. What it does not permit is unchanged: no new sinks, no cross-surface leakage, no motion outside the existing presets.

---

## 6. Studio, LivePreview & presets

- **LayoutPanel** (`frontend/src/lib/components/studio/LayoutPanel.svelte`, new): the seven v1 groups (§2–§3) with the same binding style as `AestheticPanel` — selects for align/container/headers/narrator/names-format, tri-state avatar toggles + shape/size, per-kind name checkboxes, tails checkbox (disabled with explanation unless `container === 'bubble'`), inert-in-classic controls disabled with explanation (§2.3 matrix). Writes whole-document `layout` on the draft card; invalid ⇒ inline issue, save disabled (same validator as P5).
- **Studio tab:** `StudioShell` gains `{ id: 'layout', label: 'Layout' }` between Aesthetic and Custom CSS; `StudioTab` union extended. No other tab moves.
- **LivePreview:** renders the draft's own `MessageTurn`/`TurnRow` components (never ad-hoc preview bubbles — the §7.2 parity rule) over a three-voice fixture (narrator + character + NPC) plus the persona bubble, with a **mode toggle (narrative/classic)** driving `resolveLayout(draft.card.layout, mode)`. Authors see both defaults and both inert sets before saving. `draft.previewTheme` path untouched (`resolveTheme` remains the only theme combinator).
- **Presets:** `CustomCssPanel` "Start from a preset" gains *Uniform rows*, *Split bubbles*, *Centered narrator* (each lint-clean, reduced-motion-safe, ≤ 2 KB). `LayoutPanel` gains a one-click *Classic* Track-1 combination (payload asserted layout-only, L5).
- **Parity scan:** `studio.test.ts` extends to `CharacterLayoutSchema` keys (every key has a binding; `headers` unset state has an "Auto (follow mode)" option).

---

## 7. Frontend architecture & file layout

```
packages/shared/src/
├── schemas/layout.ts                 # CharacterLayoutSchema + Avatars/Names subschemas (pure)
├── layout/resolve.ts                 # resolveLayout(), NEUTRAL doc, CLASSIC_LAYOUT, mode defaults (pure)
├── layout/presets.ts                 # classic document factory (shared by backfill rationale + Studio)
├── hooks/manifest.ts                 # +5 chat hooks (append-only, C1)
frontend/src/lib/
├── chat/layoutAttrs.ts               # resolved layout → data-*/--msg-* (pure, unit-tested)
├── components/chat/TurnRow.svelte    # NEW: per-voice row (header slot + body slot, L1)
├── components/chat/SegmentAvatar.svelte # NEW: img | initials | npc hue ring (alt="" decorative)
├── components/chat/MessageTurn.svelte   # refactor: maps segments → TurnRow, owns single/voices collapse + L8 tags
├── components/chat/MessageLog.svelte    # adds data-align/data-container, passes resolved layout down
├── components/chat/SpeechBubble.svelte / NarratorBlock.svelte  # body renderers; role branches removed (L2)
├── components/studio/LayoutPanel.svelte # NEW: v1 controls + Classic combo + inert explanations
├── components/studio/StudioShell.svelte # +layout tab
└── custom/presets.ts                 # +3 layout sheets
frontend/unit/
├── layoutAttrs.test.ts  layoutContract.test.ts  layoutResolve.test.ts (shared re-export)
└── boundaries.test.ts (amended: L1/L2 cases; C1 manifest case covers +5 hooks)
backend/src/db/
├── migrate.ts                        # v7 chat_layout_neutrality (DDL + JS backfill loop honoring charTail)
└── repositories.ts                   # layout column mappers/statements; duplicate carries it; summary excludes it
```

Route loads, session, streaming, prompt preview, dialect conversion, and the outlet lifecycle are untouched (no new fetch, no new chunk — `resolveLayout` is dependency-free; `build` size test asserts the chat entry chunk unchanged ± 2 KB).

---

## 8. Feature specifications

### 8.1 Neutral default

Blank card (`layout NULL`), either mode: §2.1 rendering; `?dev=1` overlay (if present) shows resolved `align/container/headers` so paint can be traced to data. Narrator dim passes contrast against both schemes (verified in §10.9, not eyeballed).

### 8.2 Each Track-1 control

- **align:** `uniform-left` (all rows share the gutter) | `split` (persona rows `justify-end`, others `justify-start`). No other value in v1.
- **container:** `row` | `bubble` | `flat` per §5 semantics; `bubble` re-enables radius/padding/tails from theme tokens; `row`/`flat` ignore them (values retained, L4 spirit).
- **headers:** `single` | `voices` | Auto (unset ⇒ §2.3 mode default). `voices`: every row with a shown name/avatar renders its header. `single`: owner header once; non-owner rows get inline voice tags (L8) and still expose `data-kind` for CSS.
- **avatars:** per-voice booleans + `shape`/`size`. `single` shows the owner avatar once; `voices` shows per-row avatars with per-row fallbacks. `alt=""`, `loading="lazy"`, `decoding="async"`.
- **narrator:** `dim-only` | `inline` | `centered` per §2.1/§2.2. `centered` reuses the current `NarratorBlock` geometry verbatim (gated behind `[data-narrator="centered"]`).
- **names:** per-kind `show*` + `format` (`plain` | `classic` per §2.2 nuance). Narrator unnamed in all modes unless a sheet says otherwise.
- **tails:** boolean, effective only in `bubble` containers; side follows computed alignment.

### 8.3 Classic preset & backfill interaction

The *Classic* combo writes the §2.2 document verbatim. The v7 backfill writes the same document (tails honored from `charTail`) to every pre-existing `layout IS NULL` row. Post-migration, opening any old chat shows its old look with explicit values in Studio — the creator can then move toward neutral one control at a time.

### 8.4 In-chat Lore Drawer

No new tab. The About line keeps its dialect/mode sentence; where layout is non-default a quiet second line names the effective combination ("Uniform rows · voices · no avatars") with a link opening Studio → Layout. No per-chat editing in v1 (deferred per §11).

---

## 9. Tricky traps & failure modes

### 9.1 Markup & CSS

| Trap | Symptom | Guard |
|---|---|---|
| `content-visibility: auto` + new row/header nesting | Placeholder-height rows (`h=96`-style signature) or clipped headers | Keep `content-visibility` on the article only (never rows); intrinsic size re-measured in probes; self-reporting probe asserts real heights |
| Absolute edit pencil vs header slot | Pencil lands on avatar/name (Batch-2 P1 class) | Pencil stays relative to `ft-turn-body`; header slot is in normal flow; probe asserts pencil rect outside avatar rect |
| Streaming header flicker | Name/avatar swaps as segments stream in | Rows index-keyed; header resolves from owner + arrived kinds; no re-key on kind arrival |
| Old sheets targeting `.ft-bubble-char` | Authors fear breakage | Hooks retained; chrome gated behind `[data-container]` so additive sheets still paint; test renders old-sheet fixture over new markup |
| `data-tail="none"` rule orphaned | Dead rule confusion | `none` becomes a first-class tails value (`data-tails="off"`); old `data-tail="none"` rule retained for compat, documented |
| Dimmed narrator contrast | Fails axe on light scheme | `color-mix` ratio pinned by test rendering both schemes; axe case in §10 |
| RTL / long unbroken names | Header overflow | Header uses minmax(0,1fr) + ellipsis; probe with 120-char name |

### 9.2 Data & migration

| Trap | Symptom | Guard |
|---|---|---|
| Backfill parsing `style` JSON | Migration throws on a hand-edited style blob | `tryParse` per row; unparseable ⇒ tails `true` (current visual) + warning counted in migration result |
| NULL vs explicit-neutral confusion | Re-running migration overwrites creator choices | Loop touches only `layout IS NULL`; explicit JSON (even neutral-equal) is never rewritten (L4) |
| `headers` unset on old rows | Reviewers expect explicit values everywhere | Unset is the specified "follow the mode" state (§2.3), not missing data — backfill leaves it unset only if backfill itself is bypassed; the stamped classic document sets it explicitly |
| Persona avatar swapped mid-story | Old turns show the new face — "history changed?" | Specified: avatars are live chrome (like theme), text is immutable. No toast; Studio copy states it |
| Layout JSON hand-written via API | Unknown enum string stored | Route 422 via TypeBox (shared validator, server authoritative); `layout_valid` audit catches pre-existing drift |
| Summary payload bloat | Lists slow down | `layout` excluded from `CharacterSummary` (verified by route test asserting absence) |

### 9.3 Studio & preview

| Trap | Symptom | Guard |
|---|---|---|
| Preview ≠ chat (ad-hoc bubbles) | Layout approved in Studio, different in chat | LivePreview renders production `MessageTurn`/`TurnRow` with `resolveLayout` — the only combinators (parity test) |
| Inert toggles in classic preview | Creator flips narrator, nothing happens | Controls disabled with explanation when preview mode is classic; `inert` list asserted in resolve tests |
| Bundling the fixture into chat chunk | Chat entry grows | Fixture lives in Studio chunk only; `build` size test guards the chat entry |
| Stale-write collision on layout | Two tabs editing layout | Existing `expectedUpdatedAt` OCC covers it (no new mechanism); stale-write dialog path tested with a layout-only patch |

---

## 10. Definition of Done & verification

### 10.1 Acceptance criteria

1. `bun run typecheck` 3/3 clean; `bun run test` fully green with the new suites; `bun run build` succeeds and the **chat route entry chunk is unchanged ± 2 KB**.
2. `bun run db:migrate` upgrades a v6 database to v7 in one transaction; `db:check` reports `user_version=7`, `layout_valid=ok`; a seeded v6 DB shows every pre-existing character with explicit classic layout JSON post-migration and byte-identical chat paint (see 4).
3. **Neutrality proof:** seeded narrative + classic chats render §2.1 on a blank card (uniform-left rows, no tails, no color coding, dim-only inline narrator, plain names, zero avatar elements) in tall **and** short headless captures with zero console errors.
4. **Backfill proof:** before/after screenshots of the same expendable classic chat are pixel-identical (after = explicit classic document); the Studio Layout panel shows the stamped values, not Auto.
5. **Choice proof:** flipping each v1 control paints its effect with no other axis moving (one-variable probes); `single` multi-voice fixture keeps inline voice tags on non-owner rows (L8); `voices` fixture shows per-row headers with monogram fallbacks where images are absent.
6. **Classic-mode proof:** narrator/NPC layout controls are inert and disabled-with-explanation; `headers` Auto resolves `single`; mode toggle in LivePreview matches real chat paint for both modes.
7. **Track-2 proof:** the three preset sheets + a hand-written `[data-kind="npc"]` rule paint over the new markup through the single outlet under the unchanged chat-conservative profile; `hideCustomStyling` removes them entirely.
8. **Layout & a11y:** axe 0 critical/serious on `/chat/[id]` in both modes and both header settings; keyboard-only pass of read → edit-segment → toolbar → composer; touch pass (pencils/toolbars reachable, no avatar/pencil overlap); narrow captures shot at ≥ 500 px layout width per the workflow gotcha.
9. **Production:** `bun run start` serves the chat route with v7 DB; unknown `layout` enum via API ⇒ 422; `layout_valid` clean.

### 10.2 Required tests (normative)

**`packages/shared/test/`** — `layout/resolve.test.ts` (defaults per mode, every field override, `tails` forced off outside `bubble`, `inert` per mode, determinism, unknown enum rejected); `layout/presets.test.ts` (classic document shape; L5 payload has zero `style` keys); `schemas.test.ts` additions (`layout` optional, `CharacterSummary` absence, `ThemeOverrides`/`THEME_PATHS` absence per L6, patch null-clears).

**`backend/test/`** — `migrations.test.ts` (v6→v7 on seeded DB: DDL, classic backfill on all NULL rows, `charTail: 'none'` ⇒ tails `false` case, unparseable-style fallback, idempotent re-run); `repositories.test.ts` (layout round-trip incl. null-clear, duplicate carries it, summary excludes it); `routes/characters.test.ts` (422 on bad enum; PATCH null clears to neutral); `db:check` audit test (`layout_valid`).

**`frontend/unit/`** — `layoutAttrs.test.ts` (attribute/var mapping table); `layoutContract.test.ts` (happy-dom: row-per-segment presence, `data-kind` on rows, `data-role` on article, L8 inline tags in `single`, zero avatar elements when off, monogram fallback when on, no `justify-end` by role); `studio.test.ts` parity extension (every `CharacterLayoutSchema` key has a binding; Auto option exists); `boundaries.test.ts` amended (L1/L2/C1 cases; chat entry size case if harness exists); `cssVars.test.ts` (no `--msg-measure` token emitted per L7).

### 10.3 Step-by-step verification

```bash
bun install && bun run typecheck && bun run test
bun run db:migrate && bun run db:check                      # user_version=7, layout_valid=ok
bun run --cwd frontend build && gzip -c frontend/build/_app/immutable/entry/*.js | wc -c   # chat entry unchanged ±2 KB

bun run dev   # http://127.0.0.1:5173  (fresh Edge profiles per capture; probes deleted afterwards)
#  1. Seeded narrative chat, blank card: tall + 900px captures → §2.1 neutral; DOM dump: data-align/container/headers present, 0 avatar elements, 0 console errors.
#  2. Same chat: flip align→split, container→bubble+tails, narrator→centered, names→classic → Classic-look capture; flip back → neutral restored.
#  3. Multi-voice fixture: headers=voices → per-row headers + monograms; headers=single → one owner header + inline voice tags (L8); DOM dump asserts tag count.
#  4. Seeded classic chat: neutral capture; narrator/NPC controls inert; headers Auto = single.
#  5. Backfill chat: pre/post migration screenshots pixel-identical; Studio shows stamped classic values.
#  6. Track-2: apply each preset sheet + one hand-written [data-kind] rule → paint; hideCustomStyling → sheets gone.
#  7. Studio: full layout pass in LivePreview (both mode toggles) → save → chat matches; stale-write dialog via second tab.
#  8. Narrow (≥500px layout width), touch, keyboard-only, axe on both modes × both header settings.

bun run build && bun run start
curl -s http://127.0.0.1:3000/api/characters/<id> | head -c 300      # layout present on detail
curl -s "http://127.0.0.1:3000/api/characters?limit=1" | grep -c layout  # 0 on summary
curl -si -X PATCH -H 'content-type: application/json' -d '{"expectedUpdatedAt":<n>,"layout":{"align":"sideways"}}' \
  http://127.0.0.1:3000/api/characters/<id> | head -1                   # 422
```

Artifacts for the PR: neutral/classic tall+short captures (both modes), single-vs-voices DOM dumps, backfill before/after pair, preset-sheet captures, axe summaries, `db:check` pre/post, keyboard/touch pass notes. Probe/scratch files removed; `git status` shows only intended files.

---

## 11. Explicit scope boundaries — deferred

Not in this blueprint: per-chat layout overrides (card default only; graduates on demand); `card` container; `uniform-right`; `density`; NPC registry images (fallbacks only); log-measure token (stylesheet constant per L7); per-message custom CSS; free author HTML in chat; persona-carried layout; state bindings targeting layout; new providers, sampling, or prompt-manager work; classic↔narrative mode conversion.

What this hands forward: a row-level markup contract every future chat feature (edit chrome, swipe UI, future per-chat overrides, future `card`/`density` fields) builds on without re-contracting; a `resolveLayout` pure function the exporter/importer can carry verbatim; Studio and preset patterns the next graduation reuses.

**Amendment (graduation that happened):** after the layout slices landed, the Studio custom-CSS authoring grew surface-scoped subtabs (showcase vs chat), virtual surface partitioning of the single stored `customCss` document (Invariant C15 — deterministic delimiters, zero-migration, total parser with heuristic legacy fallback), and a miniature chat-viewport LivePreview frame. Recorded as-built in the walkthrough §7 ("Post-Blueprint Architectural Horizons"); C15 is indexed in `docs/development.md` §6.3 and `docs/architecture.md` §11.3 alongside C14.

---

## 12. Execution order

1. **shared**: `schemas/layout.ts`, `layout/resolve.ts`, `layout/presets.ts`, manifest +5 hooks, `SHARED_VERSION` bump, resolve/preset/schema tests.
2. **backend storage**: migration v7 (DDL + honoring backfill loop) + `layout_valid` audit; repository mappers/statements/summary-exclusion/duplicate; migration + repository + `db:check` tests.
3. **backend routes**: no code change expected beyond schema flow — assert 422/stale/clear/summary-absence via route tests.
4. **frontend contract first**: `layoutAttrs.ts` (+ tests), `TurnRow`/`SegmentAvatar`, `MessageTurn` refactor, `MessageLog` attributes, `app.css` neutral + classic rules; amend `boundaries.test.ts` **before** any Studio work (it polices the rest); `layoutContract` tests green.
5. **frontend chat**: L8 inline tags, streaming stability, pencil/toolbar placement, narrator modes, avatar fallbacks; headless probes per axis (both modes).
6. **frontend studio**: `LayoutPanel`, StudioShell tab, LivePreview mode toggle + three-voice fixture, presets, Classic combo (L5-asserted), parity scan.
7. **backfill + compat sweep**: v6 fixture DB through migration, before/after paint pairs, old-sheet fixture over new markup, `hideCustomStyling`/`disableCharacterThemes` matrix.
8. **polish & §10.3**: narrow/touch/keyboard/axe, artifacts; update `docs/schema.md` (v7 + `layout` column), `docs/architecture.md` (layout-as-data, markup contract, mode matrix), `docs/development.md §6.3` (L1–L8 mapping); probes removed, `git status` clean.
