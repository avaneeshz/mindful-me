import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SupplementsButton } from './SupplementsButton'

const VIEWED_DATE = new Date(2026, 8, 13)

describe('SupplementsButton', () => {
  it('renders a real <button>, not an inert <span> — same interactive-trigger contract as every other header pill', () => {
    const html = renderToStaticMarkup(<SupplementsButton viewedDate={VIEWED_DATE} />)
    expect(html).toMatch(/<button[^>]*>/)
    expect(html).toContain('Supplements')
  })

  it('names itself for assistive tech, with the real done/total count, and starts closed', () => {
    const html = renderToStaticMarkup(<SupplementsButton viewedDate={VIEWED_DATE} />)
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toContain('aria-expanded="false"')
    // Local-only (no backend configured in tests): nothing has been touched
    // yet for this day, so every one of the 7 items renders unchecked.
    expect(html).toContain('aria-label="Supplements, 0 of 7 taken"')
  })

  it('shows no checklist, checkbox, or note field at all while closed', () => {
    const html = renderToStaticMarkup(<SupplementsButton viewedDate={VIEWED_DATE} />)
    expect(html).not.toContain('role="dialog"')
    expect(html).not.toContain('role="checkbox"')
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain('Zinc')
  })

  it('is focusable and keyboard-operable like every other real button (no explicit tabIndex override)', () => {
    const html = renderToStaticMarkup(<SupplementsButton viewedDate={VIEWED_DATE} />)
    expect(html).not.toContain('tabindex="-1"')
  })
})
