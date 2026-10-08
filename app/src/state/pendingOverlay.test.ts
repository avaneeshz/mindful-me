import { describe, expect, it } from 'vitest'
import type { TileDto } from '@/api/tiles'
import type { ActivityRow } from '@/domain/pickerHierarchy'
import { overlayActivities, overlayParameterOptions, overlayParameterSelections, overlayTiles } from './pendingOverlay'
import type { PendingWrite } from './pendingWritesQueue'

let n = 0
function w(action: string, entity: string, args: unknown[]): PendingWrite {
  n += 1
  return { id: String(n), userId: 'u', action, entity, recordId: 'r', op: 'save', args, label: '', createdAt: n, attempts: 1, status: 'failed', lastError: 'x', permanent: false, nextAttemptAt: 0 }
}
const tile = (id: string, extra: Partial<TileDto> = {}): TileDto => ({ id, label: id, iconKey: 'k', sortOrder: 0, hidden: false, color: null, ...extra })

describe('overlayTiles', () => {
  it('shows a tile whose create never reached the server, with later edits applied in order', () => {
    const rows = overlayTiles([tile('a')], [w('tile.create', 'tile', ['b', 'Work', 'briefcase']), w('tile.setColor', 'tile', ['b', '#112233']), w('tile.update', 'tile', ['b', 'Work 2', 'star'])])
    const b = rows.find((r) => r.id === 'b')
    expect(b).toMatchObject({ label: 'Work 2', iconKey: 'star', color: '#112233', sortOrder: 1 })
  })
  it('does not duplicate a tile the server already has, but still applies an unconfirmed rename', () => {
    const rows = overlayTiles([tile('a')], [w('tile.create', 'tile', ['a', 'x', 'y']), w('tile.update', 'tile', ['a', 'Renamed', 'k'])])
    expect(rows).toHaveLength(1)
    expect(rows[0].label).toBe('Renamed')
  })
  it('ignores other entities', () => {
    expect(overlayTiles([tile('a')], [w('tile.update', 'activity', ['a', 'Z', 'k'])])).toEqual([tile('a')])
  })
})

describe('overlayActivities', () => {
  const base: ActivityRow = { id: 'p', name: 'Walk', tileId: 't', parentId: null, iconKey: null, hidden: false, sortOrder: 0, disappearMode: 'manual', disappearLimit: null }
  it('shows an unsynced sub-activity under its parent and applies hide', () => {
    const rows = overlayActivities([base], [w('activity.create', 'activity', [{ id: 'c', name: 'Brisk', parentId: 'p' }]), w('activity.setHidden', 'activity', ['p', true])])
    expect(rows.find((r) => r.id === 'c')).toMatchObject({ name: 'Brisk', parentId: 'p', tileId: null })
    expect(rows.find((r) => r.id === 'p')?.hidden).toBe(true)
  })
})

describe('overlayParameterOptions', () => {
  it('shows an option the user added that the server never confirmed', () => {
    const rows = overlayParameterOptions(
      [{ id: 'a', parameterType: 'quality', label: 'Good', iconKey: null, sortOrder: 0 }],
      [w('parameterOption.create', 'parameterOption', ['quality', 'Calm', null, 'b'])],
    )
    expect(rows.map((r) => r.label)).toEqual(['Good', 'Calm'])
    expect(rows[1].sortOrder).toBe(1)
  })
})

describe('overlayParameterSelections', () => {
  const server = {
    quality: [{ optionId: 'calm', selected: false }, { optionId: 'tired', selected: true }],
    symptom: [{ optionId: 's1', selected: false }],
    flag: [],
  }
  it('keeps a tick the server never confirmed, and marks the list as the activity’s own', () => {
    const out = overlayParameterSelections(server, 'walk', [w('parameterSelection.set', 'parameterSelection', ['walk', 'quality', 'calm', true])])
    expect(out.byType.quality.find((o) => o.optionId === 'calm')?.selected).toBe(true)
    expect(out.byType.quality.find((o) => o.optionId === 'tired')?.selected).toBe(true)
    expect(out.ownTypes.has('quality')).toBe(true)
    expect(out.ownTypes.has('symptom')).toBe(false)
  })
  it('applies an unconfirmed untick, and ignores other activities', () => {
    const out = overlayParameterSelections(server, 'walk', [
      w('parameterSelection.set', 'parameterSelection', ['walk', 'quality', 'tired', false]),
      w('parameterSelection.set', 'parameterSelection', ['run', 'quality', 'calm', true]),
    ])
    expect(out.byType.quality.find((o) => o.optionId === 'tired')?.selected).toBe(false)
    expect(out.byType.quality.find((o) => o.optionId === 'calm')?.selected).toBe(false)
  })
})
