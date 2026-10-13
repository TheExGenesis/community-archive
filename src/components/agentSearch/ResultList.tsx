'use client'

import TweetCard from '@/components/TweetCard'
import type { PortalTweet } from '@/lib/portal/types'
import type { Citation } from './messageView'
import { TweetRowList } from './TweetRows'

/** A list shows this many rows before the rest fold. */
const FIRST_ROWS = 8

/**
 * A set of tweets the agent placed in its answer, under its own label. A
 * tweet that is also cited carries the citation's number, so the list and
 * the chips in the prose point at the same tweet.
 */
export function ResultList({
  label,
  tweets,
  citations,
}: {
  label: string
  tweets: PortalTweet[]
  citations: ReadonlyMap<string, number>
}) {
  const count = tweets.length
  return (
    <section aria-label={label} className="my-5">
      <h3 className="mb-1 text-sm font-semibold text-foreground">
        {label}{' '}
        <span className="font-normal text-muted-foreground">
          · {count} {count === 1 ? 'tweet' : 'tweets'}
        </span>
      </h3>
      <TweetRowList
        tweets={tweets}
        first={FIRST_ROWS}
        step={count}
        label={label}
        citations={citations}
        moreLabel={(n) => `${n.toLocaleString('en-US')} more in this list`}
      />
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
