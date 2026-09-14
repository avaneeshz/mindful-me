---
name: feedback-hook-testing-no-jsdom
description: This repo's vitest runs in a plain Node environment with no jsdom/testing-library — component tests only ever exercise the initial (closed/collapsed) render via renderToStaticMarkup, and React hooks (useState/useEffect) have no direct test coverage at all.
metadata:
  type: feedback
---

`vitest.config.ts` sets `environment: 'node'` deliberately ("Pure logic
only — no DOM environment needed, so no jsdom dependency"). There is no
`@testing-library/react` or `@testing-library/react-hooks` dependency in
`package.json`. Confirmed by inspection on 2026-09-14: `useNoteEntries.ts`
and `useDisplayValueHistory.ts` — both real hooks with `useState`/`useEffect`
and network calls — have **no test file at all**.

**Why it matters:** every `*.test.tsx` component test in this repo uses
`renderToStaticMarkup` from `react-dom/server`, which never runs effects and
never fires event handlers. So these tests can only assert on a component's
very first render — in practice, always its closed/collapsed default state.
A task description that says "add tests mirroring an existing hook's test
style" for a hook-driven feature (e.g. a popover's open contents, or a new
`useX` hook) may be assuming a testing setup that doesn't actually exist in
this repo.

**How to apply:** when asked to test something that only manifests after a
state change no static SSR render can trigger (opening a popover, expanding
a collapsible section, a hook's fetched data), don't invent a fake test that
looks like it covers the behavior but doesn't (e.g. asserting on the initial
markup and calling it done). Instead: (1) extract the actual logic in
question into a small pure, exported function — same pattern this codebase
already uses (`lib/displayValuesLocalStore.ts`'s `sortDisplayValueHistory`
split out of `listLocalDisplayValues` specifically for testability) — and
test that directly with `describe`/`it`/`expect` like every other
`domain/*.test.ts` or `state/*.test.ts` file; (2) still extend the
component's own `*.test.tsx` with whatever the closed-state render CAN
verify (e.g. that new empty-state strings/headings don't leak while closed);
(3) say explicitly, in a code comment in the test file, that the
open/expanded behavior is covered at the pure-function level instead and
why — don't silently under-deliver on an explicit test-coverage ask.

Applied on the header-control Recent/History split (SCRUM, 2026-09-14):
`domain/notes.ts`'s new `partitionNoteEntriesByToday` and
`state/useSessionHistory.ts`'s new `selectPastSessions` both got full pure
test coverage; `NoteButtonPill.test.tsx`/`DisplayValueButton.test.tsx` only
got closed-state leak-check additions, with a comment explaining why.

Related: [[project-scheduled-activity-no-date]].
