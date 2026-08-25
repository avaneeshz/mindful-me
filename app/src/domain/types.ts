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

/** A whole-slot marker. Carries no duration and consumes no slot capacity. */
export type FlagId = 'Trauma response' | 'Stress response' | 'Fear response'

export interface PlacedActivity {
  name: string
  /** Drill-down path, e.g. ["Oiling", "Body"]. Empty for flat cards. */
  path: string[]
  /** Minutes. Always a multiple of 15, extending from the start slot. */
  duration: number
}

/**
 * Read-only by contract. `entryAt` hands back one shared frozen instance for
 * every empty slot, so a stray `entry.activities.push(...)` anywhere would
 * otherwise corrupt every empty slot at once. Mutation happens on an explicit
 * clone inside the reducer, never on an entry read out of state.
 */
export interface SlotEntry {
  readonly activities: readonly PlacedActivity[]
  readonly flags: readonly FlagId[]
}

/** Slot index (0–47) -> entry. Sparse: absent means an empty slot. */
export type SlotEntries = Record<number, SlotEntry>

export type Period = 'day' | 'night'
