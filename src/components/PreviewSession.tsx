'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

type View = 'actual' | 'signed-in' | 'signed-out'
const PreviewSessionContext = createContext({
  enabled: false,
  view: 'actual' as View,
})

// Presentation only. Never supplies an identity or changes authentication.
export function PreviewSessionProvider({
  enabled,
  children,
}: {
  enabled: boolean
  children: ReactNode
}) {
  const [view, setView] = useState<View>('actual')
  return (
    <PreviewSessionContext.Provider
      value={{ enabled, view: enabled ? view : 'actual' }}
    >
      {children}
      {enabled && (
        <aside
          className="fixed bottom-3 left-3 z-50 rounded-lg border bg-background p-2 text-xs shadow-md"
          aria-label="Development preview controls"
        >
          <label className="flex items-center gap-2">
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
            UI only · actual permissions stay unchanged
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
