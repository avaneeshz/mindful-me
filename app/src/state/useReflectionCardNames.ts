import { useCallback, useSyncExternalStore } from 'react'
import { REFLECTION_CARDS } from '@/data/reflectionCards'
import { resolveCardName, withCardName, type ReflectionCardNames } from '@/domain/reflectionCardNames'
import { loadCardNames, saveCardNames } from '@/lib/reflectionCardNamesStore'

/**
 * The user's own names for the State Tiles. Local-first and shared: every
 * consumer (the grid, the mapping popover, the activity summary) reads the
 * same snapshot, so a rename shows everywhere at once.
 */
const EMPTY: ReflectionCardNames = {}
let snapshot: ReflectionCardNames | null = null
const listeners = new Set<() => void>()

function current(): ReflectionCardNames {
  if (snapshot === null) snapshot = loadCardNames()
  return snapshot
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function update(next: ReflectionCardNames): void {
  snapshot = next
  saveCardNames(next)
  listeners.forEach((l) => l())
}

export function useReflectionCardNames() {
  const names = useSyncExternalStore(subscribe, current, () => EMPTY)

  const nameFor = useCallback(
    (card: number): string => {
      const defaultTitle = REFLECTION_CARDS.find((c) => c.number === card)?.title ?? `Card ${card}`
      return resolveCardName(names, card, defaultTitle)
    },
    [names],
  )

  const rename = useCallback((card: number, name: string) => {
    const defaultTitle = REFLECTION_CARDS.find((c) => c.number === card)?.title ?? ''
    update(withCardName(current(), card, name, defaultTitle))
  }, [])

  const isCustom = useCallback((card: number) => names[card] !== undefined, [names])

  return { nameFor, rename, isCustom }
}
