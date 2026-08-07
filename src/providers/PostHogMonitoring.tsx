'use client'

import { useEffect } from 'react'

const posthogProjectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
const posthogHost =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'

type PostHogMonitoringProps = {
  host?: string
  projectToken?: string
}

export default function PostHogMonitoring({
  host = posthogHost,
  projectToken = posthogProjectToken,
}: PostHogMonitoringProps = {}) {
  useEffect(() => {
    if (!projectToken) return

    let isActive = true
    let unsubscribeFromAuth: (() => void) | undefined

    const initializePostHog = async () => {
      const [{ default: posthog }, { createBrowserClient }] = await Promise.all(
        [import('posthog-js'), import('@/utils/supabase')],
      )

      if (!isActive) return

      if (!posthog.__loaded) {
        posthog.init(projectToken, {
          api_host: host,
          defaults: '2026-05-30',
          autocapture: true,
          capture_pageview: 'history_change',
          capture_pageleave: true,
          capture_exceptions: true,
          capture_performance: {
            web_vitals: true,
          },
          person_profiles: 'identified_only',
          mask_personal_data_properties: true,
          custom_personal_data_properties: [
            'access_token',
            'code',
            'email',
            'refresh_token',
            'token',
          ],
          session_recording: {
            maskAllInputs: true,
          },
        })
      }

      const identifyUser = (userId: string) => {
        if (posthog.get_distinct_id() !== userId) {
          posthog.identify(userId)
        }
      }

      const supabase = createBrowserClient()

      void supabase.auth.getSession().then(({ data: { session } }) => {
        if (isActive && session?.user.id) {
          identifyUser(session.user.id)
        }
      })

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
          posthog.reset()
        } else if (session?.user.id) {
          identifyUser(session.user.id)
        }
      })

      unsubscribeFromAuth = () => subscription.unsubscribe()
    }

    void initializePostHog().catch((error) => {
      console.error('Failed to initialize PostHog monitoring:', error)
    })

    return () => {
      isActive = false
      unsubscribeFromAuth?.()
    }
  }, [host, projectToken])

  return null
}
