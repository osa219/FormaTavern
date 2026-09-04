# AGENTS.md — FormaTavern Codebase Guide

This repository contains the implementation codebase for **FormaTavern** (a lightweight, design-centric LLM roleplay client).

---

## 1. Architectural Source of Truth

The authoritative product specifications, Architecture Decision Records (ADRs), and system designs are maintained outside this repository in the **Tolaria Knowledge Vault**:
📍 **Vault Path**: `S:\WorkSpace\Markdown Workspace\FormaTavern`

When you need deeper context on architectural decisions or system design, consult the vault files or use Tolaria MCP tools:
- **`formatavern.md`**: Master project index and architecture overview.
- **`spec-data-schemas-and-storage.md`**: SQLite relational tables, TypeBox schemas, and Migration v2.
- **`spec-narrative-envelope.md`**: Three-Track narrative grammar, optional closers, and streaming parser.
- **`spec-prompt-builder.md`**: Prompt Sandwich (blocks 1–9c), macros, and context budgeting.
- **`spec-message-lifecycle-and-api.md`**: Streaming state machine (500ms SQLite flushes), tree swipes, and REST/SSE endpoints.
- **`ui-ux-theme-schema-and-component-binding.md`**: Pure CSS Design Tokens, `<MessageTurn />`, and theme cascade.
- **`adr-001` through `adr-006`**: Technical stack, SQLite WAL, concurrency, network security, character storage truth, and auth posture.

---

## 2. Environment & Toolchain Paths (S: Drive)

This machine hosts development runtimes and global tools on the **`S:`** drive rather than `C:`.

- **Bun Runtime ($\ge 1.2$, installed 1.4.1):**
  - Binary: `S:\Program Files\bun\bin\bun.exe`
  - Runner: `S:\Program Files\bun\bin\bunx.exe`
  - PATH entry: `S:\Program Files\bun\bin` (configured in User `PATH`)
  - *Tip:* If a spawned subshell does not inherit the updated PATH, prepend `$env:PATH = "S:\Program Files\bun\bin;$env:PATH"` or invoke directly via `& "S:\Program Files\bun\bin\bun.exe"`.

- **Node.js & npm:**
  - Node: `S:\Program Files\nodejs\node.exe`
  - npm: `S:\Program Files\nodejs\npm.cmd`
  - npm Global Prefix: `S:\Users\osama\AppData\Roaming\npm`



