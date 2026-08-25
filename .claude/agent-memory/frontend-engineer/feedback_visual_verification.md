---
name: feedback-visual-verification
description: How to verify layout/responsive claims in mindful-me — use CDP device-metric emulation, and never trust document-level scroll checks
metadata:
  type: feedback
---

Verify responsive/layout claims with Chrome DevTools Protocol
`Emulation.setDeviceMetricsOverride`, never with Chrome's `--window-size` flag
alone. And never conclude "it fits" from `document.documentElement.scrollHeight`.

**Why:** two separate false-pass traps burned a previous review of this repo.
(1) On Windows, `--window-size` reserves a classic scrollbar gutter, so the
measured viewport is narrower than the device being claimed — and Windows
Chrome floors at ~500px width regardless of the flag, silently cropping
narrower checks. (2) This app's scroll container is `<main>`, not the document,
so `document.documentElement.scrollHeight` reports "no overflow" while `<main>`
is genuinely overflowing and controls sit below the fold. Measure
`main.scrollHeight - main.scrollTop - main.clientHeight` instead.

**How to apply:** any time a claim involves a viewport size, whether something
is above the fold, or the client's target device (iPad landscape, 1194x834 — the
device Acceptance Criterion 13 is written against). Node 24's global `WebSocket`
is enough to drive CDP directly; no browser-automation dependency is needed.
Related: [[project-stabilization-pass-scope]].
