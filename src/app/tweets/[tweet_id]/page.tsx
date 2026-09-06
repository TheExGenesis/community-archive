import { getTweetPageData } from '@/lib/getTweetPageData'
import { notFound } from 'next/navigation'
import TweetComponent from '@/components/TweetComponent'
import TweetBackLink from '@/components/TweetBackLink'
import ThreadView from '@/components/ThreadView'
import QuotingTweetsSidebar from '@/components/QuotingTweetsSidebar'
import { getTweetBackLink } from '@/lib/navigation'
import { Link2, MessagesSquare } from 'lucide-react'

// ISR: serve from CDN cache, revalidate at most once per hour
export const revalidate = 3600

export default async function TweetPage({
  params,
  searchParams,
}: {
  params: { tweet_id: string }
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const { tweet_id } = params
  const { tweet, threadTree, quotingTweets, quotingTweetCount } =
    await getTweetPageData(tweet_id)

  if (!tweet) {
    notFound()
  }

  const isThread = threadTree && Object.keys(threadTree.tweets).length > 1
  const backLink = getTweetBackLink(searchParams)

  return (
    <main className="min-h-screen bg-background">
      <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <TweetBackLink
          href={backLink.href}
          label={backLink.label}
          useHistory={backLink.hasKnownOrigin}
        />

        <header className="mb-8 mt-8 border-b border-border pb-7">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-brand">
            {isThread ? (
              <MessagesSquare className="h-4 w-4" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
            Archive permalink
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            {isThread ? 'Conversation thread' : 'Archived tweet'}
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
            {isThread
              ? 'Read the surrounding conversation with the linked tweet highlighted.'
              : 'A permanent public view of this tweet in Community Archive.'}
          </p>
        </header>

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] xl:gap-10">
          <div className="min-w-0">
            {isThread && threadTree ? (
              <ThreadView tree={threadTree} highlightTweetId={tweet_id} />
            ) : (
              <article className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6">
                <TweetComponent
                  key={tweet.tweet_id}
                  tweet={tweet}
                  isPermalinkPage
                />
              </article>
            )}

            <div className="mt-8 rounded-lg border border-dashed border-border bg-card px-5 py-4 text-sm leading-6 text-muted-foreground">
              This permalink preserves the archived version. Use the Twitter
              link on the tweet to compare it with the live post when it is
              still available.
            </div>
          </div>

          <QuotingTweetsSidebar
            tweets={quotingTweets}
            totalCount={quotingTweetCount}
            targetTweet={tweet}
          />
        </div>
      </section>
    </main>
  )
}
