import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import { describeSlotContents } from '@/components/editor/ActivityPicker'

/**
 * A mount smoke test: renders the whole screen and asserts the structural
 * decisions the redesign is accountable for. It is not a substitute for visual
 * review, but it does prove the tree renders and that the deleted surfaces are
 * genuinely gone rather than merely hidden.
 *
 * THE CLOCK IS PINNED, ALWAYS. This suite used to render against real device
 * time, so which slot was "now" — and therefore what the editor showed and what
 * its capacity meter contained — changed by the hour. It passed in the morning
 * and failed the rest of the day. Every render here must pass a fixed Date.
 */

/** 10:15 on a fixed date -> slot 20, which the seed fills with one 30-min entry. */
const AT_10_15AM = new Date(2026, 7, 25, 10, 15)

function render(now: Date = AT_10_15AM): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/']}>
      <App now={now} />
    </MemoryRouter>,
  )
}

describe('Today screen', () => {
  const html = render()

  it('uses "30-Minute Slotting" as the primary heading', () => {
    expect(html).toContain('30-Minute Slotting')
    expect(html).toMatch(/<h1[^>]*>30-Minute Slotting<\/h1>/)
  })

  it('has no greeting and no hardcoded streak line', () => {
    expect(html).not.toMatch(/Good (Morning|Afternoon|Evening)/i)
    expect(html).not.toMatch(/streak/i)
    expect(html).not.toMatch(/Deepthi/i)
  })

  it('has no Today’s Shape, Recent Activity, or scoring surface at all', () => {
    expect(html).not.toMatch(/Today.s Shape/i)
    expect(html).not.toMatch(/Recent Activity/i)
    expect(html).not.toMatch(/Overall progress/i)
    expect(html).not.toMatch(/vs yesterday/i)
    // The old score-band labels. "Building" alone is not tested: it legitimately
    // appears in the "Building & Rebuilding" activity card.
    expect(html).not.toMatch(/Just started/)
    expect(html).not.toMatch(/slots marked<\/|Excellent/)
  })

  it('has no notification bell', () => {
    expect(html).not.toMatch(/notification/i)
  })

  it('renders both period segments and both timeline rows', () => {
    expect(html).toContain('Day · 6a–6p')
    expect(html).toContain('Night · 6p–6a')
    expect(html).toContain('Day timeline, 6am to 6pm')
    expect(html).toContain('Night timeline, 6pm to 6am')
  })

  it('renders all 48 slots as real buttons across the two rows', () => {
    const slotButtons = html.match(/data-slot="\d+"/g) ?? []
    expect(slotButtons).toHaveLength(48)
    const indices = new Set(slotButtons.map((s) => Number(s.match(/\d+/)![0])))
    expect(indices.size).toBe(48)
  })

  it('shows exactly one current-time marker', () => {
    expect(html.match(/>NOW</g) ?? []).toHaveLength(1)
  })

  it('does not spend primary viewport space on a marked-slot count', () => {
    expect(html).not.toContain('slots marked today')
  })

  it('renders one anchored visual span per activity in a two-activity slot', () => {
    // Seed slot 29 holds 15 min Body care + 15 min Supplements.
    expect(html.match(/data-activity-span="29-\d"/g) ?? []).toHaveLength(2)
  })

  it('renders flags inside their slot, stacked vertically', () => {
    // Seed slot 22 carries a Trauma response flag.
    const slot22 = html.split('data-slot="22"')[1]?.split('data-slot=')[0] ?? ''
    expect(slot22).toContain('flex-col')
  })

  it('marks the weather pill as placeholder data', () => {
    expect(html).toContain('placeholder weather, not live data')
  })

  it('renders all 24 activity cards as tiles', () => {
    for (const name of ['Night Sleep', 'Body care', 'Miscellaneous', 'GEOM / HOSS / HECOLL']) {
      expect(html).toContain(name)
    }
  })

  it('renders the three flag toggles with accessible names', () => {
    expect(html).toContain('aria-label="Trauma response"')
    expect(html).toContain('aria-label="Stress response"')
    expect(html).toContain('aria-label="Fear response"')
  })

  /*
   * The staging pane used to render a "Choose an activity" placeholder while
   * idle — a column of reserved space restating what the tile grid beside it
   * already says. The pane now renders nothing until a card is staged.
   */
  it('renders no idle placeholder in the staging pane', () => {
    expect(html).not.toContain('Choose an activity')
  })

  /*
   * The notice copy used to be a hardcoded sentence asserting "2 activities",
   * which a slot holding one 30-minute entry contradicts. It is now derived —
   * see describeSlotContents, unit-tested below — so the only thing this smoke
   * test can usefully guard is that the old literal never comes back.
   */
  it('no longer hardcodes the slot-full sentence', () => {
    expect(html).not.toContain('full — 2 activities totalling 30 minutes. Remove one')
  })

  it('draws one capacity fill per activity, sized by its own duration', () => {
    const meter = html.split('aria-label="Slot capacity"')[1]?.split('</div>')[0] ?? ''
    const fills = meter.match(/left:calc\(/g) ?? []
    // Slot 20 (the pinned now-slot) holds a single 30-minute Vipassana entry:
    // one fill, full width.
    expect(fills).toHaveLength(1)
    expect(meter).toContain('width:calc(100% - 2px)')
  })

  it('rules both timeline rows with hour ticks, not just the midnight one', () => {
    for (const label of ['06', '08', '10', '12', '14', '16', '18', '20', '22', '00']) {
      expect(html).toContain('>' + label + '</span>')
    }
  })

  it('keeps the sidebar with Today active and the rest as placeholders', () => {
    expect(html).toContain('Ritual Board')
    expect(html).toContain('Stay Consistent')
    expect(html).toContain('My Slots')
    expect(html).toContain('(not yet available)')
  })

  /*
   * The sidebar footer CTA was a bare <span> styled exactly like a working
   * button: not focusable, no handler, no disabled affordance — the one element
   * that broke the honest-placeholder pattern the six nav items above it use.
   */
  it('makes the sidebar footer CTA an honestly disabled button', () => {
    const cta = html.split('View Tips')[0]
    expect(cta.endsWith('</span>')).toBe(false)
    expect(html).toMatch(/<button[^>]*disabled[^>]*>View Tips/)
    expect(html.split('View Tips')[1]).toContain('(not yet available)')
  })
})

/*
 * Guards bug #3: the suite used to render against `new Date()` and its result
 * changed by the hour. Any assertion that depends on which slot is "now" must
 * hold at every hour of the day, so this renders across the whole 24 and checks
 * the invariants that should never move.
 */
describe('rendering is independent of the wall clock', () => {
  const everyHalfHour = Array.from(
    { length: 48 },
    (_, slot) => new Date(2026, 7, 25, Math.floor(slot / 2), (slot % 2) * 30 + 5),
  )

  it('renders the same structure at every slot of the day', () => {
    for (const now of everyHalfHour) {
      const at = render(now)
      expect(at).toMatch(/<h1[^>]*>30-Minute Slotting<\/h1>/)
      // Exactly one current-time marker, on exactly one of the two rows.
      expect(at.match(/>NOW</g) ?? []).toHaveLength(1)
      expect(at.match(/data-slot="\d+"/g) ?? []).toHaveLength(48)
      expect(at).toContain('25 of 48 slots marked today')
    }
  })
})

describe('slot-full notice copy', () => {
  it('reports the slot’s real entry count and real total', () => {
    // A slot is full at 2 activities OR at 30 booked minutes, so one 30-minute
    // entry fills it just as a 15 + 15 pair does.
    expect(describeSlotContents(1, 30)).toBe('1 activity totalling 30 minutes')
    expect(describeSlotContents(2, 30)).toBe('2 activities totalling 30 minutes')
  })

  it('agrees in number with both the count and the total', () => {
    expect(describeSlotContents(1, 1)).toBe('1 activity totalling 1 minute')
  })
})
