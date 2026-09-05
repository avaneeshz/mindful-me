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
      onToggleQuality={() => {}}
      onToggleSymptom={() => {}}
      onSetNotes={() => {}}
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

  it('opens for a leaf card (no sub-options) with duration/quality/symptoms/flag/notes all present', () => {
    const html = renderModal({
      staging: { ...EMPTY_STAGING, cardName: 'Night Sleep' },
    })
    expect(html).toContain('role="dialog"')
    expect(html).toContain('Night Sleep')
    expect(html).toContain('role="slider"') // the duration drag-block
    expect(html).toContain('Activity quality')
    expect(html).toContain('Nourishing')
    expect(html).toContain('Chronic Symptoms')
    expect(html).toContain('Pitta')
    expect(html).toContain('Protective response')
    expect(html).toContain('Add notes')
    expect(html).toContain('Save entry')
  })

  it('names the activity, with no tile-name subtitle under it any more', () => {
    const html = renderModal({ staging: { ...EMPTY_STAGING, cardName: 'Night Sleep' } })
    expect(html).toContain('Night Sleep')
    expect(html).not.toContain('Sleep &amp; Rest')
  })

  it('is a wide sheet (760px reference width), not the old narrow side panel', () => {
    const html = renderModal({ staging: { ...EMPTY_STAGING, cardName: 'Night Sleep' } })
    expect(html).toContain('md:w-[min(760px,92vw)]')
  })

  it('has no "Duration" section label above the ruler — it shows directly, unlabeled (still sr-only for assistive tech)', () => {
    const html = renderModal({ staging: { ...EMPTY_STAGING, cardName: 'Night Sleep' } })
    expect(html).toMatch(/<p id="duration-drag-label" class="sr-only">\s*Duration\s*<\/p>/)
  })

  it('has no Cancel button — the X close icon is the only way to dismiss without saving', () => {
    const html = renderModal({ staging: { ...EMPTY_STAGING, cardName: 'Night Sleep' } })
    expect(html).not.toContain('>Cancel<')
    expect(html).toContain('aria-label="Close"')
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
  it('shows sub-option chips TOGETHER with duration/quality/symptoms/flag, not a separate step', () => {
    const html = renderModal({
      staging: { ...EMPTY_STAGING, cardName: 'Supplements' },
    })
    expect(html).toContain('Zinc (post-breakfast)')
    expect(html).toContain('role="slider"')
    expect(html).toContain('Activity quality')
    expect(html).toContain('Chronic Symptoms')
  })

  it('keeps showing both at a deeper (third) level too, for a card that has one', () => {
    const html = renderModal({
      staging: { ...EMPTY_STAGING, cardName: 'Body Care (self)', path: ['Oiling'] },
    })
    expect(html).toContain('Face') // the third-level chip row
    expect(html).toContain('role="slider"')
    expect(html).toContain('Activity quality')
  })

  it('a leaf with nothing further to pick shows no chip row, only duration/quality/symptoms/flag/notes', () => {
    const html = renderModal({
      staging: { ...EMPTY_STAGING, cardName: 'Supplements', path: ['Omega (post-lunch)'] },
    })
    expect(html).not.toContain('Zinc (post-breakfast)')
    expect(html).toContain('role="slider"')
    expect(html).toContain('Activity quality')
  })
})

describe('Activity quality — 18-value multi-select (SCRUM-10)', () => {
  it('lists all 18 quality values', () => {
    const html = renderModal({ staging: { ...EMPTY_STAGING, cardName: 'Night Sleep' } })
    for (const quality of [
      'Resonance',
      'Flow',
      'Scattered',
      'Overstimulated',
      'Zone out',
      'Numb',
      'Engaged',
      'Bored',
      'Resistant',
      'Frozen',
      'Avoiding',
      'Confusion',
      'Compulsive persistent',
      'Interoceptive Override',
      'Addictive',
      'Nourishing',
      'Draining',
      'Energizing',
    ]) {
      expect(html).toContain(quality)
    }
  })

  it('renders no icon inside an Activity quality chip — text-only, per SCRUM-15', () => {
    const html = renderModal({ staging: { ...EMPTY_STAGING, cardName: 'Night Sleep' } })
    const section = html.slice(html.indexOf('Activity quality'), html.indexOf('Chronic Symptoms'))
    expect(section).not.toContain('<svg')
  })

  it('is a real checkbox group (multi-select), not a radiogroup', () => {
    const html = renderModal({ staging: { ...EMPTY_STAGING, cardName: 'Night Sleep' } })
    expect(html).toContain('role="group" aria-label="Activity quality"')
  })

  it('reflects every currently-selected quality as checked', () => {
    const html = renderModal({
      staging: { ...EMPTY_STAGING, cardName: 'Night Sleep', quality: ['Flow', 'Nourishing'] },
    })
    expect(html.match(/aria-checked="true"/g)?.length).toBeGreaterThanOrEqual(2)
  })
})

describe('Chronic Symptoms — a new multi-select section', () => {
  it('sits between Activity quality and Protective response', () => {
    const html = renderModal({ staging: { ...EMPTY_STAGING, cardName: 'Night Sleep' } })
    const qualityIndex = html.indexOf('Activity quality')
    const symptomsIndex = html.indexOf('Chronic Symptoms')
    const flagIndex = html.indexOf('Protective response')
    expect(qualityIndex).toBeGreaterThan(-1)
    expect(symptomsIndex).toBeGreaterThan(qualityIndex)
    expect(flagIndex).toBeGreaterThan(symptomsIndex)
  })

  it('lists all 6 symptom values', () => {
    const html = renderModal({ staging: { ...EMPTY_STAGING, cardName: 'Night Sleep' } })
    for (const symptom of ['Pitta', 'Inflammation', 'Right knee pain', 'Calves pain', 'Temporal pain', 'Dryness']) {
      expect(html).toContain(symptom)
    }
  })

  it('is a real checkbox group (multi-select), not a radiogroup like flag', () => {
    const html = renderModal({ staging: { ...EMPTY_STAGING, cardName: 'Night Sleep' } })
    expect(html).toContain('role="group" aria-label="Chronic Symptoms"')
  })

  it('renders no icon inside a Chronic Symptoms chip — text-only, per SCRUM-15', () => {
    const html = renderModal({ staging: { ...EMPTY_STAGING, cardName: 'Night Sleep' } })
    const section = html.slice(html.indexOf('Chronic Symptoms'), html.indexOf('Protective response'))
    expect(section).not.toContain('<svg')
  })

  it('reflects every currently-selected symptom as checked', () => {
    const html = renderModal({
      staging: { ...EMPTY_STAGING, cardName: 'Night Sleep', symptoms: ['Pitta', 'Dryness'] },
    })
    // Both selected symptoms' chips carry aria-checked="true".
    expect(html.match(/aria-checked="true"/g)?.length).toBeGreaterThanOrEqual(2)
  })
})

describe('Protective response (formerly "Flag") — relabeled, reordered', () => {
  it('uses the new label, not the old one', () => {
    const html = renderModal({ staging: { ...EMPTY_STAGING, cardName: 'Night Sleep' } })
    expect(html).toContain('Protective response')
    expect(html).not.toContain('>Flag<')
  })

  it('orders the 14 options as specified, with None last', () => {
    const html = renderModal({ staging: { ...EMPTY_STAGING, cardName: 'Night Sleep' } })
    const labels = [
      'Trauma Activation',
      'Triggered',
      'Attack',
      'Anger',
      'Procrastinated',
      'Shut Down',
      'Collapse',
      'Over Accommodating',
      'Hyper Responsibility',
      'Over Function',
      'Intellectualization',
      'Optimization',
      'Hyper Vigilance',
      'Problem Solving',
      'None',
    ]
    const order = labels.map((label) => html.indexOf(`>${label}</`, html.indexOf('Protective response')))
    for (const index of order) expect(index).toBeGreaterThan(-1)
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1])
  })

  it('renders no icon inside a Protective response chip — text-only', () => {
    const html = renderModal({ staging: { ...EMPTY_STAGING, cardName: 'Night Sleep' } })
    const section = html.slice(html.indexOf('Protective response'))
    expect(section).not.toContain('<svg')
  })
})

describe('Notes — a real, always-visible textarea (was the inert "Deep log" stub)', () => {
  it('renders a plain textarea with "Add notes" placeholder, no heading, no expand/collapse', () => {
    const html = renderModal({ staging: { ...EMPTY_STAGING, cardName: 'Night Sleep' } })
    expect(html).toContain('<textarea')
    expect(html).toContain('placeholder="Add notes"')
    expect(html).not.toContain('Deep log')
  })

  it('shows whatever is currently staged as its value', () => {
    const html = renderModal({
      staging: { ...EMPTY_STAGING, cardName: 'Night Sleep', notes: 'Felt calm afterward.' },
    })
    expect(html).toContain('Felt calm afterward.')
  })
})

describe('Save button is a small centered pill, not a full-width bar', () => {
  it('is not `block` (full-width) any more', () => {
    const html = renderModal({ staging: { ...EMPTY_STAGING, cardName: 'Night Sleep' } })
    const saveButtonMatch = html.match(/<button[^>]*>\s*Save entry/)
    expect(saveButtonMatch).not.toBeNull()
    expect(saveButtonMatch?.[0]).toContain('rounded-full')
    expect(saveButtonMatch?.[0]).not.toContain('w-full')
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
        onToggleQuality={() => {}}
        onToggleSymptom={() => {}}
        onSetNotes={() => {}}
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
