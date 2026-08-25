import { describe, expect, it } from 'vitest'
// @ts-expect-error - tailwind.config.js is a plain JS config file with no type declarations.
import tailwindConfig from '../../../../tailwind.config.js'
import { buttonVariants } from './button'

/**
 * Bug: `size="control"` applies `h-control`, documented as "44px — the
 * standard touch target height" — but `control` was declared only under
 * `theme.extend.minHeight` / `theme.extend.width` in tailwind.config.js, never
 * under `theme.extend.height`. Tailwind therefore had no rule for `h-control`
 * at all, so it resolved to `height: 0`; the Confirm/Cancel buttons in
 * StagingPane measured 16-18px tall (padding only) instead of 44px.
 *
 * The test setup runs in the `node` environment (no jsdom/browser, see
 * vitest.config.ts) so there is no layout engine to assert a computed pixel
 * height against. This asserts at the level that setup supports: the design
 * token `h-control` compiles against actually exists, and stays in lockstep
 * with the `minHeight`/`width` tokens of the same name it was missing beside.
 */
describe('the `control` height token behind size="control" buttons', () => {
  it('is declared under theme.extend.height, matching minHeight and width', () => {
    const extend = (tailwindConfig as { theme: { extend: Record<string, Record<string, string>> } })
      .theme.extend
    expect(extend.height.control).toBe('44px')
    expect(extend.minHeight.control).toBe('44px')
    expect(extend.width.control).toBe('44px')
  })

  it('size="control" still applies the h-control class the token now backs', () => {
    expect(buttonVariants({ size: 'control' })).toContain('h-control')
    // The default size, used by StagingPane's "Add to slot" / mobile sticky
    // primary action without an explicit `size` prop.
    expect(buttonVariants({})).toContain('h-control')
  })
})
