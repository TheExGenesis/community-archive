'use client'

import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Names the part of the turn that failed, for the console log. */
  label: string
  /** What the reader sees instead of the failed part. */
  fallback?: string
}

interface State {
  failed: boolean
}

/**
 * Keeps a bad tweet object inside one turn's evidence. Without it, one card
 * that fails to render replaces the whole conversation with the error page.
 */
export class EvidenceBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'Ask the archive evidence render failed',
        part: this.props.label,
        error: error.message,
        componentStack: info.componentStack,
      }),
    )
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <p
        role="status"
        className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground"
      >
        {this.props.fallback ?? 'Some posts could not be shown.'}
      </p>
    )
  }
}
