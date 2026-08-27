import { describe, expect, it } from 'vitest'
import type { ScheduledActivity } from '@/domain/types'
import { mergeUnsyncedLocalEdits } from './insightsData'
import type { PendingEdit } from './syncQueue'

const DAY_1 = new Date(2026, 7, 26)
const DAY_2 = new Date(2026, 7, 27)

function activity(id: string, overrides: Partial<ScheduledActivity> = {}): ScheduledActivity {
  return {
    id,
    name: 'Homework',
    path: [],
    startMinutes: 600,
    durationMinutes: 30,
    flags: [],
    status: 'planned',
    timezone: 'Asia/Kolkata',
    ...overrides,
  }
}

function pending(ids: Record<string, Partial<PendingEdit> & { editedAt: string }>) {
  return new Map<string, PendingEdit>(
    Object.entries(ids).map(([id, edit]) => [id, { removes: false, creates: false, ...edit }]),
  )
}

describe('mergeUnsyncedLocalEdits', () => {
  it('returns the server’s answer untouched when nothing is queued', () => {
    const serverDays = [{ date: DAY_1, activities: [activity('a')] }]
    expect(mergeUnsyncedLocalEdits(serverDays, [{ date: DAY_1, activities: [] }], new Map())).toBe(
      serverDays,
    )
  })

  it('keeps an activity logged offline that the server has never seen', () => {
    // Without this, opening Insights straight after logging something offline
    // would show the day as if that entry did not exist.
    const merged = mergeUnsyncedLocalEdits(
      [{ date: DAY_1, activities: [] }],
      [{ date: DAY_1, activities: [activity('offline-one')] }],
      pending({ 'offline-one': { editedAt: '2026-08-26T10:00:00.000Z', creates: true } }),
    )
    expect(merged[0].activities.map((a) => a.id)).toEqual(['offline-one'])
  })

  it('hides an activity deleted offline whose delete has not been sent yet', () => {
    const merged = mergeUnsyncedLocalEdits(
      [{ date: DAY_1, activities: [activity('a', { updatedAt: '2026-08-26T09:00:00.000Z' })] }],
      [{ date: DAY_1, activities: [] }],
      pending({ a: { editedAt: '2026-08-26T10:00:00.000Z', removes: true } }),
    )
    expect(merged[0].activities).toEqual([])
  })

  it('still lets a newer server edit win (rule 7), even on a read-only surface', () => {
    const merged = mergeUnsyncedLocalEdits(
      [{ date: DAY_1, activities: [activity('a', { durationMinutes: 120, updatedAt: '2026-08-26T11:00:00.000Z' })] }],
      [{ date: DAY_1, activities: [activity('a', { durationMinutes: 30 })] }],
      pending({ a: { editedAt: '2026-08-26T10:00:00.000Z' } }),
    )
    expect(merged[0].activities[0].durationMinutes).toBe(120)
  })

  it('stays scoped to the days it was given (rule 8) and matches them by calendar day', () => {
    const merged = mergeUnsyncedLocalEdits(
      [
        { date: DAY_1, activities: [] },
        { date: DAY_2, activities: [] },
      ],
      [
        { date: DAY_1, activities: [activity('one')] },
        { date: DAY_2, activities: [activity('two', { startMinutes: 900 })] },
      ],
      pending({
        one: { editedAt: '2026-08-26T10:00:00.000Z', creates: true },
        two: { editedAt: '2026-08-27T10:00:00.000Z', creates: true },
      }),
    )

    expect(merged).toHaveLength(2)
    expect(merged[0].activities.map((a) => a.id)).toEqual(['one'])
    expect(merged[1].activities.map((a) => a.id)).toEqual(['two'])
  })

  it('does not resurrect a local day that has no queued write behind it', () => {
    const merged = mergeUnsyncedLocalEdits(
      [{ date: DAY_1, activities: [] }],
      [{ date: DAY_1, activities: [activity('synced-then-deleted-elsewhere')] }],
      pending({ other: { editedAt: '2026-08-26T10:00:00.000Z' } }),
    )
    expect(merged[0].activities).toEqual([])
  })
})
