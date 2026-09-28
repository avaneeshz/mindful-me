/** Semantic hues for interface icons and stats — never activities, which use the pastel palette (palette.ts). */
export type Hue = 'accent' | 'sky' | 'mint' | 'sun'

/** Static class strings per hue so Tailwind can see them. */
export const hueStyles: Record<Hue, { icon: string; bubble: string; bar: string; ring: string }> = {
  accent: { icon: 'text-accent-ink', bubble: 'bg-accent/15', bar: 'bg-accent-ink', ring: 'ring-accent-ink/40' },
  sky: { icon: 'text-sky', bubble: 'bg-sky/[0.12]', bar: 'bg-sky', ring: 'ring-sky/40' },
  mint: { icon: 'text-mint', bubble: 'bg-mint/[0.12]', bar: 'bg-mint', ring: 'ring-mint/40' },
  sun: { icon: 'text-sun', bubble: 'bg-sun/[0.12]', bar: 'bg-sun', ring: 'ring-sun/40' },
}
