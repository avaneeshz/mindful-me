import type { LucideIcon } from 'lucide-react'

/**
 * The top-level picker tile's identity. Was a fixed 9-value union (Tile
 * Redesign — see the full-stack-engineer agent definition's Phase 1 scope);
 * PICKER-CUSTOM-1 generalized tiles to a user-owned, arbitrary-count
 * `public.tiles` table, so this is now plain `string` (a real `tiles.id`
 * uuid once live data is loaded, or one of the 9 original literal ids for
 * the static local-only fallback catalog — both are valid `CategoryId`
 * values now, deliberately not distinguished by the type system). Every
 * `ActivityCard.categoryId` still names the one tile it drills down from.
 */
export type CategoryId = string

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
  /** Second-level options, if this card has any. Legacy shape — still populated for the static catalog (and read by `ItemChip`'s badge count), but no longer what drill-down logic itself walks; see `children` below. */
  sub?: string[]
  /** Third level — only "Body Care (self)" goes this deep in the static catalog. Legacy shape, same status as `sub` above. */
  third?: Record<string, string[]>
  /**
   * The canonical, arbitrary-depth drill-down tree (PICKER-CUSTOM-1) —
   * `domain/boardReducer.ts`'s `isStagingComplete`/`stagingOptions` walk
   * THIS, never `sub`/`third` directly, so a live user-owned activity tree
   * (which has no 3-level cap) and the legacy static catalog (still only
   * ever 2 levels deep) both drill down through the exact same logic.
   * `data/activities.ts` synthesizes this from `sub`/`third` for every
   * static card at module load, so nothing has to hand-author it twice.
   * `undefined`/empty means "no further options — this node is a leaf."
   */
  children?: ActivityCard[]
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
 * scheduled activity (at most one; "None" clears it).
 *
 * Was a fixed 14-value union (SCRUM-15's replacement of the original
 * 4-value vocabulary). PICKER-CUSTOM-1 made this user-editable — a shared,
 * growable vocabulary per type (`public.parameter_options`, `parameter_type =
 * 'flag'`), with each activity SELECTING which of those apply to it
 * (`public.activity_parameter_selections`, with inheritance — see
 * `internal.effective_parameter_options`'s own doc comment) — a closed TS
 * union can no longer usefully describe an
 * open-ended, server-defined, per-activity option set, so this is plain
 * `string` now. The real constraint moved entirely to where it actually
 * belongs: the DB's `internal.assert_valid_flags` (validated against the
 * SPECIFIC activity's effective list at write time) and, client-side, the
 * picker only ever offering values from that same effective list — never a
 * free-text field — exactly the same trust boundary `ScheduledActivity.
 * name`/`.path` (plain strings, never TS-enum-constrained either) have
 * always had.
 *
 * A whole-slot marker is legacy-only going forward: the client no longer
 * creates flag-only markers (Modal Redesign §E) — flags now attach to the
 * real activity being logged instead (see `ScheduledActivity.flags` below).
 * Old zero-duration marker rows, if any exist, keep rendering exactly as
 * before (`domain/slots.ts` `flagMarkerAt` is untouched).
 */
export type FlagId = string

/**
 * A multi-select, optional reflection on how a logged activity felt —
 * "Activity quality" (formerly "How did it feel?"). Any number can be
 * selected at once, mirroring `Symptom`/`ScheduledActivity.symptoms`'
 * multi-select shape exactly.
 *
 * Same PICKER-CUSTOM-1 generalization as `FlagId` above — was an 18-value
 * closed union (SCRUM-10), now plain `string`: per-activity, user-editable,
 * inherited, server-validated. See `FlagId`'s own doc comment for the full
 * reasoning; it applies here verbatim.
 */
export type ActivityQuality = string

/**
 * A multi-select, optional set of chronic symptoms noticed around a logged
 * activity ("Chronic Symptoms" section, between quality and protective
 * response). Unlike quality/flags, any number can be selected at once —
 * `ScheduledActivity.symptoms` is a plain array with no "at most one"
 * client-side contract, mirroring the DB's own `text[]` storage shape
 * (`symptoms_encrypted`, encrypted the same way `flags_encrypted` originally
 * was, before flags narrowed to single-select). Same PICKER-CUSTOM-1
 * generalization as `FlagId`/`ActivityQuality` — was a fixed 6-value union,
 * now plain `string`; see `FlagId`'s own doc comment for the full reasoning.
 */
export type Symptom = string

/**
 * The selected values for one MULTISELECT-kind `header_button_note_fields`
 * row (Sleep's old hardcoded "How was your sleep?" `SleepQualityId` picker
 * generalizes onto this same mechanism now — see
 * `20260921060000_dynamic_note_fields.sql`) — keyed by that field's stable
 * `id` (`note_field_id`), so any activity-category button can carry any
 * number of user-defined multiselect fields, not just Sleep's one. A TEXT-
 * kind field (Note/Dreams) never appears here — it still round-trips
 * through `ScheduledActivity.notes`/`dreamsNote` exactly as before, since
 * that mechanism was never the one with a physical-column ceiling.
 */
export type FieldSelections = Record<string, string[]>

/**
 * One reflection-card pairing on a logged activity — many-to-many (a
 * scheduled activity can carry several cards, one card can be used on many
 * scheduled activities), and unlike quality/symptoms (which share ONE note
 * field per activity), EACH pairing carries its own freeform note. `card`
 * names the pairing by the static catalog's own `number` (`data/
 * reflectionCards.ts`, 1–18) — never the server-side `reflection_cards.id`
 * — the same reasoning `ScheduledActivity.name` identifies an activity by
 * its catalog NAME rather than `activities.id`: this client stays fully
 * usable with zero backend configured (rule 6), and the static catalog's
 * own number is the one identity that is always available offline.
 * `api/reflectionCards.ts` resolves `card` to the real DB id only at the
 * sync boundary, mirroring `api/catalog.ts`'s `catalogIdForName`.
 */
export interface ReflectionEntry {
  card: number
  /** Optional — an empty string is "no note for this card", same as `ScheduledActivity.notes`'s null. */
  note: string
}

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
  /** Reflection-card pairings, optional, any number at once — see `ReflectionEntry`. */
  reflections: ReflectionEntry[]
  status: ScheduleStatus
  /** IANA zone the user was in when this was scheduled — locks the wall clock. */
  timezone: string
  /** Any multiselect-kind note field's chosen values, keyed by that field's own `id` — see `FieldSelections`. Encrypted at rest per field (rule 10). */
  fieldSelections: FieldSelections
  /** A SEPARATE freeform note from `notes` — driven by whichever activity-category button's second (`'secondary'`) text field is configured, Sleep's "Dreams" by default. Encrypted at rest like `notes` (rule 10). */
  dreamsNote: string | null
}

export type ActivityList = readonly ScheduledActivity[]

export type Period = 'day' | 'night'
