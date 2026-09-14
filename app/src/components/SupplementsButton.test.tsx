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

  it('never shows the raw N/7 fraction on the trigger face — a score to chase reads as anxious, not a glance-and-go status', () => {
    const html = renderToStaticMarkup(<SupplementsButton viewedDate={VIEWED_DATE} />)
    expect(html).not.toContain('/7')
    expect(html).not.toMatch(/>\s*0\s*<\/span>/)
  })

  it('shows no tick below the "mostly done" (>= 3 of 7) threshold — a fresh local-only render starts at 0', () => {
    const html = renderToStaticMarkup(<SupplementsButton viewedDate={VIEWED_DATE} />)
    // Only the trigger's own label wraps a <span> at 0 taken; no second
    // icon/mark sits beside it (the tick only appears once doneCount >= 3 —
    // there is no way to seed that count without a backend in this pure
    // SSR-string test, so this asserts the below-threshold half of the rule;
    // the >= 3 half is exercised by hand/in the running app).
    const triggerButton = html.match(/<button[^>]*aria-haspopup="dialog"[^>]*>.*?<\/button>/s)?.[0] ?? ''
    expect(triggerButton).toContain('Supplements')
    expect(triggerButton).not.toContain('<svg')
    // The exact count still reaches assistive tech even though it is no
    // longer painted on the face.
    expect(html).toContain('aria-label="Supplements, 0 of 7 taken"')
  })
})
