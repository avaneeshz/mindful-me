import { useEffect, useMemo, useState } from 'react'
import { apiListHealthMetrics } from '@/api/healthSync'
import { dateFromLocalDateISO } from '@/lib/localTime'
import { supabaseConfigured } from '@/lib/supabaseClient'
import { onHealthSyncFinished } from '@/state/healthSyncRunner'
import { addDaysISO } from '@/lumen/domain/lumenDay'
import { heartRateOnAxis, heartRateScale, type HeartSample } from '@/lumen/domain/heartRateStrip'

const NONE: HeartSample[] = []

/**
 * The person's heart rate across one Lumen day, one point per minute on the
 * day's axis. Rule 8: one bounded read, local midnight of D-1 to D+2. Loading,
 * failure and local-only mode all just return no samples (no line, no spinner).
 */
export function useHeartRateDay(dayISO: string) {
  const [state, setState] = useState<{ day: string; samples: HeartSample[] }>({ day: dayISO, samples: NONE })
  // Re-read after every sync, so the strips pick up new readings without a reload.
  const [syncs, setSyncs] = useState(0)
  useEffect(() => onHealthSyncFinished((o) => o.ok && setSyncs((n) => n + 1)), [])

  useEffect(() => {
    if (!supabaseConfigured) return
    let cancelled = false
    apiListHealthMetrics('heart-rate-intraday', dateFromLocalDateISO(addDaysISO(dayISO, -1)), dateFromLocalDateISO(addDaysISO(dayISO, 2)))
      .then((rows) => {
        if (!cancelled) setState({ day: dayISO, samples: heartRateOnAxis(rows, dayISO) })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [dayISO, syncs])

  // A response for another day is never shown against this one.
  const samples = state.day === dayISO ? state.samples : NONE
  const scale = useMemo(() => heartRateScale(samples), [samples])
  return { samples, scale }
}
