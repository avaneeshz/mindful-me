import { useNavigate } from 'react-router-dom'
import { TileButtonsPanel } from '@/components/TileButtonsPanel'
import { BUTTON_PAGES, type ButtonPageId } from '@/domain/headerButtons'
import { useBoard } from '@/state/BoardContext'
import { useEditMode } from '@/state/EditModeContext'
import { useSeedButtonPage } from '@/state/useSeedButtonPage'

/**
 * A sidebar page that is one State Tile's window as a screen of its own: the
 * same buttons, categories and Edit mode (`TileButtonsPanel`), minus the free-
 * form notes box. Edit mode is the top bar's Edit toggle.
 */
function ButtonPage({ pageId }: { pageId: ButtonPageId }) {
  const { scope, title } = BUTTON_PAGES[pageId]
  const ready = useSeedButtonPage(pageId)
  const { dispatch } = useBoard()
  const navigate = useNavigate()
  // The top bar's Edit is the one Edit control: here it turns on adding categories and buttons, and dragging.
  const { editMode } = useEditMode()

  return (
    <section aria-label={title} className="mb-5xl mt-xl flex flex-col gap-xl ipad-land:mt-md">
      <h2 className="min-w-0 truncate border-b border-line pb-md font-display text-h1-sm font-semibold text-ink">{title}</h2>

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
