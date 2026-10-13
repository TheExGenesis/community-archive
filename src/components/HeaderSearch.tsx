'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import UserSearchInput from '@/components/UserSearchInput'
import { buildSearchHref, parseSearchExpression } from '@/lib/searchParams'
import { buildAskHref, isAskShortcut } from '@/lib/askFromSearch'
import { capturePostHogEvent } from '@/lib/posthog'
import { AskShortcutChip } from '@/components/AskShortcutChip'
import {
  AskSignInPopover,
  useAskFromSearch,
} from '@/components/AskSignInPopover'

export default function HeaderSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const searchHref = buildSearchHref(query)

  const goAsk = () => {
    if (!query.trim()) return
    capturePostHogEvent('search_interface_action', {
      action: 'ask_from_search',
      has_query: true,
      active_filter_count: Object.keys(parseSearchExpression(query).options)
        .length,
    })
    router.push(buildAskHref(query))
  }
  // Signed out, asking explains and offers sign-in instead.
  const { ask, explaining, setExplaining } = useAskFromSearch(goAsk)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const { options } = parseSearchExpression(query)
    capturePostHogEvent('archive_search_submitted', {
      has_query: Boolean(query.trim()),
      active_filter_count: Object.keys(options).length,
      surface: 'header',
    })
    router.push(searchHref)
  }

  return (
    <>
      <Link
        href="/search"
        aria-label="Search Community Archive"
        className="hidden h-9 w-9 items-center justify-center rounded-md border border-input hover:bg-accent lg:inline-flex 2xl:hidden"
      >
        <Search className="h-4 w-4" aria-hidden="true" />
      </Link>
      <form
        onSubmit={handleSubmit}
        className="hidden items-center sm:flex lg:hidden 2xl:flex"
      >
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <UserSearchInput
            placeholder="Search tweets..."
            value={query}
            onValueChange={setQuery}
            className={`h-9 w-40 border-border bg-muted py-1.5 pl-8 text-sm focus:ring-brand lg:w-56 ${query.trim() ? 'pr-16' : 'pr-3'}`}
            aria-label="Search Community Archive"
            aria-keyshortcuts="Control+Enter Meta+Enter"
            title="Enter to search · Ctrl or ⌘ + Enter to ask the archive"
            autoComplete="off"
            onKeyDownCapture={(event) => {
              if (!isAskShortcut(event) || !query.trim()) return
              event.preventDefault()
              ask()
            }}
          />
          {query.trim() && (
            <AskSignInPopover
              open={explaining}
              onOpenChange={setExplaining}
              question={query}
            >
              <span className="absolute right-1.5 top-1/2 -translate-y-1/2">
                <AskShortcutChip onAsk={ask} />
              </span>
            </AskSignInPopover>
          )}
        </div>
      </form>
    </>
  )
}
