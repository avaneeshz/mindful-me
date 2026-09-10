import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HeaderBar } from './HeaderBar'

const FIXED_NOW = new Date(2026, 8, 5, 10, 0)

function render(): string {
  return renderToStaticMarkup(
    <HeaderBar
      now={FIXED_NOW}
      viewedDate={FIXED_NOW}
      onSelectDate={() => {}}
      user={null}
      onSignOut={() => {}}
      activities={[]}
      onQuickLog={() => {}}
    />,
  )
}

describe('HeaderBar note pills', () => {
  it('renders the 7 note pills, in order — Extra Senses, Learnings, Relational Nutrient, Prayer, Scriptures, Sermons, Worship Singing', () => {
    const html = render()
    const labels = ['Extra Senses', 'Learnings', 'Relational Nutrient', 'Prayer', 'Scriptures', 'Sermons', 'Worship Singing']
    let lastIndex = -1
    for (const label of labels) {
      const index = html.indexOf(`>${label}<`)
      expect(index).toBeGreaterThan(lastIndex)
      lastIndex = index
    }
  })

  it('no longer carries Gifts, Mirror, Chits, Opportunities or Feedback as pill labels', () => {
    const html = render()
    for (const gone of ['aria-label="Gifts notes"', 'aria-label="Mirror notes"', 'aria-label="Chits notes"', 'aria-label="Opportunities notes"', 'Feedback']) {
      expect(html).not.toContain(gone)
    }
  })

  it('every note pill is a real, focusable <button>', () => {
    const html = render()
    for (const label of ['Extra Senses', 'Learnings', 'Relational Nutrient', 'Prayer', 'Scriptures', 'Sermons', 'Worship Singing']) {
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
})
