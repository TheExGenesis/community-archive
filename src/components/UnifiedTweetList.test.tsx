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
  quote_tweet_id: 'quoted-1',
  retweeted_tweet_id: null,
  avatar_media_url: 'https://example.com/avatar.jpg',
  username: 'archive_user',
  account_display_name: 'Archive User',
  media: [
    {
      media_url: 'https://example.com/photo.jpg',
      media_type: 'photo',
      width: 800,
      height: 600,
    },
  ],
  urls: [],
  quoted_tweet: {
    tweet_id: 'quoted-1',
    account_id: '456',
    created_at: '2026-08-05T12:00:00.000Z',
    full_text: 'The quoted tweet is visible in compact search results.',
    retweet_count: 2,
    favorite_count: 8,
    avatar_media_url: 'https://example.com/quoted-avatar.jpg',
    username: 'quoted_user',
    account_display_name: 'Quoted User',
    media: [],
  },
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
    expect(screen.getByAltText('Tweet image 1')).toBeInTheDocument()
    expect(screen.getByText('Quoted User')).toBeInTheDocument()
    expect(
      screen.getByText(
        'The quoted tweet is visible in compact search results.',
      ),
    ).toBeInTheDocument()
    expect(
      screen
        .getAllByRole('link', { name: 'View tweet in Community Archive' })
        .every(
          (link) => link.getAttribute('href') === '/tweets/2085447310574793145',
        ),
    ).toBe(true)
    expect(
      screen
        .getAllByRole('link', { name: 'View original tweet on Twitter' })
        .every(
          (link) =>
            link.getAttribute('href') ===
              'https://twitter.com/archive_user/status/2085447310574793145' &&
            link.getAttribute('target') === '_blank',
        ),
    ).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Show more' }))
    expect(
      screen.getByRole('button', { name: 'Show less' }),
    ).toBeInTheDocument()
  })

  it('sends table-header sort choices to the server-search owner', async () => {
    const onSearchSortChange = jest.fn()
    render(
      <UnifiedTweetList
        tweets={[tweet]}
        compact
        searchSort="newest"
        onSearchSortChange={onSearchSortChange}
      />,
    )

    expect(screen.getByRole('columnheader', { name: /Date/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
    await userEvent.click(screen.getByRole('button', { name: /Date/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Sort by likes' }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Sort by reposts' }),
    )
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Sort search results' }),
      'likes',
    )

    expect(onSearchSortChange.mock.calls).toEqual([
      ['oldest'],
      ['likes'],
      ['reposts'],
      ['likes'],
    ])
  })
})
