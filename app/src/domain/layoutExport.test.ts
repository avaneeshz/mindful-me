import { describe, expect, it } from 'vitest'
import { DEFAULT_HEADER_BUTTONS, DEFAULT_HEADER_BUTTON_GROUPS, type HeaderButtonConfig } from './headerButtons'
import { assembleLayoutExport, type LayoutExportInput } from './layoutExport'

const empty = { visible: [], hidden: [], groups: [{ id: 'g', name: 'Buttons', sortOrder: 0 }] }

function input(overrides: Partial<LayoutExportInput> = {}): LayoutExportInput {
  return {
    frameNumber: 2,
    frameName: 'Work',
    now: new Date(2026, 8, 11),
    header: empty,
    tileCategories: [],
    hiddenTileCards: [],
    tileTitle: (card) => `Tile ${card}`,
    boardFor: () => empty,
    ...overrides,
  }
}

describe('assembleLayoutExport', () => {
  it('reports an empty frame as empty rather than blank sections', () => {
    const data = assembleLayoutExport(input())
    expect(data.isEmpty).toBe(true)
    expect(data.frameName).toBe('Work')
    expect(data.frameNumber).toBe(2)
  })

  it('lists the header buttons by category, with what each one is', () => {
    const data = assembleLayoutExport(
      input({ header: { visible: DEFAULT_HEADER_BUTTONS, hidden: [], groups: DEFAULT_HEADER_BUTTON_GROUPS } }),
    )
    const labels = data.header.categories.flatMap((c) => c.buttons.map((b) => b.label))
    expect(labels).toEqual(expect.arrayContaining(['Extra Senses', 'Vipassana', 'Steps', 'Protein', 'Supplements']))
    const protein = data.header.categories.flatMap((c) => c.buttons).find((b) => b.label === 'Protein')
    expect(protein).toMatchObject({ kind: 'Daily number', detail: 'Daily target 80' })
    const supplements = data.header.categories.flatMap((c) => c.buttons).find((b) => b.label === 'Supplements')
    expect(supplements?.kind).toBe('Checklist')
    expect(supplements?.detail).toContain('Zinc')
    expect(data.isEmpty).toBe(false)
  })

  it('keeps hidden buttons in their own list, not mixed into the shown ones', () => {
    const [first, second] = DEFAULT_HEADER_BUTTONS as readonly HeaderButtonConfig[]
    const data = assembleLayoutExport(
      input({ header: { visible: [first!], hidden: [{ ...second!, hidden: true }], groups: DEFAULT_HEADER_BUTTON_GROUPS } }),
    )
    expect(data.header.hiddenButtons.map((b) => b.label)).toEqual([second!.label])
    expect(data.header.categories.flatMap((c) => c.buttons.map((b) => b.label))).toEqual([first!.label])
  })

  it('includes State Tiles by category with their own buttons, and names hidden tiles', () => {
    const steps = DEFAULT_HEADER_BUTTONS.find((b) => b.id === 'steps')!
    const data = assembleLayoutExport(
      input({
        tileCategories: [{ name: 'Body', cards: [3, 4] }, { name: 'Empty', cards: [] }],
        hiddenTileCards: [9],
        boardFor: (card) => (card === 3 ? { visible: [steps], hidden: [], groups: empty.groups } : empty),
      }),
    )
    expect(data.stateTiles.map((c) => c.name)).toEqual(['Body'])
    expect(data.stateTiles[0]!.tiles.map((t) => t.title)).toEqual(['Tile 3', 'Tile 4'])
    expect(data.stateTiles[0]!.tiles[0]!.categories[0]!.buttons[0]!.label).toBe('Steps')
    expect(data.hiddenTiles).toEqual(['Tile 9'])
    expect(data.isEmpty).toBe(false)
  })

  it('only lists sidebar pages that have buttons', () => {
    const steps = DEFAULT_HEADER_BUTTONS.find((b) => b.id === 'steps')!
    const data = assembleLayoutExport(
      input({ boardFor: (card) => (card === 499 ? { visible: [steps], hidden: [], groups: empty.groups } : empty) }),
    )
    expect(data.pages.map((p) => p.title)).toEqual(['Dashboard'])
  })
})
