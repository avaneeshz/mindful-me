import { useSyncExternalStore } from 'react'
import { getActivityLogSnapshot, subscribeActivityLog } from '@/lib/activityLogger'
import type { ActivityLogEntry } from '@/domain/activityLog'

/** The signed-in user's last three days of activity, newest first. Live. */
export function useActivityLog(): readonly ActivityLogEntry[] {
  return useSyncExternalStore(subscribeActivityLog, getActivityLogSnapshot, getActivityLogSnapshot)
}
