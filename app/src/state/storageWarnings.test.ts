import { describe, expect, it } from 'vitest'
import { LONG_UNSYNCED_MS, storageWarnings, type StorageWarningInput } from './storageWarnings'

const base: StorageWarningInput = {
  pendingCount: 2, oldestPendingAt: 1_000_000, now: 1_000_000 + 60_000, ledgerSaveFailed: false, persistence: 'granted', evictionRisk: false,
}
const ids = (i: Partial<StorageWarningInput>) => storageWarnings({ ...base, ...i }).map((w) => w.id)

describe('storageWarnings', () => {
  it('says nothing when everything is synced, whatever the browser state', () => {
    expect(ids({ pendingCount: 0, oldestPendingAt: null, ledgerSaveFailed: true, persistence: 'denied' })).toEqual([])
  })
  it('says nothing for a few fresh changes in a protected browser', () => {
    expect(ids({})).toEqual([])
  })
  it('warns urgently when waiting changes cannot be saved on the device', () => {
    const [w] = storageWarnings({ ...base, ledgerSaveFailed: true })
    expect(w).toMatchObject({ id: 'cannot-save', severity: 'urgent' })
  })
  it('warns when something has waited 3 days, and names Safari only where it applies', () => {
    const old = { oldestPendingAt: 0, now: LONG_UNSYNCED_MS }
    expect(ids(old)).toEqual(['long-unsynced'])
    expect(storageWarnings({ ...base, ...old, evictionRisk: true })[0].body).toContain('Safari')
    expect(storageWarnings({ ...base, ...old, evictionRisk: false })[0].body).not.toContain('Safari')
    expect(ids({ oldestPendingAt: 0, now: LONG_UNSYNCED_MS - 1 })).toEqual([])
  })
  it('tells the user when the browser refused to protect the data', () => {
    expect(ids({ persistence: 'denied' })).toEqual(['not-protected'])
    expect(ids({ persistence: 'unsupported' })).toEqual(['not-protected'])
    expect(ids({ persistence: 'unknown' })).toEqual([])
  })
})
