import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DictationButton, DictationButtonView, DictationField } from './DictationButton'

const noop = () => {}
const view = (over: Partial<Parameters<typeof DictationButtonView>[0]> = {}) =>
  renderToStaticMarkup(
    <DictationButtonView status="idle" elapsedMs={0} errorMessage={null} onPress={noop} onDismissError={noop} {...over} />,
  )

describe('DictationButtonView', () => {
  it('idle: a labelled, enabled mic that is not pressed', () => {
    const html = view()
    expect(html).toContain('aria-label="Dictate"')
    expect(html).toContain('aria-pressed="false"')
    expect(html).not.toContain('disabled=""')
    expect(html).not.toContain('role="alert"')
  })

  it('recording: says how to stop, shows elapsed time, is pressed', () => {
    const html = view({ status: 'recording', elapsedMs: 65_000 })
    expect(html).toContain('aria-label="Stop dictation"')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('1:05')
    expect(html).toContain('motion-safe:animate-ping')
  })

  it('transcribing: disabled and busy, with a spinner', () => {
    const html = view({ status: 'transcribing' })
    expect(html).toContain('aria-label="Transcribing…"')
    expect(html).toContain('disabled=""')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('animate-spin')
  })

  it('error: shows the message as an alert, button stays usable', () => {
    const html = view({ status: 'error', errorMessage: "You're offline." })
    expect(html).toContain('role="alert"')
    expect(html).toContain("You&#x27;re offline.")
    expect(html).toContain('aria-label="Dictate"')
  })

  it('has a 44px touch target on mobile', () => {
    expect(view()).toContain('mobile:h-control')
    expect(view()).toContain('mobile:w-control')
  })
})

describe('DictationButton / DictationField', () => {
  it('render nothing where recording is unsupported (no microphone API in this environment)', () => {
    expect(renderToStaticMarkup(<DictationButton getTarget={() => null} />)).toBe('')
  })

  it('DictationField still renders its field, without a mic when unsupported', () => {
    const html = renderToStaticMarkup(
      <DictationField>
        <textarea defaultValue="x" />
      </DictationField>,
    )
    expect(html).toContain('<textarea')
    expect(html).not.toContain('aria-label="Dictate"')
  })

  it('supported + disabled hides the mic', async () => {
    vi.resetModules()
    vi.doMock('@/state/useDictation', () => ({
      useDictation: () => ({
        status: 'idle', error: null, errorMessage: null, elapsedMs: 0, supported: true,
        toggle: noop, cancel: noop, dismissError: noop,
      }),
    }))
    const mod = await import('./DictationButton')
    const on = renderToStaticMarkup(<mod.DictationButton getTarget={() => null} />)
    const off = renderToStaticMarkup(<mod.DictationButton getTarget={() => null} disabled />)
    expect(on).toContain('aria-label="Dictate"')
    expect(off).toBe('')
    vi.doUnmock('@/state/useDictation')
  })
})
