import React from 'react'
import { act, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import TweetList from './TweetList'
import { fetchTweets } from '@/lib/queries/tweetQueries'
import {
  canPreviewTweetSearch,
  searchTweetPreviewWithClickHouse,
} from '@/lib/clickhouseSearch'

jest.mock('@/utils/supabase', () => ({
  createBrowserClient: () => ({}),
}))

jest.mock('@/lib/queries/tweetQueries', () => ({
  fetchTweets: jest.fn(),
}))

jest.mock('@/lib/clickhouseSearch', () => ({
  canPreviewTweetSearch: jest.fn(),
  searchTweetPreviewWithClickHouse: jest.fn(),
}))

jest.mock('@/components/UnifiedTweetList', () => ({
  __esModule: true,
  default: ({ tweets }: { tweets: Array<{ tweet_id: string }> }) => (
    <div data-testid="tweet-ids">
      {tweets.map((tweet) => tweet.tweet_id).join(',')}
    </div>
  ),
}))

const previewTweet = {
  tweet_id: 'preview',
  account_id: '42',
  created_at: '2026-08-13T00:00:00.000Z',
  full_text: 'Preview tweet',
  favorite_count: 1,
  retweet_count: 0,
  reply_to_tweet_id: null,
  account: {
    username: 'alice',
    account_display_name: 'Alice',
  },
  media: [],
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('TweetList progressive search', () => {
  let warnSpy: jest.SpiedFunction<typeof console.warn>

  beforeEach(() => {
    jest.clearAllMocks()
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('renders the preview before replacing it with the complete canonical page', async () => {
    const complete = deferred<{
      tweets: Array<typeof previewTweet>
      totalCount: null
      error: null
    }>()
    const fullTweets = [
      { ...previewTweet, tweet_id: 'canonical-1' },
      { ...previewTweet, tweet_id: 'canonical-2' },
    ]
    ;(canPreviewTweetSearch as jest.Mock).mockReturnValue(true)
    ;(searchTweetPreviewWithClickHouse as jest.Mock).mockResolvedValue(
      previewTweet,
    )
    ;(fetchTweets as jest.Mock).mockReturnValue(complete.promise)

    render(
      <TweetList
        filterCriteria={{
          searchQuery: 'open & source',
          rawSearchQuery: 'open source',
          excludeRetweets: true,
        }}
      />,
    )

    expect(await screen.findByTestId('tweet-ids')).toHaveTextContent('preview')
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading the remaining results…',
    )

    await act(async () => {
      complete.resolve({ tweets: fullTweets, totalCount: null, error: null })
      await complete.promise
    })

    expect(screen.getByTestId('tweet-ids')).toHaveTextContent(
      'canonical-1,canonical-2',
    )
    expect(
      screen.queryByText('Loading the remaining results…'),
    ).not.toBeInTheDocument()
  })

  it('falls through to the canonical page when the preview fails', async () => {
    ;(canPreviewTweetSearch as jest.Mock).mockReturnValue(true)
    ;(searchTweetPreviewWithClickHouse as jest.Mock).mockRejectedValue(
      new Error('preview unavailable'),
    )
    ;(fetchTweets as jest.Mock).mockResolvedValue({
      tweets: [{ ...previewTweet, tweet_id: 'canonical' }],
      totalCount: null,
      error: null,
    })

    render(
      <TweetList
        filterCriteria={{
          searchQuery: 'open & source',
          rawSearchQuery: 'open source',
          excludeRetweets: true,
        }}
      />,
    )

    expect(await screen.findByTestId('tweet-ids')).toHaveTextContent(
      'canonical',
    )
    expect(fetchTweets).toHaveBeenCalledTimes(1)
  })
})
