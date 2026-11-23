import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FrameSwitcher } from './FrameSwitcher'

describe('FrameSwitcher', () => {
  it('names the frame and disables both arrows when there is only one', () => {
    const html = renderToStaticMarkup(<FrameSwitcher frame={1} frameCount={1} onPrevious={() => {}} onNext={() => {}} />)
    expect(html).toContain('Frame 1')
    expect(html.match(/disabled=""/g)?.length).toBe(2)
  })

  it('enables an arrow only when there is somewhere to go', () => {
    const html = renderToStaticMarkup(<FrameSwitcher frame={2} frameCount={3} onPrevious={() => {}} onNext={() => {}} />)
    expect(html).not.toContain('disabled=""')
  })
})
