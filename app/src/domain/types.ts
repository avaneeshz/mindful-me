import type { LucideIcon } from 'lucide-react'

export type CategoryId = 'mind' | 'body' | 'sports' | 'nature' | 'focus'

export interface Category {
  id: CategoryId
  /** Canonical display name — taxonomy terminology, do not paraphrase. */
  label: string
  /** DEEP tone. Picker tiles and list-row icon chips only. */
  deep: string
  /** LIGHT pastel tone. Timeline strip fill ONLY. */
  light: string
  /**
   * Foreground utility class for content sitting on the DEEP fill, chosen for
   * WCAG contrast rather than per-tile guesswork. See CATEGORIES for the
   * measured ratios behind each choice.
   */
  onDeep: 'text-white' | 'text-charcoal'
  /**
   * Set only where NEITHER foreground reaches WCAG AA 4.5:1 on the DEEP fill.
   * Names the `.label-contrast-boost` mitigation class (see index.css) which is
   * applied to label TEXT only. A stopgap until the offending category token is
   * re-toned at design level — not a decorative treatment.
   */
  onDeepBoost?: 'label-contrast-boost'
  icon: LucideIcon
}

/** A top-level draggable/tappable activity. 24 of these, "Flags" excluded. */
export interface ActivityCard {
  name: string
  categoryId: CategoryId
  icon: LucideIcon
  /** Second-level options, if this card has any. */
  sub?: string[]
  /** Third level — only "Body care" goes this deep. */
  third?: Record<string, string[]>
}

/** A whole-slot marker. Carries no duration and consumes no schedule room. */
export type FlagId = 'Trauma response' | 'Stress response' | 'Fear response'

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
  flags: FlagId[]
  status: ScheduleStatus
  /** IANA zone the user was in when this was scheduled — locks the wall clock. */
  timezone: string
}

export type ActivityList = readonly ScheduledActivity[]

export type Period = 'day' | 'night'
