'use client'

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from 'react'

const ArchiveSearchContext = createContext<{
  query: string
  setQuery: Dispatch<SetStateAction<string>>
} | null>(null)

export function ArchiveSearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('')
  const value = useMemo(() => ({ query, setQuery }), [query])
  return (
    <ArchiveSearchContext.Provider value={value}>
      {children}
    </ArchiveSearchContext.Provider>
  )
}

export function useArchiveSearch() {
  const value = useContext(ArchiveSearchContext)
  if (!value) throw new Error('ArchiveSearchProvider is required')
  return value
}
