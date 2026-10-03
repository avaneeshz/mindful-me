import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ActivitySummary } from './ActivitySummary'
import type { ScheduledActivity } from '@/domain/types'

function activity(overrides: Partial<ScheduledActivity> = {}): ScheduledActivity {
  return {
    id: 'a1',
    name: 'Sleep',
    path: [],
    startMinutes: 22 * 60,
    durationMinutes: 480,
    status: 'planned',
    flags: [],
    quality: [],
    symptoms: [],
    notes: null,
    reflections: [],
    fieldSelections: {},
    dreamsNote: null,
    ...overrides,
  } as ScheduledActivity
}

function render(a: ScheduledActivity): string {
  return renderToStaticMarkup(
    <ActivitySummary activity={a} onEdit={() => {}} onRemove={() => {}} onClose={() => {}} onOpenNote={() => {}} />,
  )
}

describe('ActivitySummary — notes', () => {
  it('shows neither note block when both are empty', () => {
    const html = render(activity())
    expect(html).not.toContain('Notes')
    expect(html).not.toContain('Dreams')
  })

  it('shows a short note and the secondary (Dreams) note in full, with no expand control', () => {
    const html = render(activity({ notes: 'Slept well', dreamsNote: 'Flying over a lake' }))
    expect(html).toContain('Slept well')
    expect(html).toContain('Dreams')
    expect(html).toContain('Flying over a lake')
    expect(html).not.toContain('aria-expanded')
  })

  it('shows a dreams-only note', () => {
    const html = render(activity({ dreamsNote: 'Only a dream' }))
    expect(html).toContain('Only a dream')
    expect(html).not.toContain('>Notes<')
  })

  it('clamps a long note and offers a tap-to-expand "…" control', () => {
    const html = render(activity({ notes: 'word '.repeat(80) }))
    expect(html).toContain('line-clamp-3')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('>…<')
  })
})
