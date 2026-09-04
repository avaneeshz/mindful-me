import {
  Activity,
  AlertTriangle,
  Angry,
  Bath,
  BatteryLow,
  BedDouble,
  BedSingle,
  Bone,
  Brain,
  Briefcase,
  Building2,
  CircleDashed,
  CloudRain,
  Coffee,
  Droplet,
  Droplets,
  Dumbbell,
  Flame,
  Flower2,
  Footprints,
  FlaskConical,
  GraduationCap,
  Hand,
  HandHeart,
  HeartCrack,
  HeartHandshake,
  HeartPulse,
  Headphones,
  Home,
  Image,
  Leaf,
  Lightbulb,
  Moon,
  PenLine,
  Pill,
  Rocket,
  Scissors,
  ShieldPlus,
  ShoppingCart,
  Shuffle,
  Soup,
  Sparkle,
  Sparkles,
  Sprout,
  Sun,
  Syringe,
  Table2,
  Thermometer,
  Timer,
  TrainFront,
  Trees,
  TreePine,
  TrendingUp,
  Tv,
  Users,
  Utensils,
  Video,
  Waves,
  Wind,
  Youtube,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { ActivityCard, ActivityQuality, Category, CategoryId, FlagId, Symptom } from '@/domain/types'

/* ------------------------------------------------------------------ *
 * Colour system — SUPERSEDED, kept as inert data only.
 *
 * Everything below (`Category.deep`/`light`/`onDeep`/`onDeepBoost` and
 * `ActivityCard.color`/`onColor`/`onColorBoost`/`hairline`) was the real,
 * measured-for-WCAG-contrast per-tile/per-item colour system the Tile
 * Redesign shipped. A later, explicitly confirmed product round replaced it
 * outright with a monochrome light/dark theme — "no colour anywhere,
 * no per-item palette, no per-category tile colours" — so none of these
 * fields are read by any component's render path any more (see
 * `TileRow.tsx`, `CategoryIconChip.tsx`, `Timeline.tsx`,
 * `DurationDragBlock.tsx`, all now purely `ink`/`surface`/`line`-based).
 *
 * These fields are kept, unread, rather than stripped from all 53 item
 * literals below — the same "kept but currently unused" treatment this file
 * already gave `onDeepBoost`/`onColorBoost` before the retheme (see
 * `.label-contrast-boost` in index.css). If per-item colour is ever
 * reintroduced, the measured values and methodology below are still valid
 * and don't need re-deriving from scratch. The original methodology notes
 * (measured against white/charcoal, nudged for 4.5:1 AA) are preserved
 * as historical record, not current behaviour.
 * ------------------------------------------------------------------ */

export const CATEGORIES: Record<CategoryId, Category> = {
  sleep: {
    id: 'sleep',
    label: 'Sleep & Rest',
    deep: 'var(--cat-sleep-deep)',
    light: 'var(--cat-sleep-light)',
    onDeep: 'text-white',
    icon: Moon,
  },
  food: {
    id: 'food',
    label: 'Food & Nourishment',
    deep: 'var(--cat-food-deep)',
    light: 'var(--cat-food-light)',
    onDeep: 'text-charcoal',
    icon: Utensils,
  },
  care: {
    id: 'care',
    label: 'Personal Care',
    deep: 'var(--cat-care-deep)',
    light: 'var(--cat-care-light)',
    onDeep: 'text-charcoal',
    icon: Droplet,
  },
  downtime: {
    id: 'downtime',
    label: 'Downtime & Errands',
    deep: 'var(--cat-downtime-deep)',
    light: 'var(--cat-downtime-light)',
    onDeep: 'text-charcoal',
    icon: Tv,
  },
  movement: {
    id: 'movement',
    label: 'Movement & Body Therapy',
    deep: 'var(--cat-movement-deep)',
    light: 'var(--cat-movement-light)',
    onDeep: 'text-white',
    icon: Footprints,
  },
  work: {
    id: 'work',
    label: 'Work & Projects',
    deep: 'var(--cat-work-deep)',
    light: 'var(--cat-work-light)',
    onDeep: 'text-white',
    icon: Rocket,
  },
  nature: {
    id: 'nature',
    label: 'Nature & Spirit',
    deep: 'var(--cat-nature-deep)',
    light: 'var(--cat-nature-light)',
    onDeep: 'text-charcoal',
    icon: Leaf,
  },
  growth: {
    id: 'growth',
    label: 'Growth & Connection',
    deep: 'var(--cat-growth-deep)',
    light: 'var(--cat-growth-light)',
    onDeep: 'text-white',
    icon: Sparkles,
  },
  home: {
    id: 'home',
    label: 'Home & Chores',
    deep: 'var(--cat-home-deep)',
    light: 'var(--cat-home-light)',
    onDeep: 'text-charcoal',
    icon: Home,
  },
}

/** In on-screen tile order (§2), the 9 tiles' own display order. */
export const CATEGORY_ORDER: CategoryId[] = [
  'sleep',
  'food',
  'care',
  'downtime',
  'movement',
  'work',
  'nature',
  'growth',
  'home',
]

/* ------------------------------------------------------------------ *
 * The authoritative 53-item taxonomy (Tile Redesign §3), grouped by tile in
 * on-screen order. This is CONTENT DATA — the client is expected to keep
 * iterating on it, so it must never be hardcoded into components.
 * ------------------------------------------------------------------ */

export const ACTIVITY_CARDS: ActivityCard[] = [
  // --- Tile 1: Sleep & Rest -------------------------------------------
  { name: 'Night Sleep', categoryId: 'sleep', icon: Moon, color: '#1F3A5F', onColor: 'text-white', disappear: { mode: 'auto', limit: 1 } },
  { name: 'Day Sleep', categoryId: 'sleep', icon: BedDouble, color: '#E58E5B', onColor: 'text-charcoal', disappear: { mode: 'auto', limit: 1 } },
  { name: 'Bed Exercise', categoryId: 'sleep', icon: Dumbbell, color: '#DA8DA7', onColor: 'text-charcoal', disappear: { mode: 'auto', limit: 2 } },
  {
    name: 'Supplements',
    categoryId: 'sleep',
    icon: Pill,
    color: '#E8B93A',
    onColor: 'text-charcoal',
    disappear: { mode: 'manual' },
    sub: [
      'Zinc (post-breakfast)',
      'Omega (post-lunch)',
      'Magnesium (post-dinner)',
      'Ayurveda — skin healing',
      'Ayurveda — fibroid healing',
      'Ayurveda — varicose veins',
      'MultiVitamin (on Chums days)',
    ],
  },
  // The PDF gave no explicit rule for this item — defaulting to `manual`
  // like its column-mates in this tile. Flagged in the PR description;
  // cheap to change to an `auto:N` rule later if that turns out wrong.
  { name: 'Slow down', categoryId: 'sleep', icon: Wind, color: '#9CA4B4', onColor: 'text-charcoal', disappear: { mode: 'manual' } },

  // --- Tile 2: Food & Nourishment --------------------------------------
  { name: 'Soaking/Sprouting/Grinding', categoryId: 'food', icon: Sprout, color: '#E8DCC0', onColor: 'text-charcoal', disappear: { mode: 'auto', limit: 2 } },
  {
    name: 'Meal Prep',
    categoryId: 'food',
    icon: Utensils,
    color: '#8969A7',
    onColor: 'text-white',
    disappear: { mode: 'auto', limit: 4 },
    sub: ['Breakfast', 'Lunch', 'Early Dinner', 'Later Dinner'],
  },
  // PDF: "Rainbow colors" — a flat solid stand-in, not a literal gradient,
  // per CLAUDE.md's anti-gradient rule.
  { name: 'Eating', categoryId: 'food', icon: Soup, color: '#ED81B3', onColor: 'text-charcoal', disappear: { mode: 'auto', limit: 4 } },
  { name: 'Dish washing', categoryId: 'food', icon: Droplets, color: '#4FB3BF', onColor: 'text-charcoal', disappear: { mode: 'auto', limit: 1 } },
  {
    name: 'Liquids',
    categoryId: 'food',
    icon: Coffee,
    color: '#CFE0E8',
    onColor: 'text-charcoal',
    disappear: { mode: 'auto', limit: 3 },
    sub: [
      'Flower tea',
      'Leaves tea',
      'Roots tea',
      '100% Cocoa',
      'Seeds tea',
      'Coconut water',
      'Chia Basil',
      'Lassi',
      'Apple Cider Vinegar',
    ],
  },
  { name: 'Gut', categoryId: 'food', icon: Activity, color: '#996D50', onColor: 'text-white', disappear: { mode: 'auto', limit: 2 } },
  {
    name: 'Chums Support',
    categoryId: 'food',
    icon: HandHeart,
    color: '#C0447A',
    onColor: 'text-white',
    disappear: { mode: 'manual' },
    sub: ['Mishti Doi', 'Shrikhand', 'Yakult'],
  },

  // --- Tile 3: Personal Care --------------------------------------------
  { name: 'Oral Care', categoryId: 'care', icon: Sparkle, color: '#6FBF97', onColor: 'text-charcoal', disappear: { mode: 'auto', limit: 2 } },
  { name: 'Bath ritual', categoryId: 'care', icon: Bath, color: '#71A9DC', onColor: 'text-charcoal', disappear: { mode: 'auto', limit: 2 } },
  { name: 'Hair Care', categoryId: 'care', icon: Scissors, color: '#CB9D41', onColor: 'text-charcoal', disappear: { mode: 'auto', limit: 1 } },
  {
    // Folds the EXISTING "Body care" card's 3-level drill in verbatim
    // (Massage/Oiling/Mask -> Face/Body/Hair), renamed to match the PDF.
    // This stays the only 2-level (sub + third) card in the whole catalog —
    // every other item's "3rd screen" list below is a single flat `sub`.
    name: 'Body Care (self)',
    categoryId: 'care',
    icon: Droplet,
    color: '#EDE6D6',
    onColor: 'text-charcoal',
    disappear: { mode: 'auto', limit: 2 },
    sub: ['Massage', 'Oiling', 'Mask'],
    third: {
      Massage: ['Face', 'Body', 'Hair'],
      Oiling: ['Face', 'Body', 'Hair'],
      Mask: ['Face', 'Body', 'Hair'],
    },
  },
  { name: 'Body Care (outsourced)', categoryId: 'care', icon: HandHeart, color: '#D9A987', onColor: 'text-charcoal', disappear: { mode: 'manual' } },

  // --- Tile 4: Downtime & Errands ---------------------------------------
  { name: 'Entertainment (YouTube)', categoryId: 'downtime', icon: Youtube, color: '#E12E3C', onColor: 'text-white', disappear: { mode: 'manual' } },
  {
    name: 'Commuting',
    categoryId: 'downtime',
    icon: TrainFront,
    color: '#6B7280',
    onColor: 'text-white',
    disappear: { mode: 'manual' },
    sub: ['Metro', 'Train', 'Bus', 'Auto', 'Cab', 'Flight'],
  },
  { name: 'Doing Nothing', categoryId: 'downtime', icon: CircleDashed, color: '#D4A72C', onColor: 'text-charcoal', disappear: { mode: 'manual' } },
  { name: 'Errand time', categoryId: 'downtime', icon: ShoppingCart, color: '#F0A8BC', onColor: 'text-charcoal', disappear: { mode: 'manual' } },
  {
    name: 'Pomodoro Break',
    categoryId: 'downtime',
    icon: Timer,
    color: '#E88A8A',
    onColor: 'text-charcoal',
    disappear: { mode: 'manual' },
    sub: ['Eating leaves', 'CCTV Control Station', 'Stretching', 'Humor content'],
  },

  // --- Tile 5: Movement & Body Therapy ----------------------------------
  {
    // Existing sub-list reused verbatim, plus Swimming and Badminton per
    // the PDF (Dancing/HIIT/Skipping/Running/Swimming/Badminton).
    name: 'Sports or Exercise',
    categoryId: 'movement',
    icon: Footprints,
    color: '#7A2E3B',
    onColor: 'text-white',
    disappear: { mode: 'auto', limit: 2 },
    sub: ['Dance', 'Skipping', 'Running', 'HIIT', 'Suryanamaskar', 'Moonnamaskar', 'Swimming', 'Badminton'],
  },
  { name: 'Breathwork', categoryId: 'movement', icon: Wind, color: '#C7D3DC', onColor: 'text-charcoal', disappear: { mode: 'auto', limit: 2 } },
  { name: 'Walking', categoryId: 'movement', icon: Footprints, color: '#D9C79E', onColor: 'text-charcoal', disappear: { mode: 'manual' } },
  { name: 'Vipassana', categoryId: 'movement', icon: Flower2, color: '#E4941F', onColor: 'text-charcoal', disappear: { mode: 'auto', limit: 1 } },
  { name: 'Acupressure', categoryId: 'movement', icon: Hand, color: '#7A1F3D', onColor: 'text-white', disappear: { mode: 'manual' } },
  { name: 'Acupuncture', categoryId: 'movement', icon: Syringe, color: '#B0B4B9', onColor: 'text-charcoal', disappear: { mode: 'manual' } },
  { name: 'Physio Injury Prevention', categoryId: 'movement', icon: ShieldPlus, color: '#E8E1D3', onColor: 'text-charcoal', disappear: { mode: 'manual' } },

  // --- Tile 6: Work & Projects -------------------------------------------
  // The old "GEOM / HOSS / HECOLL" card is split: GEOM stands alone here,
  // HOSS moves into Experiments' sub-list below.
  { name: 'GEOM', categoryId: 'work', icon: Building2, color: '#66ABDA', onColor: 'text-charcoal', disappear: { mode: 'manual' } },
  {
    name: 'Experiments',
    categoryId: 'work',
    icon: FlaskConical,
    color: '#5B3A5E',
    onColor: 'text-white',
    disappear: { mode: 'manual' },
    sub: [
      'Relational Field Experiments',
      'Survival Edge Experiment',
      'HOSS experiments',
      'Yoga',
      'Surya Namaskar',
      'Moon Namaskar',
    ],
  },
  {
    name: 'Work',
    categoryId: 'work',
    icon: Briefcase,
    color: '#F2884C',
    onColor: 'text-charcoal',
    disappear: { mode: 'manual' },
    sub: ['Deep', 'Shallow', 'Creative'],
  },
  {
    // The old "Gmeet / Zoom" card's Coach/Therapist sub-options are now their
    // own standalone items below (Therapy, Coaching); its remaining two
    // (Cofounder, Personal Board of Director) fold in here, plus "Other".
    name: 'Gmeet calls',
    categoryId: 'work',
    icon: Video,
    color: '#35B5B5',
    onColor: 'text-charcoal',
    disappear: { mode: 'manual' },
    sub: ['Cofounder', 'Personal Board of Director', 'Other'],
  },
  // Renamed from "Writing — author journey" to match the PDF.
  { name: 'Author writing', categoryId: 'work', icon: PenLine, color: '#A32357', onColor: 'text-white', disappear: { mode: 'auto', limit: 1 } },

  // --- Tile 7: Nature & Spirit --------------------------------------------
  {
    // Existing sub-list reused verbatim, with the missing entries added so
    // it reads exactly as the PDF's full list.
    name: 'Spiritual Care',
    categoryId: 'nature',
    icon: HeartHandshake,
    color: '#D9A62E',
    onColor: 'text-charcoal',
    disappear: { mode: 'auto', limit: 5 },
    sub: ['Singing / worship time', 'Prayer', 'Bible reading', 'Gratitude', 'Manifestation'],
  },
  // The old "Nature connect" wrapper (sub: Sunlight/Breathwork/Star
  // sleeping) is dissolved — these were three independent items per the
  // PDF. Breathwork moved into Movement & Body Therapy above; Sunlight and
  // Star sleeping are promoted to their own top-level items here.
  { name: 'Daily Sunlight', categoryId: 'nature', icon: Sun, color: '#E8D24A', onColor: 'text-charcoal', disappear: { mode: 'auto', limit: 1 } },
  { name: 'Ocean Contact', categoryId: 'nature', icon: Waves, color: '#1D6FA5', onColor: 'text-white', disappear: { mode: 'manual' } },
  { name: 'Forest walk', categoryId: 'nature', icon: TreePine, color: '#2E5E3E', onColor: 'text-white', disappear: { mode: 'manual' } },
  { name: 'Star sleeping', categoryId: 'nature', icon: BedSingle, color: '#3B3B6D', onColor: 'text-white', disappear: { mode: 'manual' } },
  { name: 'Nursery visit', categoryId: 'nature', icon: Sprout, color: '#90AB86', onColor: 'text-charcoal', disappear: { mode: 'auto', limit: 1 } },
  { name: 'Gardening', categoryId: 'nature', icon: Trees, color: '#4C7A4C', onColor: 'text-white', disappear: { mode: 'auto', limit: 1 } },

  // --- Tile 8: Growth & Connection -----------------------------------------
  {
    name: 'Building & Rebuilding',
    categoryId: 'growth',
    icon: Headphones,
    color: '#2C5F9E',
    onColor: 'text-white',
    disappear: { mode: 'manual' },
    sub: ['Podcasts', 'Audiobook'],
  },
  { name: 'Human Connection', categoryId: 'growth', icon: Users, color: '#7B5CA5', onColor: 'text-white', disappear: { mode: 'manual' } },
  // Promoted from a "Gmeet / Zoom" sub-option to its own top-level item.
  { name: 'Therapy', categoryId: 'growth', icon: HandHeart, color: '#94AE30', onColor: 'text-charcoal', disappear: { mode: 'auto', limit: 1 } },
  // Promoted from "Gmeet / Zoom" -> "Coach".
  { name: 'Coaching', categoryId: 'growth', icon: GraduationCap, color: '#D54127', onColor: 'text-white', disappear: { mode: 'auto', limit: 1 } },
  { name: 'Homework', categoryId: 'growth', icon: Table2, color: '#5E7A4C', onColor: 'text-white', disappear: { mode: 'manual' } },
  { name: 'Image Generation', categoryId: 'growth', icon: Image, color: '#E8C23A', onColor: 'text-charcoal', disappear: { mode: 'auto', limit: 1 } },
  {
    name: 'Learning',
    categoryId: 'growth',
    icon: Lightbulb,
    color: '#B0348F',
    onColor: 'text-white',
    disappear: { mode: 'manual' },
    sub: ['New Skills', 'New competency', 'New capacity'],
  },

  // --- Tile 9: Home & Chores ------------------------------------------------
  {
    name: 'Mopping/Brooming',
    categoryId: 'home',
    icon: Sparkles,
    color: '#F2F0EA',
    onColor: 'text-charcoal',
    hairline: true,
    disappear: { mode: 'auto', limit: 1 },
  },
  { name: 'Study table clean', categoryId: 'home', icon: Table2, color: '#E986A1', onColor: 'text-charcoal', disappear: { mode: 'auto', limit: 1 } },
  // PDF: "Mixed Pastel color" — a flat solid stand-in, not a gradient.
  { name: 'Clothes maintenance', categoryId: 'home', icon: Zap, color: '#C9B8DE', onColor: 'text-charcoal', disappear: { mode: 'auto', limit: 1 } },
  { name: 'Star Bazar visit', categoryId: 'home', icon: ShoppingCart, color: '#EDE3D0', onColor: 'text-charcoal', disappear: { mode: 'manual' } },
  { name: 'Clean Toilets', categoryId: 'home', icon: Droplets, color: '#D8EEF0', onColor: 'text-charcoal', disappear: { mode: 'manual' } },
]

const CARDS_BY_NAME = new Map(ACTIVITY_CARDS.map((card) => [card.name, card]))

export function findCard(name: string): ActivityCard | undefined {
  return CARDS_BY_NAME.get(name)
}

/** The 5-7 items belonging to one tile, in on-screen order — never re-sorted. */
export function cardsForCategory(categoryId: CategoryId): ActivityCard[] {
  return ACTIVITY_CARDS.filter((card) => card.categoryId === categoryId)
}

export function categoryOf(name: string): Category {
  const card = findCard(name)
  if (!card && import.meta.env.DEV) {
    // The taxonomy is content the client keeps renaming (PRODUCT-HANDOFF §10),
    // and a rename that misses a call site would otherwise show up only as a
    // tile quietly wearing the wrong category colour. Dev-only: never a
    // user-facing failure, and the 'sleep' fallback still renders.
    console.warn(
      `[activities] Unknown activity "${name}" — no card by that name in ACTIVITY_CARDS. ` +
        `Falling back to the "Sleep & Rest" category colour. Check for a taxonomy rename.`,
    )
  }
  return CATEGORIES[card?.categoryId ?? 'sleep']
}

/**
 * The colour a real activity's timeline-strip segment fills with — the
 * item's own `color` (Tile Redesign §4), falling back to its tile's `light`
 * pastel only for a name with no current catalog entry (a stale/renamed
 * taxonomy reference — `categoryOf` above already logs that case in dev).
 */
export function itemFillColor(name: string | null): string {
  const card = findCard(name ?? '')
  return card?.color ?? categoryOf(name ?? '').light
}

/* ------------------------------------------------------------------ *
 * Flags — whole-slot markers. NOT timed activities, no duration, no capacity
 * cost. Behaviour is frozen this pass; only the presentation was resized.
 * ------------------------------------------------------------------ */

export interface FlagDefinition {
  id: FlagId
  /** Short caption shown under the icon on touch viewports. */
  shortLabel: string
  icon: LucideIcon
}

export const FLAGS: FlagDefinition[] = [
  { id: 'Trauma response', shortLabel: 'Trauma', icon: HeartCrack },
  { id: 'Stress response', shortLabel: 'Stress', icon: Zap },
  { id: 'Fear response', shortLabel: 'Fear', icon: AlertTriangle },
  // Appended, not reordered in among the existing three (Modal Redesign §E).
  { id: 'Anger response', shortLabel: 'Anger', icon: Angry },
]

/* ------------------------------------------------------------------ *
 * "How did it feel?" (Modal Redesign §D) — a single-select, optional
 * reflection on a logged activity. Icon choices are a judgement call (none
 * were prescribed) — flagged in the PR description, cheap to swap later.
 * ------------------------------------------------------------------ */

export interface QualityDefinition {
  id: ActivityQuality
  icon: LucideIcon
}

export const QUALITIES: QualityDefinition[] = [
  { id: 'Nourishing', icon: HeartPulse },
  { id: 'Productive', icon: TrendingUp },
  { id: 'Straining', icon: CloudRain },
  { id: 'Draining', icon: BatteryLow },
  { id: 'Dysregulated', icon: Shuffle },
]

/* ------------------------------------------------------------------ *
 * "Chronic Symptoms" — a multi-select, optional set of symptoms noticed
 * around a logged activity. Unlike quality/flags, any number of these can
 * be selected at once (see `ScheduledActivity.symptoms`). Icon choices are
 * a judgement call (none were prescribed), same as quality's — cheap to
 * swap later.
 * ------------------------------------------------------------------ */

export interface SymptomDefinition {
  id: Symptom
  icon: LucideIcon
}

export const SYMPTOMS: SymptomDefinition[] = [
  { id: 'Pitta', icon: Flame },
  { id: 'Inflammation', icon: Thermometer },
  { id: 'Right knee pain', icon: Bone },
  { id: 'Calves pain', icon: Footprints },
  { id: 'Temporal pain', icon: Brain },
  { id: 'Dryness', icon: Sun },
]
