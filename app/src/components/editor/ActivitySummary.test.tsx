import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ActivitySummary } from './ActivitySummary'
import type { ScheduledActivity } from '@/domain/types'

const BASE: ScheduledActivity = {
  id: 'a1',
  name: 'Homework',
  path: [],
  startMinutes: 600, // 10:00
  durationMinutes: 45,
  flags: [],
  quality: [],
  symptoms: [],
  notes: null,
  status: 'planned',
  timezone: 'UTC',
}

describe('ActivitySummary — the read-only Activity view', () => {
  it('shows a real empty state when nothing resolves (never-clicked, or a since-removed id)', () => {
    const html = renderToStaticMarkup(<ActivitySummary activity={undefined} onEdit={vi.fn()} />)
    expect(html).toContain('Tap a scheduled activity on the timeline')
    expect(html).not.toContain('Edit')
  })

  it('guards against a flag-only marker (name === null) the same way, defensively', () => {
    const marker: ScheduledActivity = { ...BASE, name: null }
    const html = renderToStaticMarkup(<ActivitySummary activity={marker} onEdit={vi.fn()} />)
    expect(html).toContain('Tap a scheduled activity on the timeline')
  })

  it('shows the name, its own real time range and duration — not the slot it was clicked in', () => {
    const html = renderToStaticMarkup(<ActivitySummary activity={BASE} onEdit={vi.fn()} />)
    expect(html).toContain('Homework')
    expect(html).toContain('10:00 – 10:45')
    expect(html).toContain('45 min')
  })

  it('formats an hour-plus duration the same hour-aware way the stepper fallback does', () => {
    const html = renderToStaticMarkup(
      <ActivitySummary activity={{ ...BASE, durationMinutes: 90 }} onEdit={vi.fn()} />,
    )
    expect(html).toContain('1h 30m')
  })

  it('shows the drill-down path when present, joined the same way the "in this slot" list does', () => {
    const html = renderToStaticMarkup(
      <ActivitySummary activity={{ ...BASE, name: 'Body Care (self)', path: ['Oiling', 'Body'] }} onEdit={vi.fn()} />,
    )
    expect(html).toContain('Oiling · Body')
  })

  it('omits every optional section when nothing was logged for it', () => {
    const html = renderToStaticMarkup(<ActivitySummary activity={BASE} onEdit={vi.fn()} />)
    expect(html).not.toContain('Activity quality')
    expect(html).not.toContain('Protective response')
    expect(html).not.toContain('Chronic Symptoms')
    expect(html).not.toContain('Notes')
  })

  it('shows activity quality, protective response, chronic symptoms and notes when present', () => {
    const html = renderToStaticMarkup(
      <ActivitySummary
        activity={{
          ...BASE,
          quality: ['Resonance', 'Flow'],
          flags: ['Attack'],
          symptoms: ['Pitta'],
          notes: 'Felt good.',
        }}
        onEdit={vi.fn()}
      />,
    )
    expect(html).toContain('Activity quality')
    expect(html).toContain('Resonance')
    expect(html).toContain('Flow')
    expect(html).toContain('Protective response')
    expect(html).toContain('Attack')
    expect(html).toContain('Chronic Symptoms')
    expect(html).toContain('Pitta')
    expect(html).toContain('Notes')
    expect(html).toContain('Felt good.')
  })

  it('always offers an Edit button that names the activity’s own id', () => {
    const html = renderToStaticMarkup(<ActivitySummary activity={BASE} onEdit={vi.fn()} />)
    expect(html).toMatch(/>Edit</)
  })
})
