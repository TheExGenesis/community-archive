'use client'
import { createContext, useContext, useState, type ReactNode } from 'react'
const Focus = createContext<{
  id: string | null
  setId: (id: string | null) => void
} | null>(null)
export const useStrandFocus = () => useContext(Focus)
export function StrandFocusProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string | null>(null)
  return <Focus.Provider value={{ id, setId }}>{children}</Focus.Provider>
}
export function StrandCardFocus({
  id,
  children,
  className,
}: {
  id: string
  children: ReactNode
  className?: string
}) {
  const focus = useStrandFocus()
  return (
    <article
      className={className}
      onMouseEnter={() => focus?.setId(id)}
      onMouseLeave={() => focus?.setId(null)}
      onFocus={() => focus?.setId(id)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          focus?.setId(null)
      }}
    >
      {children}
    </article>
  )
}
