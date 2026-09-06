import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import TweetList from './TweetList'
import { fetchTweets } from '@/lib/queries/tweetQueries'
import {
  canPreviewTweetSearch,
  searchTweetPreviewsWithClickHouse,
} from '@/lib/clickhouseSearch'

jest.mock('@/utils/supabase', () => ({
  createBrowserClient: () => ({}),
}))

jest.mock('@/lib/queries/tweetQueries', () => ({
  fetchTweets: jest.fn(),
}))

jest.mock('@/lib/clickhouseSearch', () => ({
  canPreviewTweetSearch: jest.fn(),
  searchTweetPreviewsWithClickHouse: jest.fn(),
}))

jest.mock('@/components/UnifiedTweetList', () => ({
  __esModule: true,
  default: ({
    tweets,
    emptyMessage,
  }: {
    tweets: Array<{ tweet_id: string }>
    emptyMessage: string
  }) => (
    <div data-testid="tweet-ids">
      {tweets.length > 0
        ? tweets.map((tweet) => tweet.tweet_id).join(',')
        : emptyMessage}
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

const previewTweets = [
  'preview-1',
  'preview-2',
  'preview-3',
  'preview-4',
  'preview-5',
].map((tweet_id) => ({ ...previewTweet, tweet_id }))

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
    ;(searchTweetPreviewsWithClickHouse as jest.Mock).mockResolvedValue({
      tweets: previewTweets,
      definitiveEmpty: false,
    })
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

    expect(await screen.findByTestId('tweet-ids')).toHaveTextContent(
      'preview-1,preview-2,preview-3,preview-4,preview-5',
    )
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
    ;(searchTweetPreviewsWithClickHouse as jest.Mock).mockRejectedValue(
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

  it('falls through when an empty preview is not marked definitive', async () => {
    ;(canPreviewTweetSearch as jest.Mock).mockReturnValue(true)
    ;(searchTweetPreviewsWithClickHouse as jest.Mock).mockResolvedValue({
      tweets: [],
      definitiveEmpty: false,
    })
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

  it('shows an immediate empty result without repeating a successful empty preview', async () => {
    ;(canPreviewTweetSearch as jest.Mock).mockReturnValue(true)
    ;(searchTweetPreviewsWithClickHouse as jest.Mock).mockResolvedValue({
      tweets: [],
      definitiveEmpty: true,
    })

    render(
      <TweetList
        filterCriteria={{
          searchQuery: 'nothing',
          rawSearchQuery: 'no results anywhere',
          excludeRetweets: true,
        }}
      />,
    )

    expect(
      await screen.findByText('No tweets to display for the current filters.'),
    ).toBeVisible()
    expect(fetchTweets).not.toHaveBeenCalled()
    expect(
      screen.queryByText('Loading the remaining results…'),
    ).not.toBeInTheDocument()
  })
})

describe('search request scheduling and cancellation', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    ;(canPreviewTweetSearch as jest.Mock).mockReturnValue(false)
  })
  afterEach(() => jest.useRealTimers())

  it('starts the canonical query despite an unresolved preview and ignores a late preview', async () => {
    jest.useFakeTimers()
    const preview = deferred<{
      tweets: typeof previewTweets
      definitiveEmpty: boolean
    }>()
    ;(canPreviewTweetSearch as jest.Mock).mockReturnValue(true)
    ;(searchTweetPreviewsWithClickHouse as jest.Mock).mockReturnValue(
      preview.promise,
    )
    ;(fetchTweets as jest.Mock).mockResolvedValue({
      tweets: [{ ...previewTweet, tweet_id: 'canonical' }],
      totalCount: null,
      error: null,
    })
    render(<TweetList filterCriteria={{ rawSearchQuery: 'archive' }} />)
    await act(async () => {
      jest.advanceTimersByTime(250)
    })
    expect(fetchTweets).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('tweet-ids')).toHaveTextContent('canonical')
    await act(async () => {
      preview.resolve({ tweets: previewTweets, definitiveEmpty: false })
    })
    expect(screen.getByTestId('tweet-ids')).toHaveTextContent('canonical')
    expect(
      (searchTweetPreviewsWithClickHouse as jest.Mock).mock.calls[0][2].aborted,
    ).toBe(true)
  })

  it('shows the canonical page while quote bodies are still loading', async () => {
    const enriched = deferred<any>()
    ;(fetchTweets as jest.Mock).mockImplementation(
      (_client, _criteria, _page, _size, options) => {
        options.onBaseTweets([{ ...previewTweet, tweet_id: 'canonical' }])
        return enriched.promise
      },
    )
    render(
      <TweetList
        filterCriteria={{ rawSearchQuery: 'archive', includeQuoteTweets: true }}
      />,
    )
    expect(await screen.findByTestId('tweet-ids')).toHaveTextContent(
      'canonical',
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading quoted tweets…',
    )
    await act(async () => {
      enriched.resolve({
        tweets: [{ ...previewTweet, tweet_id: 'canonical' }],
        totalCount: null,
        error: null,
      })
    })
    expect(screen.queryByText('Loading quoted tweets…')).not.toBeInTheDocument()
  })

  it('aborts obsolete searches and rejects late results and quote updates', async () => {
    const old = deferred<any>()
    const current = deferred<any>()
    ;(fetchTweets as jest.Mock)
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(current.promise)
    const { rerender, unmount } = render(
      <TweetList filterCriteria={{ rawSearchQuery: 'old' }} />,
    )
    const oldOptions = (fetchTweets as jest.Mock).mock.calls[0][4]
    rerender(<TweetList filterCriteria={{ rawSearchQuery: 'new' }} />)
    expect(oldOptions.signal.aborted).toBe(true)
    await act(async () => {
      current.resolve({
        tweets: [{ ...previewTweet, tweet_id: 'current' }],
        totalCount: null,
        error: null,
      })
    })
    await act(async () => {
      oldOptions.onBaseTweets(previewTweets)
      old.resolve({ tweets: previewTweets, totalCount: null, error: null })
    })
    expect(screen.getByTestId('tweet-ids')).toHaveTextContent('current')
    const currentSignal = (fetchTweets as jest.Mock).mock.calls[1][4].signal
    unmount()
    expect(currentSignal.aborted).toBe(true)
  })

  it('does not repeat an equivalent search after a parent rerender', async () => {
    ;(fetchTweets as jest.Mock).mockResolvedValue({
      tweets: previewTweets,
      totalCount: null,
      error: null,
    })
    const { rerender } = render(
      <TweetList filterCriteria={{ rawSearchQuery: 'archive' }} />,
    )
    await screen.findByTestId('tweet-ids')
    rerender(<TweetList filterCriteria={{ rawSearchQuery: 'archive' }} />)
    expect(fetchTweets).toHaveBeenCalledTimes(1)
  })
})

test('retries a failed search explicitly without changing its filters', async () => {
  jest.resetAllMocks()
  const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {})
  ;(canPreviewTweetSearch as jest.Mock).mockReturnValue(false)
  ;(fetchTweets as jest.Mock)
    .mockResolvedValueOnce({
      tweets: [],
      totalCount: null,
      error: new Error('Temporarily unavailable'),
    })
    .mockResolvedValueOnce({
      tweets: previewTweets,
      totalCount: null,
      error: null,
    })
  render(
    <TweetList
      filterCriteria={{ rawSearchQuery: 'archive', fromUsername: 'alice' }}
    />,
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Retry search' }))
  expect(await screen.findByTestId('tweet-ids')).toHaveTextContent('preview-1')
  expect((fetchTweets as jest.Mock).mock.calls[1][1]).toEqual({
    rawSearchQuery: 'archive',
    fromUsername: 'alice',
  })
  errorLog.mockRestore()
})

test('a cancelled late preview cannot replace a completed search error', async () => {
  jest.resetAllMocks()
  jest.useFakeTimers()
  const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {})
  const preview = deferred<{
    tweets: typeof previewTweets
    definitiveEmpty: boolean
  }>()
  ;(canPreviewTweetSearch as jest.Mock).mockReturnValue(true)
  ;(searchTweetPreviewsWithClickHouse as jest.Mock).mockReturnValue(
    preview.promise,
  )
  ;(fetchTweets as jest.Mock).mockResolvedValue({
    tweets: [],
    totalCount: null,
    error: new Error('Search unavailable'),
  })
  render(<TweetList filterCriteria={{ rawSearchQuery: 'archive' }} />)
  await act(async () => {
    jest.advanceTimersByTime(250)
  })
  expect(screen.getByText('Search could not be completed')).toBeVisible()
  await act(async () => {
    preview.resolve({ tweets: previewTweets, definitiveEmpty: false })
  })
  expect(screen.queryByTestId('tweet-ids')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Retry search' })).toBeVisible()
  errorLog.mockRestore()
  jest.useRealTimers()
})
