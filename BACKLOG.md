# mindful-me — Backlog

Confirmed requirements that are **not being implemented right now**. Ask "give me the pending backlog" any time and this file is the answer — everything below is understood and agreed, just sequenced after the current priority.

This file is additive: when something here starts implementation, move it out (note it as in progress / link its PR); when a new requirement is confirmed but deferred, add it here rather than losing it in chat history.

## Recently completed

**Quick-log header buttons (Exercise/Breathing/Sleep), Protein, Supplements.** Implemented, not yet committed — see the full-stack-engineer session dated 2026-09-13. Exercise/Breathing reuse the existing 'Sports or Exercise'/'Breathwork' catalog identities; Sleep is a new catalog card (its own 3-value type list + an 11-value "How was your sleep?" vocabulary + a separate Dreams note, both new `scheduled_activities` columns). Protein is a new synced (not local-only) per-day set/replace value in a new `public.daily_values` table, generalized by `metric_key` rather than Protein-specific. Supplements is a new 7-item daily checklist, its own new `public.supplement_completions` table and its own new component (`SupplementsButton.tsx`) — a genuinely new interaction pattern, reusing `NoteButtonPill`'s popover chrome only. Migrations added under `supabase/migrations/20260913060*.sql`, not applied.

**Editable history across every header control.** Implemented, not yet committed or applied — see the full-stack-engineer session dated 2026-09-13. All three areas from the original handoff (directly below, kept for context):

1. **`note_entries`** (the 7 `NoteButtonPill` buttons) — added `update_note_entry`/`delete_note_entry` RPCs. The DELETE half is a rule-11 soft delete (`deleted_at` + a 30-day purge job, mirroring `scheduled_activities` exactly), never a real DELETE RLS policy — the handoff's literal wording asked for one, superseded once rule 11 was actually applied; see the migration's own top-of-file note. `NoteButtonPill`'s history rows now have inline Edit (reuses the Store form's own textarea/type-chip shape) and Remove (immediate, no confirm step — matches `ActivitySummary`/`SlotActivityList`'s existing Edit/Remove convention exactly, including the Pencil/X icon choice). Migration: `supabase/migrations/20260913070000_note_entries_edit_delete.sql`, not applied.
2. **`DisplayValueButton`** — confirmed the handoff's reasoning both ways before building: a `quickLogName` button (Vipassana/Exercise/Breathing/Sleep) gets a session JUMP LIST, not a second edit surface — each row dispatches the existing `editActivity` action and opens the same `LogActivityModal` the Timeline's own Edit does. A day-value button (Steps/Protein) gets a real per-day history list, inline-editable via a new `state/useDisplayValueHistory.ts` hook built on the SAME local-first store the plain setter already writes through — `lib/displayValuesLocalStore.ts` already retains a full day-map forever, so no new local storage shape was needed, only a way to read all of it. **Architecture call, flagged per the agent definition's own instruction**: Steps' history stays local-only (device-scoped, same explicitly-scoped exception Steps already was) rather than moving it onto `daily_values` — that move is still a real decision for whoever wants cross-device Steps history, not made here.
3. **Supplements** — confirmed no gap: `viewedDate` navigation (rule 12) already lets the user see and edit any past day's checklist, and no other day-scoped control in this app offers a cross-day-at-a-glance view either, so building one only for Supplements would be a one-off. Nothing built.

**Backend persistence + real login.** Email/password auth via Supabase, no email verification, anonymous-auth bootstrap removed. Implemented and merged — **PR #6**.

**BL-1, BL-2, BL-3.** Implemented and merged — **PR #7**:

- **BL-1** — the duration stepper's own number is now directly click-to-edit (the separate "Set exact minutes" box is gone); `[−] [editable number] [+]`, centered; quick-add buttons unchanged.
- **BL-2** — the header date pill opens a real month-grid date picker (any past/future date); introduced an explicit `viewedDate` concept in `BoardContext`, separate from real `now`, so editing a past day works and saves against that day. The NOW marker/line only renders when `viewedDate` is the real current day.
- **BL-3** — real device location + real temperature in the header, city name only (no address, no coordinates).

---

## Backlog

**In flight — activity picker redesign (tile row, log-activity modal, quality field, single-select flags, mockup-matched visuals).** On a branch, not yet merged — **PR #9**. Not documented in detail here until it merges, same convention as Phase 4/5 below.

### Known issues

**DB security advisory — `record_local_edit_conflict` callable by any authenticated user.** Found live on the Supabase project (not introduced by current work): `public.record_local_edit_conflict` is `SECURITY DEFINER` with no additional caller check, so any signed-in user can invoke it, not just the owner of the row it acts on. It's part of the Phase 5 "last-write-wins" conflict-tracking groundwork (`list_local_edit_conflicts` alongside it, plus two new `activity_events.event_type` values) — already applied to the live database under migration `20260827143623_local_edit_conflicts`, but **that migration file does not exist in `supabase/migrations/`** (repo and live DB have drifted; live has more migrations applied than the repo has files for). No client code references either function yet. Needs: (1) a real caller/ownership check added to `record_local_edit_conflict` (mirror the `user_id = auth.uid()` pattern the other RPCs already use), and (2) the missing migration file(s) written back into the repo so it matches live state. Not urgent (unused by the client today) but shouldn't ship wired up without the fix.

### Phase 4 — Insights & aggregation
Daily/weekly time-per-category totals, planned-vs-actual, free/occupied time analysis, activity trends. Depends on real accounts (now implemented, see "Recently completed" above) to be meaningful per-user data rather than a single shared anonymous bucket.

A first-pass implementation exists on a branch, but the requirement isn't finalized — expect a more capable UI with more components before this actually merges. Not documented in detail here on purpose until that's settled.

### Phase 5 — Sync hardening
Offline write queue, multi-device conflict handling (last-write-wins + kept history, per the original architecture decisions), full local-first resilience. The "accounts" piece of this phase has already shipped as part of the login work above; the remaining offline/conflict mechanics stay here.

A first-pass implementation exists on the same branch as Phase 4, held for the same reason — not documented in detail here until the requirement is settled and it's ready to merge.
