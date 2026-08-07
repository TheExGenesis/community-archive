'use client'

import { useEffect, useRef } from 'react'
import {
  initializePostHog,
  markPostHogIdentityReady,
  syncPostHogIdentity,
} from '@/lib/posthog'

export default function PostHogProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const identifiedUserId = useRef<string | null>(null)

  useEffect(() => {
    let isActive = true
    let unsubscribe: (() => void) | undefined

    const connectIdentity = async () => {
      if (!(await initializePostHog()) || !isActive) return

      const { createBrowserClient } = await import('@/utils/supabase')
      if (!isActive) return
      const supabase = createBrowserClient()
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, session) => {
        identifiedUserId.current = syncPostHogIdentity(
          event,
          session,
          identifiedUserId.current,
        )
        if (
          event === 'INITIAL_SESSION' ||
          event === 'SIGNED_IN' ||
          event === 'SIGNED_OUT'
        ) {
          markPostHogIdentityReady()
        }
      })

      unsubscribe = () => subscription.unsubscribe()
    }

    void connectIdentity().catch((error) => {
      if (process.env.NODE_ENV === 'development') {
        console.warn('PostHog identity setup failed', error)
      }
    })

    return () => {
      isActive = false
      unsubscribe?.()
    }
  }, [])

  return children
}
