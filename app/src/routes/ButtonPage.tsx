import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EditModeToggle } from '@/components/HeaderButtonEditor'
import { TileButtonsPanel } from '@/components/TileButtonsPanel'
import { BUTTON_PAGES, type ButtonPageId } from '@/domain/headerButtons'
import { useBoard } from '@/state/BoardContext'
import { useSeedButtonPage } from '@/state/useSeedButtonPage'

/**
 * A sidebar page that is one State Tile's window as a screen of its own: the
 * same buttons, categories and Edit mode (`TileButtonsPanel`), minus the free-
 * form notes box. The page has its own Edit toggle, independent of the header's.
 */
function ButtonPage({ pageId }: { pageId: ButtonPageId }) {
  const { scope, title } = BUTTON_PAGES[pageId]
  const ready = useSeedButtonPage(pageId)
  const { dispatch } = useBoard()
  const navigate = useNavigate()
  const [editMode, setEditMode] = useState(false)

  return (
    <section aria-label={title} className="mb-5xl mt-xl flex flex-col gap-xl ipad-land:mt-md">
      <div className="flex items-center justify-between gap-md border-b border-line pb-md">
        <h2 className="min-w-0 truncate font-display text-h1-sm font-semibold text-ink">{title}</h2>
        <EditModeToggle active={editMode} onToggle={() => setEditMode((v) => !v)} />
      </div>

      {ready ? (
        <TileButtonsPanel
          card={scope}
          title={title}
          editMode={editMode}
          // The log form lives on Today, so step out to it.
          onEditActivity={(id) => {
            navigate('/')
            dispatch({ type: 'editActivity', id })
          }}
        />
      ) : (
        <p className="text-caption text-ink-dim">Loading your buttons…</p>
      )}
    </section>
  )
}

export function DashboardPage() {
  return <ButtonPage pageId="dashboard" />
}

export function ProductPage() {
  return <ButtonPage pageId="product" />
}
