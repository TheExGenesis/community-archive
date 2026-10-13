'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import UserSearchInput from '@/components/UserSearchInput'
import { capturePostHogEvent } from '@/lib/posthog'
import { buildSearchParams, parseSearchExpression } from '@/lib/searchParams'
import { buildAskHref, isAskShortcut } from '@/lib/askFromSearch'
import { AskShortcutChip } from '@/components/AskShortcutChip'
import {
  AskSignInPopover,
  useAskFromSearch,
} from '@/components/AskSignInPopover'

const exampleSearches = ['open source', 'AI alignment', 'from:vitalikbuterin']

export default function HomepageSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')

  const search = (expression: string) => {
    const trimmedQuery = expression.trim()
    if (!trimmedQuery) return

    const params = buildSearchParams(trimmedQuery)
    const { options } = parseSearchExpression(trimmedQuery)
    capturePostHogEvent('archive_search_submitted', {
      has_query: true,
      active_filter_count: Object.keys(options).length,
      surface: 'homepage',
    })
    router.push(`/search?${params.toString()}`)
  }

  // ⌘/Ctrl+Enter, or the chip, hands the text to Ask the archive instead.
  const goAsk = () => {
    const trimmed = query.trim()
    if (!trimmed) return
    capturePostHogEvent('search_interface_action', {
      action: 'ask_from_search',
      has_query: true,
      active_filter_count: Object.keys(parseSearchExpression(trimmed).options)
        .length,
    })
    router.push(buildAskHref(trimmed))
  }
  // Signed out, asking explains and offers sign-in instead.
  const { ask, explaining, setExplaining, available } = useAskFromSearch(goAsk)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    search(query)
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <form
        onSubmit={handleSubmit}
        className="relative rounded-[50px] border border-border bg-card p-1.5 text-left shadow-[0_12px_30px_rgba(15,23,42,0.10)] sm:p-2"
      >
        <UserSearchInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search tweets, people, ideas"
          aria-label="Search Community Archive"
          className={`h-14 rounded-[50px] border-0 bg-transparent pl-3 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 min-[360px]:text-base sm:pl-4 sm:text-lg ${available && query.trim() ? 'pr-32' : 'pr-16'}`}
          autoComplete="off"
          aria-keyshortcuts="Control+Enter Meta+Enter"
          onKeyDownCapture={(event) => {
            if (!available || !isAskShortcut(event) || !query.trim()) return
            event.preventDefault()
            ask()
          }}
        />
        {available && query.trim() && (
          <AskSignInPopover
            open={explaining}
            onOpenChange={setExplaining}
            question={query}
          >
            <span className="absolute right-16 top-1/2 -translate-y-1/2 sm:right-[4.25rem]">
              <AskShortcutChip onAsk={ask} />
            </span>
          </AskSignInPopover>
        )}
        <Button
          type="submit"
          size="icon"
          className="absolute right-2.5 top-1/2 h-11 w-11 -translate-y-1/2 rounded-full bg-brand text-brand-foreground shadow-sm hover:bg-brand/90 focus-visible:ring-brand sm:right-3"
          aria-label="Search archive"
        >
          <Search className="h-5 w-5" />
        </Button>
      </form>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[13px] text-muted-foreground sm:text-sm">
        <span>Try:</span>
        {exampleSearches.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => search(example)}
            className="font-medium text-foreground underline-offset-4 transition-colors hover:text-brand"
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  )
}
