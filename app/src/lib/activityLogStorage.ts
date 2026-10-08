import type { ActivityLogEntry } from '@/domain/activityLog'

/**
 * The one device-storage adapter for the activity log (MOBILE-READINESS.md:
 * browser storage lives behind a small adapter). IndexedDB, not localStorage:
 * the log keeps full note text for three days and can outgrow localStorage's
 * ~5 MB. Fail-closed like `lib/storage.ts` — where IndexedDB is unavailable
 * (private mode, blocked by policy, tests) the log still works for the
 * session in memory and simply isn't durable across a reload.
 */
const DB_NAME = 'mindful-me-activity-log'
const STORE = 'entries'

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE, { keyPath: 'id' })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined)
        try {
          const tx = db.transaction(STORE, mode)
          const request = work(tx.objectStore(STORE))
          tx.oncomplete = () => resolve(request ? request.result : undefined)
          tx.onerror = () => resolve(undefined)
          tx.onabort = () => resolve(undefined)
        } catch {
          resolve(undefined)
        }
      }),
  )
}

export async function loadAllLogEntries(): Promise<ActivityLogEntry[]> {
  const rows = await run<ActivityLogEntry[]>('readonly', (store) => store.getAll())
  return Array.isArray(rows) ? rows : []
}

export async function saveLogEntry(entry: ActivityLogEntry): Promise<void> {
  await run('readwrite', (store) => store.put(entry))
}

export async function deleteLogEntries(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return
  await run('readwrite', (store) => {
    for (const id of ids) store.delete(id)
  })
}
