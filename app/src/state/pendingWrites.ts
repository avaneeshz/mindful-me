import { apiCreateActivity, apiReorderActivities, apiSetActivityColor, apiSetActivityHidden, apiSetActivityNoteLabels, apiUpdateActivity } from '@/api/activityHierarchy'
import { apiCreateHeaderButton, apiReorderHeaderButtons, apiSetHeaderButtonHidden, apiUpdateHeaderButton } from '@/api/headerButtons'
import { apiCreateNoteEntry, apiDeleteNoteEntry, apiUpdateNoteEntry } from '@/api/notes'
import { apiCreateParameterOption } from '@/api/parameterOptions'
import { apiSetDailyValue } from '@/api/dailyValues'
import { apiSetSupplementCompletion } from '@/api/supplements'
import { apiCreateTile, apiReorderTiles, apiSetTileColor, apiSetTileHidden, apiUpdateTile } from '@/api/tiles'
import { logActivity } from '@/lib/activityLogger'
import {
  addWrite,
  amendWrite,
  findWrite,
  makeAllDue,
  markWriteFailed,
  markWritePermanent,
  nextDueWrite,
  pendingIds,
  removeWrite,
  writesForUser,
  type PendingWrite,
  type PendingWrites,
} from './pendingWritesQueue'
import { loadIdMap, loadPendingWrites, savePendingWrites, saveIdMap } from './pendingWritesStorage'

/**
 * Write-through for every user change that is not a scheduled activity.
 *
 * Before: the screen updated instantly, called the API fire-and-forget, and if
 * it failed it showed a message once and forgot — and the next load replaced
 * the screen's list with the server's, erasing the change. Now every such
 * change is first written to a durable ledger (`pendingWritesQueue.ts`), then
 * sent. It leaves the ledger only when the server confirms. A failed send
 * backs off and is retried on its own (on a timer, when the network returns,
 * on "Retry now", and after a reload / sign-out / sign-in), and meanwhile
 * `getPendingIds` tells every reconcile which rows it must not overwrite.
 *
 * Nothing here expires.
 */
export type WriteOutcome = 'ok' | 'retry' | 'rejected'
interface Executed {
  outcome: WriteOutcome
  result: unknown
}

const bool = (ok: boolean): Executed => ({ outcome: ok ? 'ok' : 'retry', result: ok })
const nullable = (value: unknown): Executed => ({ outcome: value === null ? 'retry' : 'ok', result: value })
const reasoned = (result: { ok: boolean; reason?: string }): Executed => ({
  outcome: result.ok ? 'ok' : result.reason === 'duplicate_name' ? 'rejected' : 'retry',
  result,
})

/** Where the server assigned its own id (notes), the device-made id a later edit still carries maps to it. */
let idMap: Record<string, string> = {}
const serverId = (id: string): string => idMap[id] ?? id
function rememberServerId(write: Pick<PendingWrite, 'action' | 'recordId'>, result: unknown): void {
  if (write.action !== 'note.create') return
  const created = (result as { id?: string } | null)?.id
  if (!created || created === write.recordId) return
  idMap = { ...idMap, [write.recordId]: created }
  saveIdMap(idMap)
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Replay handlers, by action name. The args are exactly what the hook passed, round-tripped through JSON. */
const executors: Record<string, (...args: any[]) => Promise<Executed>> = {
  'tile.create': async (id, label, iconKey) => nullable(await apiCreateTile(id, label, iconKey)),
  'tile.update': async (id, label, iconKey) => bool(await apiUpdateTile(id, label, iconKey)),
  'tile.setColor': async (id, color) => bool(await apiSetTileColor(id, color)),
  'tile.setHidden': async (id, hidden) => bool(await apiSetTileHidden(id, hidden)),
  'tile.reorder': async (ids) => bool(await apiReorderTiles(ids)),
  'activity.create': async (input) => reasoned(await apiCreateActivity(input)),
  'activity.update': async (id, name, iconKey) => reasoned(await apiUpdateActivity(id, name, iconKey)),
  'activity.setColor': async (id, color) => bool(await apiSetActivityColor(id, color)),
  'activity.setHidden': async (id, hidden) => bool(await apiSetActivityHidden(id, hidden)),
  'activity.setNoteLabels': async (id, first, second) => bool(await apiSetActivityNoteLabels(id, first, second)),
  'activity.reorder': async (ids) => bool(await apiReorderActivities(ids)),
  'headerButton.create': async (input) => nullable(await apiCreateHeaderButton(input)),
  'headerButton.update': async (input) => bool(await apiUpdateHeaderButton(input)),
  'headerButton.setHidden': async (id, hidden) => bool(await apiSetHeaderButtonHidden(id, hidden)),
  'headerButton.reorder': async (ids) => bool(await apiReorderHeaderButtons(ids)),
  'note.create': async (buttonKey, note, types) => nullable(await apiCreateNoteEntry(buttonKey, note, types)),
  'note.update': async (id, note, types) => nullable(await apiUpdateNoteEntry(serverId(id), note, types)),
  'note.delete': async (id) => bool(await apiDeleteNoteEntry(serverId(id))),
  'parameterOption.create': async (type, label, iconKey, id) => nullable(await apiCreateParameterOption(type, label, iconKey, id)),
  'supplement.set': async (buttonId, itemKey, localDate, done, note) =>
    nullable(await apiSetSupplementCompletion(buttonId, itemKey, localDate, done, note)),
  'dailyValue.set': async (metricKey, localDate, value) => nullable(await apiSetDailyValue(metricKey, localDate, value)),
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const DRAIN_EVERY_MS = 15_000

let queue: PendingWrites = []
let loaded = false
let currentUserId: string | null = null
let snapshot: readonly PendingWrite[] = []
const inFlight = new Set<string>()
let draining = false
let timer: ReturnType<typeof setInterval> | null = null
const listeners = new Set<() => void>()

function commit(next: PendingWrites): void {
  queue = next
  savePendingWrites(queue)
  snapshot = writesForUser(queue, currentUserId)
  for (const listener of listeners) listener()
}

function ensureLoaded(): void {
  if (loaded) return
  loaded = true
  queue = [...loadPendingWrites(), ...queue]
  idMap = { ...loadIdMap(), ...idMap }
  snapshot = writesForUser(queue, currentUserId)
}

/** Called by the auth layer whenever the signed-in user changes. */
export function setPendingWritesUser(userId: string | null): void {
  ensureLoaded()
  currentUserId = userId
  snapshot = writesForUser(queue, userId)
  for (const listener of listeners) listener()
  if (userId === null) return
  void drain()
  if (!timer) {
    timer = setInterval(() => void drain(), DRAIN_EVERY_MS)
    ;(timer as { unref?: () => void }).unref?.()
    globalThis.addEventListener?.('online', () => void drain())
  }
}

export interface WriteSpec {
  action: string
  entity: string
  recordId: string
  op: 'save' | 'delete'
  args: unknown[]
  /** Plain words for the activity log, e.g. `Rename tile “Work”`. */
  label: string
  /** A newer change to the same record replaces an unsent older one (idempotent "set" actions only). */
  coalesce?: boolean
}

export type WriteStatus = 'ok' | 'queued' | 'rejected'
export interface WriteResult<R> {
  /** `ok` — the server confirmed. `queued` — saved on this device, will keep retrying. `rejected` — the server refused it for good. */
  status: WriteStatus
  result: R | null
}

async function execute(write: Pick<PendingWrite, 'action' | 'args'>): Promise<Executed> {
  const run = executors[write.action]
  if (!run) return { outcome: 'retry', result: null }
  try {
    return await run(...write.args)
  } catch {
    return { outcome: 'retry', result: null }
  }
}

function describeFailure(write: PendingWrite): string {
  return executors[write.action] ? 'The server did not accept it yet' : `Unknown change type “${write.action}” — kept until the app is updated`
}

/**
 * Records the change durably, then sends it. Resolves once the first attempt
 * is over; a failed attempt is NOT lost — it is retried by the drain loop.
 */
export async function writeThrough<R = unknown>(spec: WriteSpec): Promise<WriteResult<R>> {
  ensureLoaded()
  const userId = currentUserId
  if (!userId) {
    const direct = await execute(spec)
    return { status: direct.outcome === 'ok' ? 'ok' : direct.outcome === 'rejected' ? 'rejected' : 'queued', result: direct.result as R }
  }

  if (spec.coalesce) {
    const existing = queue.find(
      (w) => w.userId === userId && w.entity === spec.entity && w.recordId === spec.recordId && w.action === spec.action && !inFlight.has(w.id),
    )
    if (existing) {
      commit(amendWrite(queue, existing.id, { args: spec.args, label: spec.label }))
      logActivity({ kind: 'save', summary: `Saved on device: ${spec.label}`, detail: spec.args })
      void drain()
      return { status: 'queued', result: null }
    }
  }

  const write: PendingWrite = {
    id: crypto.randomUUID(),
    userId,
    action: spec.action,
    entity: spec.entity,
    recordId: spec.recordId,
    op: spec.op,
    args: spec.args,
    label: spec.label,
    createdAt: Math.max(Date.now(), ...queue.map((w) => w.createdAt + 1)),
    attempts: 0,
    status: 'pending',
    lastError: null,
    permanent: false,
    nextAttemptAt: 0,
  }
  const blocked = queue.some((w) => w.userId === userId && w.entity === spec.entity && w.recordId === spec.recordId)
  commit(addWrite(queue, write))
  logActivity({ kind: 'save', summary: `Saved on device: ${spec.label}`, detail: spec.args })

  if (blocked) {
    // An earlier change to this record is still unconfirmed — it must land first.
    void drain()
    return { status: 'queued', result: null }
  }

  inFlight.add(write.id)
  const executed = await execute(write)
  inFlight.delete(write.id)

  if (executed.outcome === 'ok') {
    rememberServerId(write, executed.result)
    commit(removeWrite(queue, write.id))
    return { status: 'ok', result: executed.result as R }
  }
  if (executed.outcome === 'rejected') {
    // The caller rolls the screen back and tells the user (e.g. a duplicate name) — nothing left to retry.
    commit(removeWrite(queue, write.id))
    logActivity({ kind: 'sync', level: 'error', summary: `Rejected by the server: ${spec.label}`, detail: { args: spec.args, result: executed.result } })
    return { status: 'rejected', result: executed.result as R }
  }
  const reason = describeFailure(write)
  commit(markWriteFailed(queue, write.id, reason, Date.now()))
  logActivity({ kind: 'sync', level: 'error', summary: `Not synced: ${spec.label} — kept on this device, will retry`, detail: { args: spec.args, error: reason } })
  return { status: 'queued', result: null }
}

/** Replays whatever is due, one at a time, oldest first. */
export async function drain(): Promise<void> {
  ensureLoaded()
  if (draining || !currentUserId) return
  draining = true
  try {
    for (;;) {
      const write = nextDueWrite(queue, currentUserId, Date.now(), inFlight)
      if (!write) return
      inFlight.add(write.id)
      const executed = await execute(write)
      inFlight.delete(write.id)
      // The entry may have been cancelled or amended while in flight.
      if (!queue.some((w) => w.id === write.id)) continue
      if (executed.outcome === 'ok') {
        rememberServerId(write, executed.result)
        commit(removeWrite(queue, write.id))
        logActivity({ kind: 'sync', summary: `Synced: ${write.label} (after ${write.attempts + 1} ${write.attempts === 0 ? 'try' : 'tries'})`, detail: write.args })
      } else if (executed.outcome === 'rejected') {
        commit(markWritePermanent(queue, write.id, 'The server refused this change'))
        logActivity({ kind: 'sync', level: 'error', summary: `Rejected by the server: ${write.label} — kept, needs attention`, detail: { args: write.args, result: executed.result } })
      } else {
        const reason = describeFailure(write)
        commit(markWriteFailed(queue, write.id, reason, Date.now()))
        logActivity({ kind: 'sync', level: 'error', summary: `Not synced: ${write.label} — attempt ${write.attempts + 1}`, detail: { args: write.args, error: reason } })
      }
    }
  } finally {
    draining = false
  }
}

export function retryPendingWritesNow(): void {
  if (!currentUserId) return
  commit(makeAllDue(queue, currentUserId, Date.now()))
  void drain()
}

/** Ids a reconcile must not overwrite (`save`) or resurrect (`delete`) for this entity. */
export function getPendingIds(entity: string): { save: Set<string>; delete: Set<string> } {
  ensureLoaded()
  return { save: pendingIds(queue, currentUserId, entity, 'save'), delete: pendingIds(queue, currentUserId, entity, 'delete') }
}

/** Edits an unsent change in place (e.g. a note edited before its create ever landed). False if it is gone or already in flight. */
export function amendPendingWrite(entity: string, recordId: string, action: string, patch: { args: unknown[]; label: string }): boolean {
  ensureLoaded()
  if (!currentUserId) return false
  const write = findWrite(queue, currentUserId, entity, recordId, action)
  if (!write || inFlight.has(write.id)) return false
  commit(amendWrite(queue, write.id, patch))
  logActivity({ kind: 'save', summary: `Saved on device: ${patch.label}`, detail: patch.args })
  return true
}

/** Drops an unsent change (e.g. deleting a note whose create never landed). False if it is gone or already in flight. */
export function cancelPendingWrite(entity: string, recordId: string, action: string, label: string): boolean {
  ensureLoaded()
  if (!currentUserId) return false
  const write = findWrite(queue, currentUserId, entity, recordId, action)
  if (!write || inFlight.has(write.id)) return false
  commit(removeWrite(queue, write.id))
  logActivity({ kind: 'save', summary: `Saved on device: ${label}`, detail: { cancelledUnsent: write.args } })
  return true
}

export function subscribePendingWrites(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getPendingWritesSnapshot(): readonly PendingWrite[] {
  return snapshot
}

/** Test seam. */
export function resetPendingWritesForTests(): void {
  queue = []
  idMap = {}
  loaded = false
  currentUserId = null
  snapshot = []
  inFlight.clear()
  draining = false
}
