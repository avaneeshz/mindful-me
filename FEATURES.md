# Features — mindful-me

What's actually built and merged to `main` — not aspirational. See [`BACKLOG.md`](./BACKLOG.md) for what's confirmed but not yet shipped, and [`OPEN-QUESTIONS.md`](./OPEN-QUESTIONS.md) for things nobody's decided on yet.

## The timeline

- ✅ **Day/Night 30-minute visual grid** spanning the full 24 hours. No illustrated scenery any more (a later, confirmed simplification — see `UI-DESIGN.md`): the Day row is a plain flat surface, the Night row a fixed grey independent of the light/dark theme toggle. The currently-active period's sun/moon icon still glows.
- ✅ **Hourly tick labels**, one per hour across each row (13 per row, not just start/midpoint/end), in their own row below the strip — never overlaid on it — with an AM/PM suffix only on the first and last label.
- ✅ **A full light/dark theme**, monochrome (no per-category or per-item colour anywhere), toggled instantly by the Sun/Moon icons beside the two timeline rows — not a separate settings screen — and persisted per-device.
- ✅ **Arbitrary-duration activities.** Storage is activity-centric (a real start time + duration in minutes) — the 30-minute grid is a rendering concern only, computed fresh from real activity data, never the unit anything is stored in.
- ✅ **One shared scheduling engine for both entry gestures** — drag an activity onto the timeline, or select a slot and pick an activity — both resolve through the same `computeCandidateSchedule` / `validateSchedule` / `commitSchedule` functions, so they can never diverge into different rules.
- ✅ **No-overlap enforcement at two layers** — client-side validation and a real Postgres exclusion constraint, so it holds even if the client is bypassed.
- ✅ **Duration control**: a draggable/resizable pill on a mini time ruler by default — drag to move, resize from either edge, both paths and the keyboard path dispatching the exact same reducer actions, hard-stopping at the nearest real conflict rather than snapping back. The old `[−] [editable number] [+]` stepper still exists as an off-by-default fallback (`SHOW_DURATION_STEPPER_FALLBACK`, a code constant) for debugging/comparison — the two are mutually exclusive, never shown together.
- ✅ **A real date picker** on the header's date pill — any past or future date, with the whole screen (timeline + editor) switching to that date's data. The "NOW" marker only ever appears when viewing today.
- ✅ **Real weather + city-only location** in the header — browser geolocation with an IP-based fallback, real temperature (Open-Meteo) and city name (BigDataCloud / GeoJS), never a full address.
- ✅ **5 placeholder header pills** — Gifts, Chits, Opportunities, Learnings, Feedback — before the date pill, wrapping onto a second line rather than overflowing. Inert (not wired to anything yet), same treatment as the Notes field's own stub predecessor.
- ✅ **Activity taxonomy**: 53 items across 9 categories (Sleep & Rest, Food & Nourishment, Personal Care, Downtime & Errands, Movement & Body Therapy, Work & Projects, Nature & Spirit, Growth & Connection, Home & Chores), several with sub-option drill-downs (up to 3 levels, e.g. Body Care).
- ✅ **Tile row + log-activity modal**: the 9 categories render as one fill-width row of tiles, each a flat progress bar (`done/total`, no colour). Tapping one grows a panel directly below it, in real layout flow — never overlapping anything — anchored to the tapped tile (left edge for tiles 1-4, centered under tile 5, right edge for tiles 6-9) and sized to fit exactly that category's own item count. Picking an item opens a modal — sub-option chips (when the item has any) and the duration/quality/symptoms/flag/notes controls all shown together, not as separate sequential steps.
- ✅ **Protective response** (formerly "Flag") — Trauma response / Stress response / Fear response / Anger response, plus None (ordered last) — a single-select, optional pick on an individual scheduled activity (at most one), encrypted at rest.
- ✅ **Activity quality** (formerly "How did it feel?") — a single-select, optional reflection on an individual scheduled activity (Nourishing / Productive / Straining / Draining / Dysregulated), encrypted at rest.
- ✅ **Chronic Symptoms** — a multi-select, optional set of symptoms noticed around a logged activity (Pitta, Inflammation, Right knee pain, Calves pain, Temporal pain, Dryness — any number at once), encrypted at rest.
- ✅ **Notes** — a real, always-visible freeform textarea on the log-activity modal (replaces the earlier inert "Deep log" stub), encrypted at rest.
- ✅ **Completion tracking** — mark any scheduled activity done; editing its time/duration never silently clears that.

## Accounts & backend

- ✅ **Real email/password accounts** via Supabase — no email verification (a deliberate product decision, not an oversight), replacing the app's earlier anonymous-session bootstrap.
- ✅ **Row-level security** on every table, scoped to the authenticated user — independently verified directly against the live database, not just assumed from the code.
- ✅ **Local-first writes.** Every add/edit saves to the device instantly; sync to the server happens in the background and the interface never waits on it. The app is fully usable with zero backend configured at all (a graceful "local-only" mode).

## Navigation & shell

- ✅ Collapsed-by-default sidebar on every device (desktop, tablet, mobile), expandable via the hamburger control.
- ✅ Responsive across desktop, tablet (iPad landscape), and mobile — not merely a shrunk desktop layout.

## Not yet built

Insights/analytics and stronger offline resilience are both in the backlog (see `BACKLOG.md` for status).

Real, named gaps against comparable products (see the product's own competitive read, folded into `ROADMAP.md`): no recurring/repeating activities, no external calendar sync, no reminders or notifications, no native mobile app, no AI-assisted scheduling. None of these are secretly half-built — they're plainly not started. See `BACKLOG.md` and `OPEN-QUESTIONS.md` for what's actually been discussed as a candidate versus what's just an honest gap.
