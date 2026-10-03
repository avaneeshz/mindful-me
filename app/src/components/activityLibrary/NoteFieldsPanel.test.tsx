import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NoteFieldsPanel } from './NoteFieldsPanel'

function render(first: string | null, second: string | null): string {
  return renderToStaticMarkup(<NoteFieldsPanel activityName="Reading" first={first} second={second} onChange={() => {}} />)
}

describe('NoteFieldsPanel', () => {
  it('offers to add a second note when there is none, and a default first title', () => {
    const html = render(null, null)
    expect(html).toContain('Notes')
    expect(html).toContain('Add a second note')
    expect(html).not.toContain('Use default')
  })

  it('lists both titles, with rename/remove, once a second note exists', () => {
    const html = render('Reflection', 'Gratitude')
    expect(html).toContain('Reflection')
    expect(html).toContain('Gratitude')
    expect(html).toContain('aria-label="Remove Gratitude"')
    expect(html).toContain('Use default')
    expect(html).not.toContain('Add a second note')
  })
})
