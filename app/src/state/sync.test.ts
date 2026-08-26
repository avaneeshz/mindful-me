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

  it('produces a create intent for a brand-new flag marker', () => {
    const state = start()
    const { intents, next } = step(state, { type: 'toggleFlag', flag: 'Fear response' })
    const marker = next.activities[0]
    expect(intents).toEqual([{ kind: 'create', activity: marker }])
  })

  it('produces a flags intent when toggling a SECOND flag on an existing marker', () => {
    let state = start()
    state = boardReducer(state, { type: 'toggleFlag', flag: 'Fear response' })
    const { intents, next } = step(state, { type: 'toggleFlag', flag: 'Stress response' })
    const marker = next.activities[0]
    expect(intents).toEqual([{ kind: 'flags', activity: marker }])
  })

  it('produces a delete intent when the last flag is toggled off', () => {
    let state = start()
    state = boardReducer(state, { type: 'toggleFlag', flag: 'Fear response' })
    const markerId = state.activities[0].id
    const { intents } = step(state, { type: 'toggleFlag', flag: 'Fear response' })
    expect(intents).toEqual([{ kind: 'delete', id: markerId }])
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
