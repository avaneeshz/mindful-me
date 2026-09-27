import { useEffect, useState } from 'react'

/**
 * A minimal cross-instance invalidation signal for `useParameterOptions`
 * (found in self-review, a materially worse consequence than first assumed):
 * folding `ActivityLibraryPanel` inline into `SlotEditor` (real user
 * feedback — see that component's own doc comment) means its own
 * `useParameterOptions(selectedActivityId)` instance and `SlotEditor`'s own
 * `useParameterOptions(stagedActivityId)` instance can now genuinely be
 * mounted AT THE SAME TIME, watching the SAME activity, with no shared
 * state between them (unlike `tiles`/`activities`, which share one instance
 * via `PickerDataContext`). Without this, editing an activity's quality/
 * symptom/flag list via the panel while that exact activity is ALSO staged
 * in `LogActivityModal` leaves the modal's picker showing stale options —
 * concretely, a user could pick a value the panel had just removed, commit
 * it, and have the server's own validation (`internal.assert_valid_quality`
 * et al.) reject it. Per `state/syncQueue.ts`'s own "never removes the item
 * and never gives up retrying" contract, that activity would then retry
 * forever and show as permanently sync-failed — a real, severe outcome, not
 * merely a stale-looking UI.
 *
 * This is deliberately NOT a full shared cache (that would mean building a
 * multi-key store `useParameterOptions` reads from instead of its own
 * state, a much larger change for this feedback round). Instead, every
 * `useParameterOptions` instance keeps its own independent state exactly as
 * before, but `notifyParameterOptionsChanged` is called after any
 * successful, server-backed mutation, and every OTHER instance watching that
 * same activityId (via `useParameterOptionsInvalidationVersion`) re-fetches
 * in response — so a change in one instance is visible in every other one
 * watching the same node within one render, without either needing to know
 * the other exists.
 *
 * Each caller identifies itself with a stable `instanceId` (see
 * `useParameterOptions.ts`'s own `instanceIdRef`) so the instance that
 * PERFORMED a mutation never redundantly reloads itself in response to its
 * own notification (found in self-review): that instance's local state
 * already reflects the mutation's own optimistic update (or, on the rare
 * skipped-label path, its own direct `load()` call already runs) — reacting
 * to its own broadcast too would re-issue the full 4-RPC fetch a second
 * time for no reason and flash a `status: 'loading'` spinner right after
 * every successful edit.
 *
 * Zero-backend / local-only mode (rule 6) never calls
 * `notifyParameterOptionsChanged` at all — there is no server-backed
 * `load()` for another instance to usefully re-run in that mode (each
 * instance's optimistic state there is genuinely independent, in-memory
 * only, with nothing to reconcile against), so this module is inert until a
 * real backend is configured.
 */

const FALLBACK_KEY = '\u0000fallback'

function keyFor(activityId: string | null): string {
  return activityId ?? FALLBACK_KEY
}

const versions = new Map<string, number>()
const listeners = new Map<string, Set<(sourceInstanceId: string) => void>>()

/** Bump the version for one activity's (or the fallback's, `activityId: null`) parameter options — call after any successful, server-backed `setOverride`/`resetToInherited`, identifying the calling instance so it doesn't redundantly re-fetch itself. */
export function notifyParameterOptionsChanged(activityId: string | null, sourceInstanceId: string): void {
  const key = keyFor(activityId)
  versions.set(key, (versions.get(key) ?? 0) + 1)
  listeners.get(key)?.forEach((listener) => listener(sourceInstanceId))
}

/** The current invalidation version for one activityId — bumps whenever `notifyParameterOptionsChanged` is called for it by a DIFFERENT instance (never this one, identified by `instanceId`). Include the result in an effect's dependency array to re-run that effect on every such change. */
export function useParameterOptionsInvalidationVersion(activityId: string | null, instanceId: string): number {
  const key = keyFor(activityId)
  const [version, setVersion] = useState(() => versions.get(key) ?? 0)

  useEffect(() => {
    // Pick up anything that changed between this render and this effect
    // actually running, then subscribe for further changes.
    setVersion(versions.get(key) ?? 0)
    const listener = (sourceInstanceId: string) => {
      if (sourceInstanceId === instanceId) return
      setVersion(versions.get(key) ?? 0)
    }
    const set = listeners.get(key) ?? new Set()
    set.add(listener)
    listeners.set(key, set)
    return () => {
      set.delete(listener)
      if (set.size === 0) listeners.delete(key)
    }
  }, [key, instanceId])

  return version
}
