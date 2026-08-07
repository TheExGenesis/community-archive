import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import UnifiedTweetList from './UnifiedTweetList'

jest.mock('@/components/TweetAvatarImage', () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}))

const tweet = {
  tweet_id: '2085447310574793145',
  account_id: '123',
  created_at: '2026-08-06T12:00:00.000Z',
  full_text: `A compact search result with enough text to demonstrate that long tweets are kept scannable in the table view. ${'More details. '.repeat(12)}`,
  retweet_count: 12,
  favorite_count: 34,
  reply_to_tweet_id: null,
  quote_tweet_id: null,
  retweeted_tweet_id: null,
  avatar_media_url: 'https://example.com/avatar.jpg',
  username: 'archive_user',
  account_display_name: 'Archive User',
  media: [],
  urls: [],
}

describe('UnifiedTweetList compact view', () => {
  it('renders table-like columns and expands collapsed tweet text', async () => {
    render(
      <UnifiedTweetList
        tweets={[tweet]}
        headerTitle="Search results · 1"
        collapseLongTweets
        compact
      />,
    )

    expect(
      screen.getByRole('table', { name: 'Search results · 1' }),
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('columnheader').map((header) => header.textContent),
    ).toEqual(['Author', 'Tweet', 'Date', 'Engagement', 'Links'])
    expect(screen.getByText('Archive User')).toBeInTheDocument()
    expect(
      screen
        .getAllByRole('link', { name: 'Open archived tweet' })
        .every(
          (link) => link.getAttribute('href') === '/tweets/2085447310574793145',
        ),
    ).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Show more' }))
    expect(
      screen.getByRole('button', { name: 'Show less' }),
    ).toBeInTheDocument()
  })
})
