/**
 * Renders `LayoutExportData` (`domain/layoutExport.ts`) to a PDF and triggers
 * the browser download. Page mechanics are shared with the day summary via
 * `lib/pdfKit.ts`; this only decides how a layout reads on the page.
 */
import { jsPDF } from 'jspdf'
import type { LayoutBoard, LayoutButton, LayoutExportData } from '@/domain/layoutExport'
import {
  INK,
  INK_DIM,
  MARGIN,
  PAGE_WIDTH,
  bodyLine,
  emptyNotice,
  ensureSpace,
  ruleLine,
  sectionHeading,
  type Cursor,
} from '@/lib/pdfKit'

function buttonRow(cursor: Cursor, button: LayoutButton, hidden = false): void {
  ensureSpace(cursor, 28)
  cursor.doc.setFont('helvetica', 'bold')
  cursor.doc.setFontSize(10.5)
  cursor.doc.setTextColor(hidden ? INK_DIM : INK)
  cursor.doc.text(button.label, MARGIN + 14, cursor.y)

  cursor.doc.setFont('helvetica', 'normal')
  cursor.doc.setFontSize(9.5)
  cursor.doc.setTextColor(INK_DIM)
  const width = cursor.doc.getTextWidth(button.kind)
  cursor.doc.text(button.kind, PAGE_WIDTH - MARGIN - width, cursor.y)
  cursor.y += 13
  if (button.detail) bodyLine(cursor, button.detail, { size: 9, color: INK_DIM })
  cursor.y += 3
}

function subHeading(cursor: Cursor, text: string, size = 11.5): void {
  ensureSpace(cursor, 34)
  cursor.doc.setFont('helvetica', 'bold')
  cursor.doc.setFontSize(size)
  cursor.doc.setTextColor(INK)
  cursor.doc.text(text, MARGIN, cursor.y)
  cursor.y += 16
}

function renderBoard(cursor: Cursor, board: LayoutBoard, headingSize?: number): void {
  subHeading(cursor, board.title, headingSize)
  const shown = board.categories.filter((c) => c.buttons.length > 0)
  if (shown.length === 0 && board.hiddenButtons.length === 0) {
    emptyNotice(cursor, 'No buttons.')
    return
  }
  for (const category of shown) {
    cursor.doc.setFont('helvetica', 'normal')
    cursor.doc.setFontSize(9.5)
    cursor.doc.setTextColor(INK_DIM)
    ensureSpace(cursor, 30)
    cursor.doc.text(category.name.toUpperCase(), MARGIN + 14, cursor.y)
    cursor.y += 14
    for (const button of category.buttons) buttonRow(cursor, button)
    cursor.y += 4
  }
  if (board.hiddenButtons.length > 0) {
    cursor.doc.setFont('helvetica', 'normal')
    cursor.doc.setFontSize(9.5)
    cursor.doc.setTextColor(INK_DIM)
    ensureSpace(cursor, 30)
    cursor.doc.text('HIDDEN', MARGIN + 14, cursor.y)
    cursor.y += 14
    for (const button of board.hiddenButtons) buttonRow(cursor, button, true)
  }
  cursor.y += 6
}

/** Builds the finished document. Exported separately so it stays testable without a real browser download. */
export function renderLayoutExportPdf(data: LayoutExportData): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const cursor: Cursor = { doc, y: MARGIN }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(INK_DIM)
  doc.text('mindful-me · layout', MARGIN, cursor.y)
  cursor.y += 22

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(INK)
  doc.text(data.frameName, MARGIN, cursor.y)
  cursor.y += 20

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(INK_DIM)
  doc.text(`Captured ${data.dateLabel}`, MARGIN, cursor.y)
  cursor.y += 20
  ruleLine(cursor)

  if (data.isEmpty) {
    bodyLine(cursor, 'Nothing is set up in this frame yet.', { color: INK_DIM, size: 12 })
    return doc
  }

  sectionHeading(cursor, 'Header buttons')
  renderBoard(cursor, { ...data.header, title: 'Header' })

  if (data.stateTiles.length > 0) {
    ruleLine(cursor)
    sectionHeading(cursor, 'State Tiles')
    for (const category of data.stateTiles) {
      subHeading(cursor, category.name, 12.5)
      for (const tile of category.tiles) renderBoard(cursor, tile, 10.5)
    }
    if (data.hiddenTiles.length > 0) {
      emptyNotice(cursor, `Hidden tiles: ${data.hiddenTiles.join(', ')}`)
    }
  }

  if (data.pages.length > 0) {
    ruleLine(cursor)
    sectionHeading(cursor, 'Pages')
    for (const page of data.pages) renderBoard(cursor, page)
  }

  return doc
}

/** Renders and immediately triggers the browser download, named `mindful-me-layout-frame-N.pdf`. */
export function downloadLayoutExportPdf(data: LayoutExportData): void {
  renderLayoutExportPdf(data).save(`mindful-me-layout-frame-${data.frameNumber}.pdf`)
}
