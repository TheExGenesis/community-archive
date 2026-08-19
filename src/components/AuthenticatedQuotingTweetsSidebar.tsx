'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Loader2, LogIn, Quote } from 'lucide-react'
import type { TweetData } from '@/components/TweetComponent'
import QuotingTweetsSidebar from '@/components/QuotingTweetsSidebar'
import { Button } from '@/components/ui/button'
import { createBrowserClient } from '@/utils/supabase'

interface AuthenticatedQuotingTweetsSidebarProps {
  targetTweet: TweetData
}

interface QuotesPageResponse {
  tweets: TweetData[]
  totalCount: number
  error?: string
}

type QuoteAccessState =
  | { status: 'signed-out' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; page: QuotesPageResponse }

function SidebarCard({ children }: { children: ReactNode }) {
  return (
    <aside className="lg:sticky lg:top-24">
      <div className="rounded-lg border border-border bg-card px-6 py-8 text-center shadow-sm">
        {children}
      </div>
    </aside>
  )
}

export default function AuthenticatedQuotingTweetsSidebar({
  targetTweet,
}: AuthenticatedQuotingTweetsSidebarProps) {
  const supabase = useMemo(() => createBrowserClient(), [])
  const [state, setState] = useState<QuoteAccessState>({
    status: 'signed-out',
  })

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    const loadQuotes = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!active || controller.signal.aborted) return
      if (!session) {
        setState({ status: 'signed-out' })
        return
      }

      setState({ status: 'loading' })
      try {
        const response = await fetch(
          `/api/tweets/${encodeURIComponent(targetTweet.tweet_id)}/quotes?offset=0&limit=12`,
          { signal: controller.signal },
        )
        const body = (await response
          .json()
          .catch(() => null)) as QuotesPageResponse | null
        if (!active || controller.signal.aborted) return
        if (response.status === 401) {
          setState({ status: 'signed-out' })
          return
        }
        if (!response.ok || !body || !Array.isArray(body.tweets)) {
          throw new Error(body?.error || 'Could not load archived quotes')
        }
        setState({ status: 'ready', page: body })
      } catch (error) {
        if (!active || controller.signal.aborted) return
        setState({
          status: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Could not load archived quotes',
        })
      }
    }

    void loadQuotes()
    return () => {
      active = false
      controller.abort()
    }
  }, [supabase, targetTweet.tweet_id])

  if (state.status === 'ready') {
    return (
      <QuotingTweetsSidebar
        tweets={state.page.tweets}
        totalCount={state.page.totalCount}
        targetTweet={targetTweet}
      />
    )
  }

  if (state.status === 'loading') {
    return (
      <SidebarCard>
        <Loader2
          className="mx-auto h-7 w-7 animate-spin text-brand"
          aria-hidden="true"
        />
        <p className="mt-3 text-sm font-medium text-foreground">
          Loading archived quotes…
        </p>
      </SidebarCard>
    )
  }

  if (state.status === 'error') {
    return (
      <SidebarCard>
        <Quote
          className="mx-auto h-7 w-7 text-muted-foreground/60"
          aria-hidden="true"
        />
        <p className="mt-3 text-sm font-medium text-foreground">
          Archived quotes are temporarily unavailable
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {state.message}
        </p>
      </SidebarCard>
    )
  }

  const redirect = `/tweets/${encodeURIComponent(targetTweet.tweet_id)}`
  return (
    <SidebarCard>
      <Quote
        className="mx-auto h-7 w-7 text-muted-foreground/60"
        aria-hidden="true"
      />
      <h2 className="mt-3 font-semibold text-foreground">
        Log in to see quotes
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Archived tweets quoting this post are available to signed-in Community
        Archive users.
      </p>
      <Button asChild className="mt-5">
        <Link href={`/login?redirect=${encodeURIComponent(redirect)}`}>
          <LogIn className="mr-2 h-4 w-4" aria-hidden="true" />
          Log in
        </Link>
      </Button>
    </SidebarCard>
  )
}
