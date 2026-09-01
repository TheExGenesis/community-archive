'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { UserRound } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  fetchAccountSuggestions,
  fetchMemberSuggestions,
} from '@/lib/queries/fetchUsers'
import {
  getStandaloneUserSearchTerm,
  mergeUserSuggestions,
} from '@/lib/searchSuggestions'
import type { UserSuggestion } from '@/lib/searchSuggestions'
import { userProfileHref } from '@/lib/navigation'
import { createBrowserClient } from '@/utils/supabase'

const RESULT_LIMIT = 3

export default function UserMatchResults({ query }: { query?: string }) {
  const supabase = useMemo(() => createBrowserClient(), [])
  const searchTerm = getStandaloneUserSearchTerm(query || '')
  const [matches, setMatches] = useState<UserSuggestion[]>([])

  useEffect(() => {
    let active = true
    let memberMatches: UserSuggestion[] = []
    let accountMatches: UserSuggestion[] = []

    if (!searchTerm) {
      setMatches([])
      return () => {
        active = false
      }
    }

    const publish = () => {
      if (!active) return
      setMatches(
        mergeUserSuggestions(memberMatches, accountMatches, RESULT_LIMIT),
      )
    }

    void fetchAccountSuggestions(supabase, searchTerm, RESULT_LIMIT)
      .then((users) => {
        accountMatches = users
        publish()
      })
      .catch(() => undefined)

    void fetchMemberSuggestions(searchTerm, RESULT_LIMIT)
      .then((users) => {
        memberMatches = users
        publish()
      })
      .catch(() => undefined)

    return () => {
      active = false
    }
  }, [searchTerm, supabase])

  if (matches.length === 0) return null

  return (
    <section aria-labelledby="people-results-heading" className="mb-6">
      <div className="mb-3 flex items-center gap-2">
        <UserRound className="h-4 w-4 text-brand" aria-hidden="true" />
        <h2
          id="people-results-heading"
          className="text-sm font-semibold text-foreground"
        >
          People matching “{searchTerm}”
        </h2>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {matches.map((match) => {
          const displayName = match.account_display_name || match.username
          return (
            <Link
              key={match.directory_id}
              href={userProfileHref(
                match.username,
                match.account_id || match.directory_id,
              )}
              className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card px-3 py-3 transition-colors hover:bg-accent"
            >
              <Avatar className="h-9 w-9 shrink-0 border border-border">
                <AvatarImage src={match.avatar_media_url || undefined} alt="" />
                <AvatarFallback className="text-xs font-semibold uppercase">
                  {displayName.slice(0, 1)}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">
                  {displayName}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  @{match.username}
                </span>
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
