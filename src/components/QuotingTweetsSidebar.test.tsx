/** @jest-environment node */

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import QuotingTweetsSidebar from './QuotingTweetsSidebar'
import type { TweetData } from './TweetComponent'

jest.mock('@/components/TweetAvatarImage', () => ({
  __esModule: true,
  default: () => null,
}))

const quotingTweet: TweetData = {
  tweet_id: 'quote-1',
  account_id: 'account-1',
  created_at: '2026-08-01T12:00:00Z',
  full_text: 'A useful perspective &amp; a second thought.',
  retweet_count: 4,
  favorite_count: 21,
  reply_to_tweet_id: null,
  quote_tweet_id: 'original-1',
  retweeted_tweet_id: null,
  avatar_media_url: 'https://example.com/avatar.jpg',
  username: 'quote_author',
  account_display_name: 'Quote Author',
  media: [],
  urls: [],
}

describe('QuotingTweetsSidebar', () => {
  it('renders quoting tweets, engagement, and the complete result count', () => {
    const markup = renderToStaticMarkup(
      <QuotingTweetsSidebar tweets={[quotingTweet]} totalCount={15} />,
    )

    expect(markup).toContain('aria-labelledby="quoting-tweets-heading"')
    expect(markup).toContain('Tweets quoting this')
    expect(markup).toContain('Quote Author')
    expect(markup).toContain('A useful perspective &amp; a second thought.')
    expect(markup).toContain('href="/tweets/quote-1"')
    expect(markup).toContain('aria-label="15 quotes"')
    expect(markup).toContain('Showing 1 of 15')
  })

  it('shows an archive-specific empty state', () => {
    const markup = renderToStaticMarkup(
      <QuotingTweetsSidebar tweets={[]} totalCount={0} />,
    )

    expect(markup).toContain('No archived quotes yet')
    expect(markup).toContain('Tweets in Community Archive that quote this post')
  })
})
