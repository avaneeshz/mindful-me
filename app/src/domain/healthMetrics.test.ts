import { describe, expect, it } from 'vitest'
import { HEALTH_DATA_TYPES, healthDataTypeMeta } from './healthMetrics'

describe('healthDataTypeMeta', () => {
  it('returns the registered entry for a known data type', () => {
    const meta = healthDataTypeMeta('steps')
    expect(meta.label).toBe('Steps')
    expect(meta.chartKind).toBe('bar')
  })

  it('falls back to a generic, non-throwing entry for an unregistered data type', () => {
    const meta = healthDataTypeMeta('some-future-type')
    expect(meta.label).toBe('Some future type')
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

import {
  HEALTH_GROUPS,
  dayOfRow,
  describeHealthValue,
  healthTypesInGroup,
  minuteLabel,
  parseHeartRateDay,
} from './healthMetrics'

describe('health groups and type coverage', () => {
  it('lists the 11 permission groups once each', () => {
    expect(HEALTH_GROUPS).toHaveLength(11)
    expect(new Set(HEALTH_GROUPS.map((g) => g.id)).size).toBe(11)
  })

  it('places every registered type in a known group', () => {
    const ids = new Set(HEALTH_GROUPS.map((g) => g.id))
    for (const dt of HEALTH_DATA_TYPES) expect(ids.has(dt.group), dt.id).toBe(true)
  })

  it('has unique data type ids', () => {
    const ids = HEALTH_DATA_TYPES.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('groups the original types where they were', () => {
    expect(healthTypesInGroup('sleep').map((d) => d.id)).toEqual(['sleep'])
    expect(healthTypesInGroup('ecg').map((d) => d.id)).toEqual(['electrocardiogram'])
    expect(healthTypesInGroup('activity_and_fitness').map((d) => d.id)).toContain('steps')
  })
})

describe('new data type conversions', () => {
  it('reads a headline number that arrives as a string, and scales it', () => {
    expect(healthDataTypeMeta('height').toChartValue({ heightMillimeters: '1700' }, null)).toBe(170)
    expect(healthDataTypeMeta('body-fat').toChartValue({ percentage: 18.5 }, null)).toBe(18.5)
    expect(healthDataTypeMeta('daily-resting-heart-rate').toChartValue({ beatsPerMinute: '58' }, null)).toBe(58)
  })

  it('returns null when the headline field is missing', () => {
    expect(healthDataTypeMeta('body-fat').toChartValue({}, null)).toBeNull()
  })

  it('charts a per-day total using its sum, falling back to minutes', () => {
    const kcal = healthDataTypeMeta('active-energy-burned')
    expect(kcal.toChartValue({ count: 3, minutes: 30, sum: 210 }, null)).toBe(210)
    expect(kcal.toChartValue({ count: 3, minutes: 30, sum: null }, null)).toBe(30)
    expect(healthDataTypeMeta('sedentary-period').toChartValue({ count: 2, minutes: 95, sum: null }, null)).toBe(95)
  })

  it('counts each event as one entry', () => {
    const moods = healthDataTypeMeta('moods')
    expect(moods.dayAggregate).toBe('count')
    expect(moods.toChartValue({ moods: ['CALM'] }, null)).toBe(1)
    expect(moods.formatValue(2)).toBe('2 entries')
    expect(moods.formatValue(1)).toBe('1 entry')
  })
})

describe('heart rate day', () => {
  it('parses a stored day and rejects malformed ones', () => {
    expect(parseHeartRateDay({ points: [[0, 60], [1, 62]], min: 60, max: 62, avg: 61, count: 5 })).toEqual({
      points: [[0, 60], [1, 62]],
      min: 60,
      max: 62,
      avg: 61,
      count: 5,
    })
    expect(parseHeartRateDay(null)).toBeNull()
    expect(parseHeartRateDay({ points: [] })).toBeNull()
    expect(parseHeartRateDay({ points: [['a', 1]], min: 1, max: 1, avg: 1 })).toBeNull()
  })

  it('formats minute-of-day as a clock time', () => {
    expect(minuteLabel(0)).toBe('00:00')
    expect(minuteLabel(75)).toBe('01:15')
    expect(minuteLabel(1439)).toBe('23:59')
    expect(minuteLabel(5000)).toBe('23:59')
  })

  it('names a day by its midpoint so a zone offset cannot shift it', () => {
    // A local day that starts 18:30 UTC the evening before still belongs to the 30th.
    const { key } = dayOfRow('2026-09-29T18:30:00.000Z', '2026-09-30T18:30:00.000Z')
    expect(key).toBe(new Date('2026-09-30T06:30:00.000Z').toLocaleDateString('sv-SE'))
  })
})

describe('describeHealthValue', () => {
  it('turns a point into readable lines, skipping times and metadata', () => {
    const lines = describeHealthValue({
      sampleTime: { physicalTime: 'x' },
      metadata: { a: 1 },
      moods: ['CALM', 'HAPPY'],
      valences: 4,
      notes: 'slept well',
    })
    expect(lines).toEqual([
      { label: 'Moods', text: 'CALM, HAPPY' },
      { label: 'Valences', text: '4' },
      { label: 'Notes', text: 'slept well' },
    ])
  })

  it('flattens one level of nesting and caps the length', () => {
    expect(describeHealthValue({ stats: { minutes: 3 } })).toEqual([{ label: 'Stats · minutes', text: '3' }])
    const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, i]))
    expect(describeHealthValue(many, 5)).toHaveLength(5)
  })

  it('never throws on odd input', () => {
    expect(describeHealthValue(null)).toEqual([])
    expect(describeHealthValue(7)).toEqual([{ label: 'Value', text: '7' }])
  })
})

import { latestHealthDetails } from './healthMetrics'

describe('latestHealthDetails', () => {
  it('describes only the most recent point', () => {
    expect(
      latestHealthDetails([
        { recordedAt: '2026-09-28T00:00:00Z', value: { timeZone: 'UTC' } },
        { recordedAt: '2026-09-29T00:00:00Z', value: { timeZone: 'Asia/Kolkata' } },
      ]),
    ).toEqual([{ label: 'Time zone', text: 'Asia/Kolkata' }])
  })

  it('is empty when there is nothing synced', () => {
    expect(latestHealthDetails([])).toEqual([])
  })
})
