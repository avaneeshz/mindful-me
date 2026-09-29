import { describe, expect, it } from 'vitest'
import { toChartRows } from './HealthMetricChart'
import { healthDataTypeMeta } from '@/domain/healthMetrics'
import type { HealthMetricPoint } from '@/api/healthSync'

function point(recordedAt: string, value: unknown): HealthMetricPoint {
  return { id: recordedAt + String(JSON.stringify(value)), dataType: 'x', recordedAt, endAt: null, value: value as HealthMetricPoint['value'], unit: null, source: null }
}

describe('toChartRows', () => {
  it('plots each point for a type stored once per day', () => {
    const rows = toChartRows([point('2026-09-29T12:00:00', 100), point('2026-09-30T12:00:00', 200)], healthDataTypeMeta('steps'))
    expect(rows.map((r) => r.value)).toEqual([100, 200])
  })

  it('averages several readings on one day into a single point', () => {
    const meta = healthDataTypeMeta('oxygen-saturation')
    const rows = toChartRows(
      [
        point('2026-09-30T02:00:00', { percentage: 96 }),
        point('2026-09-30T05:00:00', { percentage: 98 }),
        point('2026-09-29T05:00:00', { percentage: 95 }),
      ],
      meta,
    )
    expect(rows.map((r) => r.value)).toEqual([95, 97])
  })

  it('counts entries per day for event types, oldest day first', () => {
    const rows = toChartRows(
      [
        point('2026-09-30T08:00:00', { symptoms: ['HEADACHE'] }),
        point('2026-09-30T09:00:00', { symptoms: ['FATIGUE'] }),
        point('2026-09-28T09:00:00', { symptoms: ['COUGH'] }),
      ],
      healthDataTypeMeta('symptoms'),
    )
    expect(rows.map((r) => r.value)).toEqual([1, 2])
  })

  it('drops points with no number to plot', () => {
    expect(toChartRows([point('2026-09-30T08:00:00', {})], healthDataTypeMeta('body-fat'))).toEqual([])
  })
})
