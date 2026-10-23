'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

type View = 'actual' | 'signed-in' | 'signed-out'
const PreviewSessionContext = createContext({
  enabled: false,
  view: 'actual' as View,
  setView: (_view: View) => {},
  optedIn: false,
  completeOptIn: () => {},
})

// Client simulation only. Never supplies a server identity or changes authentication.
export function PreviewSessionProvider({
  enabled,
  children,
}: {
  enabled: boolean
  children: ReactNode
}) {
  const [view, setCurrentView] = useState<View>('actual')
  const [optedIn, setOptedIn] = useState(false)
  const setView = (next: View) => {
    setOptedIn(false)
    setCurrentView(next)
  }
  return (
    <PreviewSessionContext.Provider
      value={{
        enabled,
        view: enabled ? view : 'actual',
        setView,
        optedIn: enabled && optedIn,
        completeOptIn: () => {
          if (enabled) {
            setCurrentView('signed-in')
            setOptedIn(true)
          }
        },
      }}
    >
      {children}
      {enabled && (
        <aside
          className="relative mx-3 my-3 w-fit max-w-[calc(100%-1.5rem)] rounded-lg border bg-background p-2 text-xs shadow-md min-[980px]:fixed min-[980px]:bottom-3 min-[980px]:left-3 min-[980px]:z-50 min-[980px]:m-0"
          aria-label="Development preview controls"
        >
          <label className="flex flex-wrap items-center gap-2">
            Preview view
            <select
              aria-label="Preview sign-in state"
              value={view}
              onChange={(event) => setView(event.target.value as View)}
              className="rounded border bg-background p-1"
            >
              <option value="actual">Actual session</option>
              <option value="signed-out">Signed out</option>
              <option value="signed-in">Signed in</option>
            </select>
          </label>
          <p className="mt-1 text-muted-foreground">
            Simulation only · no login or consent saved
          </p>
        </aside>
      )}
    </PreviewSessionContext.Provider>
  )
}

export const usePreviewSession = () => useContext(PreviewSessionContext)

export function PreviewHeroActions({
  actual,
  signedIn,
  signedOut,
}: {
  actual: ReactNode
  signedIn: ReactNode
  signedOut: ReactNode
}) {
  const { view } = usePreviewSession()
  return (
    <>
      {view === 'actual' ? actual : view === 'signed-in' ? signedIn : signedOut}
    </>
  )
}

export function PreviewAccount({ children }: { children: ReactNode }) {
  const { view } = usePreviewSession()
  if (view === 'actual') return <>{children}</>
  return (
    <span className="text-xs text-muted-foreground">
      {view === 'signed-in' ? 'Preview account' : 'Signed out (preview)'}
    </span>
  )
}
