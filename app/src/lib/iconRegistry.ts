import {
  Activity,
  Bath,
  BatteryLow,
  BatteryCharging,
  BedDouble,
  BedSingle,
  Bone,
  Brain,
  Briefcase,
  Building2,
  CircleDashed,
  CircleSlash,
  Coffee,
  Droplet,
  Droplets,
  Dumbbell,
  EyeOff,
  Flame,
  Flower2,
  Footprints,
  FlaskConical,
  GraduationCap,
  Hand,
  HandHeart,
  HeartHandshake,
  HeartPulse,
  Headphones,
  HelpCircle,
  Home,
  Image,
  Leaf,
  Lightbulb,
  Magnet,
  Moon,
  PenLine,
  Pill,
  Repeat,
  Rocket,
  Scissors,
  Shield,
  ShieldPlus,
  ShoppingCart,
  Shuffle,
  Snowflake,
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

/**
 * The catalog-customization icon set — every Lucide icon `data/activities.ts`
 * already uses for the 9 system tiles and 53 system cards, keyed by the exact
 * `icon_key` strings the catalog migrations already seed into
 * `public.activities.icon_key`/`public.catalog_categories.icon_key` (see
 * `supabase/migrations/20260829090000_fix_activities_category_and_reseed.sql`).
 * This is the ONE registry a DB row's `icon_key` resolves through at read
 * time, and the ONE list the Configuration screen's icon picker offers for a
 * newly-added tile/card/sub/third — deliberately a closed set (no arbitrary
 * icon name from the DB is ever trusted directly as a component lookup),
 * reusing icons the product already renders elsewhere rather than growing a
 * second, parallel icon vocabulary.
 */
export const ICON_REGISTRY: Record<string, LucideIcon> = {
  Activity,
  Bath,
  BatteryLow,
  BatteryCharging,
  BedDouble,
  BedSingle,
  Bone,
  Brain,
  Briefcase,
  Building2,
  CircleDashed,
  CircleSlash,
  Coffee,
  Droplet,
  Droplets,
  Dumbbell,
  EyeOff,
  Flame,
  Flower2,
  Footprints,
  FlaskConical,
  GraduationCap,
  Hand,
  HandHeart,
  HeartHandshake,
  HeartPulse,
  Headphones,
  HelpCircle,
  Home,
  Image,
  Leaf,
  Lightbulb,
  Magnet,
  Moon,
  PenLine,
  Pill,
  Repeat,
  Rocket,
  Scissors,
  Shield,
  ShieldPlus,
  ShoppingCart,
  Shuffle,
  Snowflake,
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
  Tv,
  Users,
  Utensils,
  Video,
  Waves,
  Wind,
  Youtube,
  Zap,
}

/** Every valid `icon_key`, alphabetical — what the Configuration screen's icon picker offers. */
export const ICON_KEYS: string[] = Object.keys(ICON_REGISTRY).sort((a, b) => a.localeCompare(b))

const REVERSE_REGISTRY = new Map<LucideIcon, string>(
  Object.entries(ICON_REGISTRY).map(([key, icon]) => [icon, key]),
)

/** A DB `icon_key` -> the component to render. Falls back to a generic glyph for an unknown key. */
export function iconForKey(key: string | null | undefined): LucideIcon {
  if (!key) return HelpCircle
  return ICON_REGISTRY[key] ?? HelpCircle
}

/** The reverse lookup — the `icon_key` a system-catalog icon COMPONENT already renders as. */
export function keyForIcon(icon: LucideIcon): string {
  return REVERSE_REGISTRY.get(icon) ?? 'HelpCircle'
}
