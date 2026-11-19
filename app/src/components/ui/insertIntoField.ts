import { fitInsertion, insertAtSelection } from '@/domain/dictation'

export type TextFieldElement = HTMLTextAreaElement | HTMLInputElement

/** True when the field can't accept typing, so it gets no mic. */
export function isFieldLocked(el: TextFieldElement | null | undefined): boolean {
  return !el || el.disabled || el.readOnly
}

export type InsertOutcome = 'inserted' | 'truncated' | 'full' | 'locked'

/**
 * Inserts dictated text at the field's current selection and leaves the caret
 * after it, with the field focused.
 *
 * It goes through `execCommand('insertText')` first, because that is a real
 * edit: the browser's own undo (Ctrl/Cmd+Z) reverses the whole insertion in
 * one step, and React's `onChange` fires as if the person had typed it. If a
 * browser refuses, it falls back to setting the value through the native
 * setter and dispatching an `input` event, which a controlled React field
 * also accepts (undo is then the page's own, not one step).
 */
export function insertIntoField(el: TextFieldElement, text: string): InsertOutcome {
  if (isFieldLocked(el)) return 'locked'

  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? start
  let { inserted, value, caret } = insertAtSelection(el.value, start, end, text)
  if (!inserted) return 'inserted'

  // Respect maxLength: only as much as fits after the selection is replaced.
  let truncated = false
  if (el.maxLength > 0) {
    const from = Math.min(start, end)
    const to = Math.max(start, end)
    const fit = fitInsertion(el.value.length, to - from, inserted, el.maxLength)
    if (!fit.text) return 'full'
    if (fit.truncated) {
      truncated = true
      inserted = fit.text
      value = el.value.slice(0, from) + inserted + el.value.slice(to)
      caret = from + inserted.length
    }
  }

  el.focus({ preventScroll: true })
  el.setSelectionRange(Math.min(start, end), Math.max(start, end))

  const before = el.value
  let done = false
  try {
    done = document.execCommand('insertText', false, inserted) && el.value !== before
  } catch {
    done = false
  }
  if (!done) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set
    if (setter) setter.call(el, value)
    else el.value = value
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  el.setSelectionRange(caret, caret)
  return truncated ? 'truncated' : 'inserted'
}
