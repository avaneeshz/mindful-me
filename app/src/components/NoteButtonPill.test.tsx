import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NoteButtonPill } from './NoteButtonPill'

// The Recent/History split itself (entries today only, entries before-today
// only, a mix, and none at all) is exercised directly against the pure
// `partitionNoteEntriesByToday` in `domain/notes.test.ts` — this suite runs
// under a plain Node environment with no jsdom/testing-library (see
// `vitest.config.ts`), so `renderToStaticMarkup` can only ever render this
// component's initial (closed) state; there is no way to drive `open` to
// `true` from here to assert on the popover's live contents.
describe('NoteButtonPill', () => {
  it('renders a real <button>, not an inert <span> — the pill is now genuinely interactive', () => {
    const html = renderToStaticMarkup(<NoteButtonPill buttonKey="mirror" label="Mirror" />)
    expect(html).toMatch(/<button[^>]*>\s*Mirror\s*<\/button>/)
    expect(html).not.toContain('<span')
  })

  it('names itself for assistive tech and starts closed', () => {
    const html = renderToStaticMarkup(<NoteButtonPill buttonKey="scriptures" label="Scriptures" />)
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-label="Scriptures notes"')
    // The popover (textarea, Store button, history) isn't in the tree at all while closed.
    expect(html).not.toContain('role="dialog"')
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain('Store')
    // The type picker (a chip radiogroup, not a <select>) is inside that same
    // closed popover, so none of it leaks either.
    expect(html).not.toContain('<select')
    expect(html).not.toContain('role="radiogroup"')
  })

  it('leaks no history edit/remove controls while closed', () => {
    const html = renderToStaticMarkup(<NoteButtonPill buttonKey="scriptures" label="Scriptures" />)
    expect(html).not.toContain('role="region"')
    expect(html).not.toContain('>History<')
    expect(html).not.toContain('>Edit<')
    expect(html).not.toContain('>Remove<')
    expect(html).not.toContain('>Save<')
  })

  it('leaks no Recent/History section content at all while closed', () => {
    const html = renderToStaticMarkup(<NoteButtonPill buttonKey="prayer" label="Prayer" />)
    expect(html).not.toContain('>Recent<')
    expect(html).not.toContain('No notes yet today')
    expect(html).not.toContain('No earlier notes yet')
  })

  it('is focusable and keyboard-operable like every other real button (no explicit tabIndex override)', () => {
    const html = renderToStaticMarkup(<NoteButtonPill buttonKey="gifts" label="Gifts" />)
    expect(html).not.toContain('tabindex="-1"')
  })

  it('renders its own given label, whichever of the buttons it is', () => {
    for (const [key, label] of [
      ['gifts', 'Extra Senses'],
      ['learnings', 'Learnings'],
      ['mirror', 'People'],
      ['scriptures', 'Scriptures'],
    ] as const) {
      const html = renderToStaticMarkup(<NoteButtonPill buttonKey={key} label={label} />)
      expect(html).toContain(label)
    }
  })
})
