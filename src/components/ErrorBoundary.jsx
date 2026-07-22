import { Component } from 'react'

// Last line of defence. Without this, one thrown render — a malformed deck
// source, a null field from the API — unmounts the whole tree and leaves a
// blank white page with no way back.
//
// Class component on purpose: componentDidCatch has no hook equivalent.
export default class ErrorBoundary extends Component {
  state = { error: null, showDetails: false }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Keep the real stack in the console for whoever's debugging, while the
    // person using the app gets the friendly version below.
    console.error('Render crashed:', error, info?.componentStack)
  }

  render() {
    const { error, showDetails } = this.state
    if (!error) return this.props.children

    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6 bg-deck-bg text-white">
        <span className="text-deck-accent font-black text-3xl tracking-tighter">WIT</span>
        <h1 className="text-2xl font-black tracking-tight">This page stopped working</h1>
        <p className="text-deck-muted max-w-md text-sm leading-relaxed">
          Not your fault — something in the app hit a snag and couldn’t recover. Reloading almost
          always fixes it, and nothing you saved has been lost.
        </p>

        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 rounded-lg bg-deck-accent hover:bg-deck-accentDim font-bold text-sm transition-colors"
          >
            Reload the app
          </button>
          <button
            onClick={() => {
              window.location.hash = ''
              window.location.href = '/'
            }}
            className="px-5 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 font-bold text-sm transition-colors"
          >
            Back to home
          </button>
        </div>

        {/* Tucked away — useful when reporting the problem, invisible otherwise. */}
        <button
          onClick={() => this.setState({ showDetails: !showDetails })}
          className="mt-4 text-xs text-white/40 hover:text-white/70 underline underline-offset-4 transition-colors"
        >
          {showDetails ? 'Hide technical details' : 'Show technical details'}
        </button>
        {showDetails && (
          <pre className="max-w-lg w-full text-left text-[11px] leading-relaxed text-white/50 bg-black/40 rounded-lg p-3 overflow-auto max-h-48 ring-1 ring-deck-border">
            {String(error?.stack || error?.message || error)}
          </pre>
        )}
      </div>
    )
  }
}
