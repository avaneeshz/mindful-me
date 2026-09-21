import { describe, expect, it } from 'vitest'
import { HEALTH_DATA_TYPES, healthDataTypeMeta } from './healthMetrics'

describe('healthDataTypeMeta', () => {
  it('returns the registered entry for a known data type', () => {
    const meta = healthDataTypeMeta('steps')
    expect(meta.label).toBe('Steps')
    expect(meta.chartKind).toBe('bar')
  })

  it('falls back to a generic, non-throwing entry for an unregistered data type', () => {
    const meta = healthDataTypeMeta('daily-heart-rate-variability')
    expect(meta.label).toBe('Daily heart rate variability')
    expect(meta.toChartValue(42, null)).toBeNull()
    expect(meta.formatValue(1)).toBe('1')
  })

  it('every registered data type converts and formats a plausible numeric sample without throwing', () => {
    for (const dt of HEALTH_DATA_TYPES) {
      const chartValue = dt.toChartValue(100, 'unit')
      expect(chartValue === null || Number.isFinite(chartValue)).toBe(true)
      if (chartValue !== null) {
        expect(() => dt.formatValue(chartValue)).not.toThrow()
      }
    }
  })

  it('converts distance from millimeters to kilometers', () => {
    const meta = healthDataTypeMeta('distance')
    expect(meta.toChartValue(5_000_000, 'mm')).toBe(5)
    expect(meta.formatValue(5)).toBe('5 km')
  })

  it('converts sleep from minutes to hours', () => {
    const meta = healthDataTypeMeta('sleep')
    expect(meta.toChartValue(450, 'min')).toBe(7.5)
    expect(meta.formatValue(7.5)).toBe('7.5 h')
  })

  it('treats a non-numeric value (a structured fallback point) as non-chartable', () => {
    const meta = healthDataTypeMeta('exercise')
    expect(meta.toChartValue({ exerciseType: 'RUNNING' }, null)).toBeNull()
  })
})
