/**
 * Pure assembly of "how this frame is set up right now" into a plain data
 * shape — the "download current layout" feature. No React, no PDF library
 * (mirrors `domain/dayExport.ts`); `lib/layoutExportPdf.ts` lays it out.
 *
 * A frame's layout is everything the user arranged: the header's categories
 * and the buttons in each, the State Tiles (in their categories, with each
 * tile's own buttons), and the sidebar's button pages. Hidden buttons and
 * tiles are listed too, so the file is a complete record of the setup.
 */
import { headerButtonCategoryLabel, groupHeaderButtons, BUTTON_PAGES, type HeaderButtonConfig, type HeaderButtonGroup } from './headerButtons'

export interface LayoutButton {
  label: string
  /** "Quick activity", "Checklist", "Content entry" or "Daily number". */
  kind: string
  /** One short line of how it is set up, or `null` when there is nothing more to say. */
  detail: string | null
}

export interface LayoutCategory {
  name: string
  buttons: LayoutButton[]
}

/** A place that holds buttons in categories: the header, a State Tile or a sidebar page. */
export interface LayoutBoard {
  title: string
  categories: LayoutCategory[]
  hiddenButtons: LayoutButton[]
}

export interface LayoutTileCategory {
  name: string
  tiles: LayoutBoard[]
}

export interface LayoutExportData {
  frameName: string
  /** 1-based frame number — used for the downloaded file's name. */
  frameNumber: number
  /** e.g. "Friday, September 11, 2026" — when the layout was captured. */
  dateLabel: string
  header: LayoutBoard
  stateTiles: LayoutTileCategory[]
  hiddenTiles: string[]
  pages: LayoutBoard[]
  /** True when the frame has no buttons or tiles anywhere. */
  isEmpty: boolean
}

export interface BoardSource {
  visible: readonly HeaderButtonConfig[]
  hidden: readonly HeaderButtonConfig[]
  groups: readonly HeaderButtonGroup[]
}

export interface LayoutExportInput {
  frameNumber: number
  frameName: string
  now: Date
  header: BoardSource
  /** The State Tile categories in order, each with its shown tiles (card numbers). */
  tileCategories: readonly { name: string; cards: readonly number[] }[]
  hiddenTileCards: readonly number[]
  tileTitle: (card: number) => string
  /** A tile's (or page's) own buttons and categories. */
  boardFor: (card: number) => BoardSource
}

function describeButton(button: HeaderButtonConfig): LayoutButton {
  const kind = headerButtonCategoryLabel(button.category)
  let detail: string | null = null
  switch (button.category) {
    case 'activity': {
      const parts: string[] = []
      if (button.activityName) parts.push(`Logs ${button.activityName}`)
      if (button.entryMode === 'songCount') parts.push('entered as a song count')
      if (button.quickLogType) parts.push(`${button.quickLogTypeLabel} choice`)
      const fields = button.noteFields.map((f) => f.label)
      if (fields.length > 0) parts.push(`fields: ${fields.join(', ')}`)
      detail = parts.length > 0 ? parts.join(' · ') : null
      break
    }
    case 'day_value': {
      if (button.dayValueUnit === 'target' && button.dayValueTarget !== null) detail = `Daily target ${button.dayValueTarget}`
      else if (button.dayValueUnit === 'min') detail = 'Minutes'
      else detail = 'Count'
      break
    }
    case 'notes':
      detail = button.noteTypes.length > 0 ? `Types: ${button.noteTypes.join(', ')}` : null
      break
    case 'checklist':
      detail = button.checklistItems.length > 0 ? `Items: ${button.checklistItems.map((i) => i.label).join(', ')}` : 'No items'
      break
  }
  return { label: button.label, kind, detail }
}

function assembleBoard(title: string, source: BoardSource): LayoutBoard {
  return {
    title,
    categories: groupHeaderButtons(source.groups, source.visible).map((row) => ({
      name: row.group.name,
      buttons: row.buttons.map(describeButton),
    })),
    hiddenButtons: source.hidden.map(describeButton),
  }
}

function boardHasButtons(board: LayoutBoard): boolean {
  return board.hiddenButtons.length > 0 || board.categories.some((c) => c.buttons.length > 0)
}

export function assembleLayoutExport(input: LayoutExportInput): LayoutExportData {
  const header = assembleBoard('Header', input.header)

  const stateTiles: LayoutTileCategory[] = input.tileCategories
    .filter((category) => category.cards.length > 0)
    .map((category) => ({
      name: category.name,
      tiles: category.cards.map((card) => assembleBoard(input.tileTitle(card), input.boardFor(card))),
    }))

  const pages = Object.values(BUTTON_PAGES)
    .map((page) => assembleBoard(page.title, input.boardFor(page.scope)))
    .filter(boardHasButtons)

  return {
    frameName: input.frameName,
    frameNumber: input.frameNumber,
    dateLabel: input.now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    header,
    stateTiles,
    hiddenTiles: input.hiddenTileCards.map(input.tileTitle),
    pages,
    isEmpty: !boardHasButtons(header) && stateTiles.length === 0 && pages.length === 0,
  }
}
