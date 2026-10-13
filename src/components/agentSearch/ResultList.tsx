'use client'

import { useMemo, useState } from 'react'
import TweetCard from '@/components/TweetCard'
import { TWEETS_VIEW, type ListView } from '@/lib/agentSearch/listView'
import type { PortalTweet } from '@/lib/portal/types'
import { GroupingToggle, type Grouping } from './GroupingToggle'
import type { Citation } from './messageView'
import { PeopleList, TweetRowList } from './TweetRows'

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
}: {
  label: string | null
  tweets: PortalTweet[]
  citations: ReadonlyMap<string, number>
  view?: ListView
}) {
  const authors = useMemo(
    () => new Set(tweets.map((tweet) => tweet.username)).size,
    [tweets],
  )
  const [grouping, setGrouping] = useState<Grouping>(
    view.kind === 'people' && authors > 1 ? 'people' : 'tweets',
  )
  // Switched to people from a tweets list, each person shows their tweets;
  // the agent's own people view keeps the showcase it asked for.
  const showcase = view.kind === 'people' ? view.showcase : 'all'
  const name = label ?? (grouping === 'people' ? 'People' : 'Tweets')
  const body =
    grouping === 'people' ? (
      <PeopleList
        tweets={tweets}
        label={name}
        citations={citations}
        showcase={showcase}
      />
    ) : (
      <TweetRowList
        tweets={tweets}
        first={label === null ? INLINE_ROWS : FIRST_ROWS}
        step={tweets.length}
        label={name}
        citations={citations}
        moreLabel={(n) => `${n.toLocaleString('en-US')} more in this list`}
      />
    )

  if (label === null) return <div className="my-4">{body}</div>

  const count = tweets.length
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
        {authors > 1 && (
          <GroupingToggle
            value={grouping}
            onChange={setGrouping}
            label={`Show ${label} as`}
          />
        )}
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
  return (
    <figure className="my-5 flex items-start gap-2 rounded-lg border border-border py-1 pl-3 pr-1">
      <span
        aria-label={`Cited as ${citation.n}`}
        className="mt-3 inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-semibold tabular-nums text-foreground"
      >
        {citation.n}
      </span>
      <div className="min-w-0 flex-1">
        <TweetCard tweet={citation.tweet} showDate showExternalLink />
      </div>
    </figure>
  )
}
