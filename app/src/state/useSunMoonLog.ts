import { useCallback, useState } from 'react'
import { generateId } from '@/domain/scheduling'
import type { SunMoonEntry, SunMoonKind } from '@/domain/sunMoonLog'
import { loadSunMoonEntries, saveSunMoonEntries } from '@/lib/sunMoonLogLocalStore'

export interface UseSunMoonLogResult {
  /** Every stretch logged for this kind, newest first. */
  entries: SunMoonEntry[]
  /** Append a stretch for `date` (`YYYY-MM-DD`); returns the minted entry. */
  addEntry: (date: string, start: string, end: string) => SunMoonEntry
}

/**
 * One end-cap's light log: local-only (there is no backend for it), mirroring
 * the local-first shape `useNoteEntries` uses minus the network mirror. The
 * lazy `useState` initializer reads `localStorage` once on mount; the SSR
 * test suite never mounts this (it lives behind the timeline caps' popover),
 * but `loadSunMoonEntries` guards `window` access regardless.
 */
export function useSunMoonLog(kind: SunMoonKind): UseSunMoonLogResult {
  const [entries, setEntries] = useState<SunMoonEntry[]>(() => loadSunMoonEntries(kind) ?? [])

  const addEntry = useCallback(
    (date: string, start: string, end: string): SunMoonEntry => {
      const entry: SunMoonEntry = {
        id: generateId(),
        kind,
        date,
        start,
        end,
        createdAt: new Date().toISOString(),
      }
      setEntries((prev) => {
        const next = [entry, ...prev]
        saveSunMoonEntries(kind, next)
        return next
      })
      return entry
    },
    [kind],
  )

  return { entries, addEntry }
}
