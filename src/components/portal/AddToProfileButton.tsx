'use client'

import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { addTweetToOwnProfile } from '@/app/user/[account_id]/actions'
import { createBrowserClient } from '@/utils/supabase'

let viewerAccountIdPromise: Promise<string | null> | null = null

function getViewerAccountId() {
  if (!viewerAccountIdPromise) {
    const supabase = createBrowserClient()
    viewerAccountIdPromise = supabase.auth
      .getUser()
      .then(({ data }) => {
        const providerId = data.user?.app_metadata?.provider_id
        return typeof providerId === 'string' ? providerId : null
      })
      .catch(() => null)
  }
  return viewerAccountIdPromise
}

export function AddToProfileButton({
  tweetId,
  accountId,
}: {
  tweetId: string
  accountId?: string
}) {
  const [isOwner, setIsOwner] = useState(false)
  const [state, setState] = useState<'idle' | 'saving' | 'added' | 'error'>(
    'idle',
  )

  useEffect(() => {
    let active = true
    if (!accountId) return () => undefined

    void getViewerAccountId().then((viewerAccountId) => {
      if (active) setIsOwner(viewerAccountId === accountId)
    })
    return () => {
      active = false
    }
  }, [accountId])

  if (!isOwner) return null

  return (
    <button
      type="button"
      disabled={state === 'saving' || state === 'added'}
      onClick={async () => {
        setState('saving')
        try {
          await addTweetToOwnProfile(tweetId)
          setState('added')
        } catch {
          setState('error')
        }
      }}
      aria-label={
        state === 'added'
          ? 'Added to profile'
          : state === 'error'
            ? 'Try adding to profile again'
            : 'Add to profile'
      }
      className="inline-flex items-center gap-1 rounded-sm transition-colors hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-70 dark:hover:text-zinc-200"
    >
      <Star
        className={`h-3.5 w-3.5 ${state === 'added' ? 'fill-current' : ''}`}
        aria-hidden="true"
      />
      <span>
        {state === 'saving'
          ? 'Adding…'
          : state === 'added'
            ? 'Added'
            : state === 'error'
              ? 'Try again'
              : 'Add to profile'}
      </span>
    </button>
  )
}

export function resetViewerAccountForTests() {
  viewerAccountIdPromise = null
}
