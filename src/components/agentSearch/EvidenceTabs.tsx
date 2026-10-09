'use client'

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import TweetCard from '@/components/TweetCard'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { PortalTweet } from '@/lib/portal/types'
import { EvidenceBoundary } from './EvidenceBoundary'
import type { EvidenceGroup } from './messageView'

export type EvidenceTab = 'cited' | 'relevant' | 'other'

const FIRST_PAGE = 5
const PAGE_SIZE = 30
const MAX_FACETS = 6

const count = (n: number) => n.toLocaleString('en-US')

const time = (tweet: PortalTweet) => {
  const value = Date.parse(tweet.createdAt)
  return Number.isFinite(value) ? value : 0
}

/** Compact cards, five at first, then thirty more per press. */
function TweetPages({
  tweets,
  label,
}: {
  tweets: PortalTweet[]
  label: string
}) {
  const [shown, setShown] = useState(FIRST_PAGE)
  if (!tweets.length) return null
  const left = tweets.length - shown
  return (
    <div>
      <ul className="space-y-3" aria-label={label}>
        {tweets.slice(0, shown).map((tweet) => (
          <li key={tweet.id}>
            <TweetCard tweet={tweet} compact collapsible showDate />
          </li>
        ))}
      </ul>
      {left > 0 && (
        <button
          type="button"
          onClick={() => setShown((value) => value + PAGE_SIZE)}
          className="mt-3 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {shown === FIRST_PAGE && left <= PAGE_SIZE
            ? `Show all ${count(tweets.length)}`
            : `Show ${count(Math.min(PAGE_SIZE, left))} more`}
        </button>
      )}
    </div>
  )
}

const chipClass = (selected: boolean) =>
  `inline-flex min-h-[2rem] items-center gap-1 rounded-full border px-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
    selected
      ? 'border-foreground bg-foreground text-background'
      : 'border-border bg-background text-foreground hover:bg-accent'
  }`

/** Author chips and a sort toggle over one list of posts. */
function FilteredPosts({
  tweets,
  label,
}: {
  tweets: PortalTweet[]
  label: string
}) {
  const [author, setAuthor] = useState<string | null>(null)
  const [byDate, setByDate] = useState(false)

  const authors = useMemo(() => {
    const counts = new Map<string, number>()
    for (const tweet of tweets) {
      counts.set(tweet.username, (counts.get(tweet.username) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .filter(([, n]) => n > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_FACETS)
  }, [tweets])

  const visible = useMemo(() => {
    const filtered = author
      ? tweets.filter((tweet) => tweet.username === author)
      : tweets
    return byDate ? [...filtered].sort((a, b) => time(b) - time(a)) : filtered
  }, [tweets, author, byDate])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {authors.length > 1 &&
          authors.map(([username, n]) => (
            <button
              key={username}
              type="button"
              aria-pressed={author === username}
              onClick={() => setAuthor(author === username ? null : username)}
              className={chipClass(author === username)}
            >
              @{username}
              <span className="tabular-nums opacity-70">{n}</span>
            </button>
          ))}
        <div
          role="group"
          aria-label="Order"
          className="ml-auto inline-flex rounded-md border border-border p-0.5 text-xs"
        >
          {[
            { value: false, text: 'By relevance' },
            { value: true, text: 'By date' },
          ].map((option) => (
            <button
              key={option.text}
              type="button"
              aria-pressed={byDate === option.value}
              onClick={() => setByDate(option.value)}
              className={`min-h-[1.75rem] rounded px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                byDate === option.value
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {option.text}
            </button>
          ))}
        </div>
      </div>
      {/* Remount on filter change so paging starts over. */}
      <TweetPages
        key={`${author ?? 'all'}-${byDate}`}
        tweets={visible}
        label={label}
      />
    </div>
  )
}

function GroupedPosts({
  groups,
  relevant,
}: {
  groups: EvidenceGroup[]
  relevant: PortalTweet[]
}) {
  const grouped = new Set(
    groups.flatMap((group) => group.tweets.map((t) => t.id)),
  )
  const rest = relevant.filter((tweet) => !grouped.has(tweet.id))
  const all = rest.length
    ? [...groups, { label: 'More relevant posts', tweets: rest }]
    : groups
  return (
    <div className="space-y-6">
      {all.map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h4 className="mb-2 text-sm font-semibold text-foreground">
            {group.label}{' '}
            <span className="font-normal text-muted-foreground">
              ({count(group.tweets.length)})
            </span>
          </h4>
          <TweetPages tweets={group.tweets} label={group.label} />
        </section>
      ))}
    </div>
  )
}

export function EvidenceTabs({
  tab,
  onTabChange,
  relevant,
  relevantTotal,
  otherMatches,
  groups,
  cited,
  footer,
}: {
  tab: EvidenceTab
  onTabChange: (tab: EvidenceTab) => void
  relevant: PortalTweet[]
  /** Includes relevant posts the tools did not return to the page. */
  relevantTotal: number
  otherMatches: PortalTweet[]
  groups: EvidenceGroup[] | null
  /** Cited cards, shown as a tab only where there is no side column. */
  cited?: { count: number; content: ReactNode }
  footer?: ReactNode
}) {
  const hasRelevant = relevantTotal > 0
  const hasOther = otherMatches.length > 0
  const hasCited = Boolean(cited?.count)
  if (!hasRelevant && !hasOther && !hasCited) {
    return footer ? <div>{footer}</div> : null
  }
  const notShown = relevantTotal - relevant.length

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => onTabChange(value as EvidenceTab)}
      className="space-y-3"
    >
      <TabsList
        className={`h-auto w-full justify-start overflow-x-auto sm:w-auto ${
          // Wide screens show cited posts in the rail, not as a tab.
          !hasRelevant && !hasOther ? 'lg:hidden' : ''
        }`}
      >
        {hasCited && cited && (
          <TabsTrigger value="cited" className="min-h-[2.75rem] lg:hidden">
            Cited ({count(cited.count)})
          </TabsTrigger>
        )}
        {hasRelevant && (
          <TabsTrigger
            value="relevant"
            className="min-h-[2.75rem] lg:min-h-[2.25rem]"
          >
            Also relevant ({count(relevantTotal)})
          </TabsTrigger>
        )}
        {hasOther && (
          <TabsTrigger
            value="other"
            className="min-h-[2.75rem] lg:min-h-[2.25rem]"
          >
            Other matches ({count(otherMatches.length)})
          </TabsTrigger>
        )}
      </TabsList>

      {hasCited && cited && (
        <TabsContent value="cited" className="lg:hidden">
          {cited.content}
        </TabsContent>
      )}
      {hasRelevant && (
        <TabsContent value="relevant" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Posts the search judged relevant to your question that the answer
            does not cite.
            {notShown > 0 &&
              ` ${count(notShown)} more were judged relevant but are not shown: each check returns its highest-scoring posts.`}
          </p>
          <EvidenceBoundary label="relevant posts">
            {groups ? (
              <GroupedPosts groups={groups} relevant={relevant} />
            ) : (
              <FilteredPosts tweets={relevant} label="Also relevant" />
            )}
          </EvidenceBoundary>
        </TabsContent>
      )}
      {hasOther && (
        <TabsContent value="other" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Search hits that were not judged relevant. Some may still be useful.
          </p>
          <EvidenceBoundary label="other matches">
            <TweetPages tweets={otherMatches} label="Other matches" />
          </EvidenceBoundary>
        </TabsContent>
      )}
      {footer}
    </Tabs>
  )
}
