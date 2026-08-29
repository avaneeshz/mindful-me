import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import { describeSlotContents } from '@/components/editor/TileRow'

/**
 * A mount smoke test: renders the whole screen and asserts the structural
 * decisions the redesign is accountable for. It is not a substitute for visual
 * review, but it does prove the tree renders and that the deleted surfaces are
 * genuinely gone rather than merely hidden.
 *
 * THE CLOCK IS PINNED, ALWAYS. Every render here must pass a fixed Date, or
 * which grid cell is "now" — and therefore what the editor shows — changes by
 * the hour the suite happens to run.
 */

/** 10:15 on a fixed date -> grid cell 20 (10:00-10:30), which the seed fills with one 30-min Vipassana entry. */
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
    expect(html).not.toMatch(/Just started/)
    expect(html).not.toMatch(/slots marked<\/|Excellent/)
  })

  it('has no notification bell', () => {
    expect(html).not.toMatch(/notification/i)
  })

  it('renders both timeline rows, with no Day/Night jump toggle above them', () => {
    expect(html).toContain('Day timeline, 6am to 6pm')
    expect(html).toContain('Night timeline, 6pm to 6am')
    // R3: the segmented "Day · 6a–6p" / "Night · 6p–6a" control is gone —
    // both rows are always visible, so it only duplicated what they show.
    expect(html).not.toMatch(/Day\s*·\s*6a[–-]6p/)
    expect(html).not.toMatch(/Night\s*·\s*6p[–-]6a/)
  })

  it('renders all 48 grid cells as real buttons across the two rows', () => {
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

  it('renders one anchored visual span per real seeded activity — no 2-activity-per-cell cap', () => {
    // The seed's 11 real activities (flag markers render no span of their
    // own), plus ONE extra span: Night Sleep is now genuinely one 8-hour
    // activity (00:00-08:00) rather than sixteen artificially separate
    // 30-minute entries, and it legitimately crosses the Night/Day row
    // boundary at 06:00 — correctly rendered as two segments, one per row.
    expect(html.match(/data-activity-span="[^"]+"/g) ?? []).toHaveLength(12)
    // Two of them — Body Care (self) and Supplements — legitimately share
    // one grid cell without overlapping, which the old capacity rule
    // specifically disallowed beyond a hardcoded pair.
    expect(html).toContain('Body Care (self)')
    expect(html).toContain('Supplements')
  })

  it('renders flags inside their slot, stacked vertically', () => {
    // Seed slot 22 (11:00) carries a Trauma response flag marker.
    const slot22 = html.split('data-slot="22"')[1]?.split('data-slot=')[0] ?? ''
    expect(slot22).toContain('flex-col')
  })

  it('renders the weather pill in its loading state (no network happens during SSR)', () => {
    // BL-3: real geolocation + weather resolve asynchronously in an effect,
    // which never runs under `renderToStaticMarkup` — the pill must render
    // its honest loading state rather than crash or show stale/fake data.
    expect(html).toContain('Loading weather')
  })

  it('renders all 9 top-level tiles on the picker’s main screen', () => {
    // Tile Redesign: the flat 24/53-card grid is gone — the picker's ALWAYS-
    // rendered surface is the 9 top-level tiles; the 53 leaf items live one
    // level deeper, behind a tile, and aren't in the initial markup at all.
    // `renderToStaticMarkup` HTML-escapes "&" to "&amp;".
    for (const label of [
      'Sleep &amp; Rest',
      'Food &amp; Nourishment',
      'Personal Care',
      'Downtime &amp; Errands',
      'Movement &amp; Body Therapy',
      'Work &amp; Projects',
      'Nature &amp; Spirit',
      'Growth &amp; Connection',
      'Home &amp; Chores',
    ]) {
      expect(html).toContain(label)
    }
  })

  // Modal Redesign §E: flags no longer live in the always-visible slot
  // header (that whole-slot `FlagsRow` is retired) — they're single-select
  // chips inside `LogActivityModal`, only rendered while a card is staged.
  // Nothing is staged on this fixed-clock initial render, so the modal's
  // content isn't in this page's markup at all; `FlagPicker`'s own render
  // (all 4 flags + None) is covered directly in its component test instead.
  it('renders no flag toggle in the default, nothing-staged page state', () => {
    expect(html).not.toContain('aria-label="Trauma response"')
  })

  it('renders no idle placeholder in the staging pane', () => {
    expect(html).not.toContain('Choose an activity')
  })

  it('no longer hardcodes a fixed 2-activity slot-full sentence', () => {
    expect(html).not.toContain('full — 2 activities totalling 30 minutes. Remove one')
  })

  it('draws one capacity fill for the pinned slot’s single seeded activity', () => {
    const meter = html.split('aria-label="Slot capacity"')[1]?.split('</div>')[0] ?? ''
    const fills = meter.match(/left:calc\(/g) ?? []
    // Grid cell 20 (the pinned now-slot) holds a single 30-minute Vipassana entry.
    expect(fills).toHaveLength(1)
    expect(meter).toContain('width:calc(100% - 2px)')
  })

  it('rules both timeline rows with exactly 3 hour ticks apiece — start, midpoint, end', () => {
    // Day: 6a, 12p, 6p. Night: 6p, 12a, 6a — "6p" and "6a" each appear once
    // per row, so 2 occurrences of each across the whole page.
    for (const label of ['6a', '12p', '6p', '12a']) {
      expect(html).toContain('>' + label + '</span>')
    }
    expect(html.match(/>6a<\/span>/g) ?? []).toHaveLength(2)
    expect(html.match(/>6p<\/span>/g) ?? []).toHaveLength(2)
    expect(html.match(/>12p<\/span>/g) ?? []).toHaveLength(1)
    expect(html.match(/>12a<\/span>/g) ?? []).toHaveLength(1)
  })

  it('keeps the sidebar with Today active and the rest as placeholders', () => {
    expect(html).toContain('Ritual Board')
    expect(html).toContain('Stay Consistent')
    expect(html).toContain('My Slots')
    expect(html).toContain('(not yet available)')
  })

  it('makes the sidebar footer CTA an honestly disabled button', () => {
    const cta = html.split('View Tips')[0]
    expect(cta.endsWith('</span>')).toBe(false)
    expect(html).toMatch(/<button[^>]*disabled[^>]*>View Tips/)
    expect(html.split('View Tips')[1]).toContain('(not yet available)')
  })
})

/*
 * Guards bug #3 from the original redesign: the suite used to render against
 * `new Date()` and its result changed by the hour. Any assertion that depends
 * on which cell is "now" must hold at every hour of the day.
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
      expect(at.match(/>NOW</g) ?? []).toHaveLength(1)
      expect(at.match(/data-slot="\d+"/g) ?? []).toHaveLength(48)
    }
  })
})

describe('slot-full notice copy', () => {
  it('reports the slot’s real entry count and real total', () => {
    expect(describeSlotContents(1, 30)).toBe('1 activity totalling 30 minutes')
    expect(describeSlotContents(2, 30)).toBe('2 activities totalling 30 minutes')
    // Now legitimately reachable — no more hardcoded 2-activity ceiling.
    expect(describeSlotContents(3, 30)).toBe('3 activities totalling 30 minutes')
  })

  it('agrees in number with both the count and the total', () => {
    expect(describeSlotContents(1, 1)).toBe('1 activity totalling 1 minute')
  })
})
