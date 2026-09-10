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
    <section aria-label="Sample tweets" className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-sans text-sm font-semibold">Sample posts</h3>
        <span className="text-[11px] text-muted-foreground">
          @{username} first · ranked by likes
        </span>
      </div>
      <div className="birdseye-scroll relative grid snap-x auto-cols-[88%] grid-flow-col items-start gap-2 overflow-x-auto pb-1 [contain:paint] md:auto-cols-auto md:grid-flow-row md:grid-cols-3 md:overflow-visible md:[contain:none]">
        {tweets.map((tweet) => (
          <div
            key={tweet.id}
            className="relative snap-start overflow-hidden rounded-xl border border-border bg-card"
          >
            {tweet.username.toLowerCase() !== username.toLowerCase() && (
              <p className="border-b border-border/50 px-3 py-1 text-[11px] font-semibold text-muted-foreground">
                Conversation context · @{tweet.username}
              </p>
            )}
            <TweetCard
              tweet={tweet}
              noClamp
              constrainMedia
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
