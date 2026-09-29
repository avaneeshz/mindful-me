import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Found in review: neither the Classic/Lumen switch nor Lumen's own lazy
 * chunk (`App.tsx`'s `<Suspense><LumenApp/></Suspense>`) had an error
 * boundary anywhere above them — an uncaught render error in either
 * interface (a stale chunk after a redeploy, a real data shape the code
 * didn't expect, anything) unmounted the WHOLE React tree with nothing left
 * to render, a blank/white screen with no way back except a manual browser
 * refresh. This is the one thing standing between that and a recoverable
 * screen: same fallback the rest of this app uses for a failed load
 * (`FullScreenLoader`'s own visual language), with a real way out.
 *
 * A boundary can't recover on its own — React unmounts the failed subtree
 * for good once it catches — so the call site keys this component by `mode`
 * (see `App.tsx`): switching away from the crashed interface tears down this
 * whole instance (caught error included) and mounts a brand-new one, which
 * is also why this component carries no reset-on-prop-change logic of its
 * own — the `key` change already does that job one level up.
 */
export class InterfaceErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // eslint-disable-next-line no-console
    console.error('[InterfaceErrorBoundary] caught a render error', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-md bg-bg px-lg text-center">
          <p className="text-body font-semibold text-ink">Something went wrong loading this view.</p>
          <p className="text-caption text-ink-dim">Your data is safe — this screen just needs a fresh start.</p>
          <Button variant="primary" size="control" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
