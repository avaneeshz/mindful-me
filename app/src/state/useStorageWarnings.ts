import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { isStorageEvictionRisk } from '@/lib/browserInfo'
import { getStorageHealth, subscribeStorageHealth } from '@/lib/storageHealth'
import { storageWarnings, type StorageWarning } from './storageWarnings'
import { usePendingWrites } from './usePendingWrites'

/** The warnings that apply right now (usually none). Re-evaluated hourly so "waiting 3 days" appears without a reload. */
export function useStorageWarnings(): StorageWarning[] {
  const pending = usePendingWrites()
  const health = useSyncExternalStore(subscribeStorageHealth, getStorageHealth, getStorageHealth)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60 * 60 * 1000)
    return () => clearInterval(id)
  }, [])
  return useMemo(
    () =>
      storageWarnings({
        pendingCount: pending.length,
        oldestPendingAt: pending.length ? Math.min(...pending.map((w) => w.createdAt)) : null,
        now,
        ledgerSaveFailed: health.ledgerSaveFailed,
        persistence: health.persistence,
        evictionRisk: isStorageEvictionRisk(),
      }),
    [pending, health, now],
  )
}
