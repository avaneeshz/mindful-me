import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge, validators } from 'tailwind-merge'

/* ---------------------------------------------------------------------------
 * FONT_SIZE_KEYS must mirror `theme.fontSize` in tailwind.config.js exactly.
 *
 * Why this exists: tailwind.config.js REPLACES Tailwind's default type scale
 * with named steps (`text-btn`, `text-caption`, …). tailwind-merge, given no
 * config, only recognises t-shirt sizes (`text-sm`, `text-lg`) as font sizes,
 * so every one of these named steps fell through to its `text-color` group —
 * the same group as `text-white`, `text-gold`, `text-terracotta`.
 *
 * Two classes in the same group means "conflict, last one wins", so any string
 * that declared colour before size silently lost the colour:
 *
 *     twMerge('text-white', 'font-bold', 'text-btn')  ->  'font-bold text-btn'
 *
 * That is exactly how every cva variant in this project is written, so the
 * primary button rendered charcoal-on-forest (~1.08:1), Edit/Remove lost their
 * Gold/Terracotta, and — in the strings where colour came second — the NOW
 * badge and the flag captions lost their 10px `text-nano` size instead.
 *
 * Registering the scale as font sizes separates the two groups, so a colour and
 * a size can coexist in one class string, which is the whole point.
 *
 * If a size is added to or renamed in tailwind.config.js, add it here too.
 * `fontSizeScaleIsRegistered` in lib/utils.test.ts fails loudly if this list
 * and the Tailwind theme ever drift apart.
 * ------------------------------------------------------------------------- */
export const FONT_SIZE_KEYS = [
  'h1',
  'h1-sm',
  'brand',
  'slot-time',
  'stepper',
  'entry-name',
  'btn',
  'body',
  'note',
  'meta',
  'caption',
  'caption-sm',
  'micro',
  'nano',
] as const

const twMerge = extendTailwindMerge({
  /* -------------------------------------------------------------------------
   * tailwind-merge 3.x ships defaults for Tailwind 4. This project is on
   * Tailwind 3.4, and the two disagree about what a bare `outline` means:
   *
   *   Tailwind 4 -> outline-width: 1px          (so it belongs to `outline-w`)
   *   Tailwind 3 -> outline-style: solid        (built CSS: `.outline{outline-style:solid}`)
   *
   * Left on the v4 default, `outline` and `outline-2` looked like two widths in
   * conflict and the bare one was deleted:
   *
   *     twMerge('outline outline-2 outline-offset-2 outline-forest')
   *       -> 'outline-2 outline-offset-2 outline-forest'
   *
   * With no `outline-style`, a browser's default `outline-style: none` wins and
   * the ring does not paint at all — which silently removed the focus-within
   * ring from the "In this slot" rows. Same class of defect as the type-scale
   * bug above: tailwind-merge configured for a different Tailwind than the one
   * actually building the CSS.
   *
   * NOTE for whoever upgrades to Tailwind 4: DELETE this override at that
   * point. Keeping it would then be the bug, in reverse.
   * ---------------------------------------------------------------------- */
  override: {
    classGroups: {
      'outline-style': [
        { outline: ['', 'solid', 'dashed', 'dotted', 'double', 'none', 'hidden'] },
      ],
      'outline-w': [
        {
          outline: [
            validators.isNumber,
            validators.isArbitraryVariableLength,
            validators.isArbitraryLength,
          ],
        },
      ],
    },
  },
  extend: {
    classGroups: {
      'font-size': [{ text: [...FONT_SIZE_KEYS] }],
    },
  },
})

/** shadcn/ui's standard class merger, taught this project's type scale. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
