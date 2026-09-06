import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NoteButtonPill } from './NoteButtonPill'

describe('NoteButtonPill', () => {
  it('renders a real <button>, not an inert <span> — the pill is now genuinely interactive', () => {
    const html = renderToStaticMarkup(<NoteButtonPill buttonKey="mirror" label="Mirror" />)
    expect(html).toMatch(/<button[^>]*>\s*Mirror\s*<\/button>/)
    expect(html).not.toContain('<span')
  })

  it('names itself for assistive tech and starts closed', () => {
    const html = renderToStaticMarkup(<NoteButtonPill buttonKey="prayer" label="Prayer" />)
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-label="Prayer notes"')
    // The popover (textarea, Store button, history) isn't in the tree at all while closed.
    expect(html).not.toContain('role="dialog"')
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain('Store')
    // Gifts' gift-type picker (a chip radiogroup, not a <select>) is inside
    // that same closed popover, so none of it leaks either.
    expect(html).not.toContain('<select')
    expect(html).not.toContain('role="radiogroup"')
    expect(html).not.toContain('Gift type')
  })

  it('is focusable and keyboard-operable like every other real button (no explicit tabIndex override)', () => {
    const html = renderToStaticMarkup(<NoteButtonPill buttonKey="gifts" label="Gifts" />)
    expect(html).not.toContain('tabindex="-1"')
  })

  it('renders its own given label, whichever of the 6 buttons it is', () => {
    for (const [key, label] of [
      ['gifts', 'Gifts'],
      ['chits', 'Chits'],
      ['opportunities', 'Opportunities'],
      ['learnings', 'Learnings'],
      ['mirror', 'Mirror'],
      ['prayer', 'Prayer'],
    ] as const) {
      const html = renderToStaticMarkup(<NoteButtonPill buttonKey={key} label={label} />)
      expect(html).toContain(label)
    }
  })
})
