# mindful-me — Backlog

Confirmed requirements that are **not being implemented right now**. Ask "give me the pending backlog" any time and this file is the answer — everything below is understood and agreed, just sequenced after the current priority.

This file is additive: when something here starts implementation, move it out (note it as in progress / link its PR); when a new requirement is confirmed but deferred, add it here rather than losing it in chat history.

## Recently completed

**Backend persistence + real login.** Email/password auth via Supabase, no email verification, anonymous-auth bootstrap removed. Implemented and pushed — **PR #6**, not yet merged. RLS re-verified directly against the live database; the live sign-up → session → data-persists flow still needs a real click-test on the deployed site before this is fully closed out (see PR #6 description).

---

## Current priority (tracked separately, not part of this backlog)

**BL-1, BL-2, and BL-3 together** — all three UI/feature items below, pulled out of the backlog as the next active batch:

### BL-1 — Merge the two duration controls into one
The duration stepper currently shows two separate controls: the `− 30 min +` stepper, and a second "Set exact minutes" text box below it. Wanted instead:
- Remove the "Set exact minutes" box entirely.
- Make the stepper's own number directly click-to-edit via keyboard (type an exact value), in addition to keeping the existing ±5 buttons on either side.
- Single row: `[−] [editable number] [+]`, centered.
- Assumption to confirm when this is picked up: the `+30min` / `+1hr` / `+2hr` quick-add buttons stay as-is.

### BL-2 — Make the header date pill a real date picker
The date shown top-right is currently today's date, display-only. Wanted instead:
- Clickable — opens a date picker on click.
- Any past or future date selectable.
- Selecting a date switches the whole screen (timeline + editor) to that date's schedule instead of always "today."
- Open question: should the "NOW" marker/line only render when viewing the real current day (not on a past/future date)? Very likely yes, not yet confirmed explicitly.

### BL-3 — Real weather + city-only location
The weather pill is currently placeholder data. Wanted instead:
- Real device location + a real free weather API for current temperature.
- Display **only the city name** (e.g. "Hyderabad," "Mumbai," "Vellore," "Chennai") — no full address, no coordinates.
- Open question: browser geolocation (permission prompt, more accurate) vs. IP-based location (no prompt, less precise) — not yet decided.

---

## Backlog

### Phase 4 — Insights & aggregation
Daily/weekly time-per-category totals, planned-vs-actual, free/occupied time analysis, activity trends. Depends on real accounts (now implemented, see "Recently completed" above) to be meaningful per-user data rather than a single shared anonymous bucket.

### Phase 5 — Sync hardening
Offline write queue, multi-device conflict handling (last-write-wins + kept history, per the original architecture decisions), full local-first resilience. The "accounts" piece of this phase has already shipped as part of the login work above; the remaining offline/conflict mechanics stay here.
