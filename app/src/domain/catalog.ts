import type { LucideIcon } from 'lucide-react'
import { ACTIVITY_CARDS, CATEGORIES, CATEGORY_ORDER, findCard as findSeedCard } from '@/data/activities'
import { iconForKey, keyForIcon } from '@/lib/iconRegistry'
import type { DisappearRule } from './types'

/**
 * The catalog-customization domain layer (see the full-stack-engineer agent
 * definition's "Catalog Customization" section) — pure derivation only, no
 * React, no storage I/O, mirroring every other `domain/*` module's contract.
 *
 * `CatalogSnapshot` is the RUNTIME shape every render-path consumer (`TileRow`,
 * `LogActivityModal` and its pickers, `boardReducer`) reads through
 * `CatalogContext` from now on — the same flat, name-keyed shape
 * `data/activities.ts`'s `CATEGORIES`/`CATEGORY_ORDER`/`ACTIVITY_CARDS` always
 * had (a tile's cards, a card's optional `sub`/`third` string lists), just no
 * longer hardcoded to exactly those 9 tiles/53 cards. `data/activities.ts`
 * itself is untouched and stays the DEFAULT SEED — `defaultCatalogSnapshot`
 * below is the one place it's read from at runtime, and every existing test
 * that imports it directly (`data/activities.test.ts`, `TileRow.test.tsx`,
 * `boardReducer.test.ts`) keeps passing unchanged.
 */
export interface CatalogCategory {
  id: string
  label: string
  icon: LucideIcon
}

export interface CatalogCard {
  name: string
  categoryId: string
  icon: LucideIcon
  /** Second-level options, if this card has any. */
  sub?: string[]
  /** Third level, keyed by the chosen second-level option. */
  third?: Record<string, string[]>
  disappear: DisappearRule
}

export interface CatalogSnapshot {
  /** Active tiles, in on-screen order. */
  categoryOrder: string[]
  categories: Record<string, CatalogCategory>
  /** Active top-level cards, in on-screen order (grouped by tile, tile order first). */
  cards: CatalogCard[]
}

export function findCardIn(snapshot: CatalogSnapshot, name: string): CatalogCard | undefined {
  return snapshot.cards.find((card) => card.name === name)
}

export function cardsForCategoryIn(snapshot: CatalogSnapshot, categoryId: string): CatalogCard[] {
  return snapshot.cards.filter((card) => card.categoryId === categoryId)
}

let cachedDefault: CatalogSnapshot | null = null

/**
 * The system's built-in catalog (`data/activities.ts`), converted to a
 * `CatalogSnapshot` — the baseline `CatalogContext` starts from before any
 * override ever loads (instant, no network, no localStorage read even), and
 * what every caller that never wires up a live catalog (`boardReducer.test.ts`'s
 * `createInitialState(activities, now)` with no third argument, chiefly) keeps
 * getting by default. Memoized: the conversion is pure and `data/activities.ts`
 * never changes at runtime.
 */
export function defaultCatalogSnapshot(): CatalogSnapshot {
  if (cachedDefault) return cachedDefault

  const categories: Record<string, CatalogCategory> = {}
  for (const id of CATEGORY_ORDER) {
    const category = CATEGORIES[id]
    categories[id] = { id, label: category.label, icon: category.icon }
  }

  const cards: CatalogCard[] = ACTIVITY_CARDS.map((card) => ({
    name: card.name,
    categoryId: card.categoryId,
    icon: card.icon,
    sub: card.sub,
    third: card.third,
    disappear: card.disappear,
  }))

  cachedDefault = { categoryOrder: [...CATEGORY_ORDER], categories, cards }
  return cachedDefault
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
}

/**
 * The system catalog, in the DB-shaped ROW form `CatalogContext` and
 * `SettingsPage`'s own staged editor need — used ONLY as their fallback
 * before a local cache or a server fetch has ever populated real rows (a
 * genuinely first-ever run, or local-only mode with no backend configured at
 * all, rule 6). Every tile keeps the exact id `catalog_categories`' own seed
 * migration gives it ('sleep', 'food', ...) — deliberately, so a category
 * removed while offline still resolves against the real row once a backend
 * eventually connects. A card/sub/third gets a stable `seed:`-prefixed slug
 * instead: the real migrations mint a random uuid for these, which nothing
 * client-side could ever predict, so these ids are guaranteed local-only
 * placeholders, superseded the moment a real `get_effective_catalog` fetch
 * resolves (`CatalogContext.applyEffectiveCatalog`) — the same "server wins
 * once connected" tradeoff `BoardContext`'s own hydrate-on-sign-in already
 * accepts for scheduled activities, not a new gap this feature introduces.
 */
interface DefaultCatalogRows {
  categories: CatalogCategoryRow[]
  activities: CatalogActivityRow[]
}

let cachedDefaultRows: DefaultCatalogRows | null = null

export function defaultCatalogRows(): DefaultCatalogRows {
  if (cachedDefaultRows) return cachedDefaultRows
  cachedDefaultRows = buildDefaultCatalogRows()
  return cachedDefaultRows
}

function buildDefaultCatalogRows(): DefaultCatalogRows {
  const categories: CatalogCategoryRow[] = CATEGORY_ORDER.map((id, index) => ({
    id,
    label: CATEGORIES[id].label,
    iconKey: keyForIcon(CATEGORIES[id].icon),
    sortOrder: index,
    isActive: true,
  }))

  const activities: CatalogActivityRow[] = []
  const topLevelIndexByCategory = new Map<string, number>()
  for (const card of ACTIVITY_CARDS) {
    const cardId = `seed:${slugify(card.name)}`
    const cardIndex = topLevelIndexByCategory.get(card.categoryId) ?? 0
    topLevelIndexByCategory.set(card.categoryId, cardIndex + 1)
    const iconKey = keyForIcon(card.icon)
    activities.push({
      id: cardId,
      name: card.name,
      categoryId: card.categoryId,
      parentId: null,
      iconKey,
      sortOrder: cardIndex,
      isActive: true,
    })
    card.sub?.forEach((subName, subIndex) => {
      const subId = `${cardId}:${slugify(subName)}`
      activities.push({
        id: subId,
        name: subName,
        categoryId: null,
        parentId: cardId,
        iconKey,
        sortOrder: subIndex,
        isActive: true,
      })
      card.third?.[subName]?.forEach((thirdName, thirdIndex) => {
        activities.push({
          id: `${subId}:${slugify(thirdName)}`,
          name: thirdName,
          categoryId: null,
          parentId: subId,
          iconKey,
          sortOrder: thirdIndex,
          isActive: true,
        })
      })
    })
  }

  return { categories, activities }
}

/* ------------------------------------------------------------------ *
 * DB-shaped rows -> runtime snapshot. `public.catalog_categories` and
 * `public.activities` are the one place all THREE levels (top-level card,
 * sub, third) live, related by `parent_id` — the same tree `activities.ts`'s
 * `sub`/`third` string lists always implied, just addressable by id now
 * (needed so the Configuration screen can add/remove one specific row).
 * ------------------------------------------------------------------ */

export type AttributeType = 'quality' | 'symptom' | 'flag'

export interface CatalogCategoryRow {
  id: string
  label: string
  iconKey: string
  sortOrder: number
  isActive: boolean
}

export interface CatalogActivityRow {
  id: string
  name: string
  /** Set for a top-level card only; null for a sub/third row. */
  categoryId: string | null
  /** Null for a top-level card; the parent row's id for a sub/third row. */
  parentId: string | null
  iconKey: string
  sortOrder: number
  isActive: boolean
}

export interface AttributeOverrideRow {
  activityId: string
  attributeType: AttributeType
  optionId: string
}

/** A NEW top-level card with nothing in `data/activities.ts` gets the simpler of the two disappear
 * rules — never locks itself, the user marks it done by hand — rather than inventing a threshold
 * nobody specified (out of scope: the Configuration screen has no disappear-rule editor in v1). */
const DEFAULT_NEW_CARD_DISAPPEAR: DisappearRule = { mode: 'manual' }

function disappearRuleForName(name: string): DisappearRule {
  return findSeedCard(name)?.disappear ?? DEFAULT_NEW_CARD_DISAPPEAR
}

const byActiveSortOrder = <T extends { isActive: boolean; sortOrder: number }>(rows: T[]): T[] =>
  rows.filter((row) => row.isActive).sort((a, b) => a.sortOrder - b.sortOrder)

/**
 * Builds the flat runtime `CatalogSnapshot` from the DB's tree-shaped rows —
 * the one place that tree gets collapsed into the `sub: string[]`/
 * `third: Record<string,string[]>` shape every existing render-path consumer
 * already understands. Inactive rows (soft-deleted, rule 11's spirit) never
 * reach this shape at all — deliberately no "restore" affordance in v1 (see
 * DECISIONS.md), so an inactive row simply isn't part of the effective catalog.
 */
export function buildSnapshotFromRows(
  categoryRows: CatalogCategoryRow[],
  activityRows: CatalogActivityRow[],
): CatalogSnapshot {
  const activeCategories = byActiveSortOrder(categoryRows)
  const categories: Record<string, CatalogCategory> = {}
  for (const row of activeCategories) {
    categories[row.id] = { id: row.id, label: row.label, icon: iconForKey(row.iconKey) }
  }
  const categoryOrder = activeCategories.map((row) => row.id)

  const activeActivities = byActiveSortOrder(activityRows)
  const childrenOf = new Map<string, CatalogActivityRow[]>()
  for (const row of activeActivities) {
    const key = row.parentId ?? ''
    const siblings = childrenOf.get(key)
    if (siblings) siblings.push(row)
    else childrenOf.set(key, [row])
  }
  // `byActiveSortOrder` already sorted `activeActivities`, and `Map` preserves
  // insertion order per key, so every `childrenOf` bucket is already in
  // on-screen order — no second sort needed here.

  const topLevelRows = (childrenOf.get('') ?? []).filter(
    (row) => row.categoryId !== null && categories[row.categoryId] !== undefined,
  )

  const cards: CatalogCard[] = topLevelRows.map((row) => {
    const subRows = childrenOf.get(row.id) ?? []
    const sub = subRows.length > 0 ? subRows.map((subRow) => subRow.name) : undefined
    let third: Record<string, string[]> | undefined
    for (const subRow of subRows) {
      const thirdRows = childrenOf.get(subRow.id) ?? []
      if (thirdRows.length === 0) continue
      third = third ?? {}
      third[subRow.name] = thirdRows.map((thirdRow) => thirdRow.name)
    }
    return {
      name: row.name,
      // Safe: filtered above to rows whose categoryId names a real category.
      categoryId: row.categoryId as string,
      icon: iconForKey(row.iconKey),
      sub,
      third,
      disappear: disappearRuleForName(row.name),
    }
  })

  return { categoryOrder, categories, cards }
}

/** activity name -> the master-option ids allowed for one attribute type, keyed by top-level card
 * name (matching `ScheduledActivity`/`StagingState`'s own `cardName`, never a DB id) — the shape
 * `QualityPicker`/`SymptomsPicker`/`FlagPicker` actually look a name up in. */
export type AttributeOverrideMap = Record<string, Partial<Record<AttributeType, string[]>>>

export function buildAttributeOverrideMap(
  activityRows: CatalogActivityRow[],
  overrides: AttributeOverrideRow[],
): AttributeOverrideMap {
  const nameById = new Map(activityRows.map((row) => [row.id, row.name]))
  const result: AttributeOverrideMap = {}
  for (const override of overrides) {
    const name = nameById.get(override.activityId)
    if (!name) continue
    const forName = result[name] ?? {}
    const list = forName[override.attributeType] ?? []
    list.push(override.optionId)
    forName[override.attributeType] = list
    result[name] = forName
  }
  return result
}

/**
 * The subset of a master option list (the 18 quality / 6 symptom / 14 flag
 * values — see `data/activities.ts`) one activity's own log form offers.
 * No override for this (activity, attribute) pair — the common case, and the
 * ONLY case for all 53 pre-existing items — means "show everything", so a
 * fresh catalog with zero `activity_attribute_options` rows reproduces
 * today's behaviour exactly (zero migration risk, per the architecture doc).
 * Preserves the master list's own order rather than the allow-list's.
 */
export function filterMasterOptions<T extends string>(
  masterIds: readonly T[],
  allowList: readonly string[] | null | undefined,
): T[] {
  if (!allowList || allowList.length === 0) return [...masterIds]
  const allowed = new Set(allowList)
  return masterIds.filter((id) => allowed.has(id))
}

/** The allow-list currently in effect for one activity's one attribute type, or undefined ("show
 * everything") — what the Configuration screen's checkbox list initializes its checked state from. */
export function overridesFor(
  overrides: AttributeOverrideMap,
  cardName: string,
  attributeType: AttributeType,
): string[] | undefined {
  return overrides[cardName]?.[attributeType]
}
