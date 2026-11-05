'use client'

import { useEffect } from 'react'
import {
  disablePostHogAfterIdentityFailure,
  initializePostHog,
} from '@/lib/posthog'

export default function PostHogProvider({
  children,
}: {
  children: React.ReactNode
}) {
  useEffect(() => {
    let isActive = true
    let unsubscribe: (() => void) | undefined

    const handleFailure = (error: unknown) => {
      if (!isActive) return
      disablePostHogAfterIdentityFailure()
      if (process.env.NODE_ENV === 'development') {
        console.warn('PostHog identity setup failed', error)
      }
    }

    const connectIdentity = async () => {
      const { createBrowserClient } = await import('@/utils/supabase')
      if (!isActive) return
      const supabase = createBrowserClient()
      // INITIAL_SESSION supplies the restored session. Subscribe before loading
      // analytics so sign-out cannot race an older getSession() result.
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!isActive) return
        void initializePostHog(session).catch(handleFailure)
      })
      unsubscribe = () => subscription.unsubscribe()
    }

    void connectIdentity().catch(handleFailure)

    return () => {
      isActive = false
      unsubscribe?.()
    }
  }, [])

  return children
}
