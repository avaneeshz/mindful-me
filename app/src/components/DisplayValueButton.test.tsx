import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DisplayValueButton } from './DisplayValueButton'
import type { ActivityList } from '@/domain/types'

// This suite runs in a plain Node environment with no jsdom/testing-library
// (see `vitest.config.ts`), so `renderToStaticMarkup` can only render this
// component's initial (closed) state — there is no way to drive `open` (or
// `historyOpen`) to `true` from here. The Recent/History split itself is
// exercised at the pure-logic level instead: `dayKey`-vs-other-dates for the
// day-value shape is exactly what `useDisplayValueHistory` already returns
// unfiltered (the component-level filtering is a one-line `.filter`), and
// the cross-day session selection/sort/exclude logic has its own dedicated
// tests against the pure `selectPastSessions` in `state/useSessionHistory.test.ts`.

const VIEWED_DATE = new Date(2026, 8, 13)
const NO_ACTIVITIES: ActivityList = []

function render(
  buttonKey: 'vipassana' | 'steps' | 'exercise' | 'breathing' | 'sleep' | 'prayer' | 'sermons' | 'worship' | 'protein',
) {
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
    for (const key of ['vipassana', 'steps', 'exercise', 'breathing', 'sleep', 'prayer', 'sermons', 'worship', 'protein'] as const) {
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
    expect(render('prayer')).toContain('—')
    expect(render('sermons')).toContain('—')
    expect(render('worship')).toContain('—')
    expect(render('steps')).toContain('—')
    expect(render('protein')).toContain('0/80')
  })

  it('leaks no popover content (start/end fields, type chips, note textareas) while closed', () => {
    for (const key of ['exercise', 'breathing', 'sleep', 'prayer', 'sermons', 'worship'] as const) {
      const html = render(key)
      expect(html).not.toContain('role="dialog"')
      expect(html).not.toContain('<textarea')
      expect(html).not.toContain('role="radiogroup"')
    }
  })

  it('leaks no History section (session list or day-value edit rows) while closed, for any button', () => {
    for (const key of ['vipassana', 'steps', 'exercise', 'breathing', 'sleep', 'prayer', 'sermons', 'worship', 'protein'] as const) {
      const html = render(key)
      expect(html).not.toContain('role="region"')
      expect(html).not.toContain('>History<')
    }
  })

  it('leaks no Recent section content while closed, for any button', () => {
    for (const key of ['vipassana', 'steps', 'exercise', 'breathing', 'sleep', 'protein'] as const) {
      const html = render(key)
      expect(html).not.toContain('>Recent<')
      expect(html).not.toContain('No sessions logged for this day yet')
      expect(html).not.toContain('No value logged for this day yet')
      expect(html).not.toContain('No other days logged yet')
      expect(html).not.toContain('No earlier sessions yet')
    }
  })

  it('renders each button’s own label', () => {
    expect(render('vipassana')).toContain('Vipassana')
    expect(render('steps')).toContain('Steps')
    expect(render('exercise')).toContain('Exercise')
    expect(render('breathing')).toContain('Breathing')
    expect(render('sleep')).toContain('Sleep')
    expect(render('prayer')).toContain('Prayer')
    expect(render('sermons')).toContain('Sermons')
    expect(render('worship')).toContain('Worship')
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

  // --- Sleep popover: Dreams/Note reorder + label removal + scroll fix ---
  //
  // Every test above only ever renders this popover CLOSED — `open` is
  // internal `useState`, and this suite (like `SupplementsButton.test.tsx`)
  // is SSR-string based with no `fireEvent.click` to actually open one.
  // `defaultOpen` is a test-only seam added for exactly this (see its own
  // doc comment on the component) — never passed by `HeaderBar` in the real
  // app — so these tests can assert what the OPEN popover actually renders.
  function renderOpenSleep() {
    return renderToStaticMarkup(
      <DisplayValueButton
        buttonKey="sleep"
        viewedDate={VIEWED_DATE}
        activities={NO_ACTIVITIES}
        onQuickLog={() => {}}
        onEditActivity={() => {}}
        defaultOpen
      />,
    )
  }

  it('puts Dreams before the general Note field in the Sleep popover', () => {
    const html = renderOpenSleep()
    const dreamsIndex = html.indexOf('placeholder="Dreams"')
    const noteIndex = html.indexOf('placeholder="Add a note"')
    expect(dreamsIndex).toBeGreaterThan(-1)
    expect(noteIndex).toBeGreaterThan(-1)
    expect(dreamsIndex).toBeLessThan(noteIndex)
  })

  it('carries no visible "Note"/"Dreams" heading — only an sr-only label, placeholder text carries the meaning (mirrors LogActivityModal’s own Notes field)', () => {
    const html = renderOpenSleep()
    expect(html).toMatch(/<label[^>]*class="sr-only"[^>]*>Dreams<\/label>/)
    expect(html).toMatch(/<label[^>]*class="sr-only"[^>]*>Note<\/label>/)
    // The OLD visible caption heading is gone for both fields.
    expect(html).not.toMatch(/text-caption font-semibold text-ink-dim">\s*Dreams\s*</)
    expect(html).not.toMatch(/text-caption font-semibold text-ink-dim">\s*Note\s*</)
  })

  it('constrains the popover panel’s height and scrolls internally, so History can never sit off-screen with no way back', () => {
    const html = renderOpenSleep()
    const panel = html.match(/<div role="dialog"[^>]*class="([^"]*)"/)?.[1] ?? ''
    expect(panel).toContain('overflow-y-auto')
    expect(panel).toContain('max-h-[min(560px,calc(100vh-32px))]')
    // History is still present in the (scrollable) panel markup.
    expect(html).toContain('>History<')
  })

  it('applies the same placeholder-only convention to the shared Note field on Exercise/Breathing — it is the same JSX branch as Sleep’s, not a Sleep-only special case', () => {
    const html = renderToStaticMarkup(
      <DisplayValueButton
        buttonKey="exercise"
        viewedDate={VIEWED_DATE}
        activities={NO_ACTIVITIES}
        onQuickLog={() => {}}
        onEditActivity={() => {}}
        defaultOpen
      />,
    )
    expect(html).toContain('placeholder="Add a note"')
    expect(html).not.toMatch(/text-caption font-semibold text-ink-dim">\s*Note\s*</)
    // Exercise never had a Dreams field to begin with.
    expect(html).not.toContain('placeholder="Dreams"')
  })

  // --- Worship's songCount entry mode: Start + number of songs, not Start/End ---
  describe('Worship’s songCount entry mode', () => {
    function renderOpenWorship() {
      return renderToStaticMarkup(
        <DisplayValueButton
          buttonKey="worship"
          viewedDate={VIEWED_DATE}
          activities={NO_ACTIVITIES}
          onQuickLog={() => {}}
          onEditActivity={() => {}}
          defaultOpen
        />,
      )
    }

    it('shows a Start time and a "Number of songs" field, never an End time field', () => {
      const html = renderOpenWorship()
      const startIndex = html.indexOf('Start time')
      const songCountIndex = html.indexOf('Number of songs')
      expect(startIndex).toBeGreaterThan(-1)
      expect(songCountIndex).toBeGreaterThan(-1)
      expect(startIndex).toBeLessThan(songCountIndex)
      expect(html).not.toContain('End time')
      expect(html).not.toMatch(/>\s*End\s*</)
    })

    it('offers no type chip fieldset — Worship has no sub list to draw from', () => {
      const html = renderOpenWorship()
      expect(html).not.toContain('role="radiogroup"')
    })

    it('still offers the freeform note field (quickLogNote), same shared branch as duration mode', () => {
      const html = renderOpenWorship()
      expect(html).toContain('placeholder="Add a note"')
    })

    it('Save starts disabled — no Start time or song count entered yet', () => {
      const html = renderOpenWorship()
      const saveButton = html.match(/<button type="submit"[^>]*>/)?.[0] ?? ''
      expect(saveButton).toContain('disabled=""')
    })

    it('shows the generic "Duration" placeholder, not a computed preview, before anything is entered', () => {
      const html = renderOpenWorship()
      expect(html).toContain('>Duration<')
    })
  })

  it('computes Worship’s face value as the SUM of every Worship-named session today — the same computed-total mechanism every other quickLogName button uses, for free', () => {
    const activities: ActivityList = [
      {
        id: 'w1',
        name: 'Worship',
        path: [],
        startMinutes: 9 * 60,
        durationMinutes: 12, // e.g. 4 songs at 3 min/song
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
        id: 'w2',
        name: 'Worship',
        path: [],
        startMinutes: 19 * 60,
        durationMinutes: 9, // e.g. 3 songs
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
        buttonKey="worship"
        viewedDate={VIEWED_DATE}
        activities={activities}
        onQuickLog={() => {}}
        onEditActivity={() => {}}
      />,
    )
    // 12m + 9m = 21m
    expect(html).toContain('21m')
  })
})
