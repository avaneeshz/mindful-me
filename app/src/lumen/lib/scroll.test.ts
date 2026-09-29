import { afterEach, describe, expect, it, vi } from 'vitest'
import { scrollLumenViewToTop } from './scroll'

describe('scrollLumenViewToTop', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('does not expose the browser scroll method result as an effect cleanup', () => {
    const unexpectedCleanup = vi.fn()
    const scrollTo = vi.fn(() => unexpectedCleanup)
    vi.stubGlobal('window', { scrollTo })

    expect(scrollLumenViewToTop()).toBeUndefined()
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 })
    expect(unexpectedCleanup).not.toHaveBeenCalled()
  })
})