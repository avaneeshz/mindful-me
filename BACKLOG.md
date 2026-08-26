# mindful-me — Backlog

Confirmed requirements that are **not being implemented right now**. Ask "give me the pending backlog" any time and this file is the answer — everything below is understood and agreed, just sequenced after the current priority.

This file is additive: when something here starts implementation, move it out (note it as in progress / link its PR); when a new requirement is confirmed but deferred, add it here rather than losing it in chat history.

## Recently completed

**Backend persistence + real login.** Email/password auth via Supabase, no email verification, anonymous-auth bootstrap removed. Implemented and merged — **PR #6**. RLS re-verified directly against the live database; the live sign-up → session → data-persists flow still needs a real click-test on the deployed site before this is fully closed out (see PR #6 description).

**BL-1, BL-2, BL-3.** Implemented and merged — **PR #7**:

- **BL-1** — the duration stepper's own number is now directly click-to-edit (the separate "Set exact minutes" box is gone); `[−] [editable number] [+]`, centered; quick-add buttons unchanged. Verified live in a headless browser.
- **BL-2** — the header date pill opens a real month-grid date picker (any past/future date); introduced an explicit `viewedDate` concept in `BoardContext`, separate from real `now`; local-first load/save, sync, and the bounded-window server reconciliation all key off `viewedDate`, so editing a past day works and saves against that day. The NOW marker/line and the SlotEditor "Now" badge only render when `viewedDate` is the real current day — resolves the backlog's open question this way; **flagged for confirmation** in case a different behavior was actually wanted. Local-only mode (no Supabase) unaffected. Verified live across desktop/tablet/mobile, including a real bug fix (Prev/Next month fighting a reactive effect) and a mobile popover-overflow fix caught during that verification.
- **BL-3** — real `navigator.geolocation` + Open-Meteo temperature + BigDataCloud reverse-geocode (city only, falling back to IP-based `ipapi.co` — including its coordinates for temperature — when geolocation is denied/unavailable/empty; the fallback itself was later fixed to swap `ipapi.co` for GeoJS after a live check found the former unreliable). Full loading/partial/unavailable UX states. The resolution chain is unit-tested against injected fakes; this sandbox blocks egress to all of those hosts (like it already does for `supabase.co`), so the GRANTED-permission path with a real response could only be verified against mocks here — **a real-browser check of the live Open-Meteo/BigDataCloud/GeoJS response shapes is still needed**.

**Phase 4 — Insights & aggregation.** Daily/weekly time-per-category totals, planned-vs-actual (completion tracking — no separate "actual duration" field exists, so this is honestly scoped to completion, not a time-variance comparison), free/occupied time analysis, and activity trends, all as pure client-side aggregation (`domain/insights.ts`) over the existing bounded-window `list_scheduled_activities` reads — no new server-side aggregation, no new tables. A real "Insights" screen (`routes/InsightsPage.tsx`, code-split via `React.lazy` so Recharts' weight is only paid on that route), wired into the Sidebar's previously-disabled nav item, with a Day/Week granularity toggle, the existing `DatePicker` reused for navigation, Recharts bar charts for category totals and trends, and custom Meter components (extending the editor's existing `CapacityMeter` visual language) for free/occupied and completion — a 2-slice pie was deliberately avoided per the `dataviz` skill's own guidance ("a single ratio against a limit is a meter, not a pie"). Implemented and pushed on `claude/mindful-me-backend-arch-m3ny6q`, no PR opened yet — see the implementation report for file locations, judgment calls (Progress vs. Insights placement, the trend window always ending "today" rather than following the day/week navigator, category-color reinforcement instead of a chart-tuned categorical palette), and what still needs a live-browser check (the Supabase-backed data path; local-only mode was verified live in a headless browser here).

---

## Backlog

### Phase 5 — Sync hardening
Offline write queue, multi-device conflict handling (last-write-wins + kept history, per the original architecture decisions), full local-first resilience. The "accounts" piece of this phase has already shipped as part of the login work above; the remaining offline/conflict mechanics stay here.
