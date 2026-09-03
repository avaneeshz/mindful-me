import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LogActivityModal } from './LogActivityModal'
import { EMPTY_STAGING } from '@/state/boardReducer'
import type { ActivityList } from '@/domain/types'

const NO_ACTIVITIES: ActivityList = []

function renderModal(overrides: Partial<ComponentProps<typeof LogActivityModal>> = {}): string {
  return renderToStaticMarkup(
    <LogActivityModal
      staging={EMPTY_STAGING}
      activities={NO_ACTIVITIES}
      maxDuration={30}
      canCommit={false}
      onPickOption={() => {}}
      onStep={() => {}}
      onSetDuration={() => {}}
      onMove={() => {}}
      onResizeStart={() => {}}
      onSetFlag={() => {}}
      onSetQuality={() => {}}
      onCommit={() => {}}
      onCancel={() => {}}
      {...overrides}
    />,
  )
}

describe('the modal only exists while a card is staged', () => {
  it('renders no dialog at all when nothing is staged', () => {
    const html = renderModal({ staging: EMPTY_STAGING })
    expect(html).not.toContain('role="dialog"')
  })

  it('opens for a leaf card (no sub-options) with duration/quality/flag all present', () => {
    const html = renderModal({
      staging: { ...EMPTY_STAGING, cardName: 'Night Sleep' },
    })
    expect(html).toContain('role="dialog"')
    expect(html).toContain('Night Sleep')
    expect(html).toContain('role="slider"') // the duration drag-block
    expect(html).toContain('How did it feel?')
    expect(html).toContain('Nourishing')
    expect(html).toContain('Deep log')
    expect(html).toContain('Save entry')
    expect(html).toContain('Cancel')
  })

  it('names the activity’s own tile as a subtitle under its title', () => {
    const html = renderModal({ staging: { ...EMPTY_STAGING, cardName: 'Night Sleep' } })
    expect(html).toContain('Sleep &amp; Rest')
  })

  it('is a wide sheet (760px reference width), not the old narrow side panel', () => {
    const html = renderModal({ staging: { ...EMPTY_STAGING, cardName: 'Night Sleep' } })
    expect(html).toContain('md:w-[min(760px,92vw)]')
  })

  it('shows "Save changes" instead of "Save entry" while editing an existing activity', () => {
    const html = renderModal({
      staging: { ...EMPTY_STAGING, cardName: 'Night Sleep', editingId: 'abc' },
    })
    expect(html).toContain('Save changes')
    expect(html).not.toContain('Save entry')
  })
})

describe('sub-option drill-down (same staging mechanism, relocated into the modal)', () => {
  it('shows sub-option chips TOGETHER with duration/quality/flag, not a separate step', () => {
    const html = renderModal({
      staging: { ...EMPTY_STAGING, cardName: 'Supplements' },
    })
    expect(html).toContain('Zinc (post-breakfast)')
    expect(html).toContain('role="slider"')
    expect(html).toContain('How did it feel?')
  })

  it('keeps showing both at a deeper (third) level too, for a card that has one', () => {
    const html = renderModal({
      staging: { ...EMPTY_STAGING, cardName: 'Body Care (self)', path: ['Oiling'] },
    })
    expect(html).toContain('Face') // the third-level chip row
    expect(html).toContain('role="slider"')
    expect(html).toContain('How did it feel?')
  })

  it('a leaf with nothing further to pick shows no chip row, only duration/quality/flag', () => {
    const html = renderModal({
      staging: { ...EMPTY_STAGING, cardName: 'Supplements', path: ['Omega (post-lunch)'] },
    })
    expect(html).not.toContain('Zinc (post-breakfast)')
    expect(html).toContain('role="slider"')
    expect(html).toContain('How did it feel?')
  })
})

describe('the Save button reflects canCommit', () => {
  // `disabled(?!:)` — the real HTML attribute, never the false-positive
  // substring match inside the Button component's own static
  // `disabled:opacity-40` Tailwind variant class.
  const SAVE_BUTTON_DISABLED = /<button[^>]*\bdisabled(?!:)\b[^>]*>\s*Save entry/

  it('is disabled while the staged pick is not committable', () => {
    const html = renderModal({
      staging: { ...EMPTY_STAGING, cardName: 'Night Sleep' },
      canCommit: false,
    })
    expect(html).toMatch(SAVE_BUTTON_DISABLED)
  })

  it('is enabled once committable', () => {
    const html = renderModal({
      staging: { ...EMPTY_STAGING, cardName: 'Night Sleep' },
      canCommit: true,
    })
    expect(html).not.toMatch(SAVE_BUTTON_DISABLED)
  })
})

describe('feature-flag-gated duration fallback', () => {
  it('shows the drag-block by default (flag off)', () => {
    const html = renderModal({ staging: { ...EMPTY_STAGING, cardName: 'Night Sleep' } })
    expect(html).toContain('role="slider"')
    expect(html).not.toContain('Decrease duration')
  })

  it('swaps to the numeric stepper when the flag is flipped on — mutually exclusive, never both', async () => {
    vi.resetModules()
    vi.doMock('@/lib/featureFlags', () => ({ SHOW_DURATION_STEPPER_FALLBACK: true }))
    const { LogActivityModal: FlaggedModal } = await import('./LogActivityModal')
    const { EMPTY_STAGING: EmptyStaging } = await import('@/state/boardReducer')

    const html = renderToStaticMarkup(
      <FlaggedModal
        staging={{ ...EmptyStaging, cardName: 'Night Sleep' }}
        activities={NO_ACTIVITIES}
        maxDuration={30}
        canCommit={false}
        onPickOption={() => {}}
        onStep={() => {}}
        onSetDuration={() => {}}
        onMove={() => {}}
        onResizeStart={() => {}}
        onSetFlag={() => {}}
        onSetQuality={() => {}}
        onCommit={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(html).toContain('Decrease duration')
    expect(html).not.toContain('role="slider"')

    vi.doUnmock('@/lib/featureFlags')
    vi.resetModules()
  })
})
