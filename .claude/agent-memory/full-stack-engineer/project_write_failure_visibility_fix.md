---
name: project-write-failure-visibility-fix
description: Design decisions behind the Sept 2026 write-failure-visibility incident fix (destructive reconcile overwrite, silent sync failures, no retry)
metadata:
  type: project
---

Branch `fix/write-failure-visibility` (off `main`, 2026-09-12) fixed a real
incident: a background sync failure could make a user's whole logged day
appear to vanish. Three bugs, fixed together:

- **Bug A** — `BoardContext`'s cold-load/date-switch effect wholesale-replaced
  `state.activities` with whatever `apiListScheduledActivities` returned,
  including a legitimately-or-not empty array. Fixed with
  `state/reconcileServerActivities.ts` (pure, tested) — merges the server's
  view with local state using the retry queue's `pendingActivityIds`/
  `pendingDeleteActivityIds` as the record of what's still unconfirmed, rather
  than inferring sync status from absence alone.
- **Bug B/C** — `runSyncIntents` fired-and-forgot each write with only a
  `console.warn` on failure, and nothing retried a failed write. Fixed with
  `state/syncQueue.ts` (pure queue: enqueue, per-activity-FIFO
  `nextItemToAttempt`, exponential backoff capped at 5 min, indefinite
  retries — never gives up / never caps attempt count) +
  `state/syncQueueStorage.ts` (localStorage persistence, global key, fail-
  closed) + a drain loop wired into `BoardContext`. Surfaced via
  `SyncStatusPill` (header, renders NOTHING when synced — a deliberate
  "restrained, not anxious" choice) and a small badge in `ActivitySummary`
  per selected activity.

Deliberate scope boundaries (asked about, not silently decided — worth
knowing before assuming they're gaps to close):

- **No intent coalescing.** Repeated edits to the same activity before it
  ever syncs produce multiple queued writes, not one collapsed write. Kept
  simple on purpose; per-activity FIFO ordering still makes the final synced
  state converge correctly, just via more requests than strictly necessary.
- **Queue is NOT namespaced per user id**, unlike the old abandoned branch's
  design. This mirrors the EXISTING precedent — `localPersistence.ts`'s board
  cache isn't user-namespaced either — so it isn't a new gap, just consistent
  with how this single-user-per-device product already persists locally.
- **Pre-existing local writes made before this fix shipped** (already in
  localStorage with no queue entry, from the old fire-and-forget code) aren't
  retroactively backfilled into the queue — there's no reliable way to know
  whether they were already synced. The fix guarantees correctness GOING
  FORWARD only (every create/edit now enqueues in the same effect that
  persists locally, so no window exists where a write is unqueued-but-
  unsynced under the new code).
- A stale, 49-commits-behind branch `claude/mindful-me-backend-arch-m3ny6q`
  (commits `9030c96`, `36f4e77`) attempted a fuller version of this (full
  Phase 5: coalescing, per-user namespacing, multi-device conflict resolution
  UI). Product owner explicitly said not to merge/resurrect it — it predates
  the quality-multiselect model, tile-row redesign, reflection cards, 6am-
  window model. Only read for naming/shape ideas, not code.

See [[project-stabilization-pass-scope]] for the other standing scope-boundary
convention on this repo (`OPEN-QUESTIONS.md`).
