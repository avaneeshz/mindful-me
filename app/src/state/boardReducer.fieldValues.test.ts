import { describe, expect, it } from 'vitest'
import { boardReducer, createInitialState, type BoardAction, type BoardState } from './boardReducer'
import { deriveSyncIntents } from './sync'
import type { ScheduledActivity } from '@/domain/types'

const AT_4PM = new Date(2026, 7, 25, 16, 0)
const run = (state: BoardState, ...actions: BoardAction[]): BoardState => actions.reduce(boardReducer, state)
const start = (activities: ScheduledActivity[] = []) => createInitialState(activities, AT_4PM)

describe('custom field values while logging', () => {
  it('stages a note’s text and a multiple-select field’s choices, and clears them again', () => {
    let s = run(start(), { type: 'pickCard', cardName: 'Homework' })
    s = run(
      s,
      { type: 'setStagingFieldText', fieldId: 'gratitude', text: 'thankful' },
      { type: 'toggleStagingFieldValue', fieldId: 'mood', label: 'Calm' },
      { type: 'toggleStagingFieldValue', fieldId: 'mood', label: 'Tense' },
    )
    expect(s.staging.fieldValues).toEqual({
      gratitude: { text: 'thankful', labels: [] },
      mood: { text: null, labels: ['Calm', 'Tense'] },
    })
    s = run(s, { type: 'setStagingFieldText', fieldId: 'gratitude', text: '' }, { type: 'toggleStagingFieldValue', fieldId: 'mood', label: 'Calm' })
    expect(s.staging.fieldValues).toEqual({ mood: { text: null, labels: ['Tense'] } })
  })

  it('ignores field edits when nothing is being logged', () => {
    const s = start()
    expect(run(s, { type: 'setStagingFieldText', fieldId: 'a', text: 'x' })).toBe(s)
    expect(run(s, { type: 'toggleStagingFieldValue', fieldId: 'a', label: 'x' })).toBe(s)
  })

  it('saves the values on the new entry and syncs them with it', () => {
    const before = run(start(), { type: 'pickCard', cardName: 'Homework' }, { type: 'setStagingFieldText', fieldId: 'g', text: 'hi' })
    const after = boardReducer(before, { type: 'commit' })
    const saved = after.activities.find((a) => a.name === 'Homework')!
    expect(saved.fieldValues).toEqual({ g: { text: 'hi', labels: [] } })
    expect(deriveSyncIntents({ type: 'commit' }, before, after)).toEqual([{ kind: 'create', activity: saved }])
  })

  it('loads an entry’s saved values when editing and lets the user change them', () => {
    const entry: ScheduledActivity = {
      id: 'e1', name: 'Homework', path: [], startMinutes: 600, durationMinutes: 30, flags: [], quality: [], symptoms: [],
      notes: null, reflections: [], fieldSelections: {}, dreamsNote: null, status: 'planned', timezone: 'UTC',
      fieldValues: { mood: { text: null, labels: ['Calm'] } },
    }
    let s = run(start([entry]), { type: 'editActivity', id: 'e1' })
    expect(s.staging.fieldValues).toEqual({ mood: { text: null, labels: ['Calm'] } })
    s = run(s, { type: 'toggleStagingFieldValue', fieldId: 'mood', label: 'Calm' }, { type: 'commit' })
    expect(s.activities.find((a) => a.id === 'e1')!.fieldValues).toEqual({})
  })

  it('never turns "values unknown" into "cleared" on an unrelated edit', () => {
    const entry: ScheduledActivity = {
      id: 'e1', name: 'Homework', path: [], startMinutes: 600, durationMinutes: 30, flags: [], quality: [], symptoms: [],
      notes: null, reflections: [], fieldSelections: {}, dreamsNote: null, status: 'planned', timezone: 'UTC',
    }
    const s = run(start([entry]), { type: 'editActivity', id: 'e1' }, { type: 'commit' })
    expect(s.activities.find((a) => a.id === 'e1')!.fieldValues).toBeUndefined()
  })
})
