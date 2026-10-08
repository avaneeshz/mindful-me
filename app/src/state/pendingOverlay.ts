import type { TileDto } from '@/api/tiles'
import type { ActivityRow } from '@/domain/pickerHierarchy'
import type { ParameterOptionDto } from '@/api/parameterOptions'
import type { PendingWrite } from './pendingWritesQueue'

/**
 * Tiles and activities are not kept on the device between visits (a reload
 * re-fetches them), so a change the server never confirmed would be invisible
 * after a reload until its retry finally lands. These pure helpers lay the
 * unconfirmed changes from the ledger back over the server's list, so the user
 * keeps seeing what they did. Oldest change first, exactly the order they will
 * be sent in.
 */
const inOrder = (writes: readonly PendingWrite[], entity: string): PendingWrite[] =>
  writes.filter((w) => w.entity === entity).sort((a, b) => a.createdAt - b.createdAt)

export function overlayTiles(server: readonly TileDto[], writes: readonly PendingWrite[]): TileDto[] {
  let rows = [...server]
  const patch = (id: string, change: Partial<TileDto>) => {
    rows = rows.map((row) => (row.id === id ? { ...row, ...change } : row))
  }
  for (const write of inOrder(writes, 'tile')) {
    const args = write.args as unknown[]
    switch (write.action) {
      case 'tile.create': {
        const [id, label, iconKey] = args as [string, string, string]
        if (!rows.some((row) => row.id === id)) {
          const next = rows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1
          rows.push({ id, label, iconKey, sortOrder: next, hidden: false, color: null })
        }
        break
      }
      case 'tile.update': {
        const [id, label, iconKey] = args as [string, string, string]
        patch(id, { label, iconKey })
        break
      }
      case 'tile.setColor': {
        const [id, color] = args as [string, string | null]
        patch(id, { color })
        break
      }
      case 'tile.setHidden': {
        const [id, hidden] = args as [string, boolean]
        patch(id, { hidden })
        break
      }
      case 'tile.reorder': {
        const ids = args[0] as string[]
        rows = rows.map((row) => (ids.includes(row.id) ? { ...row, sortOrder: ids.indexOf(row.id) } : row))
        break
      }
    }
  }
  return rows
}

interface CreateActivityArgs {
  id: string
  name: string
  tileId?: string | null
  parentId?: string | null
}

export function overlayActivities(server: readonly ActivityRow[], writes: readonly PendingWrite[]): ActivityRow[] {
  let rows = [...server]
  const patch = (id: string, change: Partial<ActivityRow>) => {
    rows = rows.map((row) => (row.id === id ? { ...row, ...change } : row))
  }
  for (const write of inOrder(writes, 'activity')) {
    const args = write.args as unknown[]
    switch (write.action) {
      case 'activity.create': {
        const input = args[0] as CreateActivityArgs
        if (!rows.some((row) => row.id === input.id)) {
          const siblings = rows.filter((row) => row.tileId === (input.tileId ?? null) && row.parentId === (input.parentId ?? null))
          rows.push({
            id: input.id,
            name: input.name,
            tileId: input.tileId ?? null,
            parentId: input.parentId ?? null,
            iconKey: null,
            hidden: false,
            sortOrder: siblings.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1,
            disappearMode: 'manual',
            disappearLimit: null,
          })
        }
        break
      }
      case 'activity.update': {
        const [id, name, iconKey] = args as [string, string, string | undefined]
        patch(id, iconKey === undefined || iconKey === null ? { name } : { name, iconKey })
        break
      }
      case 'activity.setColor': {
        const [id, color] = args as [string, string | null]
        patch(id, { color })
        break
      }
      case 'activity.setHidden': {
        const [id, hidden] = args as [string, boolean]
        patch(id, { hidden })
        break
      }
      case 'activity.setNoteLabels': {
        const [id, first, second] = args as [string, string | null, string | null]
        patch(id, { noteLabel: first, secondNoteLabel: second })
        break
      }
      case 'activity.reorder': {
        const ids = args[0] as string[]
        rows = rows.map((row) => (ids.includes(row.id) ? { ...row, sortOrder: ids.indexOf(row.id) } : row))
        break
      }
    }
  }
  return rows
}

/** Options the user added that the server never confirmed — shown again after a reload until they land. */
export function overlayParameterOptions(server: readonly ParameterOptionDto[], writes: readonly PendingWrite[]): ParameterOptionDto[] {
  const rows = [...server]
  for (const write of inOrder(writes, 'parameterOption')) {
    if (write.action !== 'parameterOption.create') continue
    const [type, label, iconKey, id] = write.args as [ParameterOptionDto['parameterType'], string, string | null, string]
    if (rows.some((row) => row.id === id)) continue
    const next = rows.filter((row) => row.parameterType === type).reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1
    rows.push({ id, parameterType: type, label, iconKey, sortOrder: next })
  }
  return rows
}
