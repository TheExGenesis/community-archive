/** @jest-environment node */

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import QuotingTweetsSidebar from './QuotingTweetsSidebar'
import type { TweetData } from './TweetComponent'

jest.mock('@/components/TweetAvatarImage', () => ({
  __esModule: true,
  default: () => null,
}))
jest.mock('@/components/ImageLightbox', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

const quotingTweet: TweetData = {
  tweet_id: 'quote-1',
  account_id: 'account-1',
  created_at: '2026-08-01T12:00:00Z',
  full_text: 'A useful perspective &amp;amp; a second thought.',
  retweet_count: 4,
  favorite_count: 21,
  reply_to_tweet_id: null,
  quote_tweet_id: 'original-1',
  retweeted_tweet_id: null,
  avatar_media_url: 'https://example.com/avatar.jpg',
  username: 'quote_author',
  account_display_name: 'Quote Author',
  media: [
    {
      media_url: 'https://example.com/quote-image.jpg',
      media_type: 'photo',
    },
  ],
  urls: [],
}

const targetTweet: TweetData = {
  ...quotingTweet,
  tweet_id: 'original-1',
  account_id: 'account-2',
  full_text: 'The complete original tweet being quoted.',
  username: 'original_author',
  account_display_name: 'Original Author',
  quote_tweet_id: null,
  media: [
    {
      media_url: 'https://example.com/original-image.jpg',
      media_type: 'photo',
    },
  ],
}

describe('QuotingTweetsSidebar', () => {
  it('renders quoting tweets, engagement, and the complete result count', () => {
    const markup = renderToStaticMarkup(
      <QuotingTweetsSidebar
        tweets={[quotingTweet]}
        totalCount={15}
        targetTweet={targetTweet}
      />,
    )

    expect(markup).toContain('aria-labelledby="quoting-tweets-heading"')
    expect(markup).toContain('Tweets quoting this')
    expect(markup).toContain('Quote Author')
    expect(markup).toContain('A useful perspective &amp; a second thought.')
    expect(markup).toContain('quote-image.jpg')
    expect(markup).toContain('The complete original tweet being quoted.')
    expect(markup).toContain('original-image.jpg')
    expect(markup).toContain('href="/tweets/quote-1"')
    expect(markup).toContain('aria-label="15 quotes"')
    expect(markup).not.toContain('Open quote')
    expect(markup).toContain('Load more quotes')
  })

  it('shows an archive-specific empty state', () => {
    const markup = renderToStaticMarkup(
      <QuotingTweetsSidebar
        tweets={[]}
        totalCount={0}
        targetTweet={targetTweet}
      />,
    )

    expect(markup).toContain('No archived quotes yet')
    expect(markup).toContain('Tweets in Community Archive that quote this post')
  })
})
