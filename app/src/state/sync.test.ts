import { describe, expect, it } from 'vitest'
import { boardReducer, createInitialState, type BoardAction, type BoardState } from './boardReducer'
import { deriveSyncIntents } from './sync'

const AT_4PM = new Date(2026, 7, 25, 16, 0) // slot 32

function start(): BoardState {
  return createInitialState([], AT_4PM)
}

function step(state: BoardState, action: BoardAction): { next: BoardState; intents: ReturnType<typeof deriveSyncIntents> } {
  const next = boardReducer(state, action)
  return { next, intents: deriveSyncIntents(action, state, next) }
}

describe('deriveSyncIntents', () => {
  it('produces nothing for a no-op action (rejected commit, selection, staging)', () => {
    const state = start()
    expect(step(state, { type: 'selectSlot', slot: 10 }).intents).toEqual([])
    expect(step(state, { type: 'commit' }).intents).toEqual([]) // nothing staged
  })

  it('produces a create intent for a brand-new committed activity', () => {
    let state = start()
    state = boardReducer(state, { type: 'pickCard', cardName: 'Homework' })
    const { next, intents } = step(state, { type: 'commit' })

    expect(intents).toHaveLength(1)
    expect(intents[0]).toMatchObject({ kind: 'create' })
    if (intents[0].kind === 'create') {
      expect(intents[0].activity.id).toBe(next.activities[0].id)
      expect(intents[0].activity.name).toBe('Homework')
    }
  })

  it('produces a reschedule intent for an in-place edit', () => {
    let state = start()
    state = boardReducer(state, { type: 'pickCard', cardName: 'Homework' })
    state = boardReducer(state, { type: 'commit' })
    const id = state.activities[0].id

    state = boardReducer(state, { type: 'editActivity', id })
    const { intents } = step(state, { type: 'stepDuration', delta: 5 })
    expect(intents).toEqual([]) // stepDuration only touches staging, not activities

    const committed = step(state, { type: 'commit' })
    expect(committed.intents).toEqual([{ kind: 'reschedule', activity: committed.next.activities[0] }])
  })

  it('produces a delete intent naming the removed activity’s id', () => {
    let state = start()
    state = boardReducer(state, { type: 'pickCard', cardName: 'Homework' })
    state = boardReducer(state, { type: 'commit' })
    const id = state.activities[0].id

    const { intents } = step(state, { type: 'removeActivity', id })
    expect(intents).toEqual([{ kind: 'delete', id }])
  })

  it('produces a restore intent (not a create) when a removal is undone', () => {
    let state = start()
    state = boardReducer(state, { type: 'pickCard', cardName: 'Homework' })
    state = boardReducer(state, { type: 'commit' })
    const id = state.activities[0].id
    state = boardReducer(state, { type: 'removeActivity', id })

    const { intents } = step(state, { type: 'undoRemoval' })
    expect(intents).toEqual([{ kind: 'restore', id }])
  })

  it('a brand-new activity with a staged flag needs only ONE intent — flags ride along inside create', () => {
    let state = start()
    state = boardReducer(state, { type: 'pickCard', cardName: 'Homework' })
    state = boardReducer(state, { type: 'setStagingFlag', flag: 'Fear response' })
    const { next, intents } = step(state, { type: 'commit' })

    expect(intents).toHaveLength(1)
    expect(intents[0]).toMatchObject({ kind: 'create' })
    expect(next.activities[0].flags).toEqual(['Fear response'])
  })

  it('editing an activity to CHANGE its flag produces reschedule + flags, not reschedule alone', () => {
    let state = start()
    state = boardReducer(state, { type: 'pickCard', cardName: 'Homework' })
    state = boardReducer(state, { type: 'setStagingFlag', flag: 'Fear response' })
    state = boardReducer(state, { type: 'commit' })
    const id = state.activities[0].id

    state = boardReducer(state, { type: 'editActivity', id })
    state = boardReducer(state, { type: 'setStagingFlag', flag: 'Stress response' })
    const { intents, next } = step(state, { type: 'commit' })

    expect(intents).toEqual([
      { kind: 'reschedule', activity: next.activities[0] },
      { kind: 'flags', activity: next.activities[0] },
    ])
    expect(next.activities[0].flags).toEqual(['Stress response'])
  })

  it('editing an activity WITHOUT touching its flag produces only reschedule — no redundant flags call', () => {
    let state = start()
    state = boardReducer(state, { type: 'pickCard', cardName: 'Homework' })
    state = boardReducer(state, { type: 'setStagingFlag', flag: 'Fear response' })
    state = boardReducer(state, { type: 'commit' })
    const id = state.activities[0].id

    state = boardReducer(state, { type: 'editActivity', id })
    state = boardReducer(state, { type: 'stepDuration', delta: 5 })
    const { intents, next } = step(state, { type: 'commit' })

    expect(intents).toEqual([{ kind: 'reschedule', activity: next.activities[0] }])
    expect(next.activities[0].flags).toEqual(['Fear response']) // unchanged
  })

  it('produces a status intent when completion is toggled', () => {
    let state = start()
    state = boardReducer(state, { type: 'pickCard', cardName: 'Homework' })
    state = boardReducer(state, { type: 'commit' })
    const id = state.activities[0].id

    const { intents, next } = step(state, { type: 'toggleComplete', id })
    expect(intents).toEqual([{ kind: 'status', activity: next.activities[0] }])
    expect(next.activities[0].status).toBe('completed')
  })

  it('never produces an intent for a rejected/no-op commit even with something staged', () => {
    // Fill the slot completely, then try to add a second thing — pickCard
    // itself no-ops (nothing staged), so nothing to commit either.
    let state = start()
    state = boardReducer(state, { type: 'pickCard', cardName: 'Homework' })
    state = boardReducer(state, { type: 'commit' })
    const { intents } = step(state, { type: 'pickCard', cardName: 'Errand time' })
    expect(intents).toEqual([])
  })
})
