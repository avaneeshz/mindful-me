/**
 * Renders `DayExportData` (`domain/dayExport.ts`) to an actual PDF and
 * triggers the browser download — the one place this feature touches a PDF
 * library. Kept deliberately thin: all the "what goes in the document and in
 * what order" logic already happened in the pure assembly step; this only
 * lays it out on a page.
 *
 * Library choice: jsPDF. It's the smallest well-maintained option that still
 * gives real text layout control (word-wrap via `splitTextToSize`, manual
 * page-break handling) — this document is plain text sections, not charts or
 * complex graphics, so `pdf-lib`'s lower-level (no built-in word-wrap, no
 * page-break helpers) control isn't needed, and jsPDF's API produces less
 * boilerplate for exactly this "clear date header, then a list of sections"
 * shape.
 */
import { jsPDF } from 'jspdf'
import type { DayExportData } from '@/domain/dayExport'

const PAGE_WIDTH = 595.28 // A4, points
const PAGE_HEIGHT = 841.89
const MARGIN = 56
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2

const INK = '#1a1a1a'
const INK_DIM = '#6b6b6b'
const LINE = '#dcdcdc'

interface Cursor {
  doc: jsPDF
  y: number
}

function ensureSpace(cursor: Cursor, needed: number): void {
  if (cursor.y + needed <= PAGE_HEIGHT - MARGIN) return
  cursor.doc.addPage()
  cursor.y = MARGIN
}

function ruleLine(cursor: Cursor): void {
  ensureSpace(cursor, 1)
  cursor.doc.setDrawColor(LINE)
  cursor.doc.line(MARGIN, cursor.y, PAGE_WIDTH - MARGIN, cursor.y)
  cursor.y += 18
}

function sectionHeading(cursor: Cursor, text: string): void {
  ensureSpace(cursor, 28)
  cursor.doc.setFont('helvetica', 'bold')
  cursor.doc.setFontSize(13)
  cursor.doc.setTextColor(INK)
  cursor.doc.text(text.toUpperCase(), MARGIN, cursor.y)
  cursor.y += 18
}

function bodyLine(cursor: Cursor, text: string, opts: { color?: string; bold?: boolean; size?: number } = {}): void {
  const size = opts.size ?? 10.5
  cursor.doc.setFont('helvetica', opts.bold ? 'bold' : 'normal')
  cursor.doc.setFontSize(size)
  cursor.doc.setTextColor(opts.color ?? INK)
  const lines = cursor.doc.splitTextToSize(text, CONTENT_WIDTH - 14) as string[]
  ensureSpace(cursor, lines.length * (size + 3) + 2)
  cursor.doc.text(lines, MARGIN + 14, cursor.y)
  cursor.y += lines.length * (size + 3)
}

function emptyNotice(cursor: Cursor, text: string): void {
  bodyLine(cursor, text, { color: INK_DIM })
  cursor.y += 6
}

function renderActivities(cursor: Cursor, data: DayExportData): void {
  sectionHeading(cursor, 'Activities')
  if (data.activities.length === 0) {
    emptyNotice(cursor, 'Nothing was logged for this day.')
    return
  }

  for (const activity of data.activities) {
    ensureSpace(cursor, 40)
    cursor.doc.setFont('helvetica', 'bold')
    cursor.doc.setFontSize(11.5)
    cursor.doc.setTextColor(INK)
    cursor.doc.text(activity.name, MARGIN, cursor.y)

    cursor.doc.setFont('helvetica', 'normal')
    cursor.doc.setFontSize(10)
    cursor.doc.setTextColor(INK_DIM)
    const rightLabel = `${activity.timeRangeLabel}  ·  ${activity.durationLabel}`
    const rightWidth = cursor.doc.getTextWidth(rightLabel)
    cursor.doc.text(rightLabel, PAGE_WIDTH - MARGIN - rightWidth, cursor.y)
    cursor.y += 14

    if (activity.pathLabel) {
      bodyLine(cursor, activity.pathLabel, { color: INK_DIM, size: 9.5 })
    }

    const signalRows: [string, string][] = [
      ['Activity quality', activity.quality.length > 0 ? activity.quality.join(', ') : '—'],
      ['Chronic symptoms', activity.symptoms.length > 0 ? activity.symptoms.join(', ') : '—'],
      ['Protective response', activity.flag ?? '—'],
    ]
    for (const [label, value] of signalRows) {
      bodyLine(cursor, `${label}:  ${value}`, { size: 9.5, color: INK_DIM })
    }

    if (activity.notes) {
      bodyLine(cursor, `Notes: ${activity.notes}`, { size: 10 })
    }

    if (activity.reflections.length > 0) {
      bodyLine(cursor, 'Reflections:', { size: 9.5, color: INK_DIM })
      for (const reflection of activity.reflections) {
        const note = reflection.note.trim() ? ` — ${reflection.note}` : ''
        bodyLine(cursor, `•  ${reflection.title}${note}`, { size: 9.5 })
      }
    }

    cursor.y += 10
  }
}

function renderNotes(cursor: Cursor, data: DayExportData): void {
  sectionHeading(cursor, 'Notes')
  if (data.noteEntries.length === 0) {
    emptyNotice(cursor, 'No notes were logged for this day.')
    return
  }

  for (const entry of data.noteEntries) {
    ensureSpace(cursor, 30)
    const chip = entry.entryType ? `${entry.buttonLabel} · ${entry.entryType}` : entry.buttonLabel
    cursor.doc.setFont('helvetica', 'bold')
    cursor.doc.setFontSize(10.5)
    cursor.doc.setTextColor(INK)
    cursor.doc.text(chip, MARGIN, cursor.y)

    cursor.doc.setFont('helvetica', 'normal')
    cursor.doc.setFontSize(9.5)
    cursor.doc.setTextColor(INK_DIM)
    const rightWidth = cursor.doc.getTextWidth(entry.timestampLabel)
    cursor.doc.text(entry.timestampLabel, PAGE_WIDTH - MARGIN - rightWidth, cursor.y)
    cursor.y += 14

    bodyLine(cursor, entry.note, { size: 10 })
    cursor.y += 8
  }
}

function renderDisplayValues(cursor: Cursor, data: DayExportData): void {
  sectionHeading(cursor, "Today's Numbers")
  if (data.displayValues.length === 0) {
    emptyNotice(cursor, 'Nothing was set for this day.')
    return
  }

  for (const value of data.displayValues) {
    ensureSpace(cursor, 16)
    cursor.doc.setFont('helvetica', 'normal')
    cursor.doc.setFontSize(10.5)
    cursor.doc.setTextColor(INK)
    cursor.doc.text(value.label, MARGIN, cursor.y)
    cursor.doc.setFont('helvetica', 'bold')
    const width = cursor.doc.getTextWidth(value.valueLabel)
    cursor.doc.text(value.valueLabel, PAGE_WIDTH - MARGIN - width, cursor.y)
    cursor.y += 16
  }
}

/** Builds the finished document. Exported separately from `downloadDayExportPdf` so it stays testable without a real browser download. */
export function renderDayExportPdf(data: DayExportData): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const cursor: Cursor = { doc, y: MARGIN }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(INK_DIM)
  doc.text('mindful-me', MARGIN, cursor.y)
  cursor.y += 22

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(INK)
  doc.text(data.dateLabel, MARGIN, cursor.y)
  cursor.y += 30

  ruleLine(cursor)

  if (data.isEmpty) {
    bodyLine(cursor, 'Nothing was logged for this day.', { color: INK_DIM, size: 12 })
    return doc
  }

  renderActivities(cursor, data)
  cursor.y += 6
  ruleLine(cursor)
  renderNotes(cursor, data)
  cursor.y += 6
  ruleLine(cursor)
  renderDisplayValues(cursor, data)

  return doc
}

/** Renders and immediately triggers the browser download, named `mindful-me-YYYY-MM-DD.pdf`. */
export function downloadDayExportPdf(data: DayExportData): void {
  const doc = renderDayExportPdf(data)
  doc.save(`mindful-me-${data.isoDate}.pdf`)
}
