'use client'

import Link from 'next/link'
import { Shield } from 'lucide-react'
import { createContext, useContext, useEffect, useState } from 'react'

type NavigationAudience = {
  isMember: boolean
  isAdmin: boolean
  localPreview?: 'admin' | 'signed-out' | null
}

const PUBLIC_AUDIENCE: NavigationAudience = {
  isMember: false,
  isAdmin: false,
}

const NavigationAudienceContext =
  createContext<NavigationAudience>(PUBLIC_AUDIENCE)

export function NavigationAudienceProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [audience, setAudience] = useState(PUBLIC_AUDIENCE)

  useEffect(() => {
    const controller = new AbortController()

    void fetch('/api/auth/navigation', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error('Navigation session check failed')
        return response.json() as Promise<NavigationAudience>
      })
      .then((nextAudience) => {
        setAudience({
          isMember: nextAudience.isMember === true,
          isAdmin: nextAudience.isAdmin === true,
          localPreview: nextAudience.localPreview ?? null,
        })
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return
        // A failed optional enhancement leaves the server-rendered public nav.
      })

    return () => controller.abort()
  }, [])

  return (
    <NavigationAudienceContext.Provider value={audience}>
      {children}
    </NavigationAudienceContext.Provider>
  )
}

export function AdminNavigationLink() {
  const { isAdmin } = useContext(NavigationAudienceContext)
  if (!isAdmin) return null

  return (
    <Link
      href="/admin"
      aria-label="Admin dashboard"
      title="Admin dashboard"
      className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <Shield className="h-5 w-5" />
    </Link>
  )
}

export const useNavigationAudience = () => useContext(NavigationAudienceContext)
