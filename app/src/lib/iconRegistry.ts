import {
  Book,
  Briefcase,
  Camera,
  Circle,
  Coffee,
  Droplet,
  Dumbbell,
  Flower2,
  Footprints,
  Heart,
  Home,
  Leaf,
  Moon,
  Music4,
  Palette,
  PenLine,
  Rocket,
  Sparkles,
  Star,
  Sun,
  Tv,
  Users,
  Utensils,
  type LucideIcon,
} from 'lucide-react'

/**
 * A small, curated icon set for user-created tiles/activities in the
 * Activity Library editor (PICKER-CUSTOM-1) — CLAUDE.md's "no random
 * colours" spirit applied to icon choice too: rather than exposing Lucide's
 * full ~1500-icon library as a picker, this offers the same handful of
 * icons the default catalog already uses (see `provision_default_tiles()`'s
 * seed) plus a few generic extras, so a new tile/activity's icon always
 * reads as intentional, not random. `resolveIcon` falls back to a plain
 * circle for any `icon_key` outside this set (a legacy/seeded value this
 * curated list doesn't happen to include, e.g. one of the 53 catalog items'
 * more specific icons) — never a missing/broken icon.
 */
export const ICON_CHOICES: { key: string; icon: LucideIcon }[] = [
  { key: 'Moon', icon: Moon },
  { key: 'Sun', icon: Sun },
  { key: 'Utensils', icon: Utensils },
  { key: 'Droplet', icon: Droplet },
  { key: 'Tv', icon: Tv },
  { key: 'Footprints', icon: Footprints },
  { key: 'Rocket', icon: Rocket },
  { key: 'Leaf', icon: Leaf },
  { key: 'Sparkles', icon: Sparkles },
  { key: 'Home', icon: Home },
  { key: 'Heart', icon: Heart },
  { key: 'Star', icon: Star },
  { key: 'Book', icon: Book },
  { key: 'Music4', icon: Music4 },
  { key: 'Coffee', icon: Coffee },
  { key: 'Dumbbell', icon: Dumbbell },
  { key: 'Briefcase', icon: Briefcase },
  { key: 'Users', icon: Users },
  { key: 'Camera', icon: Camera },
  { key: 'Palette', icon: Palette },
  { key: 'Flower2', icon: Flower2 },
  { key: 'PenLine', icon: PenLine },
]

const ICON_MAP = new Map(ICON_CHOICES.map((c) => [c.key, c.icon]))

/** Any `icon_key` string -> a renderable icon, defaulting to a plain circle for one outside the curated set (never a broken/missing icon). */
export function resolveIcon(iconKey: string | null | undefined): LucideIcon {
  return (iconKey && ICON_MAP.get(iconKey)) || Circle
}
