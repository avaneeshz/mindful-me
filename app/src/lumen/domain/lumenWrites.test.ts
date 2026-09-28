import { describe, expect, it } from 'vitest'
import type { ScheduledActivity } from '@/domain/types'
import { applyRemove, applyWrite, findStored, planCreate, planUpdate } from './lumenWrites'

function make(id: string, name: string, startMinutes: number, durationMinutes: number, extra: Partial<ScheduledActivity> = {}): ScheduledActivity {
  return {
    id,
    name,
    path: [],
    startMinutes,
    durationMinutes,
    flags: [],
    quality: [],
    symptoms: [],
    notes: null,
    reflections: [],
    fieldSelections: {},
    dreamsNote: null,
    status: 'planned',
    timezone: 'Asia/Kolkata',
    ...extra,
  }
}

const day = '2026-09-12'
const next = '2026-09-13'

describe('planCreate', () => {
  it('stores an evening entry on the Lumen day itself', () => {
    const plan = planCreate(day, {}, { activity: { name: 'Dinner', path: [] }, start: 19 * 60, durationMinutes: 45 })
    expect(plan).toMatchObject({ ok: true, date: day, activity: { name: 'Dinner', startMinutes: 1140, durationMinutes: 45 } })
  })

  it('stores a 12–6 AM entry on the next calendar date', () => {
    const plan = planCreate(day, {}, { activity: { name: 'Reading', path: [] }, start: 1440 + 90, durationMinutes: 30 })
    expect(plan).toMatchObject({ ok: true, date: next, activity: { startMinutes: 90 } })
  })

  it('keeps a sleep that crosses midnight as one row on the day it started', () => {
    const plan = planCreate(day, {}, { activity: { name: 'Sleep', path: [] }, start: 23 * 60, durationMinutes: 8 * 60 })
    expect(plan).toMatchObject({ ok: true, date: day, activity: { startMinutes: 1380, durationMinutes: 480 } })
  })

  it('refuses to overlap anything on any of the three dates', () => {
    const byDate = { [next]: [make('r', 'Reading', 60, 60)] } // 01:00–02:00 on the 13th
    expect(planCreate(day, byDate, { activity: { name: 'Film', path: [] }, start: 23 * 60 + 30, durationMinutes: 120 })).toEqual({
      ok: false,
      reason: 'too-long',
      maxDuration: 90,
    })
    expect(planCreate(day, byDate, { activity: { name: 'Film', path: [] }, start: 1440 + 70, durationMinutes: 10 })).toMatchObject({
      ok: false,
      reason: 'occupied',
    })
  })

  it('only starts entries inside 06:00 → 06:00', () => {
    expect(planCreate(day, {}, { activity: { name: 'X', path: [] }, start: 300, durationMinutes: 30 })).toMatchObject({ ok: false, reason: 'outside-day' })
    expect(planCreate(day, {}, { activity: { name: 'X', path: [] }, start: 1800, durationMinutes: 30 })).toMatchObject({ ok: false, reason: 'outside-day' })
  })

  it('carries the details it is given', () => {
    const plan = planCreate(day, {}, {
      activity: { name: 'Run', path: ['Outdoor'] },
      start: 420,
      durationMinutes: 30,
      context: { quality: ['Energised'], notes: 'Easy pace' },
    })
    expect(plan).toMatchObject({ ok: true, activity: { path: ['Outdoor'], quality: ['Energised'], notes: 'Easy pace' } })
  })
})

describe('planUpdate', () => {
  it('moves an entry across midnight to the next calendar date, keeping it completed', () => {
    const byDate = { [day]: [make('f', 'Film', 23 * 60 + 30, 60, { status: 'completed' })] }
    const plan = planUpdate(day, byDate, 'f', { start: 1440 + 30 })
    expect(plan).toMatchObject({
      ok: true,
      fromDate: day,
      toDate: next,
      activity: { id: 'f', startMinutes: 30, durationMinutes: 60, status: 'completed', timezone: 'Asia/Kolkata' },
    })
  })

  it('ignores its own current placement when checking room', () => {
    const byDate = { [day]: [make('a', 'Work', 540, 60)] }
    expect(planUpdate(day, byDate, 'a', { durationMinutes: 90 })).toMatchObject({ ok: true, activity: { durationMinutes: 90 } })
  })

  it('refuses a longer duration that would overlap the next entry', () => {
    const byDate = { [day]: [make('a', 'Work', 540, 60), make('b', 'Lunch', 600, 30)] }
    expect(planUpdate(day, byDate, 'a', { durationMinutes: 90 })).toEqual({ ok: false, reason: 'too-long', maxDuration: 60 })
  })

  it('edits details only, without re-validating time', () => {
    const byDate = { [day]: [make('a', 'Work', 540, 60)] }
    expect(planUpdate(day, byDate, 'a', { context: { notes: 'Shipped it' } })).toMatchObject({
      ok: true,
      fromDate: day,
      toDate: day,
      activity: { notes: 'Shipped it', startMinutes: 540 },
    })
  })

  it('reports an entry it cannot find', () => {
    expect(planUpdate(day, {}, 'nope', {})).toMatchObject({ ok: false, reason: 'missing' })
  })
})

describe('applying writes', () => {
  it('moves the row between dates and keeps each date sorted', () => {
    const film = make('f', 'Film', 1410, 60)
    const byDate = { [day]: [make('a', 'Work', 540, 60), film], [next]: [make('r', 'Reading', 120, 30)] }
    const moved = { ...film, startMinutes: 30 }
    const changed = applyWrite(byDate, moved, next, day)
    expect(changed[day].map((a) => a.id)).toEqual(['a'])
    expect(changed[next].map((a) => a.id)).toEqual(['f', 'r'])
  })

  it('removes from wherever the row is stored', () => {
    const byDate = { [next]: [make('r', 'Reading', 120, 30)] }
    expect(findStored(byDate, 'r')?.date).toBe(next)
    expect(applyRemove(byDate, 'r')).toEqual({ [next]: [] })
    expect(applyRemove(byDate, 'missing')).toEqual({})
  })
})
