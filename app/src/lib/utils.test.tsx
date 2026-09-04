import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { FONT_SIZE_KEYS, cn } from './utils'

/* ---------------------------------------------------------------------------
 * REGRESSION GUARD for the tailwind-merge class-group bug.
 *
 * `cn()` used a bare `twMerge()` with no config, so it did not know that this
 * project REPLACED Tailwind's type scale with named steps (`text-btn`,
 * `text-caption`, …). Those names fell into tailwind-merge's `text-color`
 * group, colliding with `text-white` / `text-gold` / `text-terracotta`, and the
 * loser was silently deleted from the class string.
 *
 * Every cva variant here writes colour before size, so colour always lost:
 * the primary CTA rendered charcoal-on-forest at ~1.08:1 contrast, and Edit and
 * Remove both rendered charcoal — indistinguishable from each other and from
 * body text. Where colour came second instead (the NOW badge, the flag
 * captions) the 10px size was the casualty.
 *
 * These tests assert the RENDERED class list, so they fail if the merge ever
 * starts eating one of the two again.
 * ------------------------------------------------------------------------- */

/** Class list of the outermost element in a rendered snippet. */
function classesOf(markup: string): string[] {
  return (markup.match(/class="([^"]*)"/)?.[1] ?? '').split(/\s+/).filter(Boolean)
}

describe('cn keeps a text colour and a text size together', () => {
  it('does not drop either half, in either order', () => {
    expect(cn('text-inv-ink', 'font-bold', 'text-btn').split(' ')).toEqual(
      expect.arrayContaining(['text-inv-ink', 'text-btn']),
    )
    expect(cn('text-nano', 'font-bold', 'text-ink-dim').split(' ')).toEqual(
      expect.arrayContaining(['text-nano', 'text-ink-dim']),
    )
  })

  it('still resolves genuine conflicts — last colour and last size win', () => {
    expect(cn('text-ink', 'text-ink-dim')).toBe('text-ink-dim')
    expect(cn('text-body', 'text-caption')).toBe('text-caption')
    expect(cn('text-ink text-body', 'text-ink-dim text-caption')).toBe(
      'text-ink-dim text-caption',
    )
  })

  it('registers every size in the Tailwind theme, so none can silently drift', async () => {
    const configUrl = new URL('../../../tailwind.config.js', import.meta.url).href
    const imported = (await import(/* @vite-ignore */ configUrl)) as {
      default: { theme: { fontSize: Record<string, unknown> } }
    }
    const themeKeys = Object.keys(imported.default.theme.fontSize).sort()
    expect([...FONT_SIZE_KEYS].sort()).toEqual(themeKeys)
  })
})

describe('cn keeps outline-style alongside outline-width', () => {
  /*
   * Second defect of the same family, found by auditing every call site rather
   * than only the reported ones. tailwind-merge 3.x defaults to Tailwind 4,
   * where bare `outline` is a WIDTH; this project builds with Tailwind 3.4,
   * where it is `outline-style: solid` and is what makes the ring paint at all.
   * Unfixed, the "In this slot" rows lost their focus-within ring entirely.
   */
  it('does not delete the bare `outline` that makes a ring paint', () => {
    expect(cn('outline outline-2 outline-offset-2 outline-ink').split(' ')).toEqual(
      expect.arrayContaining(['outline', 'outline-2', 'outline-offset-2', 'outline-ink']),
    )
    expect(cn('focus-within:outline focus-within:outline-2').split(' ')).toContain(
      'focus-within:outline',
    )
  })

  it('still lets a later width override an earlier one', () => {
    expect(cn('outline-2', 'outline-1.5')).toBe('outline-1.5')
  })
})

describe('the primary action button', () => {
  it('renders the theme-invert fill, at the button type size (monochrome retheme)', () => {
    const classes = classesOf(renderToStaticMarkup(<Button>Add to slot</Button>))
    // Both must survive. `text-inv-ink` on `bg-inv-bg` is the theme's own
    // guaranteed-contrast pair (near-black on near-white, or the reverse) —
    // no colour token is involved any more, but the same collision risk
    // (a colour-like utility ahead of a size utility) still applies to it.
    expect(classes).toContain('text-inv-ink')
    expect(classes).toContain('bg-inv-bg')
    expect(classes).toContain('text-btn')
    expect(classes).not.toContain('text-ink')
  })

  it('keeps Edit and Remove distinguishable — by weight now, not colour', () => {
    // No colour any more (Section A) — `accent` and `destructive` share the
    // same `text-ink-dim` resting tone and are distinguished by weight
    // (medium vs semibold) and, on hover, an underline. Still two genuinely
    // different class lists, just not via a hue difference.
    const edit = classesOf(renderToStaticMarkup(<Button variant="accent">Edit</Button>))
    const remove = classesOf(
      renderToStaticMarkup(<Button variant="destructive">Remove</Button>),
    )
    expect(edit).toContain('text-ink-dim')
    expect(edit).toContain('text-caption')
    expect(remove).toContain('text-ink-dim')
    expect(remove).toContain('text-caption')
    expect(edit).not.toEqual(remove)
  })

  it('keeps the ghost/Cancel action dim rather than untinted', () => {
    const ghost = classesOf(renderToStaticMarkup(<Button variant="ghost">Cancel</Button>))
    expect(ghost).toContain('text-ink-dim')
    expect(ghost).toContain('text-body')
  })
})

describe('the period navigator segments', () => {
  it('renders the focused segment with the theme-invert fill (monochrome retheme)', () => {
    const active = classesOf(
      renderToStaticMarkup(
        <Chip as="button" size="segment" tone="active" interactive>
          Day
        </Chip>,
      ),
    )
    expect(active).toContain('bg-inv-bg')
    expect(active).toContain('text-inv-ink')
    expect(active).toContain('text-body')

    const bare = classesOf(
      renderToStaticMarkup(
        <Chip as="button" size="segment" tone="bare" interactive>
          Night
        </Chip>,
      ),
    )
    expect(bare).toContain('text-ink')
    expect(bare).toContain('text-body')
  })
})
