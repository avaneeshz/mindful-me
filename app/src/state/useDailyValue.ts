import { useEffect, useRef, useState } from 'react'
import { apiListDailyValues, apiSetDailyValue } from '@/api/dailyValues'
import type { DisplayButtonKey } from '@/domain/displayButtons'
import { loadDisplayValue, saveDisplayValue } from '@/lib/displayValuesLocalStore'
import { supabaseConfigured } from '@/lib/supabaseClient'

/**
 * A `synced: true` display-value button's (Steps, Protein) per-day
 * number — local-first (rule 6) with a background sync to `public.
 * daily_values`, generalizing `DisplayValueButton`'s own local-counter
 * pattern (`lib/displayValuesLocalStore.ts`) rather than replacing it: the
 * SAME local store is still the instant, always-correct source on this
 * device (and the only one at all when no backend is configured); a
 * configured Supabase project is a background mirror the UI never blocks on,
 * the exact same shape `state/useNoteEntries.ts` already established for
 * note entries.
 *
 * `metricKey` is the `public.daily_values.metric_key` value (`'protein'` or
 * `'steps'`); `buttonKey`/`dayKey` key the LOCAL cache, same as every
 * other display-value button. `enabled` lets `DisplayValueButton` call this
 * hook unconditionally (rules of hooks) while skipping every effect for a
 * button that isn't actually a synced one — never issuing a request for an
 * invalid `metric_key`.
 */
export function useDailyValue(
  metricKey: string,
  buttonKey: DisplayButtonKey,
  dayKey: string,
  enabled: boolean,
): { value: number | null; setValue: (next: number | null) => void } {
  const [value, setLocalValue] = useState<number | null>(() => (enabled ? loadDisplayValue(buttonKey, dayKey) : null))
  const hasFetchedRef = useRef<string | null>(null)

  // Local-cache re-read whenever the header date moves — mirrors the plain
  // local-counter path in `DisplayValueButton` exactly.
  useEffect(() => {
    if (!enabled) return
    setLocalValue(loadDisplayValue(buttonKey, dayKey))
  }, [enabled, buttonKey, dayKey])

  // Background reconciliation with the server's authoritative history —
  // fetched once per (metric, day-key change), never blocking the value
  // already shown from the local cache above (rule 6).
  useEffect(() => {
    if (!enabled || !supabaseConfigured) return
    if (hasFetchedRef.current === dayKey) return
    hasFetchedRef.current = dayKey
    let cancelled = false
    apiListDailyValues(metricKey).then((entries) => {
      if (cancelled || entries === null) return
      const match = entries.find((entry) => entry.localDate === dayKey)
      if (match === undefined) return
      // Server wins once it answers — same reconciliation shape
      // `BoardContext`'s hydrate and `useNoteEntries` already follow.
      saveDisplayValue(buttonKey, dayKey, match.value)
      setLocalValue(match.value)
    })
    return () => {
      cancelled = true
    }
  }, [enabled, metricKey, buttonKey, dayKey])

  function setValue(next: number | null) {
    if (!enabled) return
    // Local-first (rule 6): visible and durable on this device before any
    // network round-trip even starts.
    saveDisplayValue(buttonKey, dayKey, next)
    setLocalValue(next)

    // "Each entry REPLACES the day's value" — the server RPC only accepts a
    // real non-negative integer (clearing/blanking stays a local-only
    // affordance, same as Steps' own blank-clears-it behaviour).
    if (supabaseConfigured && next !== null) {
      void apiSetDailyValue(metricKey, dayKey, next)
    }
  }

  return { value, setValue }
}
