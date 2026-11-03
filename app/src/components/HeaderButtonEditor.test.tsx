import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HeaderButtonFormDialog } from './HeaderButtonEditor'
import { DEFAULT_HEADER_BUTTONS, type HeaderButtonCategory, type HeaderButtonGroup } from '@/domain/headerButtons'

const ONE_GROUP: HeaderButtonGroup[] = [{ id: 'g1', name: 'Morning', sortOrder: 0 }]
const TWO_GROUPS: HeaderButtonGroup[] = [...ONE_GROUP, { id: 'g2', name: 'Evening', sortOrder: 1 }]

// Same SSR-string convention as `LogActivityModal.test.tsx`/
// `DisplayValueButton.test.tsx` — no jsdom in this suite, so only the
// dialog's INITIAL render (per `mode`) is exercised; the inline add-field
// panel's own open/close and edit interactions are plain `useState` driven
// by DOM events, which this environment cannot simulate. What's tested here
// is the render-time shape for every `mode` this dialog can start in.

/** How "Add button" opens: no type chosen yet. */
function renderAddStepOne(groups = ONE_GROUP): string {
  return renderToStaticMarkup(
    <HeaderButtonFormDialog
      mode={{ kind: 'add', groupId: groups[0]!.id }}
      groups={groups}
      onClose={() => {}}
      onCreate={() => {}}
      onUpdate={() => {}}
    />,
  )
}

/** The form step, with a type already chosen. */
function renderAdd(category: HeaderButtonCategory = 'activity', groups = ONE_GROUP): string {
  return renderToStaticMarkup(
    <HeaderButtonFormDialog
      mode={{ kind: 'add', groupId: groups[0]!.id, category }}
      groups={groups}
      onClose={() => {}}
      onCreate={() => {}}
      onUpdate={() => {}}
    />,
  )
}

const SLEEP_BUTTON = DEFAULT_HEADER_BUTTONS.find((b) => b.id === 'sleep')!
const VIPASSANA_BUTTON = DEFAULT_HEADER_BUTTONS.find((b) => b.id === 'vipassana')!

function renderEdit(button = SLEEP_BUTTON, groups = ONE_GROUP): string {
  return renderToStaticMarkup(
    <HeaderButtonFormDialog
      mode={{ kind: 'edit', button }}
      groups={groups}
      onClose={() => {}}
      onCreate={() => {}}
      onUpdate={() => {}}
    />,
  )
}

describe('HeaderButtonFormDialog — add mode', () => {
  it('starts on step one: the four button types, and no form yet', () => {
    const html = renderAddStepOne()
    expect(html).toContain('role="dialog"')
    expect(html).toContain('Add button')
    expect(html).toContain('What kind of button do you want to add?')
    for (const label of ['Quick activity', 'Checklist', 'Content entry', 'Daily number']) {
      expect(html).toContain(label)
    }
    expect(html).not.toContain('<form')
    expect(html).not.toContain('id="header-button-label"')
    expect(html).not.toContain('Fields')
    expect(html).not.toContain('id="header-button-group"')
  })

  it('shows the form once a type is chosen, with no type list and a Back button to change the choice', () => {
    const html = renderAdd()
    expect(html).toContain('<form')
    expect(html).not.toContain('What kind of button do you want to add?')
    expect(html).toContain('>Back<')
    expect(html).not.toContain('Fields')
    expect(html).not.toContain('Add multiple-choice field')
  })

  it('asks for nothing about note fields — they come from the activity without explanation', () => {
    const html = renderAdd()
    expect(html).not.toContain('Fields')
    expect(html).not.toContain('Add multiple-choice field')
    expect(html).not.toContain('from the activity')
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
    expect(html).not.toContain('from the activity')
  })

  it('does not explain where note fields come from', () => {
    expect(renderEdit()).not.toContain('Written notes come from the activity itself')
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

describe('HeaderButtonFormDialog — each button type asks only for its own settings', () => {
  it('a note button asks for type options only', () => {
    const html = renderAdd('notes')
    expect(html).toContain('Type options')
    expect(html).not.toContain('Activity to quick-log')
    expect(html).not.toContain('>Fields<')
  })

  it('a daily number asks for its value shape only', () => {
    const html = renderAdd('day_value')
    expect(html).toContain('Value shape')
    expect(html).not.toContain('Activity to quick-log')
  })

  it('a checklist asks for its items only', () => {
    const html = renderAdd('checklist')
    expect(html).toContain('Items (one per line)')
    expect(html).not.toContain('Value shape')
  })
})

describe('HeaderButtonFormDialog — category picker', () => {
  it('is hidden while the user has a single category', () => {
    expect(renderAdd('notes', ONE_GROUP)).not.toContain('id="header-button-group"')
  })

  it('lists every category once there is more than one, so a button can be moved with a tap', () => {
    const html = renderAdd('notes', TWO_GROUPS)
    expect(html).toContain('id="header-button-group"')
    expect(html).toContain('>Morning</option>')
    expect(html).toContain('>Evening</option>')
  })

  it('an edited button starts in its own category', () => {
    const button = { ...SLEEP_BUTTON, groupId: 'g2' }
    expect(renderEdit(button, TWO_GROUPS)).toMatch(/<option value="g2" selected="">Evening<\/option>/)
  })

  it('has no button type picker when editing — the type is fixed once the button exists', () => {
    expect(renderEdit()).not.toContain('aria-label="Button type"')
  })
})
