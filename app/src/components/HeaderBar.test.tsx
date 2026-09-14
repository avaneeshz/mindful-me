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
      syncQueue={[]}
      onRetrySyncNow={() => {}}
      onEditActivity={() => {}}
    />,
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
