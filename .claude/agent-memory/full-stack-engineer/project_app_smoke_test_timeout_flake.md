---
name: project-app-smoke-test-timeout-flake
description: App.smoke.test.tsx's "renders the same structure at every slot of the day" test times out under full-suite parallel load — pre-existing, not a regression
metadata:
  type: project
---

`app/src/App.smoke.test.tsx` > "rendering is independent of the wall clock" >
"renders the same structure at every slot of the day" intermittently fails
with `Test timed out in 5000ms`, both when the FULL test suite runs (`npm
test` / `vitest run` with all ~30+ files in parallel) AND, on a slower/busier
run of this Windows machine, even standalone (`vitest run
app/src/App.smoke.test.tsx` alone) — observed taking 5.6-6.0s against the
hard 5000ms default `testTimeout`, i.e. genuinely just over the line, not
hung. An earlier note here claimed standalone always passes in under 1s —
that no longer holds; this machine's baseline speed for this test varies
run-to-run, sometimes landing on either side of 5000ms even alone.

**Why:** confirmed by `git stash`-ing an unrelated change set and re-running
the full suite — the flake reproduced identically on unmodified `main`, so
it's CPU/resource contention on this Windows machine, not a real regression.
The test itself (48 sequential `renderToStaticMarkup` calls, no timers, no
effects — SSR doesn't run `useEffect` at all) has no actual slow algorithmic
path; it's just enough sequential render work that it sits close to the
default timeout on this machine.

**How to apply:** if this test fails with a timeout (full-suite OR
standalone) and the change under review never touched
`App.smoke.test.tsx`/rendering-perf-sensitive code, don't chase it as a
regression — re-run with `--testTimeout=15000` to confirm it passes given
more headroom before spending time on it. If it fails even with a generous
timeout, or a file you changed plausibly slowed rendering, that's worth
investigating for real.
