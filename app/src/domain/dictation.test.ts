import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DICTATION_PREFS,
  dictationErrorMessage,
  fitInsertion,
  formatElapsed,
  insertAtSelection,
  parseDictationPrefs,
  type DictationErrorCode,
} from './dictation'

describe('insertAtSelection', () => {
  it('inserts into an empty field with no extra spaces', () => {
    expect(insertAtSelection('', 0, 0, 'hello there')).toEqual({ value: 'hello there', caret: 11, inserted: 'hello there' })
  })

  it('inserts at the start, before existing text', () => {
    const r = insertAtSelection('world', 0, 0, 'hello')
    expect(r.value).toBe('hello world')
    expect(r.caret).toBe(6)
  })

  it('inserts at the end, adding a leading space after a word', () => {
    const r = insertAtSelection('Went for a walk', 15, 15, 'and felt calm')
    expect(r.value).toBe('Went for a walk and felt calm')
    expect(r.caret).toBe(r.value.length)
  })

  it('inserts in the middle with a space on both sides', () => {
    const r = insertAtSelection('onetwo', 3, 3, 'and')
    expect(r.value).toBe('one and two')
    expect(r.caret).toBe(8)
  })

  it('does not double a space that is already there', () => {
    expect(insertAtSelection('hello ', 6, 6, 'world').value).toBe('hello world')
    expect(insertAtSelection('a b', 2, 2, 'x').value).toBe('a x b')
  })

  it('does not add a space before closing punctuation or after a newline', () => {
    expect(insertAtSelection('Hello.', 5, 5, 'world').value).toBe('Hello world.')
    expect(insertAtSelection('line one\n', 9, 9, 'line two').value).toBe('line one\nline two')
  })

  it('replaces a selection', () => {
    const r = insertAtSelection('I felt bad today', 7, 10, 'good')
    expect(r.value).toBe('I felt good today')
    expect(r.caret).toBe(11)
  })

  it('handles a reversed selection', () => {
    expect(insertAtSelection('abc def', 7, 4, 'xyz').value).toBe('abc xyz')
  })

  it('clamps out-of-range selections and appends when there is none', () => {
    expect(insertAtSelection('abc', 99, 99, 'd').value).toBe('abc d')
    expect(insertAtSelection('abc', -5, -5, 'd').value).toBe('d abc')
    expect(insertAtSelection('abc', null, null, 'd').value).toBe('abc d')
  })

  it('trims the spoken text and ignores empty transcripts', () => {
    expect(insertAtSelection('a', 1, 1, '  b  ').value).toBe('a b')
    expect(insertAtSelection('abc', 1, 1, '   ')).toEqual({ value: 'abc', caret: 1, inserted: '' })
  })

  it('keeps Devanagari text intact', () => {
    expect(insertAtSelection('आज', 2, 2, 'मैं खुश हूँ').value).toBe('आज मैं खुश हूँ')
  })
})

describe('formatElapsed', () => {
  it('formats minutes and seconds', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(7_400)).toBe('0:07')
    expect(formatElapsed(65_000)).toBe('1:05')
    expect(formatElapsed(-5)).toBe('0:00')
  })
})

describe('dictationErrorMessage', () => {
  const codes: DictationErrorCode[] = [
    'permission_denied', 'no_microphone', 'unsupported', 'recording_failed', 'empty', 'offline', 'unavailable',
    'unauthorized', 'not_configured', 'rate_limited', 'too_large', 'unsupported_audio', 'upstream_failed',
  ]

  it('has a non-empty message for every code', () => {
    for (const code of codes) expect(dictationErrorMessage(code).length).toBeGreaterThan(10)
  })

  it('gives permission, offline and rate-limit their own specific help', () => {
    expect(dictationErrorMessage('permission_denied')).toMatch(/browser settings/i)
    expect(dictationErrorMessage('offline')).toMatch(/offline/i)
    expect(dictationErrorMessage('rate_limited')).toMatch(/little while/i)
  })
})

describe('parseDictationPrefs', () => {
  it('defaults to on and not yet disclosed', () => {
    expect(parseDictationPrefs(null)).toEqual(DEFAULT_DICTATION_PREFS)
    expect(DEFAULT_DICTATION_PREFS).toEqual({ enabled: true, disclosed: false })
  })

  it('keeps valid stored values', () => {
    expect(parseDictationPrefs({ enabled: false, disclosed: true })).toEqual({ enabled: false, disclosed: true })
  })

  it('repairs bad fields one at a time', () => {
    expect(parseDictationPrefs({ enabled: 'no', disclosed: true })).toEqual({ enabled: true, disclosed: true })
    expect(parseDictationPrefs('junk')).toEqual(DEFAULT_DICTATION_PREFS)
  })
})

describe('fitInsertion', () => {
  it('leaves text alone when there is no limit or it fits', () => {
    expect(fitInsertion(5, 0, ' hello', 0)).toEqual({ text: ' hello', truncated: false })
    expect(fitInsertion(5, 0, ' hello', 20)).toEqual({ text: ' hello', truncated: false })
  })

  it('counts a replaced selection as free room', () => {
    expect(fitInsertion(10, 4, 'abcd', 10)).toEqual({ text: 'abcd', truncated: false })
  })

  it('reports a full field as nothing inserted', () => {
    expect(fitInsertion(10, 0, ' hi', 10)).toEqual({ text: '', truncated: true })
  })

  it('cuts at a word boundary, not mid-word', () => {
    expect(fitInsertion(0, 0, 'one two three', 9)).toEqual({ text: 'one two', truncated: true })
  })

  it('keeps the whole last word when the cut lands exactly on a boundary', () => {
    expect(fitInsertion(0, 0, 'one two three', 7)).toEqual({ text: 'one two', truncated: true })
  })

  it('falls back to a hard cut for one very long word', () => {
    expect(fitInsertion(0, 0, 'abcdefghij', 4)).toEqual({ text: 'abcd', truncated: true })
  })
})
