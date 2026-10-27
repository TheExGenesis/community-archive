import type { Metadata } from 'next'
import type { TweetPage } from './loadTweetPage'
import { fallbackTitle, plainTweetText } from './subject'

/** Shared by the dynamic permalink and its cached guest view. */
export function tweetPageMetadata(page: TweetPage | null): Metadata {
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
