import React from 'react'
import Link from 'next/link'
import { FaHeart, FaRetweet } from 'react-icons/fa'
import { Quote } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import TweetAvatarImage from '@/components/TweetAvatarImage'
import type { TweetData } from '@/components/TweetComponent'
import { formatNumber } from '@/lib/formatNumber'

interface QuotingTweetsSidebarProps {
  tweets: TweetData[]
  totalCount: number
}

const dateFormatter = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

function decodeTweetText(text: string) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&#x27;/g, "'")
}

function getAvatarInitial(...values: Array<string | undefined>) {
  for (const value of values) {
    const initial = Array.from(value?.trim() ?? '')[0]
    if (initial) return initial
  }
  return 'U'
}

export default function QuotingTweetsSidebar({
  tweets,
  totalCount,
}: QuotingTweetsSidebarProps) {
  return (
    <aside
      aria-labelledby="quoting-tweets-heading"
      className="lg:sticky lg:top-24"
    >
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Quote className="h-4 w-4 text-brand" aria-hidden="true" />
            <h2
              id="quoting-tweets-heading"
              className="font-semibold text-foreground"
            >
              Tweets quoting this
            </h2>
          </div>
          <span
            className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold tabular-nums text-muted-foreground"
            aria-label={`${totalCount} ${totalCount === 1 ? 'quote' : 'quotes'}`}
          >
            {formatNumber(totalCount)}
          </span>
        </div>

        {tweets.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <Quote
              className="mx-auto h-7 w-7 text-muted-foreground/60"
              aria-hidden="true"
            />
            <p className="mt-3 text-sm font-medium text-foreground">
              No archived quotes yet
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Tweets in Community Archive that quote this post will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {tweets.map((tweet) => (
              <article key={tweet.tweet_id} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-9 w-9 flex-shrink-0">
                    <TweetAvatarImage
                      src={tweet.avatar_media_url}
                      alt={`${tweet.account_display_name}'s profile picture`}
                      username={tweet.username}
                      tweetId={tweet.tweet_id}
                    />
                    <AvatarFallback className="text-xs">
                      {getAvatarInitial(
                        tweet.account_display_name,
                        tweet.username,
                      )}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-baseline gap-1.5">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {tweet.account_display_name}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        @{tweet.username}
                      </span>
                    </div>
                    <time
                      dateTime={tweet.created_at}
                      className="text-xs text-muted-foreground"
                    >
                      {dateFormatter.format(new Date(tweet.created_at))}
                    </time>
                  </div>
                </div>

                <p className="mt-3 line-clamp-4 whitespace-pre-wrap break-words text-sm leading-5 text-foreground">
                  {decodeTweetText(tweet.full_text)}
                </p>

                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1">
                      <FaHeart aria-hidden="true" />
                      {formatNumber(tweet.favorite_count)}
                      <span className="sr-only">likes</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <FaRetweet aria-hidden="true" />
                      {formatNumber(tweet.retweet_count ?? 0)}
                      <span className="sr-only">reposts</span>
                    </span>
                  </div>
                  <Link
                    href={`/tweets/${tweet.tweet_id}`}
                    className="font-medium text-brand underline-offset-2 hover:underline"
                  >
                    Open quote
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}

        {totalCount > tweets.length && (
          <p className="border-t border-border bg-muted/40 px-5 py-3 text-center text-xs text-muted-foreground">
            Showing {tweets.length} of {formatNumber(totalCount)} archived
            quotes
          </p>
        )}
      </div>
    </aside>
  )
}
