import {
  AlertTriangle,
  BedDouble,
  BookOpen,
  Car,
  Droplet,
  Flower2,
  Footprints,
  Headphones,
  HeartCrack,
  HeartHandshake,
  Home,
  Leaf,
  Moon,
  Palette,
  PenLine,
  Pill,
  Rocket,
  Shirt,
  ShoppingCart,
  ShowerHead,
  Sparkles,
  Sprout,
  Target,
  Timer,
  Tv,
  Users,
  Utensils,
  Video,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { ActivityCard, Category, CategoryId, FlagId } from '@/domain/types'

/* ------------------------------------------------------------------ *
 * Categories.
 *
 * `onDeep` is the foreground used on the DEEP fill (picker tiles / icon
 * chips). It is picked by measured WCAG contrast, not by eye:
 *
 *   mind   #6B8F82 — white 3.52:1 | charcoal 3.21:1  -> white + boost
 *   body   #C9B48A — white 2.02:1 | charcoal 5.60:1  -> charcoal
 *   sports #E8845C — white 2.66:1 | charcoal 4.25:1  -> charcoal
 *   nature #4F7D6C — white 4.69:1 | charcoal 2.28:1  -> white
 *   focus  #1B3B32 — white 12.2:1                    -> white
 *
 * See the engineering report: the spec named only Body & Domestic as the
 * charcoal exception, but Sports or Exercise measures worse on white than on
 * charcoal, and Mind & Rest cannot reach 4.5:1 with either foreground.
 *
 * MIND & REST IS A LIVE AA FAILURE. Both candidates were recomputed rather
 * than assumed; white (3.52:1) beats charcoal (3.21:1) but still misses the
 * 4.5:1 minimum for text. `onDeepBoost` applies the documented
 * `.label-contrast-boost` mitigation to the label text as a stopgap. The
 * durable fix is a design-level re-tone of --cat-mind-deep, which is a brand
 * colour decision and is deliberately NOT made here.
 * ------------------------------------------------------------------ */

export const CATEGORIES: Record<CategoryId, Category> = {
  mind: {
    id: 'mind',
    label: 'Mind & Rest',
    deep: 'var(--cat-mind-deep)',
    light: 'var(--cat-mind-light)',
    onDeep: 'text-white',
    onDeepBoost: 'label-contrast-boost',
    icon: Moon,
  },
  body: {
    id: 'body',
    label: 'Body & Domestic',
    deep: 'var(--cat-body-deep)',
    light: 'var(--cat-body-light)',
    onDeep: 'text-charcoal',
    icon: Home,
  },
  sports: {
    id: 'sports',
    label: 'Sports or Exercise',
    deep: 'var(--cat-sports-deep)',
    light: 'var(--cat-sports-light)',
    onDeep: 'text-charcoal',
    icon: Footprints,
  },
  nature: {
    id: 'nature',
    label: 'Nature & Connection',
    deep: 'var(--cat-nature-deep)',
    light: 'var(--cat-nature-light)',
    onDeep: 'text-white',
    icon: Leaf,
  },
  focus: {
    id: 'focus',
    label: 'Focus & Growth',
    deep: 'var(--cat-focus-deep)',
    light: 'var(--cat-focus-light)',
    onDeep: 'text-white',
    icon: Target,
  },
}

/* ------------------------------------------------------------------ *
 * The authoritative 24-card taxonomy, in on-screen order, ported 1:1 from
 * the prototype's CARDS array. This is CONTENT DATA — the client is expected
 * to keep iterating on it, so it must never be hardcoded into components.
 * ------------------------------------------------------------------ */

export const ACTIVITY_CARDS: ActivityCard[] = [
  { name: 'Night Sleep', categoryId: 'mind', icon: Moon },
  { name: 'Day Sleep', categoryId: 'mind', icon: BedDouble },
  { name: 'Brushing + Shower', categoryId: 'body', icon: ShowerHead },
  { name: 'Clothes maintenance', categoryId: 'body', icon: Shirt },
  { name: 'Writing — author journey', categoryId: 'focus', icon: PenLine },
  { name: 'Image generation', categoryId: 'focus', icon: Palette },
  { name: 'Homework', categoryId: 'focus', icon: BookOpen },
  { name: 'Meal Prep', categoryId: 'body', icon: Utensils },
  { name: 'Nursery visit', categoryId: 'body', icon: Sprout },
  { name: 'Star Bazar visit', categoryId: 'body', icon: ShoppingCart },
  { name: 'Vipassana', categoryId: 'mind', icon: Flower2 },
  {
    name: 'Nature connect',
    categoryId: 'nature',
    icon: Leaf,
    sub: ['Sunlight', 'Breathwork', 'Star sleeping'],
  },
  {
    name: 'Sports or Exercise',
    categoryId: 'sports',
    icon: Footprints,
    sub: ['Dance', 'Skipping', 'Running', 'HIIT', 'Suryanamaskar', 'Moonnamaskar'],
  },
  { name: 'YouTube watching', categoryId: 'mind', icon: Tv },
  { name: 'Human connection', categoryId: 'nature', icon: Users },
  { name: 'GEOM / HOSS / HECOLL', categoryId: 'focus', icon: Rocket },
  {
    name: 'Spiritual Care',
    categoryId: 'nature',
    icon: HeartHandshake,
    sub: ['Singing time / worship time', 'Bible reading', 'Prayer'],
  },
  {
    name: 'Building & Rebuilding',
    categoryId: 'focus',
    icon: Headphones,
    sub: ['Podcasts', 'Audiobook'],
  },
  { name: 'Errand time', categoryId: 'body', icon: Car },
  {
    name: 'Pomodoro Break',
    categoryId: 'mind',
    icon: Timer,
    sub: ['Eating leaves', 'CCTV Control Station', 'Stretching', 'Humor content'],
  },
  {
    // The only 3-level card: Body care -> Massage/Oiling/Mask -> Face/Body/Hair.
    name: 'Body care',
    categoryId: 'body',
    icon: Droplet,
    sub: ['Massage', 'Oiling', 'Mask'],
    third: {
      Massage: ['Face', 'Body', 'Hair'],
      Oiling: ['Face', 'Body', 'Hair'],
      Mask: ['Face', 'Body', 'Hair'],
    },
  },
  {
    name: 'Supplements',
    categoryId: 'mind',
    icon: Pill,
    sub: ['Omega', 'Magnesium', 'Zinc'],
  },
  {
    name: 'Gmeet / Zoom',
    categoryId: 'focus',
    icon: Video,
    sub: ['Coach', 'Therapist', 'Cofounder', 'Personal Board of Director'],
  },
  { name: 'Miscellaneous', categoryId: 'body', icon: Sparkles },
]

const CARDS_BY_NAME = new Map(ACTIVITY_CARDS.map((card) => [card.name, card]))

export function findCard(name: string): ActivityCard | undefined {
  return CARDS_BY_NAME.get(name)
}

export function categoryOf(name: string): Category {
  const card = findCard(name)
  if (!card && import.meta.env.DEV) {
    // The taxonomy is content the client keeps renaming (PRODUCT-HANDOFF §10),
    // and a rename that misses a call site would otherwise show up only as a
    // tile quietly wearing the wrong category colour. Dev-only: never a
    // user-facing failure, and the 'mind' fallback still renders.
    console.warn(
      `[activities] Unknown activity "${name}" — no card by that name in ACTIVITY_CARDS. ` +
        `Falling back to the "Mind & Rest" category colour. Check for a taxonomy rename.`,
    )
  }
  return CATEGORIES[card?.categoryId ?? 'mind']
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
]
