import { supabase } from '@/lib/supabaseClient'
import type { AttributeOverrideRow, AttributeType, CatalogActivityRow, CatalogCategoryRow } from '@/domain/catalog'

/**
 * Top-level catalog card name <-> `activities.id` mapping. `scheduled_
 * activities.activity_id` references the TOP-LEVEL card row only — the
 * drill-down `path` (e.g. ["Oiling", "Body"]) stays plain text, exactly as
 * the client has always stored it, so no sub-option lookup is needed here.
 *
 * Fetched once per session and cached in memory: the catalog is close to
 * static content (see `data/activities.ts`), and every read here is already
 * behind `list_scheduled_activities`'s own per-window fetch, not a hot path.
 */
interface CatalogMaps {
  byName: Map<string, string>
  byId: Map<string, string>
}

let cache: CatalogMaps | null = null
let inFlight: Promise<CatalogMaps> | null = null

async function fetchCatalog(): Promise<CatalogMaps> {
  const byName = new Map<string, string>()
  const byId = new Map<string, string>()
  if (!supabase) return { byName, byId }

  const { data, error } = await supabase
    .from('activities')
    .select('id, name')
    .is('parent_id', null)
    .eq('is_active', true)
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[catalog] failed to load activity catalog — sync will stall until it does', error.message)
    return { byName, byId }
  }
  for (const row of data ?? []) {
    byName.set(row.name, row.id)
    byId.set(row.id, row.name)
  }
  return { byName, byId }
}

async function load(): Promise<CatalogMaps> {
  if (cache) return cache
  if (!inFlight) inFlight = fetchCatalog()
  cache = await inFlight
  return cache
}

/** The catalog row id for a top-level card name, or null (e.g. offline, not yet loaded). */
export async function catalogIdForName(name: string): Promise<string | null> {
  const { byName } = await load()
  return byName.get(name) ?? null
}

/** The top-level card name for a catalog row id. */
export async function nameForCatalogId(id: string): Promise<string | null> {
  const { byId } = await load()
  return byId.get(id) ?? null
}

/** Test-only: drop the cached catalog so the next call refetches. */
export function resetCatalogCache(): void {
  cache = null
  inFlight = null
}

/* ------------------------------------------------------------------ *
 * Configuration screen API — `catalog_categories`/`activities`/
 * `activity_attribute_options` CRUD (see
 * `supabase/migrations/20260906120000_catalog_categories.sql` onward and the
 * full-stack-engineer agent definition's "Catalog Customization" section).
 * Every function here fails soft exactly like `api/scheduledActivities.ts`'s
 * own convention: `null`/`false`/no-op when Supabase isn't configured or a
 * call fails, NEVER thrown past this module for a read, since `CatalogContext`
 * must keep working from its local-first cache regardless (rule 6). Writes
 * (create/toggle/set-attribute-options) still throw on a real RPC error, same
 * as `apiCreateScheduledActivity` et al. — `CatalogContext` is what decides
 * how to react (log and move on; the local optimistic state already applied).
 * ------------------------------------------------------------------ */

interface EffectiveCatalogCategoryDto {
  id: string
  label: string
  icon_key: string
  sort_order: number
  is_active: boolean
}

interface EffectiveCatalogActivityDto {
  id: string
  name: string
  category_id: string | null
  parent_id: string | null
  icon_key: string
  sort_order: number
  is_active: boolean
}

interface EffectiveCatalogAttributeOverrideDto {
  activity_id: string
  attribute_type: string
  option_id: string
}

interface EffectiveCatalogDto {
  categories: EffectiveCatalogCategoryDto[]
  activities: EffectiveCatalogActivityDto[]
  attribute_overrides: EffectiveCatalogAttributeOverrideDto[]
}

export interface EffectiveCatalogPayload {
  categories: CatalogCategoryRow[]
  activities: CatalogActivityRow[]
  overrides: AttributeOverrideRow[]
}

/**
 * The full effective catalog (active tiles/cards/subs/thirds + this user's
 * own attribute-option overrides), one round trip. Returns `null` on any
 * failure to reach/read the server — `CatalogContext` treats that exactly
 * like `apiListScheduledActivities`'s own `null` contract: stay on whatever
 * local-first cache it already has, never overwrite it with "nothing".
 */
export async function apiGetEffectiveCatalog(): Promise<EffectiveCatalogPayload | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('get_effective_catalog')
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[catalog] get_effective_catalog failed — staying on local catalog', error.message)
    return null
  }
  const dto = data as EffectiveCatalogDto
  return {
    categories: (dto.categories ?? []).map((c) => ({
      id: c.id,
      label: c.label,
      iconKey: c.icon_key,
      sortOrder: c.sort_order,
      isActive: c.is_active,
    })),
    activities: (dto.activities ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      categoryId: a.category_id,
      parentId: a.parent_id,
      iconKey: a.icon_key,
      sortOrder: a.sort_order,
      isActive: a.is_active,
    })),
    overrides: (dto.attribute_overrides ?? []).map((o) => ({
      activityId: o.activity_id,
      attributeType: o.attribute_type as AttributeType,
      optionId: o.option_id,
    })),
  }
}

/** Adds a new tile. Returns the new row's id, or null if it couldn't be created (offline, RLS, etc.) —
 * the caller (`CatalogContext`) has already applied this optimistically to local state either way. */
export async function apiCreateCatalogCategory(label: string, iconKey: string): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('create_catalog_category', { p_label: label, p_icon_key: iconKey })
  if (error) throw error
  return (data as { id: string } | null)?.id ?? null
}

/** Adds a new activity row — a top-level card (`parentId` null) or a sub/third option (`parentId`
 * set). `categoryId` is required only for a top-level card, ignored otherwise (mirrors the
 * `activities` table's own `top_level_has_category` constraint). */
export async function apiCreateCatalogActivity(params: {
  name: string
  categoryId: string | null
  parentId: string | null
  iconKey: string
}): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('create_catalog_activity', {
    p_name: params.name,
    p_category_id: params.categoryId,
    p_parent_id: params.parentId,
    p_icon_key: params.iconKey,
  })
  if (error) throw error
  return (data as { id: string } | null)?.id ?? null
}

/** Rule 11's spirit — soft-disable only, never a hard delete of a row that has ever reached the
 * server. Applies to a tile (`catalog_categories`); see `apiSetActivityActive` for a card/sub/third. */
export async function apiSetCatalogCategoryActive(id: string, isActive: boolean): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.rpc('set_catalog_category_active', { p_id: id, p_is_active: isActive })
  if (error) throw error
}

/** Soft-disable (or re-enable) one activity row — a top-level card, a sub-option, or a third-level
 * option, all the same `activities` table row shape. */
export async function apiSetActivityActive(id: string, isActive: boolean): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.rpc('set_activity_active', { p_id: id, p_is_active: isActive })
  if (error) throw error
}

/** Replaces the allow-list for one (activity, attribute type) pair wholesale. An empty array clears
 * the override entirely — back to "show every master option" (the architecture's documented default). */
export async function apiSetActivityAttributeOptions(
  activityId: string,
  attributeType: AttributeType,
  optionIds: readonly string[],
): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.rpc('set_activity_attribute_options', {
    p_activity_id: activityId,
    p_attribute_type: attributeType,
    p_option_ids: optionIds,
  })
  if (error) throw error
}
