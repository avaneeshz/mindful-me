import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TimeRangeField } from './TimeRangeField'

const noop = () => {}

describe('TimeRangeField', () => {
  it('offers previous/next day buttons beside each date of a dated range', () => {
    const html = renderToStaticMarkup(
      <TimeRangeField
        startValue="22:00"
        onStartChange={noop}
        endValue="06:00"
        onEndChange={noop}
        startDate="2026-10-17"
        onStartDateChange={noop}
        endDate="2026-10-18"
        onEndDateChange={noop}
      />,
    )
    expect(html).toContain('Previous day — Start date')
    expect(html).toContain('Next day — Start date')
    expect(html).toContain('Previous day — End date')
    expect(html).toContain('Next day — End date')
  })

  it('shows no date controls without dates', () => {
    const html = renderToStaticMarkup(
      <TimeRangeField startValue="" onStartChange={noop} endValue="" onEndChange={noop} />,
    )
    expect(html).not.toContain('Previous day')
  })
})
