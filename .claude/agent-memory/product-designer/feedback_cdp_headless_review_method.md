---
name: feedback-cdp-headless-review-method
description: How to actually drive/click through this app headlessly for UX review, and a false-positive trap to avoid
metadata:
  type: feedback
---

This project (mindful-me / app/) has no puppeteer or playwright installed, and
the sandboxed Bash tool can't hold a long-lived interactive session. What works:
launch `chrome.exe --headless=new --remote-debugging-port=9222`, then drive it
with a small hand-rolled Node script using the native `WebSocket` global (Node
22+) against the CDP websocket — `Runtime.evaluate` to click/inspect DOM,
`Page.captureScreenshot` for visual checks, `Emulation.setDeviceMetricsOverride`
to set viewport size. This is fast enough to click through full multi-step flows
(drill-downs, edit, remove/undo, drag-and-drop via synthetic `DragEvent` +
`DataTransfer`) in one review pass.

**Why: false-positive trap** — launching Chrome with `--window-size=W,H` on
Windows does NOT give you a true W×H viewport; it reserves ~16px for a
scrollbar/window-chrome gutter even in headless mode, so `window.innerWidth`
comes back short. This is enough to make a CSS container-query breakpoint (e.g.
"engages at ≥860px container width") look like it fails on the exact target
device when it actually doesn't. Always call
`Emulation.setDeviceMetricsOverride({width, height, deviceScaleFactor:1})`
after navigating and verify `window.innerWidth`/`innerHeight` match the intended
device exactly before treating any width/height-dependent measurement as real.
Same caution applies to `document.documentElement.scrollHeight` for "does this
page scroll" checks — if the layout's real scroll container is an inner `<main
overflow-y-auto>` (common in this app's shell), the document-level height check
reports "fits fine" even when that inner container is overflowing and the user
would need to scroll. Check the actual scrolling ancestor's `scrollHeight` vs
`clientHeight`, not just the document's.

How to apply: reuse this CDP-driver approach for future UI/UX reviews of this
app rather than assuming a testing framework is available; always re-verify
viewport-dependent findings with corrected device metrics before reporting them
as confirmed defects, since the naive approach produces exactly this kind of
false alarm.
