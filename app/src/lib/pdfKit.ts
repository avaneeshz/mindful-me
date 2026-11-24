/**
 * The small set of page-layout helpers both PDF exports (the day summary and
 * the layout) share: a cursor that walks down an A4 page, adding pages as it
 * goes, plus headings, wrapped lines and rules. Nothing here knows what goes
 * in a document — only how to lay text out on one.
 */
import type { jsPDF } from 'jspdf'

export const PAGE_WIDTH = 595.28 // A4, points
export const PAGE_HEIGHT = 841.89
export const MARGIN = 56
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2

export const INK = '#1a1a1a'
export const INK_DIM = '#6b6b6b'
export const LINE = '#dcdcdc'

export interface Cursor {
  doc: jsPDF
  y: number
}

export function ensureSpace(cursor: Cursor, needed: number): void {
  if (cursor.y + needed <= PAGE_HEIGHT - MARGIN) return
  cursor.doc.addPage()
  cursor.y = MARGIN
}

export function ruleLine(cursor: Cursor): void {
  ensureSpace(cursor, 1)
  cursor.doc.setDrawColor(LINE)
  cursor.doc.line(MARGIN, cursor.y, PAGE_WIDTH - MARGIN, cursor.y)
  cursor.y += 18
}

export function sectionHeading(cursor: Cursor, text: string): void {
  ensureSpace(cursor, 28)
  cursor.doc.setFont('helvetica', 'bold')
  cursor.doc.setFontSize(13)
  cursor.doc.setTextColor(INK)
  cursor.doc.text(text.toUpperCase(), MARGIN, cursor.y)
  cursor.y += 18
}

export function bodyLine(cursor: Cursor, text: string, opts: { color?: string; bold?: boolean; size?: number } = {}): void {
  const size = opts.size ?? 10.5
  cursor.doc.setFont('helvetica', opts.bold ? 'bold' : 'normal')
  cursor.doc.setFontSize(size)
  cursor.doc.setTextColor(opts.color ?? INK)
  const lines = cursor.doc.splitTextToSize(text, CONTENT_WIDTH - 14) as string[]
  ensureSpace(cursor, lines.length * (size + 3) + 2)
  cursor.doc.text(lines, MARGIN + 14, cursor.y)
  cursor.y += lines.length * (size + 3)
}

export function emptyNotice(cursor: Cursor, text: string): void {
  bodyLine(cursor, text, { color: INK_DIM })
  cursor.y += 6
}
