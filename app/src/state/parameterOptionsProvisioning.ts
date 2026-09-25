import { apiProvisionDefaultParameterOptions } from '@/api/parameterOptions'

/**
 * De-dupes concurrent calls to `apiProvisionDefaultParameterOptions()` across
 * every `useParameterOptions` instance in the app (found by code review,
 * same round as `parameterOptionsInvalidation.ts`): before this feedback
 * round, `useParameterOptions(null)` — the "fallback scope" instance that
 * triggers first-time provisioning — only ever existed inside the
 * standalone Activity Library route, which was never mounted alongside
 * anything else that could also call it. Now that `ActivityLibraryPanel`
 * renders as `SlotEditor`'s sibling, a brand-new/never-provisioned user
 * opening Edit mode can have BOTH `SlotEditor`'s own hook instance
 * (`activityId: null` while nothing is staged) and `ActivityLibraryPanel`'s
 * (`activityId: null` before any tile is picked) independently see "all
 * empty" on mount and each call `apiProvisionDefaultParameterOptions()`.
 *
 * `provision_default_parameter_options()`'s own SQL is a plain
 * check-then-insert (`if exists(...) return; insert ...`), not an atomic
 * upsert — two concurrent calls can both pass the `exists` check before
 * either commits, and the SECOND one's insert then trips
 * `activity_parameter_options_scope_idx` and fails outright. The losing
 * instance's `provisioned` flag comes back `false`, so it never reloads —
 * it falls through and marks itself `'ready'` with the STALE, still-empty
 * arrays from before provisioning, showing "No options configured yet" even
 * though the account WAS actually provisioned by the winning instance. This
 * directly undercuts "new users get sensible defaults from day one," and
 * lands on a brand-new user's very first Edit-mode open.
 *
 * Fix: every `useParameterOptions` instance calls THIS function instead of
 * `apiProvisionDefaultParameterOptions()` directly. The first caller starts
 * the real network call and every other concurrent caller awaits that exact
 * same promise instead of firing its own — so only one real
 * `provision_default_parameter_options()` RPC call is ever in flight at a
 * time PER BROWSER TAB, and every instance in that tab that was waiting on
 * it sees the SAME (successful) result and proceeds to reload with the
 * real, now-provisioned data.
 *
 * This module-level guard only ever coordinates instances sharing one JS
 * heap — it cannot, by itself, dedupe two genuinely separate browser tabs or
 * devices racing the same brand-new account (found in a second self-review
 * pass, after an earlier version of this comment overclaimed the race was
 * fully closed). That cross-connection case is closed at the DATABASE
 * instead: `provision_default_parameter_options()` itself now takes a
 * transaction-scoped advisory lock keyed on the user's id before its
 * check-then-insert (see that migration's own doc comment,
 * `20260925060600_advisory_lock_provision_default_parameter_options.sql`),
 * so two truly concurrent calls — from two tabs, or even without this
 * client-side guard at all — serialize correctly at the source of truth.
 * This module's job is narrower and complementary: avoiding two redundant
 * round trips (and, before the DB fix, the unique-index failure) for the
 * common, same-tab case this feedback round was actually about.
 */
let inFlight: Promise<boolean> | null = null

export function provisionDefaultParameterOptionsOnce(): Promise<boolean> {
  if (!inFlight) {
    // Cleared once settled — a genuinely later provisioning need (there
    // isn't one today; every real caller only ever tries once per mount,
    // via its own `provisionedRef`) would still get a fresh real call
    // rather than being stuck replaying a long-resolved promise.
    inFlight = apiProvisionDefaultParameterOptions().finally(() => {
      inFlight = null
    })
  }
  return inFlight
}
