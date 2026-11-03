import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { apiListReflectionCardOverrides, apiSetReflectionCardImage, apiSetReflectionCardName } from '@/api/reflectionCardOverrides'
import { REFLECTION_CARDS } from '@/data/reflectionCards'
import { resolveCardName, withCardName } from '@/domain/reflectionCardNames'
import { loadCardCustomization, saveCardCustomization, type CardCustomization } from '@/lib/reflectionCardsStore'
import { supabaseConfigured } from '@/lib/supabaseClient'
import { useAccountOwner } from '@/state/useAccountOwner'

/**
 * The signed-in account's own names and pictures for the State Tiles.
 * Shared by every consumer (grid, mapping popover, activity summary) so a
 * change shows everywhere at once. Account-specific: loaded from the server
 * for the current user, with a per-account device cache for instant paint.
 * With no backend configured it is a plain on-device store (rule 6).
 * A change shows immediately and is rolled back, with a message, if the
 * server refuses or can't be reached.
 */
interface Snapshot extends CardCustomization {
  owner: string | null
}

const EMPTY: Snapshot = { owner: null, names: {}, images: {} }
let snapshot: Snapshot = EMPTY
const listeners = new Set<() => void>()

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const current = () => snapshot

function publish(next: Snapshot) {
  snapshot = next
  if (next.owner) saveCardCustomization(next.owner, { names: next.names, images: next.images })
  listeners.forEach((l) => l())
}

const defaultTitle = (card: number) => REFLECTION_CARDS.find((c) => c.number === card)?.title ?? `Card ${card}`
const defaultImage = (card: number) => REFLECTION_CARDS.find((c) => c.number === card)?.image ?? ''

const SAVE_FAILED = 'Couldn’t save right now. Check your connection and try again.'
export type CardSaveResult = { ok: true } | { ok: false; message: string }

export function useReflectionCards() {
  const owner = useAccountOwner()
  const snap = useSyncExternalStore(subscribe, current, () => EMPTY)

  useEffect(() => {
    if (snapshot.owner === owner) return
    if (!owner) {
      publish(EMPTY)
      return
    }
    publish({ owner, ...loadCardCustomization(owner) })
    if (!supabaseConfigured) return
    let cancelled = false
    void apiListReflectionCardOverrides().then((rows) => {
      if (cancelled || rows === null || snapshot.owner !== owner) return
      const names: Record<number, string> = {}
      const images: Record<number, string> = {}
      for (const r of rows) {
        if (r.name) names[r.card] = r.name
        if (r.imageData) images[r.card] = r.imageData
      }
      publish({ owner, names, images })
    })
    return () => {
      cancelled = true
    }
  }, [owner])

  const nameFor = useCallback((card: number) => resolveCardName(snap.names, card, defaultTitle(card)), [snap])
  const imageFor = useCallback((card: number) => snap.images[card] ?? defaultImage(card), [snap])

  const rename = useCallback(async (card: number, name: string): Promise<CardSaveResult> => {
    const before = snapshot
    const names = withCardName(before.names, card, name, defaultTitle(card))
    publish({ ...before, names })
    if (!supabaseConfigured) return { ok: true }
    const result = await apiSetReflectionCardName(card, names[card] ?? null)
    if (result.ok) return result
    if (snapshot.owner === before.owner) publish({ ...snapshot, names: before.names })
    return { ok: false, message: result.reason === 'invalid' ? 'That name can’t be saved.' : SAVE_FAILED }
  }, [])

  /** `imageData` null restores the built-in picture. */
  const setImage = useCallback(async (card: number, imageData: string | null): Promise<CardSaveResult> => {
    const before = snapshot
    const images = { ...before.images }
    if (imageData === null) delete images[card]
    else images[card] = imageData
    publish({ ...before, images })
    if (!supabaseConfigured) return { ok: true }
    const result = await apiSetReflectionCardImage(card, imageData)
    if (result.ok) return result
    if (snapshot.owner === before.owner) publish({ ...snapshot, images: before.images })
    return { ok: false, message: result.reason === 'invalid' ? 'This picture can’t be saved. Try a different one.' : SAVE_FAILED }
  }, [])

  return { nameFor, imageFor, rename, setImage }
}
