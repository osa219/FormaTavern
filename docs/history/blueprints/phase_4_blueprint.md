# Phase 3 Review → Approved

All nine criteria are evidenced; S1–S9 are asserted by the tests named, and the curl sequence covers the full node lifecycle. Five notes, none blocking:

1. **`stateOverrides` landed on `ChatMetadataSchema`**, whereas the spec placed the log on the message (`messages.metadata.stateOverrides`) and only the *cache* on the chat. Acceptable as long as `PATCH /chats/:id/state` also writes the active leaf's `messages.state` (your `current_state_integrity=ok` audit implies it does — confirm in the PR, because Phase 4's Block-7b expectations and the HUD's "source: override" glyph both read the leaf). Update `spec-message-lifecycle-and-api` to match whichever you keep.
2. **`serializeEnvelope` alongside `serializeSegments`** — two public names for one operation is drift bait. Keep one and re-export the other as a deprecated alias with a comment, or delete it.
3. **Live curl ran against `:3000` only.** The proxy path was proven in Phases 0–2 and Phase 4 exercises it continuously, so no action — just noting the gap.
4. **Two artifacts requested in §8.1 aren't in the walkthrough:** the browser reattach-after-reload proof (#8) and the OpenRouter live-smoke status (#7, "run" with output or "not run"). Record both in the PR.
5. The additive `GET /messages/:id/siblings` route is fine; Phase 4 will use `siblingIndex/siblingCount` decorations and only fall back to it for the carousel's prefetch.

Proceed.

---

# FormaTavern — Phase 4 Blueprint: Chameleon Frontend Canvas (The UI Engine)

**Purpose:** Replace the diagnostic canvas with the product: a reading-first salon whose entire visual identity is a function of data — `(character.style, persona.styleOverrides, stateBindings, currentState, accessibilityPrefs) → CSS custom properties` — rendered through **one** message component, streamed at frame rate without fighting the reader's scroll, and operable end-to-end from keyboard and touch. Everything the UI shows is already computed by the backend (`segments`, `state`, `parse`, sibling ordinals); the frontend parses only the *live* stream and never re-parses persisted rows.

**New dependencies (frontend):** `tailwindcss` + `@tailwindcss/vite` (v4), `marked`, `dompurify`, `@fontsource-variable/{cinzel,playfair-display,inter,jetbrains-mono}`, dev: `happy-dom`. **Shared:** none (pure theme cascade added). **Backend:** one additive change — mount `ASSETS_DIR` at `/assets` (see §3.4). **`SHARED_VERSION`:** `0.4.0-phase4`.

---

## 1. Invariants for this phase

| # | Invariant | Enforced by |
|---|---|---|
| U1 | **Cascade order is fixed and pure:** `NEUTRAL → character.style → stateBindings (in array order, later wins) → persona.styleOverrides → accessibility`. `resolveTheme()` lives in `shared`, has no DOM/clock/random, and is the only place tokens are combined. | `shared/test/theme/cascade.test.ts` |
| U2 | **Zero runtime CSS injection.** No `<style>` elements created at runtime, no `document.styleSheets` mutation, no class-name strings built from data. Tokens reach the DOM through exactly one `style` attribute on the theme root (`--theme-*` custom properties); everything else is static Tailwind utilities and `app.css`. | Grep test over `src/` for `<style` creation / template-literal `class=`; `cssVars.test.ts` |
| U3 | **Persisted rows are never parsed on the client.** `MessageView.segments/state/metadata.parse` are rendered as received. `parseEnvelope` runs only on the live buffer of the one streaming turn. | Import boundary: `parseEnvelope` imported solely in `stream.svelte.ts` |
| U4 | **Frame budget:** per animation frame, per stream: ≤ 1 `parseEnvelope`, ≤ 1 reactive commit, ≤ 1 markdown render (the last segment only). Token arrival never touches `$state` directly. | `streamBuffer.test.ts` with fake rAF; `?dev=1` overlay records max frame cost |
| U5 | **Scroll ownership:** auto-follow only while `stuck` (reader within 48 px of the bottom). A user scroll gesture disengages; nothing re-engages except the reader (Jump-to-latest, or scrolling back to the bottom). Programmatic scrolls never count as gestures. | `scroll/policy.test.ts` |
| U6 | **Layout stability:** hover/focus toolbars occupy reserved space; the caret is `position:absolute`; theme transitions animate only paint properties (color, background, border-color, opacity) — never size, font, or layout. Streaming growth is the only permitted content shift, and only at the bottom edge. | CSS review checklist; Lighthouse CLS ≤ 0.02 on a 300-turn chat |
| U7 | **Reconciliation:** the terminal `done`/`error` payload replaces the streamed turn wholesale; the client never trusts its own buffer past the terminal event (S4 mirror). | `session.test.ts` |
| U8 | **Accessibility floor holds under every theme:** focus rings, control contrast, and chrome text use the neutral palette — never character tokens. `disableCharacterThemes` yields a WCAG-AA neutral reading theme; `prefers-reduced-motion` zeroes all durations; every action is reachable by keyboard; streaming is `aria-busy`, announced once at terminal. | `a11y` checklist §8.3, axe 0 serious/critical |
| U9 | **Route-scoped state (ADR-003):** `ChatSession` is constructed per `chatId` under `{#key}` and destroyed on navigation. Leaving a chat unsubscribes the SSE reader only — generation continues (S1) and is re-attached on return via `activeGenerationMessageId`. | `session.test.ts`; manual reattach check |
| U10 | **Purity boundaries unchanged:** `svelte-check` stays 0/0 over `treaty<App>`; `shared` gains only pure modules. | `bun run typecheck` |

---

## 2. Design language (normative where stated)

### 2.1 The two palettes
- **Character palette** — the `--theme-*` tokens. Owns: bubbles, narrator prose, quote/action tints, backdrop, ambient accent. Mutable by data.
- **Chrome palette** — fixed neutral (`neutral-950…50`, OKLCH), used for drawers, composer shell, toolbars, dialogs, focus rings, toasts. Immutable, contrast-verified. The chrome may *borrow a whisper* of the character accent — and only via `color-mix()` at ≤ 8 %:
  ```css
  --chrome-bg:      color-mix(in oklab, var(--n-950), var(--theme-accent) 6%);
  --chrome-surface: color-mix(in oklab, var(--n-900), var(--theme-accent) 8%);
  --chrome-line:    color-mix(in oklab, var(--n-800), var(--theme-accent) 10%);
  ```
  This is what makes the whole app feel re-tuned per character without ever risking legibility of controls.

### 2.2 Typography
- Narrative text uses `--theme-font-family` at a fluid size: `font-size: clamp(0.95rem, 0.9rem + 0.25vw, 1.0625rem)` × `--theme-font-size` multiplier; `line-height: var(--theme-line-height)`; `text-wrap: pretty`; `hanging-punctuation: first`.
- Measure: bubbles `max-width: min(70ch, 85%)` (desktop `70%`); narrator prose `max-width: 62ch`, centered, italic, letter-spacing `0.005em`, color `--theme-narrator-color`, with a hairline `⁂`-free separator: 1 px `color-mix(accent 25%)` rule 3rem wide above when it follows a bubble.
- Speech `<q>`/`.speech` → `--theme-quote-color`, weight 500; actions `<em>` → `--theme-action-color`. Speaker labels (NPC, non-primary character): `0.6875rem`, uppercase, tracking `0.08em`, 75 % opacity, chrome font (`Inter`), never the character font.
- Chrome text: `Inter Variable`; mono for ids/dev: `JetBrains Mono Variable`. Curated self-hosted families (`Cinzel`, `Playfair Display`, `Inter`, `JetBrains Mono`) are registered by importing `@fontsource-variable/*` in `app.css` with `font-display: swap`. Any other family in a theme falls through the CSS stack the author wrote.

### 2.3 Geometry & atmosphere
- Bubble radius `--theme-bubble-radius`; padding `--theme-bubble-padding`; a 1 px border `--theme-char-border` / `--theme-user-border`; shadow `0 1px 0 rgb(0 0 0 / .08), 0 8px 24px -16px rgb(0 0 0 / .45)`. Tails are 10 px CSS triangles via `::after`, driven by `data-tail="left|right|none"`.
- NPC bubbles are **tinted from the character bubble**, not from an unrelated palette:
  `background: color-mix(in oklab, var(--theme-char-bg) 68%, hsl(var(--npc-hue) 55% 45%) 32%)` where `--npc-hue` is `chat.metadata.npcs[key].accent`-derived if present, else a stable hash of the name. Text uses `--theme-char-text`. Coherent with any theme, light or dark.
- Backdrop: image layer (`object-fit: cover`, `filter: blur(var(--theme-bg-blur))`, scaled `1.06` to hide blur edges) under an overlay layer (`--theme-bg-overlay`). **No image ⇒ ambient gradient**, never a flat wall:
  `radial-gradient(120% 80% at 20% 0%, color-mix(in oklab, var(--theme-accent), transparent 86%), transparent 60%), radial-gradient(90% 70% at 100% 100%, color-mix(in oklab, var(--theme-char-bg), transparent 40%), transparent 70%), var(--n-950)`.
- Motion tokens: `--motion-theme: 600ms`, `--motion-ui: 180ms`, `--motion-enter: 240ms`, easing `cubic-bezier(.22,1,.36,1)`. Under `prefers-reduced-motion: reduce` **all three are `0ms`** and the caret does not blink.

### 2.4 The anti-strobe mechanism (normative)
Color and length tokens are **registered** so the custom properties themselves interpolate; every consumer then transitions in lockstep, including gradients, `color-mix()` results and borders, with no per-component transition lists:
```css
@property --theme-accent    { syntax: '<color>';  inherits: true; initial-value: #94a3b8; }
@property --theme-char-bg   { syntax: '<color>';  inherits: true; initial-value: #1e293b; }
/* …every color token…; and: */
@property --theme-bubble-radius { syntax: '<length>'; inherits: true; initial-value: 1rem; }

.theme-root { transition: --theme-accent var(--motion-theme), --theme-char-bg var(--motion-theme), /* …all registered tokens… */; }
.theme-root[data-transitions="off"] { transition: none; }      /* first paint + reduced motion */
```
Unregistered tokens (font family, padding shorthand, background image) snap. The backdrop image cross-fades through a two-layer A/B buffer (§5.3) so the snap is invisible. Browsers without `@property` degrade to an instant switch — correct, just less lovely.

---

## 3. Architecture & file layout

### 3.1 `frontend/`

```
frontend/
├── bunfig.toml                       # [test] preload = ["./unit/setup.ts"]  (happy-dom registrator)
├── unit/                             # bun tests for pure modules — OUTSIDE src so svelte-check ignores them
│   ├── tsconfig.json                 # extends ../tsconfig.json; "types": ["bun"]; include ["."]
│   ├── setup.ts                      # GlobalRegistrator.register()
│   ├── markdown.test.ts  cssVars.test.ts  scrollPolicy.test.ts  streamBuffer.test.ts  session.test.ts  shortcuts.test.ts  boundaries.test.ts
├── static/                           # favicon, manifest-less
├── src/
│   ├── app.html                      # <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">, color-scheme dark
│   ├── app.css                       # Tailwind v4 entry, @property registrations, @theme inline bridge, :root neutral tokens, chrome palette, prose-roleplay, motion, reduced-motion
│   ├── lib/
│   │   ├── api/  client.ts (treaty<App>, toUiError)  sse.ts (readSse<ChatStreamEvent>)  errors.ts (code→copy)
│   │   ├── state/
│   │   │   ├── session.svelte.ts     # ChatSession — route-scoped
│   │   │   ├── stream.svelte.ts      # StreamController — rAF buffer commit (only importer of parseEnvelope)
│   │   │   ├── settings.svelte.ts    # global settings + BroadcastChannel('formatavern_sync')
│   │   │   ├── prefs.svelte.ts       # device prefs: a11y toggles, enterToSend, devMode — localStorage
│   │   │   ├── media.svelte.ts       # reducedMotion, reducedTransparency, coarsePointer (matchMedia)
│   │   │   └── toasts.svelte.ts
│   │   ├── theme/  engine.svelte.ts (ThemeEngine)  cssVars.ts (themeToCssVars, CSS_VAR_NAMES)
│   │   ├── render/ markdown.ts (renderRoleplayMarkdown)  speech.ts (marked inline ext)  npcTint.ts (npcHue)
│   │   ├── scroll/ policy.ts (pure)  controller.svelte.ts (element binding, prepend anchoring)
│   │   ├── actions/ shortcuts.ts  autosize.ts  clickOutside.ts
│   │   └── components/
│   │       ├── chat/     ChatViewport  Backdrop  MessageLog  MessageTurn  SpeechBubble  NarratorBlock  TurnToolbar  SwipeCarousel  StreamCaret  JumpToLatest  ErrorSlate
│   │       ├── composer/ Composer  DirectorDrawer  VoiceSelect
│   │       ├── hud/      StateHud  StateOverridePopover
│   │       ├── nav/      TopBar  NavDrawer  ChatListItem  CharacterCard
│   │       ├── settings/ SettingsSheet  ProviderPanel  GenerationPanel  AccessibilityPanel
│   │       ├── dialogs/  EditTurnDialog  ConfirmDialog
│   │       └── ui/       Markdown  Toaster  Icon  Spinner  Kbd  VisuallyHidden
│   └── routes/
│       ├── +layout.ts (ssr=false)  +layout.svelte (shell: app.css, settings/prefs/media init, Toaster, dev flag)
│       ├── +page.svelte                     # Foyer: characters + recent chats
│       ├── chat/[chatId]/+page.ts (load)  +page.svelte ({#key chatId} → ChatSession, ThemeEngine, ChatViewport)
│       └── dev/+page.svelte                 # relocated Phase 3 bare canvas; renders 404 copy unless import.meta.env.DEV
```

### 3.2 `packages/shared` additions
```
packages/shared/src/theme/
├── cascade.ts     # resolveTheme, matchesWhen, applyBindingSet, THEME_PATHS (the 20 legal dotted paths)
├── defaults.ts    # DEFAULT_CHARACTER_THEME (moved here, re-exported from schemas/theme), NEUTRAL_A11Y_THEME
└── index.ts
packages/shared/test/theme/cascade.test.ts
```

### 3.3 Tailwind v4 bridge (`app.css`, normative shape)
```css
@import "tailwindcss";
@import "@fontsource-variable/inter"; @import "@fontsource-variable/cinzel";
@import "@fontsource-variable/playfair-display"; @import "@fontsource-variable/jetbrains-mono";

:root { /* neutral values for every --theme-* so the Foyer and drawers render without a theme root */ }

@theme inline {
  --color-char-bg: var(--theme-char-bg);   --color-char-text: var(--theme-char-text);   --color-char-border: var(--theme-char-border);
  --color-user-bg: var(--theme-user-bg);   --color-user-text: var(--theme-user-text);   --color-user-border: var(--theme-user-border);
  --color-accent: var(--theme-accent);     --color-quote: var(--theme-quote-color);     --color-action: var(--theme-action-color);
  --color-narrator: var(--theme-narrator-color);
  --color-chrome-bg: var(--chrome-bg);     --color-chrome-surface: var(--chrome-surface); --color-chrome-line: var(--chrome-line);
  --font-narrative: var(--theme-font-family);  --font-chrome: 'Inter Variable', system-ui, sans-serif;
  --radius-bubble: var(--theme-bubble-radius);
}
```
Components use only static utilities: `bg-char-bg text-char-text border-char-border rounded-bubble font-narrative p-(--theme-bubble-padding)`. The arbitrary-value form `p-(--var)` is the *only* sanctioned data-driven utility, and only with a fixed variable name.

### 3.4 Backend & proxy touch (the only one)
- `index.ts`: mount `ASSETS_DIR` at `/assets` with `staticPlugin({ assets: ASSETS_DIR, prefix: '/assets' })` — in dev **and** prod; traversal-guarded as the SPA handler is. Cache: `immutable` is wrong for user files — use `Cache-Control: public, max-age=3600`.
- `vite.config.ts`: add `'/assets': { target: 'http://127.0.0.1:3000', changeOrigin: true }`.
- Seeds stay imageless (the ambient gradient is the default look). A background dropped into `data/assets/backgrounds/` and referenced by a card's `style.background.image` is served at `/assets/backgrounds/<file>` — matches `AssetPath`.

---

## 4. Theme engine

### 4.1 `resolveTheme` (shared, pure) — normative semantics

```ts
export interface ThemeInputs {
  character?: CharacterTheme;                 // undefined → NEUTRAL
  bindings?: StateBinding[];
  state?: StateVector;
  persona?: ThemeOverrides;
  a11y: { disableCharacterThemes: boolean; disableReactiveTheming: boolean };
}
export interface ResolvedTheme { theme: CharacterTheme; appliedBindings: number[]; warnings: string[]; }
export function resolveTheme(i: ThemeInputs): ResolvedTheme;
```
1. Start from `structuredClone`-free deep copy of `DEFAULT_CHARACTER_THEME`, deep-merge `character` (missing optionals stay default).
2. If `!a11y.disableReactiveTheming && bindings && state`: for each binding in order, `matchesWhen(binding.when, state)` ⇒ for each `[path, value]` in `set`: path ∈ `THEME_PATHS` and `CssToken`-valid ⇒ assign; else push warning (never throw). Record index in `appliedBindings`.
   - **`matchesWhen`**: every key in `when` must exist in `state` and be equal after normalization: strings compared case-insensitively and trimmed; numbers numerically (`'7'` vs `7` equal); booleans strictly; arrays/objects never match. Empty `when` never matches (a binding must be conditional).
3. Deep-merge `persona` (any legal key; the editor UI will only expose user-bubble keys later, the cascade doesn't care).
4. If `a11y.disableCharacterThemes`: return `NEUTRAL_A11Y_THEME` (system-ui, `#e2e8f0` on `#0f172a`, borders visible, no background image, radius `0.75rem`) — but keep `background: {}` so no backdrop loads. Bindings and persona are ignored (`appliedBindings: []`).
5. Deterministic: equal inputs ⇒ deep-equal output.

### 4.2 `themeToCssVars` (frontend, pure)
Produces `Record<CssVarName, string>` for **exactly** the 17 variables enumerated in the UI/UX spec (`--theme-font-family … --theme-bg-overlay`) plus `--theme-char-tail`, `--theme-user-tail`. Rules: optional colors fall back as in the spec; `--theme-bg-img` is `url("<path>")` with `"` and `\` escaped (`CSS.escape` is not for URLs — escape manually) or `none`; output is serialized to one `style` string in a **fixed key order** so the DOM attribute is stable (no spurious style-recalc from reordering). Test asserts key set and order.

### 4.3 `ThemeEngine` (frontend, runes)
```ts
export class ThemeEngine {
  constructor(private inputs: () => { character?: CharacterCard; persona?: Persona; state: StateVector }) {}
  readonly resolved = $derived(resolveTheme({
    character: this.inputs().character?.style, bindings: this.inputs().character?.stateBindings,
    state: this.inputs().state, persona: this.inputs().persona?.styleOverrides,
    a11y: { disableCharacterThemes: prefs.disableCharacterThemes, disableReactiveTheming: prefs.disableReactiveTheming }
  }));
  readonly styleAttr = $derived(serializeVars(themeToCssVars(this.resolved.theme)));
  readonly backgroundImage = $derived(this.resolved.theme.background.image ?? null);
}
```
`ChatViewport` applies `style={engine.styleAttr}` on the root, `data-transitions={ready && !media.reducedMotion ? 'on' : 'off'}`, where `ready` flips to `true` in an `$effect` **after** the first frame (`requestAnimationFrame` twice) — first paint is themed but not animated, so route entry never strobes from neutral to character.

State source for bindings: `session.currentState` = the streaming turn's *live* `resolveState(previous, livePatch)` is **not** used — bindings react at terminal only, when `done.message.state` arrives. Rationale: a half-typed `"mood": "fur` would flap; the spec's 600 ms transition is for the committed change. (Dev mode may show the live patch in the HUD, greyed.)

---

## 5. Component hierarchy & state contracts

### 5.1 Tree

```
+layout.svelte  (Toaster, global keyboard scope, settings/prefs init)
└── chat/[chatId]/+page.svelte   {#key chatId}  → new ChatSession(data), new ThemeEngine(() => session.themeInputs)  setContext
    └── ChatViewport  [theme root: style=--theme-*; data-transitions; grid: topbar / log / composer; 100dvh]
        ├── Backdrop            (A/B image layers + overlay + ambient gradient)
        ├── TopBar              (menu ▤, character name + avatar, StateHud, ⋯ settings)
        │   └── StateHud ▸ StateOverridePopover
        ├── MessageLog          (scroll container; sentinel top; windowed turns; JumpToLatest)
        │   ├── MessageTurn ×N  (segments → NarratorBlock | SpeechBubble; TurnToolbar; SwipeCarousel; ErrorSlate)
        │   └── MessageTurn (live)  ← session.live, StreamCaret in last segment
        ├── Composer            (autosize textarea, VoiceSelect, Director toggle, Send/Stop)
        │   └── DirectorDrawer  (one-shot note, standing direction → PATCH chat.metadata)
        ├── NavDrawer <dialog>  (chats grouped by character; generating indicator; New chat)
        ├── SettingsSheet <dialog> (Provider / Generation / Narrative / Accessibility panels)
        └── EditTurnDialog, ConfirmDialog <dialog>
```
Drawers and dialogs are native `<dialog>` (focus trap, Esc, inert background for free); on `coarsePointer` they present as bottom sheets via CSS only.

### 5.2 `ChatSession` contract (`session.svelte.ts`)

```ts
export class ChatSession {
  readonly chatId: string;
  chat        = $state<ChatView>();             character = $state<CharacterCard>();    persona = $state<Persona>();
  messages    = $state.raw<MessageWithTree[]>([]);  // active-branch window, ascending. RAW: replaced immutably, never mutated.
  hasOlder    = $state(true);                   loadingOlder = $state(false);
  live        = $state<LiveTurn | null>(null);  // exactly one while streaming
  currentState = $derived(this.chat?.metadata.currentState ?? defaultState(this.character));
  activeLeafId = $derived(this.chat?.activeLeafId ?? null);
  busy        = $derived(this.live !== null);
  themeInputs = $derived({ character: this.character, persona: this.persona, state: this.currentState });

  // commands — all return void, surface failures via toasts, and never throw to the template
  send(input: { message?: string; directorNote?: string; narrativeRole?: NarrativeRole; senderName?: string }): Promise<void>;
  stop(): Promise<void>;
  regenerate(messageId: string): Promise<void>;
  continueTurn(messageId: string): Promise<void>;
  select(siblingId: string): Promise<void>;          // POST /select → refetch window
  edit(messageId: string, content: string): Promise<void>;
  remove(messageId: string): Promise<void>;
  overrideState(patch: StateVector): Promise<void>;
  loadOlder(): Promise<void>;                        // prepend; caller handles anchoring
  reattach(): Promise<void>;                         // if chat.activeGenerationMessageId → GET /messages/:id/stream
  destroy(): void;                                   // abort SSE reader ONLY (S1); clear rAF
}
export interface LiveTurn {
  messageId: string | null; parentId: string | null;   // null until `start`
  optimisticUserId: string | null;                     // temp id of the optimistic user turn
  segments: Segment[]; heldBack: string; warnings: ParseWarningCode[]; truncatedAt: 'persona' | null;
  chars: number; startedAt: number; ttftMs: number | null; phase: 'connecting' | 'streaming' | 'finishing';
  resumedFrom: number;
}
```
**Command choreography (normative):**
- `send`: push optimistic user turn (`id: 'tmp-…'`, `status:'complete'`) and set `live = { phase:'connecting', … }` **synchronously**; then `POST`. `start` → set ids. Non-2xx before `start` → remove optimistic turn, `live = null`, toast by code (`generation_in_progress` → "Eldrin is still writing — stop first?"; `provider_unconfigured` → opens SettingsSheet; `prompt_budget_exceeded` → shows `details.report`).
- terminal (`done`/`error`) → `live = null`; `messages` = window refetched (`GET /chats/:id/messages?limit=WINDOW`) **and** `chat` refetched (for `activeLeafId`, `currentState`, `npcs`). One round-trip pair; replaces both optimistic and streamed turns wholesale (U7). Announce via live region: "Eldrin replied" / "Generation stopped" / "Generation failed".
- `select` / `remove` / `edit` → refetch window (+ chat). `regenerate` / `continueTurn` → same as `send` from `live` onward (no optimistic user turn; `continue` seeds `segments` from the existing row and sets `resumedFrom`).
- `stop` → `POST /stop`; the terminal event arrives through the open stream; the button shows a spinner until then (max 3 s, then toast "still stopping…").
- `reattach` is called in the constructor when `chat.activeGenerationMessageId` is set and by a visibility-change handler when the tab returns after the reader died (`readSse` rejects) with `activeGenerationMessageId` still set.

### 5.3 `StreamController` (`stream.svelte.ts`) — the rAF gate

```ts
export class StreamController {
  private buffer = '';           // plain field — NOT $state
  private dirty = false; private raf = 0;
  constructor(private opts: () => ParseOptions, private commit: (r: ParseResult, chars: number) => void) {}
  push(text: string) { this.buffer += text; this.dirty = true; if (!this.raf) this.raf = requestAnimationFrame(this.tick); }
  seed(content: string) { this.buffer = content; this.dirty = true; this.tick(); }
  private tick = () => { this.raf = 0; if (!this.dirty) return; this.dirty = false;
    const r = parseEnvelope(this.buffer, { ...this.opts(), streaming: true }); this.commit(r, this.buffer.length); };
  flush() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; this.tick(); }
  dispose() { if (this.raf) cancelAnimationFrame(this.raf); }
}
```
`commit` assigns `live.segments/heldBack/warnings/truncatedAt/chars` (one reactive write per frame). When the tab is hidden, `requestAnimationFrame` pauses — acceptable: nothing is visible; `flush()` runs on `visibilitychange → visible`. Tests inject a fake rAF.

### 5.4 `MessageTurn` (the one message component)

```svelte
<script lang="ts">
  import type { Segment, MessageStatus } from '@formatavern/shared';
  let { segments, status, narrativeRole, primaryName, npcs, streaming = false, isLast = false,
        toolbar }: { …; toolbar?: import('svelte').Snippet } = $props();
  const lastIdx = $derived(segments.length - 1);
  const ownedByUser = $derived(narrativeRole === 'persona');
</script>

<article class="turn group relative my-3 flex w-full flex-col gap-2" data-role={narrativeRole} data-status={status}
         aria-busy={streaming} style="content-visibility:auto; contain-intrinsic-size: auto 6rem;">
  {#each segments as seg, i (i)}          <!-- index-keyed on purpose: positional, only the last mutates -->
    {#if seg.kind === 'narrator'}
      <NarratorBlock text={seg.text} live={streaming && i === lastIdx} />
    {:else}
      <SpeechBubble variant={seg.kind} name={seg.name} {primaryName} hue={seg.kind === 'npc' ? npcHue(seg.name, npcs) : null}
                    text={seg.text} live={streaming && i === lastIdx} />
    {/if}
  {/each}
  {#if streaming && segments.length === 0}<SpeechBubble variant="character" name={primaryName} {primaryName} text="" live />{/if}
  {#if status === 'error'}<ErrorSlate />{/if}
  <div class="toolbar-slot h-7">{@render toolbar?.()}</div>   <!-- reserved height: no hover shift (U6) -->
</article>
```
`SpeechBubble`: `variant ∈ character|npc|persona`; alignment `persona → justify-end`; tail from `data-tail`; label shown when `variant==='npc'` or (`character` and `name !== primaryName`); body `<Markdown text/>`; `live` renders `<StreamCaret/>` absolutely positioned after the last block. `NarratorBlock`: centered measure, `<Markdown text/>`, the hairline rule when not the first segment.

`Markdown.svelte`: `const html = $derived(renderRoleplayMarkdown(text)); {@html html}` — `$derived` memoizes per segment; earlier segments' text never changes, so only the live segment re-renders (U4).

### 5.5 Markdown pipeline (`render/markdown.ts`) — normative
- `marked` with `gfm: true, breaks: true`, **disabled**: raw HTML (`marked` option to treat HTML as text — escape it), images, tables, headings (`#` in prose renders literally — roleplay text uses `#` rarely and never as headings), links rendered as plain `<a rel="noopener noreferrer" target="_blank">` only for `http(s):`; everything else stays text.
- Speech extension (`render/speech.ts`): inline tokenizer matching `"…"` and `“…”` on a single line (no newline inside, ≤ 600 chars) → `<q class="speech">…</q>` (quotes kept as text inside, so copy/paste is faithful). Registered **before** emphasis so `*she whispers, "come"*` yields `<em>… <q>…</q></em>`. Never inside code spans (tokenizer order handles it).
- DOMPurify: `ALLOWED_TAGS: ['p','br','em','strong','q','code','pre','blockquote','ul','ol','li','hr','a','span','del','s']`, `ALLOWED_ATTR: ['class','href','rel','target']`, `ALLOW_DATA_ATTR: false`, hook `uponSanitizeAttribute` allowing `class` only when value is `speech`, `href` only `^https?:`. `FORBID_TAGS: ['style','script','img','svg','math']`. This is the last line; `marked` already escapes, DOMPurify catches regressions.
- Streaming tolerance: unterminated `*` / `"` render literally (marked's default); no attempt to auto-close.
- Dev mode (`?dev=1`): `Markdown` shows leaked markers by not stripping anything — but persisted content is already clean; dev mode instead renders `metadata.parse.warnings` and the raw `content` in a collapsible per turn.

---

## 6. Streaming, scrolling, windowing

### 6.1 Scroll policy (`scroll/policy.ts`, pure)
```ts
export interface ScrollSample { scrollTop: number; scrollHeight: number; clientHeight: number; }
export const STICK_THRESHOLD_PX = 48;
export function isAtBottom(s: ScrollSample): boolean;                       // scrollHeight - scrollTop - clientHeight <= 48
export function nextStuck(prev: boolean, s: ScrollSample, cause: 'user' | 'program' | 'content'): boolean;
//   user    → isAtBottom(s)            (gesture decides)
//   program → prev                     (our own scrolls never change ownership)
//   content → prev                     (growth never re-engages)
export function prependAdjust(beforeHeight: number, afterHeight: number, scrollTop: number): number; // scrollTop + (after - before)
```
### 6.2 `ScrollController` (element-bound)
- Gesture detection: `wheel`, `touchmove`, `keydown` (PageUp/Home/arrows while the log is focused), and `pointerdown` on the scrollbar region set `lastGestureAt = now`. A `scroll` event within 120 ms of a gesture ⇒ `cause:'user'`; a `scroll` following our `scrollTo` ⇒ `cause:'program'` (flag set before `scrollTo`, cleared on the next `scroll` event).
- Follow: after each live commit (same frame, in the `commit` callback), if `stuck` ⇒ `el.scrollTop = el.scrollHeight` (instant; smooth scrolling lags a stream). `JumpToLatest` pill appears when `!stuck && (live || unreadTail)`; clicking scrolls smoothly (respecting reduced motion) and sets `stuck = true`.
- `overflow-anchor: none` on the log; anchoring is ours: `loadOlder` measures `scrollHeight` before/after prepend in the same tick (Svelte `flushSync` or `tick()`) and applies `prependAdjust`.
- Composer height changes (autosize, drawer) shift the log's `clientHeight`; when `stuck`, re-pin in a `ResizeObserver` callback.
- Mobile keyboard: `interactive-widget=resizes-content` makes the layout viewport shrink so `100dvh` grid stays correct; a `visualViewport.resize` listener re-pins when `stuck` (iOS Safari < 17 fallback).

### 6.3 Windowing (Decision D4 — no virtual scroller in v1)
- `WINDOW = 60` turns fetched initially; `loadOlder` fetches 60 more via `before` when the top sentinel intersects. Rendered turns are capped at `WINDOW_MAX = 240`: when exceeded **and** `stuck`, the oldest 60 are dropped from `messages` (re-fetchable); never trimmed while the reader is up the log.
- `content-visibility: auto` + `contain-intrinsic-size` on every turn skips layout/paint for off-screen turns. Measured target: 1,000-turn branch scrolled end-to-end at 60 fps on a mid-range laptop with ≤ 240 in DOM. A true variable-height virtualizer is deferred until this measurably fails.

---

## 7. Interaction design

### 7.1 Composer
- Autosize textarea (1–8 rows), placeholder `Speak as Traveler…` (changes with voice: `Narrate…`, `Speak as <NPC>…`). `VoiceSelect` is a compact pill left of the input: `Traveler · Narrator · NPC… · Eldrin` (maps to `narrativeRole`; `npc` reveals a name field with datalist from `chat.metadata.npcs`).
- Send: `Enter` (pref `enterToSend`, default on; `Shift+Enter` newline) or `Ctrl/⌘+Enter` always. Empty message with a director note ⇒ allowed ("director-only turn"); empty both ⇒ disabled.
- While `busy`: Send morphs into **Stop** (same footprint, U6), input stays editable (drafting the next line while reading is a feature), `Enter` is inert with a subtle shake + tooltip "still writing".
- Director toggle `🎬` opens `DirectorDrawer` above the input: one-shot note (cleared after send, chip shown in the sent turn's toolbar as "note attached") and standing direction (persisted via `PATCH /chats/:id { metadata: { standingDirection } }`, debounced 600 ms, saved indicator).

### 7.2 Turn toolbar & swipes
- Toolbar appears on hover/focus-within for any turn, always for the last turn; contents by role: user → `edit · delete · copy`; assistant → `SwipeCarousel · regenerate ↻ · continue ⏵ (leaf only) · edit · delete · copy · (dev) parse info`. Icons are 24 px in 36 px targets (44 px on coarse pointer).
- `SwipeCarousel`: `◀  2 / 3  ▶`. `◀` disabled at index 0; `▶` on the last sibling **regenerates** (new swipe) — labelled `▶+` with tooltip "New reply", so it's not a surprise. Both disabled while `busy`. `select(siblingId)` needs sibling ids: fetch lazily via `GET /messages/:id/siblings` on first hover/focus of the carousel and cache per parent; the count/index come from decorations without any request.
- Transition: the turn's inner wrapper cross-fades 180 ms (`opacity` + `translateX(±8px)`), outer height reserved by keeping the old content until the new page arrives (skeleton shimmer if > 250 ms). Reduced motion ⇒ instant.
- `EditTurnDialog`: raw `content` textarea (monospace), for assistant turns shows a hint that state is recomputed and downstream turns are not; saves via `PATCH { content }`; server reparse result replaces the row.
- Delete: `ConfirmDialog` stating the subtree count (`hasChildren` ⇒ "and 4 later turns"); the log animates the removal only under motion.

### 7.3 Keyboard map (`actions/shortcuts.ts`)

| Keys | Where | Action |
|---|---|---|
| `Enter` / `Shift+Enter` / `Ctrl+Enter` | composer | send / newline / send (always) |
| `Esc` | anywhere | stop generation if busy; else close topmost drawer/popover |
| `Alt+←` / `Alt+→` | anywhere (not in text fields) | previous / next swipe on the **last assistant turn** (`→` at end = regenerate, requires confirm-less; shows toast "new reply") |
| `Alt+D` | anywhere | toggle Director drawer |
| `Alt+S` | anywhere | toggle State HUD popover |
| `Alt+N` | anywhere | Nav drawer |
| `/` | not in text fields | focus composer |
| `PageUp/PageDown/Home/End` | log focused | native scroll (counts as gesture) |

Rules: shortcuts never fire while focus is in `input/textarea/[contenteditable]` except `Esc` and `Ctrl+Enter`; a `<Kbd>`-rendered cheat sheet lives in Settings; `Alt`-combos are chosen because browsers reserve `Ctrl/⌘+letter`.

### 7.4 State HUD
- Ambient chips in the TopBar: `calm · ♥ 5 · danger low · spire observatory` rendered in chrome typography at 60 % opacity; a chip whose value changed on the last terminal event pulses once (`--motion-enter`), and the theme transition runs simultaneously — the reader *sees* the world shift.
- Source glyph: `◆ patch`, `◇ inherited`, `✎ override`, `○ initial` (from the leaf's `metadata.stateSource`), tooltip lists `stateWarnings`.
- Click / `Alt+S` → `StateOverridePopover`: a form generated from `character.stateSchema` — enum → segmented control, int → range slider with numeric input clamped to `[min,max]`, string → text input (200 max). Schema-less characters get a key/value editor for primitives. Submit → `overrideState(patch)`; response `warnings` shown inline (e.g. "affinity clamped to 10").

### 7.5 Foyer (`/`) and navigation
- Foyer: character cards render a **live theme swatch** — a miniature `SpeechBubble` pair styled by that character's tokens on that character's ambient gradient (each card is its own `theme-root` with `data-transitions="off"`). This is the "chameleon" thesis visible before the first message. Recent chats below, grouped by character, with a "writing…" dot when `activeGenerationMessageId` is set.
- `NavDrawer` inside a chat: same list, plus **New chat** with this character. Deleting a chat requires confirm; deleting the current chat navigates to `/`.
- Settings: `SettingsSheet` panels bind to `settings.svelte.ts` (PATCH on change, debounced for numeric fields, immediate for selects; API key field is write-only with `apiKeyHint` shown; `Clear key` sends `null`). BroadcastChannel post after each successful PATCH; incoming messages update the store when `tabId !== self`. **Accessibility panel** is device-local (`prefs`): `Disable character themes`, `Disable reactive theming`, `Enter to send`, `Reduce motion (follow system / on)`.

---

## 8. Tricky traps & failure modes

### 8.1 Theming & CSS

| Trap | Symptom | Guard |
|---|---|---|
| Theme applied in `onMount` | One neutral frame, then a 600 ms swoosh on every chat open | Theme is derived from `load` data before first render; transitions off until after first frame (`data-transitions`) |
| `transition: all` or transitioning `padding/font-size` | Layout jank during theme change; text reflow ripples | Only registered custom properties transition (§2.4); `unit/boundaries.test.ts` greps for `transition: all` / `transition-all` |
| `@property` initial-value mismatch (e.g. `rgba()` string rejected as `<color>`?) | Token registered but browser ignores value → falls to initial | `initial-value` must be a computationally independent color (`#hex`); all `CssToken` colors the schema admits are valid `<color>` — `rgba()` is fine. A `cssVars.test.ts` case asserts every color in both seeds passes `CSS.supports('color', v)` in happy-dom → use a manual allow-list instead (happy-dom lacks `CSS.supports`); document that unsupported values snap, never break |
| Dynamic Tailwind class strings (`bg-${x}`) | Purged in prod, works in dev | U2 grep test; only `p-(--theme-bubble-padding)` sanctioned |
| `url()` built from unescaped path | Style attribute breakout | Path is `AssetPath`-validated *and* escaped in `themeToCssVars`; test with `"` in the path (rejected by schema, escaped anyway) |
| `backdrop-filter`/`filter: blur()` on a full-screen layer | GPU thrash on phones; battery | Blur on the image layer only (not backdrop-filter); `will-change: transform`; blur capped at 12 px; disabled when `prefers-reduced-transparency` or `coarsePointer && deviceMemory ≤ 4` |
| Background image swap flashes to gradient | Visible pop | A/B layers: preload via `new Image()`; on `load`, fade B in over A (`--motion-theme`), then swap roles; on error keep A and toast in dev |
| Light character theme on dark chrome | Muddy contrast on labels inside bubbles | Labels use `currentColor` at 75 % (bubble text color), never chrome color; chrome stays outside bubbles |
| Font family with CJK/emoji fallbacks missing | Tofu | Every theme stack gets `, system-ui, sans-serif` appended in `themeToCssVars` if absent |
| `color-scheme` fixed to dark | Native form controls/scrollbars look wrong under a parchment theme | Compute `--theme-scheme` from the luminance of `charBubbleText` (light text ⇒ `dark`, else `light`) and set `color-scheme` on the theme root |

### 8.2 Streaming, scroll, layout

| Trap | Symptom | Guard |
|---|---|---|
| Appending tokens to `$state` string | Full segment re-render + markdown per token; long tasks | `StreamController` buffer is a plain field; one commit per frame (U4) |
| `$effect` that reads `live.segments` and scrolls | Effect runs after every commit even when not stuck; also runs on unrelated state | Scroll pinning happens inside the `commit` callback, gated on `stuck`; no `$effect` on the buffer |
| Smooth scroll during streaming | Log lags behind, then jumps | `scrollTop = scrollHeight` (instant) while streaming; smooth only for Jump-to-latest |
| Browser scroll anchoring vs. our prepend logic | Double compensation → jump | `overflow-anchor: none` on the log; `prependAdjust` only |
| Composer autosize while stuck | Bottom of last turn hidden behind the composer | `ResizeObserver` on composer → re-pin when stuck; log has `padding-bottom: env(safe-area-inset-bottom)` |
| iOS keyboard | Composer under the keyboard or log unscrollable | `interactive-widget=resizes-content`, `100dvh` grid, `visualViewport` resize re-pin; test on iOS Safari and Android Chrome |
| `content-visibility: auto` on the live turn | Height estimate flicker at the bottom | Live turn and last 3 turns opt out (`content-visibility: visible`) |
| Windowing trims while reader is at top | Content vanishes under the reader | Trim only when `stuck` |
| `{#each}` keyed by segment `text` | Whole bubble remounts each token | Index-keyed (§5.4) |
| Reconciliation shorter than streamed text (agency truncation) | Log shrinks; if stuck, fine; if not, reader's viewport shifts | Reconcile replaces the turn; when `!stuck`, compensate with `prependAdjust`-style delta so the reader's anchor turn stays put |
| Route change mid-stream | Reader `fetch` aborted → error toast; generation appears "lost" | `destroy()` aborts silently (no toast for `AbortError`); the chat list shows "writing…"; returning reattaches |
| Reattach race (snapshot vs. live) | Duplicate text | `start.resumedFrom` seeds the controller with the snapshot token *before* live tokens; the server guarantees ordering (Phase 3 §5.6) |
| Tab hidden for minutes during a long generation | rAF paused; on return a giant single commit + parse | Acceptable (≤ 5 ms/50 KB); `flush()` on visibility; reduced-motion users see no jump animation anyway |

### 8.3 Svelte 5 reactivity boundaries

| Trap | Symptom | Guard |
|---|---|---|
| `$state` (deep proxy) for `messages` | Proxying 240 × nested objects on every refetch; slow `$derived`s | `$state.raw` + immutable replacement |
| Mutating `$props()` (e.g. `message.segments.push`) | Warnings/undefined behaviour | Props are read-only; all mutation goes through `ChatSession` |
| `setContext` after `await` in `+page.svelte` | "Context can only be set during initialisation" | Construct session/engine synchronously from `data`; async work inside the class |
| Class instance recreated by `$derived` | Stream controller/RAF handles leak | Session and engine are `const` in the component under `{#key}`; `onDestroy(() => session.destroy())` |
| `$effect` reading `prefs` via `localStorage` each run | Layout thrash | `prefs` is a runes store hydrated once; persisted with `$effect` on the store only |
| Snippet closures capturing loop variables | Toolbar acts on the wrong turn after refetch | Pass `messageId` as a snippet parameter, not via closure |
| `{@html}` with `$derived` returning the same string | Fine — Svelte diffs strings | No action; but never pass un-sanitized text |
| `bind:this` on a conditionally rendered log | `ScrollController` attached to `undefined` | Controller binds in a `$effect` with a null guard and re-binds on element change |
| Eden Treaty `error` object shape vs `ApiError` envelope | Toasts show `[object Object]` | `toUiError()` normalizes `{ status, value: { error } }` → `{ code, message, details }`; test |

### 8.4 Sanitization & content

| Trap | Symptom | Guard |
|---|---|---|
| Trusting `marked` output | `<img onerror>` via raw HTML | Raw HTML escaped in marked **and** DOMPurify allow-list; tests with 8 OWASP vectors |
| `class` attribute allowed generally | `class="hidden"` from content hides text; Tailwind class injection | Hook restricts `class` to `speech` |
| Links to `javascript:` / `data:` | XSS | href allow-list `^https?:`; `rel="noopener noreferrer"` |
| Quote detection across lines | A `"` at a paragraph end swallows the next paragraph | Single-line, ≤ 600 chars; unbalanced quotes stay plain |
| Curly vs straight quotes | Only one style colored | Both handled; `«»` and `„“` deferred (documented) |
| Copy-to-clipboard copies HTML | Pasting into editors carries markup | Copy `message.content` raw (with state block stripped via `stripOutOfBand`) |
| Names with markup (`<b>Guard</b>`) | Label renders HTML | Labels are text nodes (`{name}`), never `{@html}` |

### 8.5 Settings & sync

| Trap | Symptom | Guard |
|---|---|---|
| BroadcastChannel echo | Store thrashes between tabs | `tabId` in every message; ignore own |
| Debounced numeric PATCH racing a select PATCH | Later response overwrites newer local value | Single in-flight queue in `settings.svelte.ts`; responses applied only if `seq` is the latest |
| API key field prefilled from view | Key would have to be in the view (S8) | Field is write-only; `apiKeyHint` displayed as text |
| a11y prefs in the settings table | Different devices need different needs; also syncs across tabs unintentionally | Device-local `prefs` (localStorage) |

---

## 9. Definition of Done & verification

### 9.1 Acceptance criteria (all must hold)

1. `bun install`; `bun run typecheck` 3/3 clean, `svelte-check` **0 errors / 0 warnings** (a11y warnings from Svelte count — `a11y-*` must be resolved, not suppressed); `bun run test` green including `frontend/unit` (added to the root `test` script) and `shared/test/theme`.
2. `bun run build` succeeds; initial route JS ≤ 220 KB gzip (excluding fonts); no runtime `<style>` injection (U2 test); production `bun run start` serves `/`, `/chat/<id>`, `/assets/*`, and Phase 0 checks still hold; `/dev` shows the disabled notice in production.
3. **Chameleon proof:** open a chat with Eldrin, then navigate to a chat with Alice — the theme root's `style` attribute changes to Alice's tokens, the transition takes ~600 ms with no intermediate neutral frame (recorded video or DevTools performance trace attached), fonts switch (Cinzel → Playfair), NPC bubbles remain coherent with each palette, the Foyer swatches match the live theme.
4. **State binding proof:** with `mock:envelope-directive`, override state to `mood: furious` → accent and character border transition to `#dc2626`; `danger: high` → overlay darkens; disable reactive theming → both revert; disable character themes → neutral A11Y theme, backdrop gone, chips still readable.
5. **Streaming proof:** with `MockLLMProvider` at 40 ms/chunk, the live turn renders segments as they open (narrator → Eldrin → Apprentice), the caret sits at the end of the active segment, no marker text ever appears (spot-check `sloppy`, `envelope-xml`, `envelope-prefix` via settings model), and the `?dev=1` overlay reports max frame cost < 8 ms and commits ≤ frames. `persona-violation` visibly reconciles at `done` (streamed text is replaced by the truncated authoritative content). `error` shows the ErrorSlate with Retry (= regenerate).
6. **Scroll proof:** while streaming, scrolling up disengages follow, Jump-to-latest appears, content keeps arriving without pulling the viewport; clicking the pill re-engages. Loading older pages (a 200-turn chat generated by a script hitting the API in a loop with the mock) keeps the reader's anchor turn in place. Lighthouse CLS ≤ 0.02 on that chat.
7. **Swipes & tree:** regenerate creates `2/2`, `◀` returns to `1/2`, `▶+` on the last creates `3/3`; `Alt+←/→` operate on the last assistant turn; edit → reparsed content shown; delete with subtree confirm; continue on the leaf appends without duplicating text (`resumedFrom` seeding).
8. **S1/U9 in the browser:** send, reload mid-stream → the chat reopens already streaming (reattach), completes, matches `GET /messages/:id`. Navigate away and back mid-stream → same.
9. **Accessibility:** keyboard-only pass of the full loop (§7.3); axe DevTools 0 critical/serious on Foyer and chat; focus visible on every control under Eldrin, Alice, and the A11Y theme; `prefers-reduced-motion: reduce` disables theme transitions, caret blink, swipe/toast animations; screen reader (NVDA/VoiceOver) hears "Eldrin replied" once per generation, not per token; touch targets ≥ 44 px on a 390 px viewport; iOS Safari and Android Chrome keep the composer visible with the keyboard open.
10. **Settings:** provider/model/key/generation/narrative edits persist, sync to a second tab within a second, never expose the key; a11y prefs persist per device only.

### 9.2 Required tests (normative list)

**`packages/shared/test/theme/cascade.test.ts`** — cascade order (persona overrides a binding; binding overrides character; a11y-neutral overrides all); `matchesWhen` (case/whitespace, numeric string, multi-key AND, missing key, empty `when` never matches, object values never match); binding application order (later wins), `appliedBindings` indices; unknown path and non-CssToken value → warning, not throw; deep-merge preserves untouched optionals; `disableReactiveTheming` skips bindings only; determinism (`JSON.stringify` equal on repeat; inputs not mutated); both seed cards + their bindings resolve without warnings.

**`frontend/unit/cssVars.test.ts`** — exact variable set and order; fallbacks per spec; `none` without image; `url("…")` escaping; system fallback appended to font stacks; luminance → `--theme-scheme`.

**`frontend/unit/markdown.test.ts`** (happy-dom) — paragraphs/`breaks`; `*em*`/`**strong**`; `"speech"` and `“speech”` → `<q class="speech">`; speech inside em; quotes spanning lines not wrapped; quotes in code spans untouched; raw HTML escaped; 8 XSS vectors (`<script>`, `<img onerror>`, `javascript:` link, `data:` link, `<svg onload>`, `style` attr, `<a href="https://x" onclick>`, `<iframe>`) → none survive; `class="hidden"` stripped; unterminated `*` and `"` render literally; deterministic; 50 KB input < 20 ms.

**`frontend/unit/scrollPolicy.test.ts`** — threshold boundaries; `user` re-engages only at bottom; `program`/`content` never change ownership; `prependAdjust`.

**`frontend/unit/streamBuffer.test.ts`** — fake rAF: 200 `push` calls in one frame → 1 parse, 1 commit; pushes across 5 frames → ≤ 5 commits; `seed` + `push` order; `flush` commits pending; `dispose` cancels; `parseEnvelope` receives `streaming: true` and the latest options.

**`frontend/unit/session.test.ts`** (fake `fetch`/`readSse` injected) — optimistic user turn inserted synchronously; `start` assigns ids; terminal → `live === null`, window and chat refetched, optimistic turn gone; 409 before `start` → rollback + toast code; `error` event → ErrorSlate state; `select`/`remove`/`edit` refetch; `destroy` aborts the reader only (no `/stop` call); `reattach` when `activeGenerationMessageId` set; `continue` seeds `resumedFrom`.

**`frontend/unit/shortcuts.test.ts`** — no firing inside text fields except `Esc`/`Ctrl+Enter`; `Alt+→` at last sibling triggers regenerate; disabled while busy.

**`frontend/unit/boundaries.test.ts`** — static scans of `src/`: no `document.createElement('style')`, no `insertRule`, no `` class={`…${ `` / `class="…${`, `parseEnvelope` imported only by `stream.svelte.ts`, no `transition-all`/`transition: all`, no `{@html` outside `Markdown.svelte`.

**E2E (Playwright, recommended — evidence, not gate; the gate is the unit suite + §9.3 artifacts)** — `foyer→chat theme vars`, `stream→reconcile`, `swipe`, `reload-mid-stream reattach`, `a11y toggles`, `mobile composer with keyboard emulation`. Run against `bun run build && bun run start` with the mock provider.

### 9.3 Step-by-step verification

```bash
bun install && bun run typecheck && bun run test
bun run --cwd frontend build && ls -la frontend/build/_app/immutable/entry   # size check (gzip via `gzip -c … | wc -c`)

bun run db:reset --yes; bun run dev
# Browser @ http://127.0.0.1:5173
#  1. Foyer: two character cards with live swatches (Cinzel/parchment vs Playfair/gothic). New chat → Eldrin.
#  2. Chat: themed on first paint (throttle CPU 4× in DevTools; no neutral flash). Greeting rendered from persisted segments.
#  3. Send "Hello?" → narrator block, Eldrin bubble, Apprentice tinted bubble appear as they open; caret on the active one;
#     HUD chips update at done; ?dev=1 overlay: max frame < 8 ms.
#  4. Settings → model mock:persona-violation → send → watch text get replaced at done; HUD source glyph unchanged.
#  5. Settings → model mock:error → send → ErrorSlate + Retry; chat immediately sendable.
#  6. Regenerate / ◀ ▶ / ▶+ / Alt+← → ; Edit a turn; Delete with subtree confirm; Continue on the leaf.
#  7. Scroll up mid-stream → pill; keep streaming; click pill. Generate 200 turns via `scripts/seed-long-chat.ts` (API loop) → load older, anchor holds.
#  8. Alt+S → override mood=angry, affinity=99 → HUD shows furious/10 + clamp warning; accent turns red over 600 ms.
#  9. Accessibility panel: Disable reactive theming → red reverts; Disable character themes → neutral; OS reduce-motion → instant.
# 10. Reload mid-stream → reattached; navigate to Foyer and back mid-stream → reattached; second tab: change temperature → first tab updates.
# 11. NavDrawer: switch to an Alice chat → 600 ms transition, no intermediate frame (record with DevTools ▸ Performance ▸ screenshots).
# 12. Keyboard-only pass of 1–10; axe DevTools on Foyer + chat; NVDA/VoiceOver announcement check.
# 13. Mobile (device toolbar 390×844 + real iOS/Android if available): composer above keyboard, 44 px targets, drawers as sheets.

bun run build && bun run start
curl -si http://127.0.0.1:3000/ | head -3; curl -si http://127.0.0.1:3000/chat/abc | head -1; curl -si http://127.0.0.1:3000/api/nope | head -1
curl -si http://127.0.0.1:3000/assets/backgrounds/nope.webp | head -1                                  # 404 JSON, not index.html
# Lighthouse (Chrome) on http://127.0.0.1:3000/chat/<200-turn chat>: Performance ≥ 90, Accessibility ≥ 95, CLS ≤ 0.02 — attach report
```

### 9.4 Explicit scope boundaries — deferred

Do **not** introduce in Phase 4: character/persona **editors** and the theme editor UI (cards remain seeded/imported); import/export & PNG cards; lorebook UI; multi-chat split view (the component model supports it — no grid yet); touch swipe gestures on turns; a true virtual scroller; TTS; i18n; PWA/service worker; auth gate; WebSockets; `delta.reasoning` display beyond dev mode; live (pre-terminal) state-binding evaluation; chat title auto-generation; message search.

What Phase 4 hands forward: one `MessageTurn`, one theme root, a pure cascade in `shared` that a future theme editor can preview with zero UI changes, a `ChatSession` that a split-view grid can instantiate N times, and a design system whose only variable surface is the 19 `--theme-*` properties.

---

## 10. Execution order

1. **shared**: `theme/cascade.ts` + `defaults.ts` + tests; bump `SHARED_VERSION`. (Pure, fast, and it fixes the binding semantics before any CSS exists.)
2. **scaffold**: Tailwind v4 + `app.css` (registrations, bridge, neutral tokens, chrome palette, motion, reduced-motion), fonts, `app.html` viewport meta; `unit/` harness with happy-dom; `boundaries.test.ts` first (it will police the rest); move the bare canvas to `/dev`.
3. **render**: `markdown.ts` + `speech.ts` + tests; `Markdown.svelte`; `cssVars.ts` + tests.
4. **state**: `prefs`, `media`, `settings` (+ BroadcastChannel), `toasts`, `api/client` + `toUiError`, `readSse`; `StreamController` + tests; `ScrollController` + policy tests; `ChatSession` + tests.
5. **components, bottom-up**: `SpeechBubble`/`NarratorBlock`/`StreamCaret` → `MessageTurn` → `MessageLog` + `JumpToLatest` → `Backdrop` → `ChatViewport` → `TopBar`/`StateHud` → `Composer`/`DirectorDrawer` → `TurnToolbar`/`SwipeCarousel`/dialogs → `NavDrawer`/`SettingsSheet` → Foyer. Run `svelte-check` after each group; resolve every `a11y-*` warning as it appears.
6. **routes**: `+layout`, `chat/[chatId]/+page.ts` load (parallel fetches), `+page.svelte` with `{#key}`; backend `/assets` mount + proxy entry.
7. **polish pass**: `@property` transitions, A/B backdrop, first-paint gating, reduced-motion audit, mobile viewport, `?dev=1` overlay.
8. **§9.3 top to bottom**; attach: theme-transition trace/video, `?dev=1` frame-cost capture on `envelope-directive`, persona-violation reconciliation clip, Lighthouse report, axe summary, and the keyboard-only pass notes to the PR.