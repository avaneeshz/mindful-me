import {
  apiCreateCatalogActivity,
  apiCreateCatalogCategory,
  apiSetActivityActive,
  apiSetActivityAttributeOptions,
  apiSetCatalogCategoryActive,
} from '@/api/catalog'
import { isTempId, type PendingCatalogOp } from './configReducer'

/**
 * Executes the Configuration screen's queued operations against the server,
 * in the background, AFTER `SettingsPage.tsx`'s Save has already applied the
 * merged result to `CatalogContext` (rule 6 — instant locally, sync is a
 * background concern the UI never waits on).
 *
 * Ops run SEQUENTIALLY, not in parallel like `state/sync.ts`'s
 * `runSyncIntents` — a `createActivity` op may reference a `createCategory`
 * op's `tempId` as its `categoryId`/`parentId` (you can only add a card to a
 * tile, or a sub to a card, that already exists in your OWN working state —
 * `configReducer.ts` guarantees every op is queued in that same dependency
 * order), so each `create*` op's real id is recorded and substituted into
 * every later op that still names its `tempId`, before that later op runs.
 * A single op's failure is logged and skipped — it does not stop the rest of
 * the queue (matching `runSyncIntents`'s own "never blocks, never throws
 * past this module" contract), since one broken row is not a reason to also
 * abandon every other already-applied local change.
 */
export async function runConfigSyncOps(ops: readonly PendingCatalogOp[]): Promise<void> {
  const realIdFor = new Map<string, string>()

  function resolve(id: string | null): string | null {
    if (id === null) return null
    return isTempId(id) ? (realIdFor.get(id) ?? null) : id
  }

  for (const op of ops) {
    try {
      switch (op.kind) {
        case 'createCategory': {
          const id = await apiCreateCatalogCategory(op.label, op.iconKey)
          if (id) realIdFor.set(op.tempId, id)
          break
        }
        case 'createActivity': {
          const categoryId = resolve(op.categoryId)
          const parentId = resolve(op.parentId)
          // The parent this row attaches to never made it to the server (its
          // own create must have failed) — nothing valid to attach to.
          if ((op.categoryId && !categoryId) || (op.parentId && !parentId)) break
          const id = await apiCreateCatalogActivity({ name: op.name, categoryId, parentId, iconKey: op.iconKey })
          if (id) realIdFor.set(op.tempId, id)
          break
        }
        case 'deactivateCategory':
          await apiSetCatalogCategoryActive(op.id, false)
          break
        case 'deactivateActivity':
          await apiSetActivityActive(op.id, false)
          break
        case 'setAttributeOptions':
          await apiSetActivityAttributeOptions(op.activityId, op.attributeType, op.optionIds)
          break
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(`[catalog] ${op.kind} failed to sync — local state is still correct, will retry next save`, error)
    }
  }
}
