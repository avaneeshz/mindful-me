import { describe, expect, it } from 'vitest'
import { holidaysFromEvents, holidaysUrl } from './indiaHolidays.ts'

describe('holidaysFromEvents', () => {
  it('keeps public and religious holidays and drops observances', () => {
    const result = holidaysFromEvents(
      [
        { summary: 'Diwali/Deepavali', description: 'Public holiday', start: { date: '2026-11-08' }, end: { date: '2026-11-09' } },
        { summary: 'Eid al-Fitr', description: 'Gazetted holiday', start: { date: '2026-03-21' }, end: { date: '2026-03-22' } },
        { summary: "Teachers' Day", description: 'Observance\nTo hide observances…', start: { date: '2026-09-05' }, end: { date: '2026-09-06' } },
      ],
      2026,
    )
    expect(result).toEqual([
      { date: '2026-03-21', name: 'Eid al-Fitr' },
      { date: '2026-11-08', name: 'Diwali/Deepavali' },
    ])
  })

  it('expands multi-day events with an exclusive end date', () => {
    const result = holidaysFromEvents([{ summary: 'Pongal', start: { date: '2026-01-14' }, end: { date: '2026-01-16' } }], 2026)
    expect(result.map((h) => h.date)).toEqual(['2026-01-14', '2026-01-15'])
  })

  it('drops cancelled, timed and out-of-year events and duplicates', () => {
    const result = holidaysFromEvents(
      [
        { summary: 'Holi', status: 'cancelled', start: { date: '2026-03-04' } },
        { summary: 'Timed', start: { dateTime: '2026-03-04T10:00:00Z' } },
        { summary: 'New Year', start: { date: '2027-01-01' } },
        { summary: 'Christmas', start: { date: '2026-12-25' } },
        { summary: 'Christmas', start: { date: '2026-12-25' } },
      ],
      2026,
    )
    expect(result).toEqual([{ date: '2026-12-25', name: 'Christmas' }])
  })
})

describe('holidaysUrl', () => {
  it('targets the India holiday calendar for one year', () => {
    const url = holidaysUrl(2026, 'KEY')
    expect(url).toContain('en.indian%23holiday%40group.v.calendar.google.com')
    expect(url).toContain('timeMin=2026-01-01')
    expect(url).toContain('timeMax=2027-01-01')
  })
})
