import type { ActivityRow, LiveTile } from './pickerHierarchy'

/**
 * User-chosen tile/activity colours (Classic edit mode's colour picker).
 * Pure — no React, no DOM. Colours are stored as a normalized lowercase
 * `#rrggbb` string (the same shape `public.tiles.color`/
 * `public.activities.color` CHECK against); `null` means "no colour of my
 * own", which inherits from the parent activity, then the tile, and finally
 * falls back to the monochrome default.
 */

/** A paint-style palette: one row of saturated hues, one of softer tones, one of deep tones, plus neutrals. */
export const COLOR_PRESETS: readonly string[] = [
  // vivid
  '#e5484d', '#f76b15', '#ffc53d', '#46a758', '#12a594', '#00a2c7', '#0090ff', '#3e63dd', '#8e4ec6', '#d6409f',
  // soft
  '#f4a9aa', '#ffc182', '#ffe08a', '#a7dcae', '#8fdccd', '#9ddcec', '#acd8fc', '#b5c3f5', '#d5b8ec', '#f3b4d6',
  // deep
  '#a3262b', '#a8470f', '#9e6c00', '#2a7e3b', '#0d7a6c', '#00718b', '#0060b8', '#2f4bae', '#62368c', '#9b2a6f',
  // neutrals
  '#000000', '#3f3f46', '#71717a', '#a1a1aa', '#d4d4d8', '#ffffff', '#8b5e3c', '#c4a484', '#556b2f', '#1f3a5f',
]

/** Where the full-spectrum dialog opens when nothing is chosen yet (a native colour input always needs a value). */
export const PICKER_START_COLOR = '#808080'

/** `#RGB`/`#RRGGBB` (any case, optional `#`) -> `#rrggbb`, or `null` when it isn't a hex colour. */
export function normalizeHexColor(input: string | null | undefined): string | null {
  if (!input) return null
  const raw = input.trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{6}$/.test(raw)) return `#${raw}`
  if (/^[0-9a-f]{3}$/.test(raw)) return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`
  return null
}

function relativeLuminance(hex: string): number {
  const channel = (offset: number) => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

/**
 * Black or white, whichever has the higher WCAG contrast on `hex` — for an
 * outline or text drawn on top of a user-chosen fill, which no theme token
 * can be guaranteed to contrast with.
 */
export function readableInkOn(hex: string): '#000000' | '#ffffff' {
  const l = relativeLuminance(hex)
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? '#000000' : '#ffffff'
}

/** The colour an activity row actually shows: its own, else its nearest coloured ancestor's, else its tile's, else `null`. */
export function effectiveActivityColor(
  rows: readonly ActivityRow[],
  tiles: readonly Pick<LiveTile, 'id' | 'color'>[],
  activityId: string,
): string | null {
  const byId = new Map(rows.map((a) => [a.id, a]))
  const visited = new Set<string>()
  let current = byId.get(activityId)
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    if (current.color) return current.color
    if (current.parentId === null) {
      return tiles.find((t) => t.id === current!.tileId)?.color ?? null
    }
    current = byId.get(current.parentId)
  }
  return null
}

/**
 * The activity row a logged activity (`name` = its top-level name, `path` =
 * the drill-down names below it) refers to — the deepest row along that path
 * that still exists, so a since-renamed subtype still resolves to its parent.
 * Top-level names are unique per user (DB-enforced), so name lookup is safe.
 */
export function rowForLoggedActivity(
  rows: readonly ActivityRow[],
  name: string | null,
  path: readonly string[],
): ActivityRow | null {
  if (!name) return null
  let current = rows.find((a) => a.parentId === null && a.name === name)
  if (!current) return null
  for (const segment of path) {
    const child = rows.find((a) => a.parentId === current!.id && a.name === segment)
    if (!child) break
    current = child
  }
  return current
}

/** The colour a logged activity's Day/Night-strip segment fills with, or `null` for the default monochrome wash. */
export function loggedActivityColor(
  rows: readonly ActivityRow[],
  tiles: readonly Pick<LiveTile, 'id' | 'color'>[],
  name: string | null,
  path: readonly string[],
): string | null {
  const row = rowForLoggedActivity(rows, name, path)
  return row ? effectiveActivityColor(rows, tiles, row.id) : null
}
