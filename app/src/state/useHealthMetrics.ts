import { useEffect, useState } from 'react'
import { apiListHealthMetrics, type HealthMetricPoint } from '@/api/healthSync'
import { dayOfRow, parseHeartRateDay, type HeartRateDayData } from '@/domain/healthMetrics'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * One data type's synced points over the last `days` (rule 8: always a bounded
 * window). `null` while loading. A failed read resolves to `[]`, the same as
 * "nothing synced" — the screen shows its empty state, never a crash.
 *
 * `enabled: false` skips the read entirely (an unopened card fetches nothing).
 * `refreshKey` re-reads, e.g. after a sync lands.
 */
export function useHealthMetrics(
  dataType: string,
  { days = 30, enabled = true, refreshKey = 0 }: { days?: number; enabled?: boolean; refreshKey?: number } = {},
): HealthMetricPoint[] | null {
  const [state, setState] = useState<{ key: string; points: HealthMetricPoint[] } | null>(null)
  const key = `${dataType}|${days}|${refreshKey}`

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    // A day ahead of now, so a row stamped with today's local midnight in a
    // zone east of the browser's is still inside the window.
    const end = new Date(Date.now() + DAY_MS)
    const start = new Date(end.getTime() - (days + 1) * DAY_MS)
    apiListHealthMetrics(dataType, start, end).then((points) => {
      if (!cancelled) setState({ key, points: points ?? [] })
    })
    return () => {
      cancelled = true
    }
  }, [dataType, days, enabled, key])

  return state && state.key === key ? state.points : null
}

export interface HeartRateDayEntry {
  /** `YYYY-MM-DD` */
  key: string
  label: string
  data: HeartRateDayData
}

/**
 * The stored full-day heart-rate rows, oldest day first, for a day picker.
 * `null` while loading.
 */
export function useHeartRateDays({ days = 14, refreshKey = 0 }: { days?: number; refreshKey?: number } = {}): HeartRateDayEntry[] | null {
  const points = useHealthMetrics('heart-rate-intraday', { days: days + 1, refreshKey })
  if (points === null) return null
  const entries: HeartRateDayEntry[] = []
  for (const p of points) {
    const data = parseHeartRateDay(p.value)
    if (!data) continue
    const { key, label } = dayOfRow(p.recordedAt, p.endAt)
    entries.push({ key, label, data })
  }
  return entries.sort((a, b) => (a.key < b.key ? -1 : 1))
}
