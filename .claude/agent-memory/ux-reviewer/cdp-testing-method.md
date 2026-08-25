---
name: cdp-testing-method
description: How to actually drive and screenshot the running app interactively (clicks, keyboard, viewport emulation) — no Playwright/Puppeteer is installed in this repo.
metadata:
  type: reference
---

mindful-me's `app/` has no Playwright/Puppeteer/webdriver dependency (checked
`package.json` — only vitest). To interact with the live dev server (not just
static screenshots), drive Chrome directly over the DevTools Protocol (CDP)
using Node's built-in `WebSocket` global (Node 22+; this environment runs
Node 24) — no npm install needed.

**Setup**: launch Chrome with `--remote-debugging-port=<port>` and a
dedicated `--user-data-dir` under the scratchpad, pointed at the dev server
URL. `curl http://localhost:<port>/json` lists page targets;
`webSocketDebuggerUrl` on the matching target is what to connect to.

**Critical gotcha — keep one script, one session**: each new Node process
that connects is a fresh CDP session. `Emulation.setDeviceMetricsOverride`
(viewport size) is scoped to that session and reverts to the real window
size the instant the session disconnects. Running one-off single-command
scripts (connect → click → disconnect) silently loses the emulated viewport
between calls, and coordinates computed against the emulated size land in
the wrong place against the real one. Always batch an entire test scenario
(navigate, set viewport, click through the flow, screenshot) inside **one**
script invocation that holds the WebSocket open throughout. A "batch runner"
that takes a JSON list of steps (nav/viewport/click/clickText/eval/
screenshot/key) and executes them over a single persistent connection is the
right shape for this.

**Touch/hover-media-query testing**: to actually get `(hover: hover)` /
`(pointer: fine)` to evaluate false (so hover-only-tooltip CSS reveals its
touch/always-visible fallback, matching an iPad), passing `mobile: true` to
`setDeviceMetricsOverride` is not sufficient by itself — it can silently
fall back to the real window size instead of the requested one. Also pass
`deviceScaleFactor` (e.g. 2) and an explicit `screenOrientation` object, and
call `Emulation.setTouchEmulationEnabled`. Verify before trusting a
screenshot by evaluating
`matchMedia('(hover: hover)').matches` / `(pointer: fine)` in-page.

**Clicking by visible text**: querying `button, a, [role="button"]` and
matching `textContent.includes(needle)` (skipping `offsetParent === null`
elements) is more robust than guessing exact selectors for primary-action
buttons like "Add to slot" / "Save changes" / "Undo".

**Orphaned instances**: a previous session's cleanup can fail, leaving a
stray headless Chrome bound to a shared debug port under a temp profile
named something like `cr-review-cdp`. If a debug port that should be fresh
already answers before you've launched anything, check for and kill that
leftover by matching its `--user-data-dir` in the process command line
(`wmic process where "name='chrome.exe'" get ProcessId,CommandLine`) rather
than killing all `chrome.exe` indiscriminately — the user's own Chrome may
be running too.

**Stale dev server = false positives on Tailwind changes**: this repo commonly
has multiple leftover `npm run dev` / vite processes on 5173/5174/5175 from
prior sessions (see [[mindful-me-app-structure]]). If a review involves a
`tailwind.config.js` edit (new theme tokens, new utility), a dev server that
was started *before* that edit can still be serving a build where the new
utility class silently compiles to nothing — the element renders at
content/intrinsic size with no error. This produced a false "circle sizing
completely broken" finding until caught: `wmic process where "name='chrome.exe'"`
/ `"name='node.exe'" get ProcessId,CreationDate,CommandLine` to check process
start time against `ls -la tailwind.config.js` mtime, or just kill stale
node/vite processes and start a fresh one on a scratch port before trusting
any measurement tied to a just-added Tailwind token. Verify by fetching
`/src/styles/index.css` from the dev server and grepping for the new
selector text (`grep -o '[.][a-zA-Z0-9_\\\\:-]*yourClass[a-zA-Z0-9_\\\\:-]*'`
— note `grep -c` undercounts because Vite serves this file as one giant
single-line JS string, so count occurrences with `-o | wc -l`, not `-c`).

**Simulating HTML5 drag-and-drop over CDP**: `Input.dispatch*` mouse events do
not trigger real `dragstart`/`drop` handlers. Instead, in an `eval` step,
construct `new DataTransfer()`, dispatch `new DragEvent('dragstart', {
dataTransfer: dt, bubbles: true, cancelable: true })` on the source element,
then `dragover` and `drop` with the *same* `dt` object on the target — the
app's own handlers populate/read `dataTransfer` exactly as a real drag would.
Confirm the source element is actually present before dispatching (an
`ActivityPicker`-style tile grid can be conditionally unmounted, e.g. when
the currently-selected slot is at capacity — `btns.find(...)` silently
returns `undefined` and `.dispatchEvent` throws a clear TypeError, which is
itself a useful signal, not just test friction).

**DOMRect via `Runtime.evaluate` returnByValue**: `getBoundingClientRect()`
result objects serialize to `{}` over CDP's `returnByValue` (its properties
aren't own-enumerable). Destructure the fields you need into a plain object
in the eval expression instead of returning the DOMRect directly.

See [[mindful-me-app-structure]] for where the app's components/state live.
