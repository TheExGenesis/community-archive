import { Suspense } from 'react'
import TweetComponent from '@/components/TweetComponent'
import { TweetConversationPreview } from '@/components/TweetConversationPreview'
import TweetBackLink, { TweetBackLinkFallback } from '@/components/TweetBackLink'
import ThreadView from '@/components/ThreadView'
import QuotingTweetsSidebar from '@/components/QuotingTweetsSidebar'
import SummaryHeading from '@/components/tweetSummary/SummaryHeading'
import { eyebrowLabel, type TweetPageSubject } from '@/lib/tweetSummary/subject'
import type { TweetData } from '@/lib/tweets/types'
import type { ClickHouseQuotePostsData } from '@/lib/clickhouseQuotePosts'
import type { TweetPage } from '@/lib/tweetSummary/loadTweetPage'
import { getTweetPageSummary } from '@/lib/tweetSummary/store'
import { Link2, MessagesSquare } from 'lucide-react'

/**
 * The permalink body, shared by the dynamic /tweets route (visitors with a
 * session, whose consent decides what they see) and the cached /guest/tweets
 * route (everyone else, who all see the same preview). It reads nothing from
 * the request itself: the back link reads the query string in the browser.
 */
export default function TweetPermalink({ page }: { page: TweetPage }) {
  const {
    tweet,
    threadTree,
    quotingTweets,
    quotingTweetCount,
    quotePosts,
    subject,
    summary,
    summaryPending,
    canReadConversation,
  } = page
  const optInHref = `/opt-in?redirect=${encodeURIComponent(`/tweets/${tweet.tweet_id}`)}`
  const isThread = subject.kind === 'thread'
  // A standalone tweet still shows the replies it collected.
  const replyIds = threadTree?.children[tweet.tweet_id] ?? []

  return (
    <main className="min-h-screen bg-background">
      <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <Suspense fallback={<TweetBackLinkFallback />}>
          <TweetBackLink />
        </Suspense>

        <header className="mb-8 mt-8 border-b border-border pb-7">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-brand">
            {isThread ? (
              <MessagesSquare className="h-4 w-4" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
            {eyebrowLabel(subject.kind)}
          </div>
          {!canReadConversation ? (
            <SummaryHeading subject={subject} summary={null} />
          ) : summaryPending ? (
            <Suspense
              fallback={<SummaryHeading subject={subject} summary={null} />}
            >
              <GeneratedSummaryHeading subject={subject} />
            </Suspense>
          ) : (
            <SummaryHeading subject={subject} summary={summary} />
          )}
        </header>

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] xl:gap-10">
          <div className="min-w-0">
            {isThread && threadTree ? (
              <ThreadView tree={threadTree} highlightTweetId={tweet.tweet_id} />
            ) : (
              <>
                <h2 className="mb-5 text-xl font-semibold text-foreground">
                  Main tweet
                </h2>
                {/* Same pop treatment as a strand's seed post. */}
                <article className="border-2 border-foreground/80 bg-card p-5 shadow-[3px_3px_0_0_hsl(var(--brand))] sm:p-6">
                  <TweetComponent
                    key={tweet.tweet_id}
                    tweet={tweet}
                    isPermalinkPage
                  />
                </article>
                {!canReadConversation && (
                  <TweetConversationPreview kind="replies" href={optInHref} />
                )}
                {threadTree && replyIds.length > 0 && (
                  <ThreadView
                    tree={threadTree}
                    heading="Replies"
                    rootIds={replyIds}
                    className="mt-10"
                  />
                )}
              </>
            )}

            <div className="mt-8 rounded-lg border border-dashed border-border bg-card px-5 py-4 text-sm leading-6 text-muted-foreground">
              This permalink preserves the archived version. Use the Twitter
              link on the tweet to compare it with the live post when it is
              still available.
            </div>
          </div>

          {!canReadConversation ? (
            <TweetConversationPreview kind="quotes" href={optInHref} />
          ) : quotePosts ? (
            <Suspense fallback={<QuotePostsLoading />}>
              <IncomingQuotes quotePosts={quotePosts} targetTweet={tweet} />
            </Suspense>
          ) : (
            <QuotingTweetsSidebar
              key={tweet.tweet_id}
              tweets={quotingTweets}
              totalCount={quotingTweetCount}
              targetTweet={tweet}
            />
          )}
        </div>
      </section>
    </main>
  )
}

// Only rendered for a first visit by an opted-in user; everyone after reads
// the stored summary without waiting.
async function GeneratedSummaryHeading({
  subject,
}: {
  subject: TweetPageSubject
}) {
  const summary = await getTweetPageSummary(subject, true)
  return <SummaryHeading subject={subject} summary={summary} />
}

async function IncomingQuotes({
  quotePosts,
  targetTweet,
}: {
  quotePosts: Promise<ClickHouseQuotePostsData>
  targetTweet: TweetData
}) {
  const { tweets, totalCount } = await quotePosts
  return (
    <QuotingTweetsSidebar
      key={targetTweet.tweet_id}
      tweets={tweets}
      totalCount={totalCount}
      targetTweet={targetTweet}
    />
  )
}

function QuotePostsLoading() {
  return (
    <aside aria-label="Quote tweets" aria-busy="true">
      <h2 className="mb-5 text-xl font-semibold text-foreground">
        Conversation
      </h2>
      <p
        role="status"
        className="rounded-lg border border-border bg-card px-5 py-8 text-sm text-muted-foreground"
      >
        Loading archived quotes…
      </p>
    </aside>
  )
}
