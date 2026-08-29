# Product — mindful-me

## What this is

mindful-me is a premium personal life-tracking application. It helps the user understand how they spend their time, what activities they perform, how consistently they perform them, and how their life patterns evolve over time — a visual, whole-day timeline rather than a task list, built to feel like a polished consumer product, not an internal tool.

The core mental model: your day is a physical span of time, not a stack of items. Two rows — Day and Night — represent the full 24 hours, and every activity you log is placed on that timeline at the moment it actually happened, for exactly as long as it actually took.

## Who it's for

Someone who wants to understand their own patterns — where their time actually goes, across categories that matter to them (rest, body, movement, connection, growth) — and who wants that record to include the honest texture of a real day: naps that ran long, a 37-minute walk that wasn't quite 30 or 45, a day that included a flagged stress response worth remembering later. Not a project-management tool, not a corporate time tracker.

## Product philosophy

Priority order, in case of conflict:

1. Clarity
2. Simplicity
3. Personal usefulness
4. Low cognitive load
5. Fast interaction
6. Beautiful but restrained visual design
7. Meaningful insights
8. Consistency

Do not add complexity merely because a feature is technically possible. When uncertain, prefer simpler, clearer, more consistent, less decorative, more intentional — over more features, more visual effects, more components, more complexity. (See `CLAUDE.md` for the full engineering-facing version of this and the design system it governs.)

## What makes this different from a generic to-do list or habit tracker

(See `ROADMAP.md`'s history and the product's own competitive read for the full comparison — the short version:)

- **The full 24 hours, not just waking hours.** Sleep is a first-class tracked period on the same timeline as everything else, not an afterthought.
- **Arbitrary duration, always.** An activity is however long it actually took — 8 minutes, 37 minutes, 2 hours 17 minutes — never rounded to fit a grid. The 30-minute grid you see is a visual ruler drawn *over* your real activities, never the unit they're stored in.
- **Category- and state-first, not task-first.** Every activity belongs to a wellness category, and can optionally carry an emotional/somatic flag (Trauma response, Stress response, Fear response) — a trauma-informed layer most planning or habit apps don't have at all.
- **One scheduling engine, two gestures.** Dragging an activity onto the timeline and selecting-a-slot-then-picking-an-activity are two entry points into the exact same underlying logic — they can never quietly diverge into different rules.
- **Real accuracy over passive convenience.** Nothing is auto-tracked or guessed by an algorithm; everything is a deliberate, honest record of what you did, when, for how long — a trade of a little more upfront effort for data you can actually trust.

## Non-negotiable product rules

These apply to every feature, and are treated as hard constraints, not defaults to reopen per-feature (the full list, with implementation detail, lives in `.claude/agents/full-stack-engineer.md` — this is the product-facing summary):

1. No two activities may overlap, ever.
2. An activity belongs to the calendar day it started on; a midnight-crossing activity is one entry, with its minutes split across both days only for aggregation.
3. Times are wall-clock, locked in at creation — a later timezone change or DST transition never retroactively shifts a past entry.
4. Editing an activity's time or duration never silently clears its completion status.
5. Placing an activity should always feel fast — snap-to-friendly-time on drop, then fine-tune to the exact minute.
6. Every write lands locally first, instantly, regardless of connectivity — sync is a background concern the interface never waits on.
7. A conflicting edit from another device: the newest edit wins, and the older one is never silently discarded.
8. A read of "today" or "this week" is always scoped to that window — the app never gets slower as history grows.
9. No accidental double-submits.
10. Sensitive fields (the emotional/somatic flags) are encrypted at rest and visible only to their owner — no exceptions.
11. Deleting something is immediate from your view, recoverable for a window, then genuinely gone.
12. You can always go back and fix a past day — nothing about your history is locked.
13. One logical activity is never silently split across two disjoint free periods — if a duration doesn't fit contiguously where you're placing it, you're offered the largest block that does, not an invisible workaround.

## Adjacent project — do not confuse

"LifeLog" is a separate, unrelated product referenced during mindful-me's early design conversations as an inspiration point (and briefly as a same-Vercel-account neighbor). It has its own weighted A/B/C scoring system, its own data model, and no shared code or backend with mindful-me. The two must not be conflated — mindful-me deliberately has no scoring/points system; its "score," where one exists at all (see Insights), is a plain completion percentage, never a weighted behavioral score.
