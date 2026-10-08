import { beforeEach, describe, expect, it } from 'vitest'
import { getActivityLogSnapshot, logActivity, resetActivityLogForTests, setActivityLogUser } from './activityLogger'

describe('activity logger', () => {
  beforeEach(() => resetActivityLogForTests())

  it('records nothing while signed out', () => {
    logActivity({ kind: 'tap', summary: 'x' })
    setActivityLogUser('a')
    expect(getActivityLogSnapshot()).toHaveLength(0)
  })

  it('keeps the full note text in the entry detail, newest first', () => {
    setActivityLogUser('a')
    const note = 'n'.repeat(5000)
    logActivity({ kind: 'save', summary: 'first', detail: { note } })
    logActivity({ kind: 'sync', summary: 'second', level: 'error' })
    const [newest, oldest] = getActivityLogSnapshot()
    expect(newest.summary).toBe('second')
    expect(newest.level).toBe('error')
    expect(oldest.detail).toContain(note)
  })

  it('keeps users apart, and the log survives a sign-out and back in', () => {
    setActivityLogUser('a')
    logActivity({ kind: 'tap', summary: 'mine' })
    setActivityLogUser(null)
    expect(getActivityLogSnapshot()).toHaveLength(0)
    setActivityLogUser('b')
    expect(getActivityLogSnapshot()).toHaveLength(0)
    setActivityLogUser('a')
    expect(getActivityLogSnapshot().map((e) => e.summary)).toEqual(['mine'])
  })
})
