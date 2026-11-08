import TweetCard from '@/components/TweetCard'
import type { PortalTweet } from '@/lib/portal/types'

/** A framed card for one tweet; the editorial row's own divider is dropped. */
export const tweetCardFrame =
  'overflow-hidden rounded-2xl border border-zinc-200 bg-white px-4 [&_.border-t]:border-t-0 [&_.border-t]:py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_14px_-6px_rgba(0,0,0,0.08)] dark:border-zinc-800 dark:bg-zinc-900/70 dark:shadow-none'

/**
 * A story's featured tweets as framed cards: side by side when the column is
 * wide enough for two cards of about 300px, otherwise one per row.
 */
export function TweetCardGrid({
  tweets,
  returnTo,
}: {
  tweets: PortalTweet[]
  returnTo: string
}) {
  if (tweets.length === 0) return null
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-start gap-4">
      {tweets.map((tweet) => (
        <div key={tweet.id} className={tweetCardFrame}>
          <TweetCard
            tweet={tweet}
            variant="editorial"
            collapsible
            showDate
            origin="digest"
            returnTo={returnTo}
          />
        </div>
      ))}
    </div>
  )
}
