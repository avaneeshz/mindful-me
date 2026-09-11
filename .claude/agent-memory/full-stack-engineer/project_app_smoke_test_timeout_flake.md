---
name: project-app-smoke-test-timeout-flake
description: App.smoke.test.tsx's "renders the same structure at every slot of the day" test times out under full-suite parallel load — pre-existing, not a regression
metadata:
  type: project
---

`app/src/App.smoke.test.tsx` > "rendering is independent of the wall clock" >
"renders the same structure at every slot of the day" intermittently fails
with `Test timed out in 5000ms` when the FULL test suite runs (`npm test` /
`vitest run` with all ~29 files in parallel), but passes reliably in under
1 second when run alone (`vitest run app/src/App.smoke.test.tsx`).

**Why:** confirmed by `git stash`-ing an unrelated change set and re-running
the full suite — the flake reproduced identically on unmodified `main`, so
it's CPU/resource contention from this Windows machine running many test
files concurrently, not a real regression. The test itself (48 sequential
`renderToStaticMarkup` calls, no timers, no effects — SSR doesn't run
`useEffect` at all) has no actual slow path.

**How to apply:** if this test fails only in a full-suite run, don't chase it
as a regression from whatever change is under review — re-run that one file
alone (or with `--testTimeout=15000` on the full run) to confirm it's this
known flake before spending time on it. If it starts failing standalone too,
that's a real regression and worth investigating properly.
