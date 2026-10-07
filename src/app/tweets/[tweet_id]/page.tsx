import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import TweetComponent from '@/components/TweetComponent'
import TweetBackLink from '@/components/TweetBackLink'
import ThreadView from '@/components/ThreadView'
import QuotingTweetsSidebar from '@/components/QuotingTweetsSidebar'
import { getTweetBackLink } from '@/lib/navigation'
import {
  eyebrowLabel,
  fallbackTitle,
  plainTweetText,
} from '@/lib/tweetSummary/subject'
import { loadTweetPage } from '@/lib/tweetSummary/loadTweetPage'
import { Link2, MessagesSquare, Sparkles } from 'lucide-react'

// ISR: serve from CDN cache, revalidate at most once per hour
export const revalidate = 3600
// The first visit to a page may wait on summary generation.
export const maxDuration = 30

type PageProps = {
  params: { tweet_id: string }
  searchParams?: Record<string, string | string[] | undefined>
}

const loadFromProps = ({ params, searchParams }: PageProps) =>
  loadTweetPage(params.tweet_id, searchParams?.from === 'opportunities')

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const page = await loadFromProps(props)
  if (!page) return { title: 'Tweet not found · Community Archive' }

  const title = page.summary?.title ?? fallbackTitle(page.subject)
  const text = plainTweetText(page.tweet.full_text)
  const description =
    page.summary?.description ??
    (text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text)
  const url = `https://www.community-archive.org/tweets/${page.tweet.tweet_id}`
  return {
    title: `${title} · Community Archive`,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'article' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function TweetPage(props: PageProps) {
  const page = await loadFromProps(props)
  if (!page) {
    notFound()
  }

  const {
    tweet,
    threadTree,
    quotingTweets,
    quotingTweetCount,
    subject,
    summary,
  } = page
  const isThread = subject.kind === 'thread'
  // A standalone tweet still shows the replies it collected.
  const replyIds = threadTree?.children[tweet.tweet_id] ?? []
  const backLink = getTweetBackLink(props.searchParams)

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
            {eyebrowLabel(subject.kind)}
          </div>
          <h1 className="max-w-4xl text-4xl font-bold tracking-tight text-foreground [text-wrap:balance] sm:text-5xl">
            {summary?.title ?? fallbackTitle(subject)}
          </h1>
          {summary && (
            <>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
                {summary.description}
              </p>
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground/80">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                AI-generated summary. The author&rsquo;s original words are
                below.
              </p>
            </>
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
