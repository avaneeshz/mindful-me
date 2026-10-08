import {
  Activity,
  Bath,
  Bed,
  BedSingle,
  Briefcase,
  Building2,
  Church,
  CircleDashed,
  Coffee,
  Droplet,
  Droplets,
  Dumbbell,
  FlaskConical,
  Flower2,
  Footprints,
  GraduationCap,
  Hand,
  HandHeart,
  Headphones,
  HeartHandshake,
  Home,
  Image,
  Leaf,
  Lightbulb,
  Moon,
  MonitorPlay,
  Music4,
  PenLine,
  Pill,
  Rocket,
  Scissors,
  ShieldPlus,
  ShoppingCart,
  Soup,
  Sparkle,
  Sparkles,
  Sprout,
  Sun,
  Syringe,
  Table2,
  Timer,
  TrainFront,
  TreePine,
  Trees,
  Tv,
  Users,
  Utensils,
  Video,
  Waves,
  Wind,
  Zap,
  type LucideIcon,
  Circle,
  type LucideProps,
} from 'lucide-react'
import { createElement, forwardRef, useSyncExternalStore } from 'react'
import { customIconIdFromKey } from '@/domain/customIcons'

/**
 * Every icon a real `icon_key` (`public.tiles`/`public.activities`) can
 * legitimately resolve to — the exact vocabulary the current default tile
 * set (9 icons) and the full 53-item legacy activity catalog (verified live
 * against the test project's `activities.icon_key` column — 46 distinct
 * values there) already use, so `provision_default_activities()`/
 * `provision_default_tiles()`'s copied `icon_key`s always render their
 * real, intended icon in the live picker instead of a generic circle stand-
 * in (found in review: the original ~22-icon curated set only covered a
 * fraction of the legacy catalog's real icons — a visible downgrade for
 * most of a newly-provisioned user's activities). This is deliberately NOT
 * an arbitrary/random expansion (CLAUDE.md's own bar) — it's exactly the
 * app's own existing, already-shipped icon usage, nothing invented.
 *
 * `Youtube` is a special case: the DB's legacy `icon_key` for "Entertainment
 * (YouTube)" is literally the string `'Youtube'`, but the brand glyph
 * doesn't exist in the installed lucide-react version (confirmed:
 * `lucide-react`'s own export list has no `Youtube` — see
 * `data/activities.ts`'s matching top-of-file note for why the STATIC card
 * uses `MonitorPlay` instead). Mapped to that same `MonitorPlay` equivalent
 * here too, rather than falling back to a bare circle for it specifically.
 *
 * `ICON_CHOICES` (the Activity Library editor's own icon PICKER for a new
 * tile/activity) uses this exact same set — not a further-curated subset —
 * since it's already the app's real, intentional icon vocabulary rather
 * than an open-ended library browse.
 */
const ICON_MAP: Record<string, LucideIcon> = {
  Activity,
  Bath,
  Bed,
  BedSingle,
  Briefcase,
  Building2,
  Church,
  CircleDashed,
  Coffee,
  Droplet,
  Droplets,
  Dumbbell,
  FlaskConical,
  Flower2,
  Footprints,
  GraduationCap,
  Hand,
  HandHeart,
  Headphones,
  HeartHandshake,
  Home,
  Image,
  Leaf,
  Lightbulb,
  Moon,
  Music4,
  PenLine,
  Pill,
  Rocket,
  Scissors,
  ShieldPlus,
  ShoppingCart,
  Soup,
  Sparkle,
  Sparkles,
  Sprout,
  Sun,
  Syringe,
  Table2,
  Timer,
  TrainFront,
  TreePine,
  Trees,
  Tv,
  Users,
  Utensils,
  Video,
  Waves,
  Wind,
  Zap,
  MonitorPlay,
}

/**
 * Legacy `icon_key` VALUES with no lucide-react component of their own —
 * resolved to an existing map entry, never offered as a separate choice in
 * `ICON_CHOICES` (a new tile/activity picks `MonitorPlay` directly instead).
 */
const LEGACY_ICON_ALIASES: Record<string, keyof typeof ICON_MAP> = {
  Youtube: 'MonitorPlay',
}

export const ICON_CHOICES: { key: string; icon: LucideIcon }[] = Object.entries(ICON_MAP)
  .map(([key, icon]) => ({ key, icon }))
  .sort((a, b) => a.key.localeCompare(b.key))

/** Any `icon_key` string -> a renderable icon, defaulting to a plain circle for one genuinely outside this vocabulary (never a broken/missing icon). */
export function resolveIcon(iconKey: string | null | undefined): LucideIcon {
  if (!iconKey) return Circle
  const customId = customIconIdFromKey(iconKey)
  if (customId) return customIconComponent(customId)
  const resolvedKey = LEGACY_ICON_ALIASES[iconKey] ?? iconKey
  return ICON_MAP[resolvedKey] ?? Circle
}

/* ——— Uploaded icons (#15) ———
 * `icon_key` 'custom:<id>' resolves to a component that paints the stored
 * silhouette as a CSS mask filled with `currentColor`, so it takes the same
 * ink colour as every Lucide icon around it, in both themes. The images
 * themselves arrive asynchronously (`state/useCustomIcons.ts` feeds them in
 * via `setCustomIcons`), so each component subscribes to this small store
 * and shows the plain circle until its image is known.
 */
let customIconImages: ReadonlyMap<string, string> = new Map()
const customIconListeners = new Set<() => void>()

export function setCustomIcons(icons: readonly { id: string; imageData: string }[]): void {
  customIconImages = new Map(icons.map((icon) => [icon.id, icon.imageData]))
  customIconListeners.forEach((listener) => listener())
}

function subscribeCustomIcons(listener: () => void): () => void {
  customIconListeners.add(listener)
  return () => customIconListeners.delete(listener)
}

const customIconComponents = new Map<string, LucideIcon>()

function customIconComponent(id: string): LucideIcon {
  const existing = customIconComponents.get(id)
  if (existing) return existing
  const Component = forwardRef<SVGSVGElement, LucideProps>(function CustomIcon({ className, style }, _ref) {
    const src = useSyncExternalStore(subscribeCustomIcons, () => customIconImages.get(id) ?? null, () => null)
    if (!src) return createElement(Circle, { className, style, 'aria-hidden': true })
    const mask = `url("${src}") center / contain no-repeat`
    return createElement('span', {
      'aria-hidden': true,
      'data-custom-icon': id,
      className: ['inline-block shrink-0', className].filter(Boolean).join(' '),
      style: { ...style, backgroundColor: 'currentColor', mask, WebkitMask: mask },
    })
  })
  Component.displayName = `CustomIcon(${id})`
  customIconComponents.set(id, Component as unknown as LucideIcon)
  return Component as unknown as LucideIcon
}
