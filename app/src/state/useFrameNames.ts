import { useCallback, useEffect, useState } from 'react'
import { apiListFrameNames, apiSetFrameName } from '@/api/frameNames'
import { normalizeFrameName, parseFrameNames, type FrameNames } from '@/domain/frameNames'
import { readStoredJSON, writeStoredJSON } from '@/lib/storage'
import { supabaseConfigured } from '@/lib/supabaseClient'
import { useAccountOwner } from '@/state/useAccountOwner'

const cacheKey = (owner: string) => `mindful-me:frame-names:${owner}`
/** Renames the server hasn't confirmed yet (frame -> name, `null` = back to default), per account. */
const outboxKey = (owner: string) => `mindful-me:frame-names:outbox:${owner}`

function loadOutbox(owner: string): Record<string, string | null> {
  const stored = readStoredJSON(outboxKey(owner))
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as Record<string, string | null>) : {}
}

function setOutbox(owner: string, frame: number, name: string | null | undefined): void {
  const outbox = loadOutbox(owner)
  if (name === undefined) delete outbox[String(frame)]
  else outbox[String(frame)] = name
  writeStoredJSON(outboxKey(owner), outbox)
}

async function flushOutbox(owner: string): Promise<void> {
  for (const [key, name] of Object.entries(loadOutbox(owner))) {
    if (await apiSetFrameName(Number(key), name)) setOutbox(owner, Number(key), undefined)
  }
}

export interface UseFrameNamesResult {
  /** Names the user gave frames; a frame with no entry shows its default. */
  names: FrameNames
  /** Renames a frame. Local first (rule 6); an empty name restores the default. */
  rename: (frame: number, rawName: string) => void
}

/** The user's frame names: instant from the device cache, then settled with the server. */
export function useFrameNames(): UseFrameNamesResult {
  const owner = useAccountOwner()
  const [names, setNames] = useState<FrameNames>(() => (owner ? parseFrameNames(readStoredJSON(cacheKey(owner))) : {}))

  useEffect(() => {
    if (!owner) {
      setNames({})
      return
    }
    setNames(parseFrameNames(readStoredJSON(cacheKey(owner))))
    if (!supabaseConfigured || owner === 'local') return
    let cancelled = false
    void (async () => {
      await flushOutbox(owner)
      const server = await apiListFrameNames()
      if (cancelled || server === null) return
      const merged: Record<number, string> = { ...server }
      // A rename still waiting to reach the server must not flicker back to the old value.
      for (const [key, name] of Object.entries(loadOutbox(owner))) {
        if (name === null) delete merged[Number(key)]
        else merged[Number(key)] = name
      }
      writeStoredJSON(cacheKey(owner), merged)
      setNames(merged)
    })()
    return () => {
      cancelled = true
    }
  }, [owner])

  const rename = useCallback(
    (frame: number, rawName: string) => {
      if (!owner) return
      const name = normalizeFrameName(rawName)
      setNames((current) => {
        const next: Partial<Record<number, string>> = { ...current }
        if (name === null) delete next[frame]
        else next[frame] = name
        writeStoredJSON(cacheKey(owner), next)
        return next
      })
      if (!supabaseConfigured || owner === 'local') return
      setOutbox(owner, frame, name)
      void flushOutbox(owner)
    },
    [owner],
  )

  return { names, rename }
}
