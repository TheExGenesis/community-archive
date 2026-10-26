'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@/utils/supabase'
import type { TweetPageSubject } from '@/lib/tweetSummary/subject'
import type { GeneratedSummary } from '@/lib/tweetSummary/generation'
import SummaryHeading from './SummaryHeading'

/**
 * Rendered only while a permalink has no stored summary. The page itself is
 * cached and shared, so it cannot tell who is looking; this asks the server
 * for a paid generation only when the visitor is signed in, then swaps the
 * neutral heading for the result. Everyone else keeps the neutral heading.
 */
export default function TweetSummaryRequester({
  tweetId,
  subject,
}: {
  tweetId: string
  subject: TweetPageSubject
}) {
  const [summary, setSummary] = useState<GeneratedSummary | null>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function requestSummary() {
      const {
        data: { session },
      } = await createBrowserClient().auth.getSession()
      if (!session || cancelled) return
      const response = await fetch(`/api/tweets/${tweetId}/summary`, {
        method: 'POST',
        signal: controller.signal,
      })
      if (!response.ok || cancelled) return
      const body = (await response.json()) as {
        summary: GeneratedSummary | null
      }
      if (!cancelled && body.summary) setSummary(body.summary)
    }

    requestSummary().catch(() => undefined)
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [tweetId])

  return <SummaryHeading subject={subject} summary={summary} />
}
