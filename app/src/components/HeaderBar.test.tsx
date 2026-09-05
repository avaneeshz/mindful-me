import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HeaderBar } from './HeaderBar'

const FIXED_NOW = new Date(2026, 8, 5, 10, 0)

function render(): string {
  return renderToStaticMarkup(
    <HeaderBar now={FIXED_NOW} viewedDate={FIXED_NOW} onSelectDate={() => {}} user={null} onSignOut={() => {}} />,
  )
}

describe('HeaderBar note pills (SCRUM-13)', () => {
  it('renders exactly the 6 pills, in order: Gifts, Chits, Opportunities, Learnings, Mirror, Prayer', () => {
    const html = render()
    const labels = ['Gifts', 'Chits', 'Opportunities', 'Learnings', 'Mirror', 'Prayer']
    let lastIndex = -1
    for (const label of labels) {
      const index = html.indexOf(`>${label}<`)
      expect(index).toBeGreaterThan(lastIndex)
      lastIndex = index
    }
  })

  it('never renders "Feedback" any more — it was renamed to Mirror, not kept alongside it', () => {
    expect(render()).not.toContain('Feedback')
  })

  it('every pill is a real, focusable <button> now, not an inert <span>', () => {
    const html = render()
    for (const label of ['Gifts', 'Chits', 'Opportunities', 'Learnings', 'Mirror', 'Prayer']) {
      expect(html).toMatch(new RegExp(`<button[^>]*aria-label="${label} notes"`))
    }
  })
})
