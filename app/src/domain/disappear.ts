/**
 * "Locks/disappears for the rest of the day" (Tile Redesign §5) — pure
 * derivation only, no React, no storage I/O. A separate module from
 * `domain/scheduling.ts` on purpose: this is picker-presentation logic layered
 * ON TOP of the committed schedule, never a placement rule of its own, and
 * `scheduling.ts`/`slots.ts` stay untouched by this feature.
 *
 * Two independent lock mechanisms, per `ActivityCard.disappear`:
 *   - `auto:N`  derived straight from `activities` — no new persisted state.
 *     Counts today's `ScheduledActivity` rows by name, scoped to whichever
 *     day `activities` already represents (the caller — `BoardContext` via
 *     `state.activities` — already scopes that to the viewed day, rule 8).
 *   - `manual`  driven by a caller-supplied `dismissed` set of item names,
 *     the one new small piece of state this feature adds (persisted per day
 *     by `state/dismissedActivities.ts`).
 */
import type { ActivityCard, ActivityList } from './types'

/** How many of today's activities carry this exact catalog name. */
export function timesScheduledToday(activities: ActivityList, cardName: string): number {
  let count = 0
  for (const activity of activities) {
    if (activity.name === cardName) count += 1
  }
  return count
}

/** True once `card` is done for the day — auto-threshold reached, or manually marked done. */
export function isCardLocked(
  card: ActivityCard,
  activities: ActivityList,
  dismissed: ReadonlySet<string>,
): boolean {
  if (card.disappear.mode === 'manual') return dismissed.has(card.name)
  return timesScheduledToday(activities, card.name) >= card.disappear.limit
}

export interface TileProgress {
  /** How many of this tile's own items are locked right now. */
  done: number
  /** How many items belong to this tile in total. */
  total: number
}

/** The "x of y done" count for one tile's own items. */
export function tileProgress(
  cards: readonly ActivityCard[],
  activities: ActivityList,
  dismissed: ReadonlySet<string>,
): TileProgress {
  let done = 0
  for (const card of cards) {
    if (isCardLocked(card, activities, dismissed)) done += 1
  }
  return { done, total: cards.length }
}

/** True once every item belonging to a tile is locked — the whole tile goes locked too. */
export function isTileLocked(progress: TileProgress): boolean {
  return progress.total > 0 && progress.done === progress.total
}
