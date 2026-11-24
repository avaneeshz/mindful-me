import { describe, expect, it } from 'vitest'
import { renderLayoutExportPdf } from './layoutExportPdf'
import type { LayoutBoard, LayoutExportData } from '@/domain/layoutExport'

const board = (title: string, count = 2): LayoutBoard => ({
  title,
  categories: [
    {
      name: 'Buttons',
      buttons: Array.from({ length: count }, (_, i) => ({ label: `Button ${i}`, kind: 'Daily number', detail: 'Count' })),
    },
  ],
  hiddenButtons: [{ label: 'Old', kind: 'Checklist', detail: 'Items: A, B' }],
})

const DATA: LayoutExportData = {
  frameName: 'Frame 1',
  frameNumber: 1,
  dateLabel: 'Friday, September 11, 2026',
  header: board('Header'),
  stateTiles: [{ name: 'Body', tiles: [board('Sleep'), board('Movement')] }],
  hiddenTiles: ['Old tile'],
  pages: [board('Dashboard')],
  isEmpty: false,
}

describe('renderLayoutExportPdf', () => {
  it('produces a real PDF for a populated frame', () => {
    expect(renderLayoutExportPdf(DATA).output('datauristring').startsWith('data:application/pdf')).toBe(true)
  })

  it('renders a calm single page for an empty frame', () => {
    const doc = renderLayoutExportPdf({ ...DATA, header: board('Header', 0), stateTiles: [], hiddenTiles: [], pages: [], isEmpty: true })
    expect(doc.getNumberOfPages()).toBe(1)
  })

  it('paginates rather than throwing when a frame has many buttons', () => {
    const many = { ...DATA, header: board('Header', 200) }
    const doc = renderLayoutExportPdf(many)
    expect(doc.getNumberOfPages()).toBeGreaterThan(1)
  })
})
