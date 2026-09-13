import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DisplayValueButton } from './DisplayValueButton'
import type { ActivityList } from '@/domain/types'

const VIEWED_DATE = new Date(2026, 8, 13)
const NO_ACTIVITIES: ActivityList = []

function render(buttonKey: 'vipassana' | 'steps' | 'exercise' | 'breathing' | 'sleep' | 'protein') {
  return renderToStaticMarkup(
    <DisplayValueButton
      buttonKey={buttonKey}
      viewedDate={VIEWED_DATE}
      activities={NO_ACTIVITIES}
      onQuickLog={() => {}}
      onEditActivity={() => {}}
    />,
  )
}

describe('DisplayValueButton', () => {
  it('renders a real <button> and starts closed for every button', () => {
    for (const key of ['vipassana', 'steps', 'exercise', 'breathing', 'sleep', 'protein'] as const) {
      const html = render(key)
      expect(html).toMatch(/<button[^>]*>/)
      expect(html).toContain('aria-haspopup="dialog"')
      expect(html).toContain('aria-expanded="false"')
      expect(html).not.toContain('role="dialog"')
    }
  })

  it('shows an em dash on the face when nothing is logged, except Protein (target-relative — 0/80)', () => {
    expect(render('vipassana')).toContain('—')
    expect(render('exercise')).toContain('—')
    expect(render('breathing')).toContain('—')
    expect(render('sleep')).toContain('—')
    expect(render('steps')).toContain('—')
    expect(render('protein')).toContain('0/80')
  })

  it('leaks no popover content (start/end fields, type chips, note textareas) while closed', () => {
    for (const key of ['exercise', 'breathing', 'sleep'] as const) {
      const html = render(key)
      expect(html).not.toContain('role="dialog"')
      expect(html).not.toContain('<textarea')
      expect(html).not.toContain('role="radiogroup"')
    }
  })

  it('leaks no History section (session list or day-value edit rows) while closed, for any button', () => {
    for (const key of ['vipassana', 'steps', 'exercise', 'breathing', 'sleep', 'protein'] as const) {
      const html = render(key)
      expect(html).not.toContain('role="region"')
      expect(html).not.toContain('>History<')
    }
  })

  it('renders each button’s own label', () => {
    expect(render('vipassana')).toContain('Vipassana')
    expect(render('steps')).toContain('Steps')
    expect(render('exercise')).toContain('Exercise')
    expect(render('breathing')).toContain('Breathing')
    expect(render('sleep')).toContain('Sleep')
    expect(render('protein')).toContain('Protein')
  })

  it('computes Sleep’s face value as the SUM of every Sleep-named session today, regardless of type', () => {
    const activities: ActivityList = [
      {
        id: 'a1',
        name: 'Sleep',
        path: ['Night sleep'],
        startMinutes: 0,
        durationMinutes: 6 * 60,
        flags: [],
        quality: [],
        symptoms: [],
        notes: null,
        reflections: [],
        sleepQuality: [],
        dreamsNote: null,
        status: 'planned',
        timezone: 'UTC',
      },
      {
        id: 'a2',
        name: 'Sleep',
        path: ['Nap'],
        startMinutes: 13 * 60,
        durationMinutes: 45,
        flags: [],
        quality: [],
        symptoms: [],
        notes: null,
        reflections: [],
        sleepQuality: [],
        dreamsNote: null,
        status: 'planned',
        timezone: 'UTC',
      },
    ]
    const html = renderToStaticMarkup(
      <DisplayValueButton
        buttonKey="sleep"
        viewedDate={VIEWED_DATE}
        activities={activities}
        onQuickLog={() => {}}
        onEditActivity={() => {}}
      />,
    )
    // 6h + 45m = 6h 45m
    expect(html).toContain('6h 45m')
  })
})
