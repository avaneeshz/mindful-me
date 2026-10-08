import { formatDetail } from '@/domain/activityLog'
import type { PendingWrite } from './pendingWritesQueue'

/**
 * How one unconfirmed change reads in the "Needs attention" list. Pure, so the
 * wording for every state is tested without rendering anything.
 */
export type PendingWriteState = 'rejected' | 'retrying' | 'sending'

export interface PendingWriteRow {
  id: string
  state: PendingWriteState
  /** The change, in words — e.g. `Add note on “Relational Nutrient”`. */
  title: string
  /** Why it is here, in plain words. */
  reason: string
  /** Everything that was going to be sent, readable and selectable. */
  detail: string | undefined
  attempts: number
  createdAt: number
}

function waitText(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000))
  if (seconds < 60) return seconds === 1 ? '1 second' : `${seconds} seconds`
  const minutes = Math.round(seconds / 60)
  return minutes === 1 ? '1 minute' : `${minutes} minutes`
}

export function describePendingWrite(write: PendingWrite, now: number): PendingWriteRow {
  const state: PendingWriteState = write.permanent ? 'rejected' : write.attempts > 0 ? 'retrying' : 'sending'
  const reason =
    state === 'rejected'
      ? 'The server refused this change, so it will not be retried on its own. Retry it, or discard it and make the change again.'
      : state === 'retrying'
        ? `The server did not accept it yet (tried ${write.attempts} ${write.attempts === 1 ? 'time' : 'times'}). Trying again in ${waitText(write.nextAttemptAt - now)}.`
        : 'Saved on this device and being sent.'
  return { id: write.id, state, title: write.label, reason, detail: formatDetail(write.args), attempts: write.attempts, createdAt: write.createdAt }
}

const ORDER: Record<PendingWriteState, number> = { rejected: 0, retrying: 1, sending: 2 }

/** Refused changes first (they need a decision), then the rest, oldest first. */
export function pendingWriteRows(writes: readonly PendingWrite[], now: number): PendingWriteRow[] {
  return writes
    .map((write) => describePendingWrite(write, now))
    .sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.createdAt - b.createdAt)
}
