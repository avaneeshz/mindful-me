import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HeaderPopup } from '@/components/ui/HeaderPopup'

describe('HeaderPopup', () => {
  const html = renderToStaticMarkup(
    <HeaderPopup aria-label="Learnings notes" onClose={() => {}}>
      <p>content</p>
    </HeaderPopup>,
  )

  it('is a labelled dialog holding its content', () => {
    expect(html).toMatch(/<div role="dialog" aria-label="Learnings notes"/)
    expect(html).toContain('<p>content</p>')
  })

  it('fills 80% of the width (10% margins) and the height less a margin, scrolling inside itself', () => {
    const panel = html.match(/<div role="dialog"[^>]*class="([^"]*)"/)?.[1] ?? ''
    expect(panel).toContain('w-[80vw]')
    expect(panel).toContain('max-h-[calc(100dvh-96px)]')
    expect(panel).toContain('overflow-y-auto')
  })

  it('uses nearly the whole screen on a phone', () => {
    const panel = html.match(/<div role="dialog"[^>]*class="([^"]*)"/)?.[1] ?? ''
    expect(panel).toContain('mobile:w-[calc(100vw-16px)]')
  })

  it('puts a dimmed backdrop behind it', () => {
    expect(html).toMatch(/<div aria-hidden="true" class="[^"]*fixed inset-0[^"]*bg-black\/40/)
  })
})
