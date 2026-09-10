# UI/UX Testing Workflow (for agents)

How to verify frontend work with the tools on this machine — learned from debugging an
invisible `Backdrop` that unit tests and `svelte-check` could not catch.

## 1. Rule zero: reproduce it yourself, in a real browser

Never ask the user to reload-and-report when you can drive Edge headlessly:

```powershell
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$tmp = "C:\Users\osama\AppData\Local\Temp\opencode\edge-probe"

# Screenshot (use a FRESH profile dir per run — reuse races and fails silently)
& $edge --headless --disable-gpu --no-sandbox --user-data-dir="$tmp\profileN" `
  --virtual-time-budget=8000 --window-size=1440,1200 `
  --screenshot="$tmp\page.png" "http://127.0.0.1:5173/<route>"

# Rendered DOM (what Svelte actually mounted, after effects settle)
& $edge --headless --disable-gpu --no-sandbox --user-data-dir="$tmp\profileM" `
  --virtual-time-budget=8000 --dump-dom "http://127.0.0.1:5173/<route>" 2>$null

# Console (JS errors, warnings — the decisive signal more than once)
& $edge --headless --disable-gpu --no-sandbox --user-data-dir="$tmp\profileK" `
  --enable-logging=stderr --v=0 --virtual-time-budget=8000 `
  --screenshot="$tmp\page.png" "http://127.0.0.1:5173/<route>" 2>&1
```

Read screenshots back with the `read` tool — it renders images. Parse DOM dumps with a
`bun` one-liner script file (never inline `bun -e` with quotes on PowerShell).

## 2. Bisect with static probe pages, not app edits

For CSS/markup suspects, drop a plain `.html` file in `frontend/static/` (Vite serves it
as-is at `/<name>.html`) and screenshot it. Each probe changes ONE variable:

- plain `background-image: url(...)` → proves serving + paint work
- exact dumped markup replica → proves the bug is in the markup, not Svelte/data
- remove overlay / z-index / filter one at a time → isolates the killer property

**Delete every probe from `frontend/static/` before finishing** — that dir ships to prod.

## 3. Verify every layer of the data path, in order

Theme-not-showing? Check each link; stop at the first broken one:

1. DB: readonly query via `bun:sqlite` (`new Database('formatavern.db', { readonly: true })`).
2. API direct: `fetch('http://127.0.0.1:3000/api/...')` via `bun`.
3. API via the exact browser path: same fetch against `:5173` (Vite proxy).
4. Asset bytes: status code AND `Content-Type` for `/assets/...` on both ports.
5. Rendered DOM: is the element/attribute present after hydration?
6. Paint: screenshot. DOM-present ≠ painted (stacking, overflow, opacity).

## 4. Gotchas that burned us (check these first next time)

- **HMR preserves page `data`.** After a DB/content change, hot-reload swaps components
  without re-running `load()`. Stale-data symptoms look exactly like broken code.
  Diagnose with a fresh profile or `Ctrl+Shift+R`, not more edits.
- **Negative `z-index` needs a stacking context.** A `-z-10` layer inside a
  `relative` + opaque-background parent with NO stacking context paints *below* the
  parent background — permanently invisible, zero console errors. Fix: `isolate`
  (i.e. `isolation: isolate`) on the themed root. Suspect this whenever DOM is
  correct but paint is missing.
- **Svelte 5 `$effect` read/write cycles.** An effect that reads state it also writes
  (even via a helper called synchronously, e.g. a cached-image fast path) loops until
  `effect_update_depth_exceeded` kills it. Read such state with `untrack()`; keep
  effects reading only their true inputs. The crash leaves *stale* UI, not blank —
  deeply misleading.
- **Screenshots race image loads.** `--virtual-time-budget` fast-forwards timers but
  network/decode still take real time. A black screenshot can mean "not yet", not
  "broken" — confirm with a DOM dump from a separate run before concluding.
- **First headless run on a fresh profile often produces nothing.** Retry once before
  debugging the command line.
- **Unit tests + `svelte-check` do not cover paint.** All suites were green while the
  backdrop had never rendered once. For rendering invariants, add a static
  boundary-police test in `frontend/unit/boundaries.test.ts` (source-scan style, e.g.
  "every file rendering `<Backdrop` must contain `isolate`").

## 5. Definition of done for a UI fix

1. Reproduced in your own headless capture (screenshot showing the bug).
2. Root cause stated as a mechanism, confirmed by a probe (not by re-reading code).
3. One minimal fix addressing that mechanism — no speculative hardening alongside it.
4. Fresh headless captures of every affected route showing the fix.
5. Regression guard added where a static invariant exists (boundaries test).
6. `bun run typecheck` 3/3 clean, `bun run test` fully green, `bun run db:check` clean.
7. Probe/scratch files removed; `git status` shows only intended files.
