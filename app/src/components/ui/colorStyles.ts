import type { CSSProperties } from 'react'

/**
 * The one treatment a user-chosen colour gets on a tile or activity card: a
 * soft wash of the colour over the page background with a matching border,
 * so labels keep the theme's own `ink` contrast in light and dark mode.
 * `null` returns no style at all — the uncoloured monochrome default.
 * Pass `border: false` while the element shows its own ink selection ring.
 */
export function colorTintStyle(color: string | null, { border = true }: { border?: boolean } = {}): CSSProperties | undefined {
  if (!color) return undefined
  return {
    background: `color-mix(in srgb, ${color} 18%, var(--bg))`,
    ...(border ? { borderColor: `color-mix(in srgb, ${color} 60%, var(--line))`, borderStyle: 'solid' } : {}),
  }
}
