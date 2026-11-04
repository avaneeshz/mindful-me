import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HeaderBar } from './HeaderBar'
import { HeaderButtonsProvider } from '@/state/HeaderButtonsContext'

const FIXED_NOW = new Date(2026, 8, 5, 10, 0)

function render(editMode = false): string {
  return renderToStaticMarkup(
    <HeaderButtonsProvider>
      <HeaderBar
        now={FIXED_NOW}
        viewedDate={FIXED_NOW}
        onSelectDate={() => {}}
        user={null}
        onSignOut={() => {}}
        activities={[]}
        onQuickLog={() => ({ ok: true })}
        syncQueue={[]}
        onRetrySyncNow={() => {}}
        onEditActivity={() => {}}
        editMode={editMode}
        onToggleEditMode={() => {}}
      />
    </HeaderButtonsProvider>,
  )
}

describe('HeaderBar note pills', () => {
  it('renders the 4 note pills, in order — Extra Senses, Learnings, Relational Nutrient, Scriptures', () => {
    const html = render()
    const labels = ['Extra Senses', 'Learnings', 'Relational Nutrient', 'Scriptures']
    let lastIndex = -1
    for (const label of labels) {
      const index = html.indexOf(`>${label}<`)
      expect(index).toBeGreaterThan(lastIndex)
      lastIndex = index
    }
  })

  it('no longer carries Gifts, Mirror, Chits, Opportunities, Feedback, Prayer, Sermons or Worship as pill labels — the last three are now real DISPLAY_BUTTONS quick-log buttons', () => {
    const html = render()
    for (const gone of [
      'aria-label="Gifts notes"',
      'aria-label="Mirror notes"',
      'aria-label="Chits notes"',
      'aria-label="Opportunities notes"',
      'aria-label="Prayer notes"',
      'aria-label="Sermons notes"',
      'aria-label="Worship notes"',
      'aria-label="Worship Singing notes"',
      'Feedback',
    ]) {
      expect(html).not.toContain(gone)
    }
  })

  it('every note pill is a real, focusable <button>', () => {
    const html = render()
    for (const label of ['Extra Senses', 'Learnings', 'Relational Nutrient', 'Scriptures']) {
      expect(html).toMatch(new RegExp(`<button[^>]*aria-label="${label} notes"`))
    }
  })
})

describe('HeaderBar display buttons', () => {
  it('renders Vipassana and Steps, each showing a face value (an em dash when unset)', () => {
    const html = render()
    expect(html).toMatch(/<button[^>]*aria-label="Vipassana — set value"/)
    expect(html).toMatch(/<button[^>]*aria-label="Steps — set value"/)
    expect(html).toContain('>Vipassana<')
    expect(html).toContain('>Steps<')
  })

  it('renders Prayer, Sermons and Worship as real time-logging display buttons, not note pills', () => {
    const html = render()
    expect(html).toMatch(/<button[^>]*aria-label="Prayer — set value"/)
    expect(html).toMatch(/<button[^>]*aria-label="Sermons — set value"/)
    expect(html).toMatch(/<button[^>]*aria-label="Worship — set value"/)
    expect(html).toContain('>Prayer<')
    expect(html).toContain('>Sermons<')
    expect(html).toContain('>Worship<')
  })
})

describe('HeaderBar download control', () => {
  it('renders a real, focusable, labeled button in row 1', () => {
    const html = render()
    // The aria-label's apostrophe is HTML-escaped (`&#x27;`) by SSR.
    expect(html).toMatch(/<button[^>]*aria-label="Download this day&#x27;s data as a PDF"/)
  })
})

describe('HeaderBar checklist control', () => {
  it('renders Supplements as a checklist button, generalized off the dynamic config', () => {
    const html = render()
    expect(html).toMatch(/<button[^>]*aria-label="Supplements, 0 of 7 taken"/)
  })
})

describe('HeaderBar edit mode (HEADER-CUSTOM-1)', () => {
  it('starts with edit mode off — no per-button remove/edit affordance, no Add buttons', () => {
    const html = render()
    expect(html).not.toMatch(/aria-label="Add (button|category)"/)
    expect(html).not.toMatch(/aria-label="(Remove|Delete) /)
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*aria-label="Edit"/)
  })

  it('in edit mode every button carries a Delete icon (not a cross), and nothing wobbles until it is selected', () => {
    const html = render(true)
    expect(html).toMatch(/aria-label="Delete Supplements"/)
    expect(html).not.toMatch(/aria-label="Remove /)
    expect(html).not.toContain('animate-jiggle')
  })

  it('in edit mode shows an Add button in every category, and one Add category', () => {
    const html = render(true)
    expect(html.match(/aria-label="Add button"/g)?.length).toBe(1)
    expect(html.match(/aria-label="Add category"/g)?.length).toBe(1)
  })

  it('a new user starts with one category, named, holding every default button', () => {
    const html = render(true)
    expect(html.match(/role="group"/g)?.length).toBe(1)
    expect(html).toMatch(/<h2[^>]*>Buttons<\/h2>/)
  })

  it('shows the category name outside edit mode too, but no rename / move / delete controls', () => {
    const html = render()
    expect(html).toMatch(/<h2[^>]*>Buttons<\/h2>/)
    expect(html).not.toMatch(/aria-label="Rename /)
    expect(html).not.toMatch(/aria-label="Delete /)
  })

  it('edit mode gives each category tap controls to rename and move it — nothing relies on dragging', () => {
    const html = render(true)
    expect(html).toContain('aria-label="Rename Buttons"')
    expect(html).toContain('aria-label="Move Buttons up"')
    expect(html).toContain('aria-label="Move Buttons down"')
    // The only category can't be deleted — a button always needs somewhere to live.
    expect(html).not.toContain('aria-label="Delete Buttons"')
  })
})
