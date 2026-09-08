import { TweetCard } from '@/components/TweetCard'
import type { PortalTweet } from '@/lib/portal/types'
export function SampleTweets({
  tweets,
  username,
}: {
  tweets: PortalTweet[]
  username: string
}) {
  return (
    <section aria-label="Sample tweets" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-sans text-sm font-semibold">Sample posts</h3>
        <span className="text-[11px] text-muted-foreground">
          @{username} first · ranked by likes
        </span>
      </div>
      <div className="grid items-start gap-3 xl:grid-cols-2">
        {tweets.map((tweet) => (
          <div
            key={tweet.id}
            className="overflow-hidden rounded-xl border border-border bg-card"
          >
            <p className="border-b border-border/50 px-4 py-2 text-[11px] font-semibold text-muted-foreground">
              {tweet.username.toLowerCase() === username.toLowerCase()
                ? `By @${username}`
                : `Conversation context · @${tweet.username}`}
            </p>
            <TweetCard
              tweet={tweet}
              compact
              collapsible
              showDate
              showExternalLink
            />
          </div>
        ))}
      </div>
      {!tweets.length && (
        <p className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">
          No sample posts are currently available. Explore the source posts
          below.
        </p>
      )}
    </section>
  )
}
