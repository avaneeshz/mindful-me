import { describe, expect, it } from 'vitest'
import { renderDayExportPdf } from './dayExportPdf'
import type { DayExportData } from '@/domain/dayExport'

const EMPTY_DATA: DayExportData = {
  dateLabel: 'Friday, September 11, 2026',
  isoDate: '2026-09-11',
  activities: [],
  noteEntries: [],
  displayValues: [],
  isEmpty: true,
}

const FULL_DATA: DayExportData = {
  dateLabel: 'Friday, September 11, 2026',
  isoDate: '2026-09-11',
  activities: [
    {
      id: 'a1',
      name: 'Meditation',
      pathLabel: 'Silent',
      timeRangeLabel: '6:00 AM – 6:20 AM',
      durationLabel: '20m',
      quality: ['Flow'],
      symptoms: ['Dryness'],
      flag: 'Anger',
      notes: 'Felt centred.',
      reflections: [{ card: 3, title: 'Internal Systems', note: 'Check-in.' }],
    },
  ],
  noteEntries: [
    {
      id: 'n1',
      buttonLabel: 'Prayer',
      entryType: 'Thanksgiving',
      note: 'Grateful for today.',
      timestampLabel: 'Fri, 11 Sep · 3:45 PM',
    },
  ],
  displayValues: [
    { label: 'Vipassana', valueLabel: '45m' },
    { label: 'Steps', valueLabel: '4.2k' },
  ],
  isEmpty: false,
}

describe('renderDayExportPdf', () => {
  it('produces a real PDF document for a day with nothing logged', () => {
    const doc = renderDayExportPdf(EMPTY_DATA)
    const uri = doc.output('datauristring')
    expect(uri.startsWith('data:application/pdf')).toBe(true)
  })

  it('produces a real PDF document for a fully populated day, without throwing', () => {
    const doc = renderDayExportPdf(FULL_DATA)
    const uri = doc.output('datauristring')
    expect(uri.startsWith('data:application/pdf')).toBe(true)
    // A real multi-section document should be non-trivially sized.
    expect(uri.length).toBeGreaterThan(500)
  })

  it('paginates rather than throwing when a day has many activities', () => {
    const many: DayExportData = {
      ...FULL_DATA,
      activities: Array.from({ length: 60 }, (_, i) => ({
        ...FULL_DATA.activities[0],
        id: `a${i}`,
        name: `Activity ${i}`,
      })),
    }
    expect(() => renderDayExportPdf(many)).not.toThrow()
  })
})
