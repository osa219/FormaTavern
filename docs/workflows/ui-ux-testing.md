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

# Rendered DOM (what Svelte actually mounted, after effects settle).
# Pipe through Out-File — a bare `> file 2>$null` redirect has produced 0-byte
# dumps in this host (see §4). Never trust a 0-byte dump; re-run before concluding.
& $edge --headless --disable-gpu --no-sandbox --user-data-dir="$tmp\profileM" `
  --virtual-time-budget=8000 --dump-dom "http://127.0.0.1:5173/<route>" | Out-File "$tmp\page.html" -Encoding utf8

# Console (JS errors, warnings — the decisive signal more than once)
& $edge --headless --disable-gpu --no-sandbox --user-data-dir="$tmp\profileK" `
  --enable-logging=stderr --v=0 --virtual-time-budget=8000 `
  --screenshot="$tmp\page.png" "http://127.0.0.1:5173/<route>" 2>&1
```

## 1b. Shoot two heights before concluding anything about "missing" content

Capture the same route tall AND short (e.g. `--window-size=1440,2600`, then
`1440,900`). The contrast discriminates two totally different bugs:

- tall shows everything, short clips with **no scrollbar** → the content is
  unreachable, not missing: suspect the scroll chain (a non-scrollable log
  inside an `overflow-hidden` clipper), not the component. Check whether ANY
  scroller exists before debugging data or paint.
- tall also hides it → genuinely absent (data/DOM/paint problem — continue
  with §3).

Read screenshots back with the `read` tool — it renders images. Parse DOM dumps with a
`bun` one-liner script file (never inline `bun -e` with quotes on PowerShell).

## 2. Bisect with static probe pages, not app edits

For CSS/markup suspects, drop a plain `.html` file in `frontend/static/` (Vite serves it
as-is at `/<name>.html`) and screenshot it. Each probe changes ONE variable:

- plain `background-image: url(...)` → proves serving + paint work
- exact dumped markup replica → proves the bug is in the markup, not Svelte/data
- remove overlay / z-index / filter one at a time → isolates the killer property
- **A/B skeletons side by side in ONE probe** → current layout chain vs candidate
  fix, same tall content, one screenshot decides (e.g. block `main` vs `flex-col`
  `main`: clipped-without-scrollbar vs scrollbar-proves-scrollable)
- **make probes self-reporting** → embed a small script that writes live
  measurements (`scrollHeight`/`clientHeight`/`scrollTop`, per-element rects and
  `contentVisibility`) into visible page text. Then a screenshot alone carries
  the numbers — no console access needed, and a human can verify with one
  screenshot of the probe URL.

**Delete every probe from `frontend/static/` before finishing** — that dir ships to prod.

## 3. Verify every layer of the data path, in order

Theme-not-showing? Check each link; stop at the first broken one:

1. DB: readonly query via `bun:sqlite` (`new Database('formatavern.db', { readonly: true })`).
2. API direct: `fetch('http://127.0.0.1:3000/api/...')` via `bun`.
3. API via the exact browser path: same fetch against `:5173` (Vite proxy).
   Quarantine "two servers" first: `Get-NetTCPConnection -LocalPort 3000,5173 -State Listen`
   must show one listener per port, and the Vite `proxy.target` must match the
   backend you queried in step 2.
3b. In-app state counts (e.g. a `?dev=1` overlay): state-has-N vs painted-M splits
   "unreachable/unpainted" from "missing data" without touching the console.
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
- **`content-visibility: auto` placeholder signature.** Rect height exactly equal to
  `contain-intrinsic-size` (e.g. every row `h=96` for `auto 6rem`) with correct text
  in the DOM means the browser skipped rendering, not that data is missing. Real
  heights + real text + still invisible means look at clipping and the scroll
  chain, not at the component.
- **A missing scrollbar is itself the finding.** `flex-1`/`min-h-0` on a child is
  inert without a flex parent; `height: 100%` against an auto-height parent
  resolves to auto, so `overflow-y: auto` never engages and an `overflow-hidden`
  ancestor clips everything past the fold — wheel does nothing, `scrollToBottom`
  is a no-op, zero console errors. If a growing list has no scrollbar, walk the
  grid/flex chain from the viewport down before anything else.
- **Watchers break on mapped/subst drives.** `... will not be watched` warnings mean
  Vite can keep serving stale transforms even across a hard reload. Restart the
  dev servers to quarantine staleness before concluding the code is wrong.
- **Headless Edge enforces a ~496px minimum layout width.** Requesting
  `--window-size=390,844` still lays out at ~496px (`innerWidth` reports 496)
  while the screenshot bitmap stays 390 wide — so right-edge content (e.g. a
  top-right edit pencil) is cropped out of the IMAGE while the DOM looks
  perfect. It mimics "DOM-present but not painted" exactly. Rule: never
  conclude paint from a sub-500px capture; put `innerWidth` in the
  self-reporting probe readout and shoot narrow captures at ≥500px instead.
- **`--dump-dom` output needs `Out-File`, not `>` redirection.** A bare
  `> file 2>$null` yielded 0-byte dumps twice in a row here (indistinguishable
  from the fresh-profile flake below); piping the same command through
  `Out-File -Encoding utf8` produced 155KB. A 0-byte dump is a tooling signal,
  not a page signal — change the capture line before retrying.
- **Screenshot files flush just after process exit.** `Get-Item` immediately
  after Edge exits can report "does not exist" for a screenshot Edge itself
  just confirmed writing ("N bytes written"). Re-check existence instead of
  re-running the capture.

## 5. Definition of done for a UI fix

1. Reproduced in your own headless capture (screenshot showing the bug).
2. Root cause stated as a mechanism, confirmed by a probe (not by re-reading code).
3. One minimal fix addressing that mechanism — no speculative hardening alongside it.
4. Fresh headless captures of every affected route showing the fix.
5. Regression guard added where a static invariant exists (boundaries test).
6. `bun run typecheck` 3/3 clean, `bun run test` fully green, `bun run db:check` clean.
7. Probe/scratch files removed; `git status` shows only intended files.
