import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ActivityFieldsPanel } from './ActivityFieldsPanel'
import type { ActivityField } from '@/domain/activityFields'
import type { ActivityRow } from '@/domain/pickerHierarchy'
import type { UseActivityFieldsResult } from '@/state/useActivityFields'

const row = (over: Partial<ActivityRow> & { id: string; name: string }): ActivityRow => ({
  tileId: null,
  parentId: null,
  iconKey: null,
  hidden: false,
  sortOrder: 0,
  disappearMode: 'manual',
  disappearLimit: null,
  ...over,
})

const rows = [row({ id: 'run', name: 'Run', tileId: 't' }), row({ id: 'trail', name: 'Trail', parentId: 'run' })]

const field = (over: Partial<ActivityField> & { id: string; label: string }): ActivityField => ({
  activityId: 'run',
  kind: 'text',
  sortOrder: 0,
  hidden: false,
  legacyKey: null,
  options: [],
  ...over,
})

function data(fields: ActivityField[], over: Partial<UseActivityFieldsResult> = {}): UseActivityFieldsResult {
  return {
    fields,
    status: 'ready',
    error: null,
    addField: vi.fn(),
    renameField: vi.fn(),
    setFieldHidden: vi.fn(),
    reorderFields: vi.fn(),
    addOption: vi.fn(),
    renameOption: vi.fn(),
    setOptionHidden: vi.fn(),
    reorderOptions: vi.fn(),
    ...over,
  }
}

const render = (activityId: string, d: UseActivityFieldsResult) =>
  renderToStaticMarkup(
    <ActivityFieldsPanel activity={rows.find((r) => r.id === activityId)!} rows={rows} data={d} onOpenActivity={() => {}} />,
  )

describe('ActivityFieldsPanel', () => {
  it('lists notes and multiple-select fields with their kind and option count', () => {
    const html = render(
      'run',
      data([
        field({ id: 'n', label: 'Gratitude' }),
        field({
          id: 'q',
          label: 'Activity quality',
          kind: 'multiselect',
          sortOrder: 1,
          options: [
            { id: 'o1', label: 'Flow', sortOrder: 0, hidden: false },
            { id: 'o2', label: 'Bored', sortOrder: 1, hidden: true },
          ],
        }),
      ]),
    )
    expect(html).toContain('Gratitude')
    expect(html).toContain('Activity quality')
    expect(html).toContain('Multiple select · 1 option')
    expect(html).toContain('Add note')
    expect(html).toContain('Add multiple-select field')
    expect(html).toContain('aria-label="Edit options for Activity quality"')
  })

  it('offers a tap alternative to ordering: move up and down, disabled at the ends', () => {
    const html = render('run', data([field({ id: 'a', label: 'A' }), field({ id: 'b', label: 'B', sortOrder: 1 })]))
    expect(html).toMatch(/aria-label="Move A up"[^>]*disabled=""/)
    expect(html).not.toMatch(/aria-label="Move A down"[^>]*disabled=""/)
    expect(html).toMatch(/aria-label="Move B down"[^>]*disabled=""/)
  })

  it('keeps hidden fields out of the list and offers a way to restore them', () => {
    const html = render('run', data([field({ id: 'a', label: 'Shown' }), field({ id: 'h', label: 'Tucked', hidden: true, sortOrder: 1 })]))
    expect(html).toContain('Shown')
    expect(html).not.toContain('Tucked')
    expect(html).toContain('Show 1 hidden item')
  })

  it('shows an empty state once loaded', () => {
    expect(render('run', data([]))).toContain('No notes or fields yet')
  })

  it('points a subtype at its parent instead of showing separate fields', () => {
    const html = render('trail', data([field({ id: 'n', label: 'Gratitude' })]))
    expect(html).toContain('uses the notes and fields of')
    expect(html).toContain('Open Run')
    expect(html).not.toContain('Gratitude')
  })
})
