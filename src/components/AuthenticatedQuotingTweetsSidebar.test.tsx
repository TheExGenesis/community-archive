import { render, screen, waitFor } from '@testing-library/react'
import { createBrowserClient } from '@/utils/supabase'
import AuthenticatedQuotingTweetsSidebar from './AuthenticatedQuotingTweetsSidebar'
import type { TweetData } from './TweetComponent'

jest.mock('@/utils/supabase', () => ({ createBrowserClient: jest.fn() }))
jest.mock('@/components/QuotingTweetsSidebar', () => ({
  __esModule: true,
  default: ({ totalCount }: { totalCount: number }) => (
    <div>Loaded {totalCount} archived quotes</div>
  ),
}))

const createBrowserClientMock = jest.mocked(createBrowserClient)
const getSession = jest.fn()

const targetTweet: TweetData = {
  tweet_id: '123',
  account_id: '42',
  created_at: '2026-08-01T12:00:00Z',
  full_text: 'Original tweet',
  retweet_count: 2,
  favorite_count: 5,
  reply_to_tweet_id: null,
  quote_tweet_id: null,
  retweeted_tweet_id: null,
  avatar_media_url: null,
  username: 'alice',
  account_display_name: 'Alice',
  media: [],
  urls: [],
}

describe('AuthenticatedQuotingTweetsSidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    createBrowserClientMock.mockReturnValue({
      auth: { getSession },
    } as never)
  })

  test('prompts signed-out visitors to log in without requesting quotes', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null })
    const fetchMock = jest.spyOn(global, 'fetch')
    render(<AuthenticatedQuotingTweetsSidebar targetTweet={targetTweet} />)

    expect(screen.getByText('Log in to see quotes')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      '/login?redirect=%2Ftweets%2F123',
    )
    await waitFor(() => expect(getSession).toHaveBeenCalled())
    expect(fetchMock).not.toHaveBeenCalled()
    fetchMock.mockRestore()
  })

  test('loads the first quote page for a signed-in visitor', async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: 'signed-in-user' } } },
      error: null,
    })
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ tweets: [], totalCount: 4, nextOffset: null }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

    render(<AuthenticatedQuotingTweetsSidebar targetTweet={targetTweet} />)

    expect(await screen.findByText('Loaded 4 archived quotes')).toBeVisible()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tweets/123/quotes?offset=0&limit=12',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    fetchMock.mockRestore()
  })
})
