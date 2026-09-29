import type { LucideIcon } from 'lucide-react'
import { ACTIVITY_CARDS, CATEGORIES, CATEGORY_ORDER } from '@/data/activities'
import {
  liveActivityCardsFromRows,
  liveCategoriesFromTiles,
  type ActivityRow,
  type LiveTile,
} from '@/domain/pickerHierarchy'
import type { ActivityCard, Category, CategoryId } from '@/domain/types'
import { FALLBACK_COLOR, paletteById, type PaletteColor } from '@/lumen/lib/palette'

/**
 * One of the person's own tiles as Lumen shows it: the same tile, label,
 * icon and activity tree Classic uses (from the shared catalog registry in
 * `data/activities.ts`), plus the one thing Classic doesn't have — a
 * pastel colour.
 */
export interface LumenTile {
  id: CategoryId
  label: string
  /** A short form for dense places (legends, charts): "Sleep & Rest" → "Sleep". */
  short: string
  icon: LucideIcon
  color: PaletteColor
  /** The tile's first-level activities, each with its own drill-down `children`. */
  cards: ActivityCard[]
}

/**
 * The spec's proposed colours for the nine default tiles
 * (prototypes/lumen/SPEC.md, "Proposed colours for the real categories").
 * Keyed by the static catalog id; a live tile is matched to one of these by
 * label, since live tiles carry their own uuid.
 */
const DEFAULT_COLOR_BY_STATIC_ID: Record<string, string> = {
  sleep: 'periwinkle',
  food: 'pistachio',
  care: 'aqua',
  downtime: 'mauve',
  movement: 'coral',
  work: 'sky',
  nature: 'fern',
  growth: 'peony',
  home: 'stone',
}

/** For tiles the person created: a spread of hues not already taken by the defaults. */
const FALLBACK_ROTATION = ['cornflower', 'clover', 'salmon', 'orchid', 'seafoam', 'bubblegum', 'lime', 'powder', 'blossom', 'jade', 'fuchsia', 'silver']

const STATIC_ID_BY_LABEL = new Map(Object.values(CATEGORIES).map((c) => [c.label.toLowerCase(), c.id]))

/** "Movement & Body Therapy" → "Movement"; "Reading" → "Reading". */
export function shortLabel(label: string): string {
  const first = label.split(/\s*&\s*|\s+and\s+/i)[0]?.trim()
  return first || label
}

/** The default palette id for a tile, before any per-device override. */
export function defaultTileColorId(tile: Pick<Category, 'id' | 'label'>, customIndex: number): string {
  const staticId = CATEGORIES[tile.id] ? tile.id : STATIC_ID_BY_LABEL.get(tile.label.toLowerCase())
  if (staticId && DEFAULT_COLOR_BY_STATIC_ID[staticId]) return DEFAULT_COLOR_BY_STATIC_ID[staticId]
  return FALLBACK_ROTATION[customIndex % FALLBACK_ROTATION.length]
}

/**
 * Pure: the person's tiles in on-screen order, coloured. `overrides` maps a
 * tile id to a palette id the person picked; unknown palette ids fall back to
 * the default so a stale override never breaks rendering.
 */
export function buildLumenTiles(
  categories: Readonly<Record<CategoryId, Category>>,
  order: readonly CategoryId[],
  cardsFor: (id: CategoryId) => ActivityCard[],
  overrides: Readonly<Record<string, string>> = {},
): LumenTile[] {
  let customIndex = 0
  const tiles: LumenTile[] = []
  for (const id of order) {
    const category = categories[id]
    if (!category) continue
    const isDefault = Boolean(CATEGORIES[id] || STATIC_ID_BY_LABEL.has(category.label.toLowerCase()))
    const fallbackId = defaultTileColorId(category, customIndex)
    if (!isDefault) customIndex += 1
    const chosen = overrides[id]
    tiles.push({
      id,
      label: category.label,
      short: shortLabel(category.label),
      icon: category.icon,
      color: (chosen && paletteById[chosen]) || paletteById[fallbackId] || FALLBACK_COLOR,
      cards: cardsFor(id),
    })
  }
  return tiles
}

/** The person's catalog: their own tiles and activity trees once loaded, else the built-in default. */
export interface CatalogSource {
  categories: Record<CategoryId, Category>
  order: CategoryId[]
  cards: ActivityCard[]
}

/**
 * Pure: the same choice `state/useLiveActivityCatalogSync.ts` makes for the
 * shared registry — the live catalog once Supabase is configured and both
 * lists have loaded with at least one tile, the static default otherwise —
 * computed during render rather than read back from the registry, which is
 * only filled in an effect after render and would lag one step behind.
 */
export function catalogSource(input: {
  configured: boolean
  tiles: readonly LiveTile[]
  tilesReady: boolean
  activities: readonly ActivityRow[]
  activitiesReady: boolean
}): CatalogSource {
  if (input.configured && input.tilesReady && input.activitiesReady && input.tiles.length > 0) {
    const { categories, order } = liveCategoriesFromTiles(input.tiles)
    return { categories, order, cards: liveActivityCardsFromRows(input.activities, order) }
  }
  return { categories: CATEGORIES, order: CATEGORY_ORDER, cards: ACTIVITY_CARDS }
}

/* ------------------------ per-device colours ------------------------ */

const COLOR_STORAGE_KEY = 'mindful-me:lumen:tile-colors'

/**
 * The person's own tile colours. Per device for now — the same stopgap the
 * interface choice uses until a per-user `user_preferences` row exists
 * (SPEC.md, Plan phase 5). Fail-closed: unreadable storage means defaults.
 */
export function loadTileColorOverrides(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(COLOR_STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    )
  } catch {
    return {}
  }
}

export function saveTileColorOverrides(overrides: Record<string, string>): void {
  try {
    window.localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(overrides))
  } catch {
    // In-memory state is still correct; only cross-reload durability is lost.
  }
}
