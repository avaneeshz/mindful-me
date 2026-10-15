import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HeaderButtonFormDialog } from './HeaderButtonEditor'
import { DEFAULT_HEADER_BUTTONS, type HeaderButtonCategory } from '@/domain/headerButtons'

// Same SSR-string convention as `LogActivityModal.test.tsx`/
// `DisplayValueButton.test.tsx` — no jsdom in this suite, so only the
// dialog's INITIAL render (per `mode`) is exercised; the inline add-field
// panel's own open/close and edit interactions are plain `useState` driven
// by DOM events, which this environment cannot simulate. What's tested here
// is the render-time shape for every `mode` this dialog can start in.

function renderAdd(category: HeaderButtonCategory = 'activity'): string {
  return renderToStaticMarkup(
    <HeaderButtonFormDialog mode={{ kind: 'add', category }} onClose={() => {}} onCreate={() => {}} onUpdate={() => {}} />,
  )
}

const SLEEP_BUTTON = DEFAULT_HEADER_BUTTONS.find((b) => b.id === 'sleep')!
const VIPASSANA_BUTTON = DEFAULT_HEADER_BUTTONS.find((b) => b.id === 'vipassana')!

function renderEdit(button = SLEEP_BUTTON): string {
  return renderToStaticMarkup(
    <HeaderButtonFormDialog
      mode={{ kind: 'edit', button }}
      onClose={() => {}}
      onCreate={() => {}}
      onUpdate={() => {}}
    />,
  )
}

describe('HeaderButtonFormDialog — add mode', () => {
  it('has no "Kind of button" picker — the kind comes from the Add button that opened it', () => {
    const html = renderAdd()
    expect(html).toContain('role="dialog"')
    expect(html).not.toContain('Kind of button')
    expect(html).toContain('Add activity')
    expect(html).toContain('Fields')
    expect(html).toContain('Add multiple-choice field')
  })

  it('shows the dashed "+ Add field" affordance, not the inline expand panel, by default', () => {
    const html = renderAdd()
    expect(html).toContain('border-dashed')
    expect(html).toContain('Add multiple-choice field')
    // The inline panel's own controls are absent until "Add multiple-choice field" is clicked.
    expect(html).not.toContain('New multiple-choice field')
    expect(html).not.toContain('id="field-title"')
  })

  it('renders no field rows when nothing is configured yet', () => {
    const html = renderAdd()
    expect(html).not.toContain('Text note')
  })

  it('no longer offers the old Sleep-only "quality picker" checkbox — retired in favor of the generic Fields list', () => {
    const html = renderAdd()
    expect(html).not.toContain('quality picker')
  })
})

describe('HeaderButtonFormDialog — edit mode, Sleep (2 text fields + 1 multiselect)', () => {
  it('renders all 3 configured fields, each with its own type caption', () => {
    const html = renderEdit()
    expect(html).toContain('Edit Sleep')
    expect(html).toContain('Note')
    expect(html).toContain('Dreams')
    expect(html).toContain('How was your sleep?')
    // Two text captions (Note, Dreams) + one multiple-choice caption.
    expect(html.match(/Text note/g)?.length).toBe(2)
    expect(html.match(/Multiple choice/g)?.length).toBe(1)
  })

  it('lets the button remove only its own multiple-choice field — text notes belong to the activity', () => {
    const html = renderEdit()
    expect(html).not.toContain('aria-label="Remove Note"')
    expect(html).not.toContain('aria-label="Remove Dreams"')
    expect(html).toContain('aria-label="Remove How was your sleep?"')
    expect(html).toContain('Text note · from the activity')
  })

  it('explains that written notes are managed on the activity', () => {
    expect(renderEdit()).toContain('Written notes come from the activity itself')
  })

  it('still shows the dashed "+ Add field" row below the configured list', () => {
    const html = renderEdit()
    expect(html).toContain('border-dashed')
    expect(html).toContain('Add multiple-choice field')
  })
})

describe('HeaderButtonFormDialog — edit mode, Vipassana (no configured fields)', () => {
  it('shows an empty Fields list with just the "+ Add field" affordance', () => {
    const html = renderEdit(VIPASSANA_BUTTON)
    expect(html).toContain('Fields')
    expect(html).not.toContain('Text note')
    expect(html).not.toContain('Multiple choice')
    expect(html).toContain('Add multiple-choice field')
  })
})

describe('HeaderButtonFormDialog — non-activity categories carry no Fields section', () => {
  it('a day_value button in edit mode has no "Fields" heading', () => {
    const protein = DEFAULT_HEADER_BUTTONS.find((b) => b.id === 'protein')!
    const html = renderEdit(protein)
    expect(html).not.toContain('>Fields<')
  })
})

describe('HeaderButtonFormDialog — add mode is fixed to the row it was opened from', () => {
  it('a note button asks for type options only', () => {
    const html = renderAdd('notes')
    expect(html).toContain('Add note')
    expect(html).toContain('Type options')
    expect(html).not.toContain('Activity to quick-log')
    expect(html).not.toContain('>Fields<')
  })

  it('a daily number asks for its value shape only', () => {
    const html = renderAdd('day_value')
    expect(html).toContain('Add daily number')
    expect(html).toContain('Value shape')
    expect(html).not.toContain('Activity to quick-log')
  })

  it('a checklist asks for its items only', () => {
    const html = renderAdd('checklist')
    expect(html).toContain('Add checklist')
    expect(html).toContain('Items (one per line)')
    expect(html).not.toContain('Value shape')
  })
})
