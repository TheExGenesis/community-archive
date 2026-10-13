'use client'

import type { PortalTweet } from '@/lib/portal/types'
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
