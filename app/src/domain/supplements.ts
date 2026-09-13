/**
 * The Supplements header control — a fixed 7-item daily checklist. Pure
 * types + the fixed enumeration only, mirroring how `domain/notes.ts` and
 * `domain/scheduling.ts` keep this kind of shared logic component/DB-free.
 * No React, no Supabase, no `localStorage` — see
 * `state/useSupplementCompletions.ts` for where those live.
 *
 * Genuinely a new interaction pattern (see the full-stack-engineer agent
 * definition's Component Rule analysis): unlike `NoteButtonPill` (an
 * append-only log of freeform notes) or `DisplayValueButton` (one
 * set/replace number or computed total per day), this is N independently
 * toggleable items, each with its own optional note, that resets every
 * calendar day (see `public.supplement_completions` — a day with no row for
 * an item simply renders unchecked).
 */

export const SUPPLEMENT_ITEMS = [
  { key: 'zinc', label: 'Zinc (post-breakfast)' },
  { key: 'omega', label: 'Omega (post-lunch)' },
  { key: 'magnesium', label: 'Magnesium (post-dinner)' },
  { key: 'ayurveda_skin', label: 'Ayurveda — skin healing' },
  { key: 'ayurveda_fibroid', label: 'Ayurveda — fibroid healing' },
  { key: 'ayurveda_varicose', label: 'Ayurveda — varicose veins' },
  { key: 'multivitamin', label: 'MultiVitamin (on Chums days)' },
] as const

export type SupplementItemKey = (typeof SUPPLEMENT_ITEMS)[number]['key']

export function supplementItemLabel(key: SupplementItemKey): string {
  return SUPPLEMENT_ITEMS.find((item) => item.key === key)?.label ?? key
}

/** One item's state for one calendar day, as the client sees it. */
export interface SupplementCompletion {
  itemKey: SupplementItemKey
  localDate: string
  done: boolean
  note: string
  /** `null` when never marked done (or the whole entry doesn't exist yet locally). */
  completedAt: string | null
}

/** An untouched item on a day with no record at all — "resets daily" is exactly this shape. */
export function emptyCompletion(itemKey: SupplementItemKey, localDate: string): SupplementCompletion {
  return { itemKey, localDate, done: false, note: '', completedAt: null }
}

/** The full day's checklist, one entry per item, in `SUPPLEMENT_ITEMS`' own order — untouched items fall back to `emptyCompletion`. */
export function fullDayChecklist(
  localDate: string,
  existing: readonly SupplementCompletion[],
): SupplementCompletion[] {
  const byKey = new Map(existing.map((entry) => [entry.itemKey, entry]))
  return SUPPLEMENT_ITEMS.map((item) => byKey.get(item.key) ?? emptyCompletion(item.key, localDate))
}
