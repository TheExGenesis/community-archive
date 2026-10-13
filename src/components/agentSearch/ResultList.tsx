'use client'

import { useMemo, useState } from 'react'
import TweetCard from '@/components/TweetCard'
import { TWEETS_VIEW, type ListView } from '@/lib/agentSearch/listView'
import type { PortalTweet } from '@/lib/portal/types'
import { useCitationLinks } from './CitationContext'
import { GroupingToggle, type Grouping } from './GroupingToggle'
import { DEFAULT_SORT, sortTweets, type ListSort } from './listSort'
import type { Citation, TweetLoad } from './messageView'
import { SortMenu } from './SortMenu'
import { TweetPlaceholder } from './TweetPlaceholder'
import { PeopleList, PendingRows, TweetRowList } from './TweetRows'

const NO_PENDING: ReadonlyArray<{ id: string; state: TweetLoad }> = []

/** A list shows this many rows before the rest fold. */
const FIRST_ROWS = 8
/** A list inside the prose is short; past this many rows it folds. */
const INLINE_ROWS = 5

/**
 * A set of tweets the agent placed in its answer. With a label it is a
 * section with a heading, shown as tweets or grouped by person the way the
 * agent chose, and the reader can switch when it has more than one author.
 * Without a label it sits inside the prose: a few rows, no heading, no
 * switch. A tweet that is also cited carries the citation's number, so the
 * list and the chips in the prose point at the same tweet.
 */
export function ResultList({
  label,
  tweets,
  citations,
  view = TWEETS_VIEW,
  scores,
  pending = NO_PENDING,
}: {
  label: string | null
  tweets: PortalTweet[]
  citations: ReadonlyMap<string, number>
  view?: ListView
  /** The relevance check's probability per tweet, when it scored them. */
  scores?: ReadonlyMap<string, number>
  /** Listed tweets not in hand yet (a reopened conversation), with why. */
  pending?: ReadonlyArray<{ id: string; state: TweetLoad }>
}) {
  const links = useCitationLinks()
  const authors = useMemo(
    () => new Set(tweets.map((tweet) => tweet.username)).size,
    [tweets],
  )
  const [grouping, setGrouping] = useState<Grouping>(
    view.kind === 'people' && authors > 1 ? 'people' : 'tweets',
  )
  const [sort, setSort] = useState<ListSort>(DEFAULT_SORT)
  // Most tweets only means something once tweets are grouped by person.
  const sortKey: ListSort =
    grouping === 'tweets' && sort.key === 'count' ? DEFAULT_SORT : sort
  const sorted = useMemo(
    () => sortTweets(tweets, sortKey, scores),
    [tweets, sortKey, scores],
  )
  // Switched to people from a tweets list, each person shows their tweets;
  // the agent's own people view keeps the showcase it asked for.
  const showcase = view.kind === 'people' ? view.showcase : 'all'
  const name = label ?? (grouping === 'people' ? 'People' : 'Tweets')
  // Tweets still to come hold their place under the rows; a person cannot
  // be grouped before their tweet is in hand.
  const placeholders = pending.length > 0 && (
    <ul aria-label={`${name}, still loading`}>
      <PendingRows pending={pending} onRetry={links?.retryTweets} />
    </ul>
  )
  const body = (
    <>
      {(tweets.length > 0 || !placeholders) &&
        (grouping === 'people' ? (
          <PeopleList
            tweets={tweets}
            label={name}
            citations={citations}
            showcase={showcase}
            sort={sortKey}
            scores={scores}
          />
        ) : (
          <TweetRowList
            key={`${sortKey.key}-${sortKey.ascending}`}
            tweets={sorted}
            first={label === null ? INLINE_ROWS : FIRST_ROWS}
            step={tweets.length}
            label={name}
            citations={citations}
            moreLabel={(n) => `${n.toLocaleString('en-US')} more in this list`}
          />
        ))}
      {placeholders}
    </>
  )

  if (label === null) return <div className="my-4">{body}</div>

  // The heading counts tweets still loading, so it does not climb as they
  // land; one that could not be fetched is still counted, since a retry may
  // bring it.
  const count = tweets.length + pending.length
  return (
    <section aria-label={label} className="my-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold text-foreground">
          {label}{' '}
          <span className="font-normal text-muted-foreground">
            · {count.toLocaleString('en-US')} {count === 1 ? 'tweet' : 'tweets'}
            {authors > 1 && ` · ${authors.toLocaleString('en-US')} people`}
          </span>
        </h3>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {count > 1 && (
            <SortMenu
              options={
                grouping === 'people'
                  ? ['relevance', 'count', 'date']
                  : ['relevance', 'date']
              }
              value={sortKey}
              onChange={setSort}
            />
          )}
          {authors > 1 && (
            <GroupingToggle
              value={grouping}
              onChange={setGrouping}
              label={`Show ${label} as`}
            />
          )}
        </div>
      </div>
      {body}
    </section>
  )
}

/**
 * One tweet the agent showed whole, where its full words matter, with the
 * citation number it shares with the chips and the rail.
 */
export function EmbeddedTweet({ citation }: { citation: Citation }) {
  const links = useCitationLinks()
  return (
    <figure className="my-5 flex items-start gap-2 rounded-lg border border-border py-1 pl-3 pr-1">
      <span
        aria-label={`Cited as ${citation.n}`}
        className="mt-3 inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-semibold tabular-nums text-foreground"
      >
        {citation.n}
      </span>
      <div className="min-w-0 flex-1">
        {citation.tweet ? (
          <TweetCard tweet={citation.tweet} showDate showExternalLink />
        ) : (
          <TweetPlaceholder
            state={citation.state}
            onRetry={links?.retryTweets}
          />
        )}
      </div>
    </figure>
  )
}
