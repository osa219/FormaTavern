# FormaTavern

> A lightweight, design-centric LLM roleplay canvas featuring adaptive chameleon typography, three-track narrative grammar, and a reactive scene state engine.

FormaTavern reimagines the AI storytelling client as an interactive, typography-first canvas. Every companion brings their own custom fonts, atmospheric color palettes, bubble shapes, and backdrop shaders. As the story evolves, scene states dynamically transform the ambient aesthetic with fluid, GPU-accelerated CSS transitions.

---

## Key Features

- **Chameleon Theming Engine**: Pure CSS `@property` registrations drive 20 independent design tokens (`--theme-*`). No runtime `<style>` tags, no CSS class interpolation, and no layout shifting.
- **Three-Track Narrative Envelope**: Streams and distinguishes three narrative voices in real time:
  - `:::narrator` — Atmospheric scene setting and stage directions.
  - `:::character[Name]` — Primary companion dialogue and core reactions.
  - `:::npc[Name]` — Dynamically tinted non-player character interactions.
- **Reactive Scene State Machine**: Companions define declarative state schemas (enums, integers, strings) and conditional style bindings (`when: { mood: 'furious' }` $\rightarrow$ transitions accent to crimson).
- **Non-Linear Tree Branching & Swipes**: Full sibling swipe navigation (`◀ 1/3 ▶`), regeneration, branch switching, turn editing, and subtree-aware pruning.
- **Frame-Budgeted Streaming**: Incoming Server-Sent Events (SSE) stream into a plain buffer and commit to DOM at most once per animation frame via `requestAnimationFrame` for buttery 60 FPS rendering.
- **Rock-Solid Persistence & Disconnect Immunity**: Powered by SQLite in WAL mode with foreign-key enforcement. Disconnecting or refreshing the browser never cancels active LLM generation.
- **Accessible & Keyboard-First**: Pure neutral chrome palette, WCAG contrast compliance, zero `axe` critical/serious violations, and comprehensive keyboard shortcuts.

---

## Repository Structure

FormaTavern is organized as a Bun workspace monorepo:

```text
FormaTavern/
├── packages/shared/       # Core domain contracts, schemas, parser & theme cascade
│   ├── src/envelope/      # Three-track streaming parser & out-of-band state extractor
│   ├── src/schemas/       # TypeBox DTO & relational data validation schemas
│   ├── src/state/         # State vector normalization, defaults & alias resolution
│   └── src/theme/         # Pure theme cascade resolver & legal CSS token paths
├── backend/               # Bun + Elysia backend API server
│   ├── src/db/            # SQLite connection, migrations (v0–v3), repositories & seeds
│   ├── src/engine/        # GenerationHub, context assembler, prompt sandwich builder
│   ├── src/providers/     # Offline Mock LLM fixtures & OpenRouter streaming client
│   └── src/routes/        # REST & SSE endpoints (/api/chats, /api/messages, /assets)
├── frontend/              # Svelte 5 + Tailwind CSS v4 frontend canvas
│   ├── src/lib/actions/   # Autosize, click-outside, and global shortcuts listeners
│   ├── src/lib/components/# MessageTurn, SpeechBubble, Composer, TopBar, HUD, Dialogs
│   ├── src/lib/render/    # Marked roleplay pipeline, speech wrapping, DOMPurify sanitizer
│   ├── src/lib/scroll/    # ScrollController & pinned gesture policy
│   ├── src/lib/state/     # ChatSession, StreamController, multi-tab settings sync
│   ├── src/lib/theme/     # CSS custom property bridge & reactive ThemeEngine
│   └── src/routes/        # Foyer (/), Chat canvas (/chat/[chatId]), Dev workbench (/dev)
└── docs/history/          # Architecture Decision Records (ADRs), blueprints & walkthroughs
```

---

## Prerequisites

- **[Bun](https://bun.sh/)** $\ge 1.2$ (tested on Bun 1.4.1)
- Modern web browser with support for CSS `@property` (Chrome 85+, Safari 15.4+, Firefox 128+)

*Note: No external database service is required. FormaTavern runs an embedded SQLite database (`formatavern.db`) in WAL mode.*

---

## Quick Start

### 1. Install Dependencies

```bash
bun install
```

### 2. Initialize Database & Seeds

Run database migrations and populate the initial seed companions (**Eldrin the Mage** and **Alice**):

```bash
bun run db:reset --yes
```

To audit database constraints and foreign-key integrity at any time:

```bash
bun run db:check
```

### 3. Start Development Server

Run both the Elysia backend (`http://127.0.0.1:3000`) and the Vite frontend dev server (`http://127.0.0.1:5173`) concurrently:

```bash
bun run dev
```

Open your browser to:
👉 **`http://127.0.0.1:5173`**

*(Requests to `/api/*` and `/assets/*` are automatically reverse-proxied to port 3000 by Vite.)*

---

## Production Build & Run

To build the optimized static frontend and serve everything through the single production Elysia binary on port 3000:

```bash
# Build static frontend bundle (gzip <= 220 KB target)
bun run build

# Start production server
bun run start
```

Access the production application at:
👉 **`http://127.0.0.1:3000`**

---

## Testing & Quality Assurance

FormaTavern maintains a strict quality bar with 0 lint warnings and comprehensive automated unit and integration tests.

```bash
# Run all tests across shared, backend, and frontend
bun run test

# Run TypeScript and Svelte 5 diagnostics (0 errors, 0 warnings)
bun run typecheck
```

### Test Coverage Highlights
- **`packages/shared`** (91 tests): Envelope parser fuzzing, surrogate pair integrity, dialect invariance, state schema normalization, and theme cascade precedence.
- **`backend`** (127 tests): SQLite foreign-key cascading, migration rollbacks, generation hub crash handling, disconnect immunity, prompt budget pruning, and byte-exact SSE contracts.
- **`frontend`** (41 tests): Static boundary police (prohibits runtime `<style>`, ensures single-point parser isolation), Marked + DOMPurify XSS attack neutralizing, scroll pinning policy, and rAF-throttled stream buffering.

---

## Keyboard Shortcuts

FormaTavern is built for keyboard-first narrative flow:

| Shortcut | Context | Action |
|---|---|---|
| <kbd>Enter</kbd> or <kbd>Ctrl</kbd>+<kbd>Enter</kbd> | Composer | Send message turn |
| <kbd>Shift</kbd>+<kbd>Enter</kbd> | Composer | Insert newline |
| <kbd>Esc</kbd> | Anywhere | Stop active generation; or close open dialog/drawer |
| <kbd>Alt</kbd>+<kbd>←</kbd> / <kbd>Alt</kbd>+<kbd>→</kbd> | Chat | Navigate previous / next swipe on the latest assistant turn |
| <kbd>Alt</kbd>+<kbd>D</kbd> | Chat | Toggle Director Guidance drawer |
| <kbd>Alt</kbd>+<kbd>S</kbd> | Chat | Toggle Scene State HUD override popover |
| <kbd>Alt</kbd>+<kbd>N</kbd> | Chat | Toggle Stories navigation drawer |
| <kbd>/</kbd> | Outside text inputs | Immediately focus message composer |

---

## LLM Providers & Offline Development

FormaTavern provides two provider modes configurable in the **Settings** sheet (<kbd>⚙</kbd> icon):

1. **Mock Engine (Offline)**: Built-in deterministic streaming fixtures for development and testing without network access or API costs:
   - `mock:envelope-directive` — Standard three-track dialogue with state block.
   - `mock:envelope-xml` — XML-tagged dialect (`<narrator>`, `<speech>`).
   - `mock:envelope-prefix` — Prefix dialect (`Narrator:`, `Character:`).
   - `mock:sloppy` — Streaming resilience against unterminated quotes and markdown formatting.
   - `mock:persona-violation` — Tests server-side agency truncation and reconciliation.
   - `mock:error` — Simulates mid-stream error recovery.
2. **OpenRouter (Online)**: Streaming connection to state-of-the-art models (Anthropic Claude, Meta Llama 3, etc.). Enter your API key in **Settings ▸ Provider** (stored securely in SQLite; keys are never sent to the client browser).

---

## Architectural Documentation

For deep technical context, Architecture Decision Records (ADRs), and phase specifications, consult the documents in `docs/history/`:
- **Blueprints**: [`docs/history/blueprints/`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/docs/history/blueprints/)
- **Walkthroughs**: [`docs/history/walkthroughs/`](file:///s:/WorkSpace/Git%20Workspace/FormaTavern/docs/history/walkthroughs/)

---

## License

MIT
