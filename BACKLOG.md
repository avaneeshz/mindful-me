# mindful-me — Backlog

Confirmed requirements that are **not being implemented right now**. Ask "give me the pending backlog" any time and this file is the answer — everything below is understood and agreed, just sequenced after the current priority.

This file is additive: when something here starts implementation, move it out (note it as in progress / link its PR); when a new requirement is confirmed but deferred, add it here rather than losing it in chat history.

## Recently completed

> **On the "merged" claims below.** GitHub's own `merged` API field reads `false` for every PR in this repo, because each merge happened via a direct `git merge` + push rather than GitHub's merge button. Verified instead with `git merge-base --is-ancestor <pr-head-sha> origin/main`, which confirms PRs #1–#7 are all genuinely in `origin/main` — every merge claim in this file is accurate as written (checked 2026-08-27). Phase 4 and Phase 5 are on `claude/mindful-me-backend-arch-m3ny6q` only, with no PR opened, exactly as their entries say.

**Phase 5 — Sync hardening.** The offline write queue, multi-device conflict handling, and the local-first resilience gaps Phase 2 left open. Implemented and pushed on `claude/mindful-me-backend-arch-m3ny6q`, no PR opened yet.

- **Offline write queue.** `state/syncQueue.ts` (pure: coalescing, strict-FIFO ordering, exponential backoff capped at 5 minutes, permanent-vs-retryable failure classification), `state/syncQueueStorage.ts` (per-user, versioned, fail-closed `localStorage` persistence) and `state/syncEngine.ts` (the thin injected-dependency shell that runs it). Replaces Phase 2's fire-and-forget `runSyncIntents`, which attempted each write exactly once and silently gave up. A write now survives no connectivity, repeated failure, and the tab being closed and reopened.
- **Conflict handling (rule 7).** `state/reconcile.ts` resolves last-write-wins per activity by comparing a queued edit's device-clock stamp against the server row's `updated_at` (now carried through to the client). The loser is never discarded: migration `20260827090000_local_edit_conflicts.sql` adds `superseded_local_edit` / `rejected_local_edit` to `activity_events` plus a narrow `record_local_edit_conflict` RPC, and the losing edit is queued to it with the same offline durability as any other write. `BoardContext`'s cold-load reconcile is no longer a blind "replace with whatever the server says" — that would have wiped every queued offline write on the next reload.
- **Sync-status indicator.** `components/SyncStatusPill.tsx` in the header. Silent when healthy; offline / syncing / can't-sync (with a real retry button) / "updated from another device" otherwise.
- **Insights included.** `useInsightsDays` now merges unsent local writes into the server's answer, so a day logged offline is not under-reported on the Insights screen.

Verified live in a headless browser using this sandbox's blocked egress to `*.supabase.co` as a genuine offline condition, and the conflict half verified against the live database via SQL. Still needs a real two-device check in the wild (this sandbox can never complete a successful sync), and a real-world check that a completed drain leaves the board correct.

**Backend persistence + real login.** Email/password auth via Supabase, no email verification, anonymous-auth bootstrap removed. Implemented and merged — **PR #6**. RLS re-verified directly against the live database; the live sign-up → session → data-persists flow still needs a real click-test on the deployed site before this is fully closed out (see PR #6 description).

**BL-1, BL-2, BL-3.** Implemented and merged — **PR #7**:

- **BL-1** — the duration stepper's own number is now directly click-to-edit (the separate "Set exact minutes" box is gone); `[−] [editable number] [+]`, centered; quick-add buttons unchanged. Verified live in a headless browser.
- **BL-2** — the header date pill opens a real month-grid date picker (any past/future date); introduced an explicit `viewedDate` concept in `BoardContext`, separate from real `now`; local-first load/save, sync, and the bounded-window server reconciliation all key off `viewedDate`, so editing a past day works and saves against that day. The NOW marker/line and the SlotEditor "Now" badge only render when `viewedDate` is the real current day — resolves the backlog's open question this way; **flagged for confirmation** in case a different behavior was actually wanted. Local-only mode (no Supabase) unaffected. Verified live across desktop/tablet/mobile, including a real bug fix (Prev/Next month fighting a reactive effect) and a mobile popover-overflow fix caught during that verification.
- **BL-3** — real `navigator.geolocation` + Open-Meteo temperature + BigDataCloud reverse-geocode (city only, falling back to IP-based `ipapi.co` — including its coordinates for temperature — when geolocation is denied/unavailable/empty; the fallback itself was later fixed to swap `ipapi.co` for GeoJS after a live check found the former unreliable). Full loading/partial/unavailable UX states. The resolution chain is unit-tested against injected fakes; this sandbox blocks egress to all of those hosts (like it already does for `supabase.co`), so the GRANTED-permission path with a real response could only be verified against mocks here — **a real-browser check of the live Open-Meteo/BigDataCloud/GeoJS response shapes is still needed**.

**Phase 4 — Insights & aggregation.** Daily/weekly time-per-category totals, planned-vs-actual (completion tracking — no separate "actual duration" field exists, so this is honestly scoped to completion, not a time-variance comparison), free/occupied time analysis, and activity trends, all as pure client-side aggregation (`domain/insights.ts`) over the existing bounded-window `list_scheduled_activities` reads — no new server-side aggregation, no new tables. A real "Insights" screen (`routes/InsightsPage.tsx`, code-split via `React.lazy` so Recharts' weight is only paid on that route), wired into the Sidebar's previously-disabled nav item, with a Day/Week granularity toggle, the existing `DatePicker` reused for navigation, Recharts bar charts for category totals and trends, and custom Meter components (extending the editor's existing `CapacityMeter` visual language) for free/occupied and completion — a 2-slice pie was deliberately avoided per the `dataviz` skill's own guidance ("a single ratio against a limit is a meter, not a pie"). Implemented and pushed on `claude/mindful-me-backend-arch-m3ny6q`, no PR opened yet — see the implementation report for file locations, judgment calls (Progress vs. Insights placement, the trend window always ending "today" rather than following the day/week navigator, category-color reinforcement instead of a chart-tuned categorical palette), and what still needs a live-browser check (the Supabase-backed data path; local-only mode was verified live in a headless browser here).

---

## Backlog

_Nothing outstanding._ Phase 5 was the last item; it moved to "Recently completed" above.

Known follow-ups that are **not** yet confirmed requirements — raise them before implementing:

- **Surfacing a lost edit to the user.** A superseded/rejected local edit is preserved in `activity_events` and readable via `list_local_edit_conflicts`, and the header pill says "Updated from another device" — but there is no screen that shows *what* the lost edit was, or offers to re-apply it. That is a deliberate scope line, not an oversight.
- **Clock skew.** Last-write-wins compares a device clock against the server clock. A badly wrong device clock can win or lose incorrectly; the losing edit is kept either way, which is why this is acceptable rather than invisible.
