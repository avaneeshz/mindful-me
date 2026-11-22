import { useEffect, useRef, useState } from 'react'
import { copyButtonInput, type NewHeaderButtonInput } from '@/domain/headerButtonForm'
import { findGroupByName, groupHeaderButtons, type ButtonPageId, BUTTON_PAGES } from '@/domain/headerButtons'
import { newTileNoteKey } from '@/domain/notes'
import { useSharedHeaderButtons } from './HeaderButtonsContext'

/**
 * The first time a button page is opened, fills it with a copy of the header's
 * category of the same name (Dashboard → "Dashboard", Product Page → "Product
 * Page"), category and button order included. After that the page is the user's
 * own: it only ever seeds a page that has no category and no button yet, so
 * deleting a copied button never brings it back.
 *
 * Returns `true` once seeding is settled and the page can render. Buttons are
 * added one per render because each add builds on the previous list.
 */
export function useSeedButtonPage(pageId: ButtonPageId): boolean {
  const { scope, sourceCategory } = BUTTON_PAGES[pageId]
  const { status, groups, visible, tileBoard, addGroup, addButton } = useSharedHeaderButtons()
  const [phase, setPhase] = useState<'waiting' | 'copying' | 'done'>('waiting')
  const pending = useRef<NewHeaderButtonInput[]>([])
  const targetGroupId = useRef<string | null>(null)

  useEffect(() => {
    if (phase === 'done' || (phase === 'waiting' && (status === 'idle' || status === 'loading'))) return

    if (phase === 'waiting') {
      const board = tileBoard(scope)
      const source = findGroupByName(groups, sourceCategory)
      if (board.groups.length > 0 || board.visible.length + board.hidden.length > 0 || !source) {
        setPhase('done')
        return
      }
      const row = groupHeaderButtons(groups, visible).find((r) => r.group.id === source.id)
      pending.current = (row?.buttons ?? []).map((b) => copyButtonInput(b, scope, () => newTileNoteKey(scope)))
      targetGroupId.current = addGroup(source.name, scope).id
      setPhase('copying')
      return
    }

    const next = pending.current.shift()
    if (next) addButton(next, targetGroupId.current)
    else setPhase('done')
  })

  return phase === 'done'
}
