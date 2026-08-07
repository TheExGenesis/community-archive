'use client'

import { useEffect, useRef } from 'react'
import posthog from 'posthog-js'
import { createBrowserClient } from '@/utils/supabase'

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST
const isPostHogConfigured = Boolean(projectToken && posthogHost)

if (projectToken && posthogHost) {
  posthog.init(projectToken, {
    api_host: posthogHost,
    capture_exceptions: true,
    debug: process.env.NODE_ENV === 'development',
  })
} else if (process.env.NODE_ENV !== 'production') {
  const missingVariable = projectToken
    ? 'NEXT_PUBLIC_POSTHOG_HOST'
    : 'NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN'

  throw new Error(
    `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
  )
}

export default function PostHogProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const identifiedUserId = useRef<string | null>(null)

  useEffect(() => {
    if (!isPostHogConfigured) return

    const supabase = createBrowserClient()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        posthog.reset()
        identifiedUserId.current = null
        return
      }

      const user = session?.user
      if (!user || (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN')) {
        return
      }

      if (identifiedUserId.current && identifiedUserId.current !== user.id) {
        posthog.reset()
      }

      posthog.identify(user.id, {
        email: user.email,
        name:
          typeof user.user_metadata.full_name === 'string'
            ? user.user_metadata.full_name
            : undefined,
        username:
          typeof user.user_metadata.user_name === 'string'
            ? user.user_metadata.user_name
            : undefined,
      })
      identifiedUserId.current = user.id
    })

    return () => subscription.unsubscribe()
  }, [])

  return children
}
