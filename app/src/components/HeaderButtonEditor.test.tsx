import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HeaderButtonFormDialog } from './HeaderButtonEditor'
import { DEFAULT_HEADER_BUTTONS } from '@/domain/headerButtons'

// Same SSR-string convention as `LogActivityModal.test.tsx`/
// `DisplayValueButton.test.tsx` — no jsdom in this suite, so only the
// dialog's INITIAL render (per `mode`) is exercised; the inline add-field
// panel's own open/close and edit interactions are plain `useState` driven
// by DOM events, which this environment cannot simulate. What's tested here
// is the render-time shape for every `mode` this dialog can start in.

function renderAdd(): string {
  return renderToStaticMarkup(
    <HeaderButtonFormDialog mode={{ kind: 'add' }} onClose={() => {}} onCreate={() => {}} onUpdate={() => {}} />,
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
  it('renders the "Kind of button" picker and no Fields section yet (activity is the default category, but no fields exist)', () => {
    const html = renderAdd()
    expect(html).toContain('role="dialog"')
    expect(html).toContain('Kind of button')
    expect(html).toContain('Fields')
    expect(html).toContain('Add field')
  })

  it('shows the dashed "+ Add field" affordance, not the inline expand panel, by default', () => {
    const html = renderAdd()
    expect(html).toContain('border-dashed')
    expect(html).toContain('Add field')
    // The inline panel's own controls are absent until "Add field" is clicked.
    expect(html).not.toContain('Field type')
    expect(html).not.toContain('Multiple choice')
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

  it('gives every field row a labeled remove affordance', () => {
    const html = renderEdit()
    expect(html).toContain('aria-label="Remove Note"')
    expect(html).toContain('aria-label="Remove Dreams"')
    expect(html).toContain('aria-label="Remove How was your sleep?"')
  })

  it('still shows the dashed "+ Add field" row below the configured list', () => {
    const html = renderEdit()
    expect(html).toContain('border-dashed')
    expect(html).toContain('Add field')
  })
})

describe('HeaderButtonFormDialog — edit mode, Vipassana (no configured fields)', () => {
  it('shows an empty Fields list with just the "+ Add field" affordance', () => {
    const html = renderEdit(VIPASSANA_BUTTON)
    expect(html).toContain('Fields')
    expect(html).not.toContain('Text note')
    expect(html).not.toContain('Multiple choice')
    expect(html).toContain('Add field')
  })
})

describe('HeaderButtonFormDialog — non-activity categories carry no Fields section', () => {
  it('a day_value button in edit mode has no "Fields" heading', () => {
    const protein = DEFAULT_HEADER_BUTTONS.find((b) => b.id === 'protein')!
    const html = renderEdit(protein)
    expect(html).not.toContain('>Fields<')
  })
})
