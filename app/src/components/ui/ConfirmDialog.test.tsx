import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ConfirmDialog } from './ConfirmDialog'

const noop = () => {}

describe('ConfirmDialog', () => {
  it('asks the question, with Cancel and the confirm action', () => {
    const html = renderToStaticMarkup(
      <ConfirmDialog
        open
        title="Are you sure you want to delete this button?"
        description="It can be brought back later."
        confirmLabel="Delete"
        onConfirm={noop}
        onCancel={noop}
      />,
    )
    expect(html).toContain('role="alertdialog"')
    expect(html).toContain('Are you sure you want to delete this button?')
    expect(html).toContain('It can be brought back later.')
    expect(html).toContain('>Cancel<')
    expect(html).toContain('>Delete<')
  })

  it('renders nothing while closed', () => {
    const html = renderToStaticMarkup(<ConfirmDialog open={false} title="Sure?" confirmLabel="Yes" onConfirm={noop} onCancel={noop} />)
    expect(html).toBe('')
  })
})
