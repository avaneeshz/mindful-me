import { useEffect, useState } from 'react'
import { catalogIdForName } from '@/api/catalog'

/**
 * The server-side `activities.id` for a catalog activity NAME — what
 * `useParameterOptions` needs to load that activity's own effective
 * quality/symptom/flag option lists (PICKER-CUSTOM-1). `null` while
 * resolving, for no name, or with no backend configured; callers then fall
 * back to each picker's static default list, so nothing ever blocks on the
 * network (rule 6). Shared by Classic's `SlotEditor` and Lumen's log sheet.
 */
export function useCatalogActivityId(cardName: string | null): string | null {
  const [id, setId] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    if (!cardName) {
      setId(null)
      return
    }
    void catalogIdForName(cardName).then((resolved) => {
      if (!cancelled) setId(resolved)
    })
    return () => {
      cancelled = true
    }
  }, [cardName])
  return id
}
