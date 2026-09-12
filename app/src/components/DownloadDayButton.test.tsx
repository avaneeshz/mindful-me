import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DownloadDayButton, DownloadDayButtonView } from './DownloadDayButton'
import type { ActivityList } from '@/domain/types'

const NO_ACTIVITIES: ActivityList = []

describe('DownloadDayButtonView', () => {
  it('renders a real, focusable, labeled, enabled button at rest', () => {
    const html = renderToStaticMarkup(
      <DownloadDayButtonView pending={false} error={null} onDownload={() => {}} />,
    )
    expect(html).toMatch(/<button[^>]*aria-label="Download this day&#x27;s data as a PDF"/)
    // Tailwind's `disabled:pointer-events-none` variant classes legitimately
    // contain the substring "disabled" — assert on the real DOM attribute
    // instead of a plain substring check.
    expect(html).not.toContain('disabled=""')
    expect(html).toContain('aria-busy="false"')
  })

  it('disables the button and shows a busy label/spinner while assembling', () => {
    const html = renderToStaticMarkup(
      <DownloadDayButtonView pending={true} error={null} onDownload={() => {}} />,
    )
    expect(html).toMatch(/<button[^>]*aria-label="Downloading this day&#x27;s data…"/)
    expect(html).toContain('disabled=""')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('animate-spin')
  })

  it('surfaces a failure as a labeled alert without disabling the trigger permanently', () => {
    const html = renderToStaticMarkup(
      <DownloadDayButtonView pending={false} error="Could not build the file — try again." onDownload={() => {}} />,
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain('Could not build the file — try again.')
    expect(html).not.toContain('disabled=""')
  })

  it('shows no error banner at all when nothing has failed', () => {
    const html = renderToStaticMarkup(
      <DownloadDayButtonView pending={false} error={null} onDownload={() => {}} />,
    )
    expect(html).not.toContain('role="alert"')
  })
})

describe('DownloadDayButton', () => {
  it('mounts idle (not busy, not erroring) with a real board', () => {
    const html = renderToStaticMarkup(
      <DownloadDayButton viewedDate={new Date(2026, 8, 11)} activities={NO_ACTIVITIES} />,
    )
    expect(html).toMatch(/<button[^>]*aria-label="Download this day&#x27;s data as a PDF"/)
    expect(html).not.toContain('role="alert"')
  })
})
