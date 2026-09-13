# mindful-me — Backlog

Confirmed requirements that are **not being implemented right now**. Ask "give me the pending backlog" any time and this file is the answer — everything below is understood and agreed, just sequenced after the current priority.

This file is additive: when something here starts implementation, move it out (note it as in progress / link its PR); when a new requirement is confirmed but deferred, add it here rather than losing it in chat history.

## Recently completed

**Quick-log header buttons (Exercise/Breathing/Sleep), Protein, Supplements.** Implemented, not yet committed — see the full-stack-engineer session dated 2026-09-13. Exercise/Breathing reuse the existing 'Sports or Exercise'/'Breathwork' catalog identities; Sleep is a new catalog card (its own 3-value type list + an 11-value "How was your sleep?" vocabulary + a separate Dreams note, both new `scheduled_activities` columns). Protein is a new synced (not local-only) per-day set/replace value in a new `public.daily_values` table, generalized by `metric_key` rather than Protein-specific. Supplements is a new 7-item daily checklist, its own new `public.supplement_completions` table and its own new component (`SupplementsButton.tsx`) — a genuinely new interaction pattern, reusing `NoteButtonPill`'s popover chrome only. Migrations added under `supabase/migrations/20260913060*.sql`, not applied.

**Deferred from the same request — editable history across every header control.** The product spec's item 4 ("all buttons get this, not just the new ones") is NOT implemented — flagged explicitly as too large/cross-cutting to bundle into the same diff as the buttons above (it touches all 9 `NoteButtonPill`s, both pre-existing `DisplayValueButton`s, and all 4 new quick-log/day-value controls uniformly). Scope for whoever picks this up: (1) `note_entries` needs `update_note_entry`/`delete_note_entry` RPCs + UPDATE/DELETE RLS policies (currently append-only by design); (2) `DisplayValueButton` needs a history view it has none of today — for a `quickLogName` button (Vipassana/Exercise/Breathing/Sleep) this is naturally "today's sessions from `activities`, each opening the EXISTING `editActivity`/`LogActivityModal` edit path" (no new edit surface needed — confirm this reasoning before building a second one); for a day-value button (Steps/Protein) it's "past days' values, each inline-editable via the existing setter, prefilled" (`public.daily_values` already has `list_daily_values` for this — Steps would need the same treatment or its own explicit continued exception); (3) Supplements' own edit surface (toggle back off / edit note) already exists day-to-day via `viewedDate`, so "history" there likely just means allowing the user to navigate to a past day, which already works (rule 12) — confirm nothing further is wanted before building anything new for it.

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
