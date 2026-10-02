import { useCallback, useMemo } from 'react'
import { effectiveActivityColor, loggedActivityColor, rowForLoggedActivity } from '@/domain/colors'
import { useOptionalPickerData } from './PickerDataContext'

export interface ActivityColors {
  /** A tile's own colour, or `null` for the monochrome default. */
  tileColor: (tileId: string) => string | null
  /** A top-level picker card's effective colour (its own, else its tile's), by name. */
  cardColor: (name: string) => string | null
  /** The fill for a logged activity's Day/Night-strip segment, or `null` for the default wash. */
  loggedColor: (name: string | null, path: readonly string[]) => string | null
}

const NO_COLORS: ActivityColors = {
  tileColor: () => null,
  cardColor: () => null,
  loggedColor: () => null,
}

/**
 * User-chosen tile/activity colours, resolved with inheritance (activity ->
 * parent -> tile). Reads the shared picker data, so a colour picked in
 * Classic edit mode shows on the tiles and the timeline on the very next
 * render. Outside a `PickerDataProvider` (isolated tests) everything is
 * uncoloured.
 */
export function useActivityColors(): ActivityColors {
  const picker = useOptionalPickerData()
  const tiles = picker?.tiles.tiles
  const rows = picker?.activities.activities

  const tileColor = useCallback((tileId: string) => tiles?.find((t) => t.id === tileId)?.color ?? null, [tiles])
  const cardColor = useCallback(
    (name: string) => {
      if (!rows || !tiles) return null
      const row = rowForLoggedActivity(rows, name, [])
      return row ? effectiveActivityColor(rows, tiles, row.id) : null
    },
    [rows, tiles],
  )
  const loggedColor = useCallback(
    (name: string | null, path: readonly string[]) => (rows && tiles ? loggedActivityColor(rows, tiles, name, path) : null),
    [rows, tiles],
  )

  return useMemo(
    () => (picker ? { tileColor, cardColor, loggedColor } : NO_COLORS),
    [picker, tileColor, cardColor, loggedColor],
  )
}
