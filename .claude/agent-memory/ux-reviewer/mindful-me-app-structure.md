---
name: mindful-me-app-structure
description: Where mindful-me's "Ritual Board" app code lives, its key docs, and a deliberate redesign decision (no score/recent-activity panel) that is easy to mistake for a bug.
metadata:
  type: project
---

mindful-me (product name in-app: "Ritual Board", working title
"Daily Ritual Board" / "30-Minute Slotting") is a Vite+React+TS+Tailwind app
under `app/`. Three docs at the repo root matter before any review:

- `CLAUDE.md` — design system and product-philosophy constitution.
- `PRODUCT-HANDOFF.md` — the original prototype's full spec (taxonomy,
  color tokens, interaction rules, responsive strategy). Treat as historical
  ground truth for *intent*, not current pixel state — the redesign changed
  some of it.
- `OPEN-QUESTIONS.md` — genuinely unresolved product/design decisions,
  actively maintained (items get removed once resolved). Always read this
  before a review and do not re-report items already tracked here as new
  findings — as of 2026-08-25 it covers: midnight rollover, real weather,
  activity-level flags, Mind & Rest contrast, icon system (Lucide,
  provisional), GEOM/HOSS/HECOLL sub-picker, "Ritual Board" branding, target
  platform, taxonomy-as-hardcoded-array, avatar gradient.

Key source layout: `app/src/state/BoardContext.tsx` + `boardReducer.ts` +
`seed.ts` (in-memory only, no persistence — resets on reload, always seeds
the same demo day rather than a truly blank first-run state);
`app/src/components/Timeline.tsx` (the 24h strip); `app/src/components/
editor/` (SlotEditor, ActivityPicker, StagingPane, SlotActivityList,
FlagsRow — the "Right Now" slot editor); `app/src/components/Sidebar.tsx`
and `HeaderBar.tsx` (both explicitly frozen/out of scope for the redesign).

**Deliberate removal, not a bug**: the original prototype's "Today's Shape"
score ring and "Recent Activity" panel were intentionally deleted in this
redesign — there is a smoke test
(`App.smoke.test.tsx`: "has no Today's Shape, Recent Activity, or scoring
surface at all") asserting they're gone, and `Timeline.tsx` has a comment
noting the "N of 48 slots marked" line now carries their at-a-glance role.
Do not flag their absence as a regression in future reviews.

Dev server: commonly found already running on more than one of
5173/5174/5175 simultaneously (leftover from prior sessions) — check all
three, don't assume only one is live. See [[cdp-testing-method]] for how to
actually interact with it beyond static screenshots.
