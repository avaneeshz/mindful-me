import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ChecklistButton } from './ChecklistButton'
import { DEFAULT_HEADER_BUTTONS } from '@/domain/headerButtons'

const VIEWED_DATE = new Date(2026, 8, 13)
const SUPPLEMENTS_BUTTON = DEFAULT_HEADER_BUTTONS.find((b) => b.id === 'supplements')!

describe('ChecklistButton', () => {
  it('renders a real <button>, not an inert <span> — same interactive-trigger contract as every other header pill', () => {
    const html = renderToStaticMarkup(<ChecklistButton button={SUPPLEMENTS_BUTTON} viewedDate={VIEWED_DATE} />)
    expect(html).toMatch(/<button[^>]*>/)
    expect(html).toContain('Supplements')
  })

  it('names itself for assistive tech, with the real done/total count, and starts closed', () => {
    const html = renderToStaticMarkup(<ChecklistButton button={SUPPLEMENTS_BUTTON} viewedDate={VIEWED_DATE} />)
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toContain('aria-expanded="false"')
    // Local-only (no backend configured in tests): nothing has been touched
    // yet for this day, so every one of the 7 configured items renders unchecked.
    expect(html).toContain('aria-label="Supplements, 0 of 7 taken"')
  })

  it('shows no checklist, checkbox, or note field at all while closed', () => {
    const html = renderToStaticMarkup(<ChecklistButton button={SUPPLEMENTS_BUTTON} viewedDate={VIEWED_DATE} />)
    expect(html).not.toContain('role="dialog"')
    expect(html).not.toContain('role="checkbox"')
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain('Zinc')
  })

  it('is focusable and keyboard-operable like every other real button (no explicit tabIndex override)', () => {
    const html = renderToStaticMarkup(<ChecklistButton button={SUPPLEMENTS_BUTTON} viewedDate={VIEWED_DATE} />)
    expect(html).not.toContain('tabindex="-1"')
  })

  it('never shows the raw N/7 fraction on the trigger face — a score to chase reads as anxious, not a glance-and-go status', () => {
    const html = renderToStaticMarkup(<ChecklistButton button={SUPPLEMENTS_BUTTON} viewedDate={VIEWED_DATE} />)
    expect(html).not.toContain('/7')
    expect(html).not.toMatch(/>\s*0\s*<\/span>/)
  })

  it('shows no tick below the "mostly done" threshold — a fresh local-only render starts at 0', () => {
    const html = renderToStaticMarkup(<ChecklistButton button={SUPPLEMENTS_BUTTON} viewedDate={VIEWED_DATE} />)
    const triggerButton = html.match(/<button[^>]*aria-haspopup="dialog"[^>]*>.*?<\/button>/s)?.[0] ?? ''
    expect(triggerButton).toContain('Supplements')
    expect(triggerButton).not.toContain('<svg')
    // The exact count still reaches assistive tech even though it is no
    // longer painted on the face.
    expect(html).toContain('aria-label="Supplements, 0 of 7 taken"')
  })

  it('names itself correctly (0 of 0) for a checklist with no configured items', () => {
    const emptyButton = { ...SUPPLEMENTS_BUTTON, id: 'empty-checklist', checklistItems: [] }
    const html = renderToStaticMarkup(<ChecklistButton button={emptyButton} viewedDate={VIEWED_DATE} />)
    expect(html).toContain(`aria-label="${emptyButton.label}, 0 of 0 taken"`)
  })
})
