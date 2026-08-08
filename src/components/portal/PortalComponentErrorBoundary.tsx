'use client'

import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { CARD, MUTED, SERIF } from './styles'

interface Props {
  children: ReactNode
  componentName: string
}

interface State {
  failed: boolean
}

/** Keeps an unexpected client render failure inside one portal component. */
export default class PortalComponentErrorBoundary extends Component<
  Props,
  State
> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'Portal component render failed',
        component: this.props.componentName,
        error: error.message,
        componentStack: info.componentStack,
      }),
    )
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <main className="min-h-screen bg-zinc-100/80 px-4 py-8 dark:bg-transparent sm:px-6">
        <div
          className={`${CARD} mx-auto max-w-[760px] px-6 py-12 text-center`}
          role="alert"
        >
          <h1 className="text-[24px] font-semibold" style={SERIF}>
            {this.props.componentName} is temporarily unavailable
          </h1>
          <p className={`mx-auto mt-2 max-w-md text-[13px] ${MUTED}`}>
            The rest of the dashboard is still available. Retry just this
            component when you’re ready.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ failed: false })}
            className="mt-5 rounded-[4px] bg-brand px-4 py-2 text-[13px] font-bold text-white hover:opacity-90"
          >
            Retry component
          </button>
        </div>
      </main>
    )
  }
}
