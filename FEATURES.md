# Features — mindful-me

What's actually built and merged to `main` — not aspirational. See [`BACKLOG.md`](./BACKLOG.md) for what's confirmed but not yet shipped, and [`OPEN-QUESTIONS.md`](./OPEN-QUESTIONS.md) for things nobody's decided on yet.

## The timeline

- ✅ **Day/Night 30-minute visual grid** spanning the full 24 hours, each row an illustrated scene (gradient sky, layered scenery) with the currently-active period's sun/moon icon glowing.
- ✅ **Arbitrary-duration activities.** Storage is activity-centric (a real start time + duration in minutes) — the 30-minute grid is a rendering concern only, computed fresh from real activity data, never the unit anything is stored in.
- ✅ **One shared scheduling engine for both entry gestures** — drag an activity onto the timeline, or select a slot and pick an activity — both resolve through the same `computeCandidateSchedule` / `validateSchedule` / `commitSchedule` functions, so they can never diverge into different rules.
- ✅ **No-overlap enforcement at two layers** — client-side validation and a real Postgres exclusion constraint, so it holds even if the client is bypassed.
- ✅ **Duration control**: a single `[−] [editable number] [+]` stepper, click-to-edit for an exact typed value, plus `+30min` / `+1hr` / `+2hr` quick-add buttons — one control, not two.
- ✅ **A real date picker** on the header's date pill — any past or future date, with the whole screen (timeline + editor) switching to that date's data. The "NOW" marker only ever appears when viewing today.
- ✅ **Real weather + city-only location** in the header — browser geolocation with an IP-based fallback, real temperature (Open-Meteo) and city name (BigDataCloud / GeoJS), never a full address.
- ✅ **Activity taxonomy**: 24 top-level activities across 5 categories (Mind & Rest, Body & Domestic, Sports or Exercise, Nature & Connection, Focus & Growth), several with sub-option drill-downs (up to 3 levels for Body care).
- ✅ **Flags** — Trauma response / Stress response / Fear response — attach to an individual scheduled activity, encrypted at rest.
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
