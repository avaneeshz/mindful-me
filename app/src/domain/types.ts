import type { LucideIcon } from 'lucide-react'

/**
 * The 9 top-level picker tiles (Tile Redesign — see the full-stack-engineer
 * agent definition's Phase 1 scope). Each tile is also the activity catalog's
 * grouping key: every `ActivityCard.categoryId` names the one tile it drills
 * down from.
 */
export type CategoryId =
  | 'sleep'
  | 'food'
  | 'care'
  | 'downtime'
  | 'movement'
  | 'work'
  | 'nature'
  | 'growth'
  | 'home'

export type ContrastForeground = 'text-white' | 'text-charcoal'

export interface Category {
  id: CategoryId
  /** Canonical display name — taxonomy terminology, do not paraphrase. */
  label: string
  /** DEEP tone. The main 3x3 tile grid, and list-row icon chips, only. */
  deep: string
  /**
   * LIGHT pastel tone. Reserved for category-level chrome that still falls
   * back to it — a flag marker, or any other spot with no single ITEM to
   * carry its own colour (see `ActivityCard.color`, which owns the timeline
   * strip fill for every real activity now that items carry their own hue).
   */
  light: string
  /**
   * Foreground utility class for content sitting on the DEEP fill, chosen for
   * WCAG contrast rather than per-tile guesswork. See CATEGORIES for the
   * measured ratios behind each choice.
   */
  onDeep: ContrastForeground
  /**
   * Set only where NEITHER foreground reaches WCAG AA 4.5:1 on the DEEP fill.
   * Names the `.label-contrast-boost` mitigation class (see index.css) which is
   * applied to label TEXT only. A stopgap until the offending category token is
   * re-toned at design level — not a decorative treatment.
   */
  onDeepBoost?: 'label-contrast-boost'
  icon: LucideIcon
}

/**
 * When an item locks/disappears for the rest of the LOCAL calendar day it is
 * being viewed on (never persisted across days — see `domain/disappear.ts`):
 *   - `auto`   locks once the item has been scheduled `limit` times today.
 *   - `manual` never locks on its own; the user marks it done via the small
 *     checkmark control on the item's own chip.
 */
export type DisappearRule = { mode: 'auto'; limit: number } | { mode: 'manual' }

/**
 * A top-level pickable activity — the leaf of the picker's 3-level drill-down
 * (9 tiles -> this item -> an optional sub/third choice). 53 of these,
 * "Flags" excluded.
 */
export interface ActivityCard {
  name: string
  categoryId: CategoryId
  icon: LucideIcon
  /** Second-level options, if this card has any. */
  sub?: string[]
  /** Third level — only "Body Care (self)" goes this deep. */
  third?: Record<string, string[]>
  /**
   * This item's own flat, accessible solid colour. Used in exactly two
   * places (Tile Redesign §4): this item's own chip in the drill-down view,
   * and its fill in the timeline strip. The 9 main tiles never take on a
   * child's colour — they keep `Category.deep` so the top screen stays calm.
   */
  color: string
  /** Foreground for content on `color`, chosen by measured WCAG contrast. */
  onColor: ContrastForeground
  /** Same `.label-contrast-boost` mitigation `Category.onDeepBoost` uses. */
  onColorBoost?: 'label-contrast-boost'
  /**
   * A hairline border for a fill close enough to white that it would
   * otherwise blend into the page background. Cosmetic only — independent of
   * `onColor`'s text-contrast measurement.
   */
  hairline?: boolean
  disappear: DisappearRule
}

/**
 * "Protective response" — a single-select, optional pick on an individual
 * scheduled activity (at most one; "None" clears it). SCRUM-15 replaced the
 * original 4-value vocabulary (`Trauma response` / `Stress response` /
 * `Fear response` / `Anger response`) outright with this 14-value one — not
 * a rename of those values, a full replacement of the option set.
 *
 * A whole-slot marker is legacy-only going forward: the client no longer
 * creates flag-only markers (Modal Redesign §E) — flags now attach to the
 * real activity being logged instead (see `ScheduledActivity.flags` below).
 * Old zero-duration marker rows, if any exist, keep rendering exactly as
 * before (`domain/slots.ts` `flagMarkerAt` is untouched).
 */
export type FlagId =
  | 'Trauma Activation'
  | 'Triggered'
  | 'Attack'
  | 'Anger'
  | 'Procrastinated'
  | 'Shut Down'
  | 'Collapse'
  | 'Over Accommodating'
  | 'Hyper Responsibility'
  | 'Over Function'
  | 'Intellectualization'
  | 'Optimization'
  | 'Hyper Vigilance'
  | 'Problem Solving'

/**
 * A multi-select, optional reflection on how a logged activity felt —
 * "Activity quality" (formerly "How did it feel?", SCRUM-10 replaced the old
 * 5-value single-select vocabulary with this 18-value multi-select one; two
 * labels, `Nourishing` and `Draining`, happen to survive from the old list,
 * coincidentally — not a preserved data mapping). Any number can be
 * selected at once, mirroring `Symptom`/`ScheduledActivity.symptoms`'
 * multi-select shape exactly.
 */
export type ActivityQuality =
  | 'Resonance'
  | 'Flow'
  | 'Scattered'
  | 'Overstimulated'
  | 'Zone out'
  | 'Numb'
  | 'Engaged'
  | 'Bored'
  | 'Resistant'
  | 'Frozen'
  | 'Avoiding'
  | 'Confusion'
  | 'Compulsive persistent'
  | 'Interoceptive Override'
  | 'Addictive'
  | 'Nourishing'
  | 'Draining'
  | 'Energizing'

/**
 * A multi-select, optional set of chronic symptoms noticed around a logged
 * activity ("Chronic Symptoms" section, between quality and protective
 * response). Unlike quality/flags, any number can be selected at once —
 * `ScheduledActivity.symptoms` is a plain array with no "at most one"
 * client-side contract, mirroring the DB's own `text[]` storage shape
 * (`symptoms_encrypted`, encrypted the same way `flags_encrypted` originally
 * was, before flags narrowed to single-select).
 */
export type Symptom = 'Pitta' | 'Inflammation' | 'Right knee pain' | 'Calves pain' | 'Temporal pain' | 'Dryness'

export type ScheduleStatus = 'planned' | 'completed'

/**
 * One logical activity instance, anchored to a real wall-clock start time —
 * the atomic unit of the activity-centric model (see the Target Architecture
 * in the full-stack-engineer agent definition). Replaces the old slot-indexed
 * `PlacedActivity` + `SlotEntries` pair: there is no 30-minute step, no
 * per-slot capacity, and no spillover bookkeeping — an activity simply has a
 * real start time and a real duration, and the ONLY placement rule is "no two
 * activities may overlap" (`domain/scheduling.ts`).
 *
 * A "flag marker" (see `domain/scheduling.ts` `flagMarkerAt`) is represented
 * as a `ScheduledActivity` with `name: null` and `durationMinutes: 0` —
 * exactly mirroring the DB shape (`scheduled_activities.activity_id` NULL,
 * `duration_minutes` 0), which is why it never participates in the overlap
 * check (a zero-length range overlaps nothing) and never consumes schedule
 * room, preserving the product's original "whole-slot marker, no capacity
 * cost" behaviour for flags.
 */
export interface ScheduledActivity {
  /** Stable id — a client-generated UUID until synced, then the server row id. */
  id: string
  /** Catalog card name, or null for a flag-only marker. */
  name: string | null
  /** Drill-down path, e.g. ["Oiling", "Body"]. Empty for flat cards or markers. */
  path: string[]
  /**
   * Minutes since local midnight of the calendar day this activity was
   * scheduled on (0–1439). This is the WALL-CLOCK time the user saw at
   * creation, locked in — never recomputed from a stored UTC instant, and
   * never shifted by a later timezone change or DST transition (rule 3).
   */
  startMinutes: number
  /**
   * Arbitrary minutes, never snapped to any step. 0 only for a flag marker.
   * May carry the activity's end past 1440 — a genuine midnight-crossing
   * activity is still ONE row (rule 2); see `splitMinutesAcrossDays` in
   * `domain/scheduling.ts` for how its minutes are attributed across the two
   * calendar days it touches.
   */
  durationMinutes: number
  /**
   * At most ONE element (Modal Redesign §E — single-select, "None" is the
   * explicit default). The wire shape stays `text[]`/`FlagId[]` deliberately
   * (an approved decision not to churn `flags_encrypted`'s array column or
   * its encrypt/decrypt functions) — enforcing "at most one" is entirely a
   * client-layer contract, never a DB constraint. A pre-existing legacy
   * marker row could in principle carry more than one (nothing in the old
   * model prevented it); the new single-select modal simply keeps only the
   * first if it ever encounters that.
   */
  flags: FlagId[]
  /** "Activity quality" — optional, multi-select. Any number, including none. */
  quality: ActivityQuality[]
  /** "Chronic Symptoms" — optional, multi-select. Any number, including none. */
  symptoms: Symptom[]
  /** Freeform notes, optional. Encrypted at rest like quality/flags/symptoms (rule 10). */
  notes: string | null
  status: ScheduleStatus
  /** IANA zone the user was in when this was scheduled — locks the wall clock. */
  timezone: string
}

export type ActivityList = readonly ScheduledActivity[]

export type Period = 'day' | 'night'
