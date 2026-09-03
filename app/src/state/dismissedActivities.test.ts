import { describe, expect, it } from 'vitest'
import { toggleDismissedName } from './dismissedActivities'

/**
 * `toggleDismissedName` is the one piece of real logic behind manual
 * disappear (§5) — everything else in this module is `localStorage` I/O,
 * untested at this layer for the same reason `state/localPersistence.ts`
 * (the board's own storage wrapper) has no dedicated test either: it is a
 * thin, fail-closed pass-through with nothing to assert beyond "doesn't
 * throw", which the pure toggle logic below doesn't depend on.
 */
describe('toggleDismissedName', () => {
  it('adds a name that is not yet present', () => {
    expect(toggleDismissedName([], 'Slow down')).toEqual(['Slow down'])
    expect(toggleDismissedName(['Doing Nothing'], 'Slow down')).toEqual(['Doing Nothing', 'Slow down'])
  })

  it('removes a name that is already present', () => {
    expect(toggleDismissedName(['Slow down'], 'Slow down')).toEqual([])
    expect(toggleDismissedName(['Doing Nothing', 'Slow down'], 'Slow down')).toEqual(['Doing Nothing'])
  })

  it('never mutates the input array', () => {
    const before = ['Slow down']
    toggleDismissedName(before, 'Doing Nothing')
    expect(before).toEqual(['Slow down'])
  })

  it('is a clean no-op round trip: toggling the same name twice restores the original set', () => {
    const start = ['Doing Nothing', 'Walking']
    const once = toggleDismissedName(start, 'Errand time')
    const twice = toggleDismissedName(once, 'Errand time')
    expect(twice).toEqual(start)
  })
})
