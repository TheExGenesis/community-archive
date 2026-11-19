import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import StreamMonitor from './page'
import { getLatestStreamTweets } from '@/lib/queries/getLatestStreamTweets'

jest.mock('@/lib/queries/getLatestStreamTweets', () => ({
  getLatestStreamTweets: jest.fn(),
}))
jest.mock('@/components/ExtensionInstallPrompt', () => () => null)
jest.mock(
  '@/components/UnifiedTweetList',
  () =>
    function TweetListMock({
      tweets,
    }: {
      tweets: { tweet_id: string; full_text: string }[]
    }) {
      return (
        <ul>
          {tweets.map((tweet) => (
            <li key={tweet.tweet_id}>{tweet.full_text}</li>
          ))}
        </ul>
      )
    },
)
jest.mock('@/components/ui/chart', () => ({
  ChartContainer: () => null,
  ChartTooltip: () => null,
  ChartTooltipContent: () => null,
}))

type Page = Awaited<ReturnType<typeof getLatestStreamTweets>>
const latest = jest.mocked(getLatestStreamTweets)
// A page of tweets; hasMore and the cursor point past its last tweet.
const tweets = (
  start: number,
  count: number,
  hasMore = count === 30,
): Page => ({
  tweets: Array.from({ length: count }, (_, i) => ({
    tweet_id: String(start + i),
    full_text: `Tweet ${start + i}`,
  })) as Page['tweets'],
  nextCursor: count
    ? { createdAt: `t${start + count - 1}`, id: String(start + count - 1) }
    : null,
  hasMore,
})

const clients: QueryClient[] = []
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  clients.push(client)
  render(
    <QueryClientProvider client={client}>
      <StreamMonitor />
    </QueryClientProvider>,
  )
  return client
}

beforeEach(() => {
  latest.mockReset()
  jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({
      data: [],
      summary: { totalTweets: 0, avgTweetsPerPeriod: 0, sourceMessages: 0 },
      count: 0,
    }),
  } as Response)
})
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear())
  jest.restoreAllMocks()
})

test('keeps loaded tweets while loading more, deduplicates overlapping pages, and stops at the end', async () => {
  latest.mockResolvedValueOnce(tweets(0, 30))
  let resolvePage!: (value: Page) => void
  latest.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolvePage = resolve
      }),
  )
  setup()
  fireEvent.click(await screen.findByRole('button', { name: 'Load More' }))
  expect(screen.getByText('Tweet 0')).toBeInTheDocument()
  await act(async () => resolvePage(tweets(29, 2)))
  expect(await screen.findByText('Tweet 30')).toBeInTheDocument()
  expect(screen.getAllByText('Tweet 29')).toHaveLength(1)
  expect(latest.mock.calls[1][0]).toEqual({ createdAt: 't29', id: '29' })
  expect(
    screen.queryByRole('button', { name: 'Load More' }),
  ).not.toBeInTheDocument()
})

test('refetching a later page does not duplicate it, and Refresh requests the newest page', async () => {
  latest
    .mockResolvedValueOnce(tweets(0, 30))
    .mockResolvedValueOnce(tweets(30, 30))
  const client = setup()
  fireEvent.click(await screen.findByRole('button', { name: 'Load More' }))
  await screen.findByText('Tweet 59')
  latest.mockResolvedValueOnce(tweets(31, 30))
  await act(async () => {
    await client.refetchQueries({
      queryKey: ['streamMonitorTweets', 't29:29'],
    })
  })
  expect(await screen.findByText('Tweet 60')).toBeInTheDocument()
  expect(screen.getAllByText('Tweet 31')).toHaveLength(1)
  latest.mockResolvedValueOnce(tweets(100, 3))
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  expect(await screen.findByText('Tweet 100')).toBeInTheDocument()
  expect(latest).toHaveBeenLastCalledWith(null)
  expect(screen.queryByText('Tweet 59')).not.toBeInTheDocument()
})

test('a failed later page preserves existing tweets and retries the same cursor', async () => {
  latest
    .mockResolvedValueOnce(tweets(0, 30))
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(tweets(30, 1))
  setup()
  fireEvent.click(await screen.findByRole('button', { name: 'Load More' }))
  const retry = await screen.findByRole('button', {
    name: 'Retry loading tweets',
  })
  expect(screen.getByText('Tweet 0')).toBeInTheDocument()
  fireEvent.click(retry)
  expect(await screen.findByText('Tweet 30')).toBeInTheDocument()
  const cursor = { createdAt: 't29', id: '29' }
  expect(latest.mock.calls.map((call) => call[0])).toEqual([
    null,
    cursor,
    cursor,
  ])
})

test('failed statistics show unavailable rather than zero activity', async () => {
  jest
    .mocked(fetch)
    .mockResolvedValue({ ok: false, json: async () => ({}) } as Response)
  latest.mockResolvedValue(tweets(0, 0))
  setup()
  await waitFor(() =>
    expect(screen.getAllByText('Unavailable')).toHaveLength(4),
  )
  expect(screen.queryByText('0')).not.toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Next time period' }),
  ).toBeDisabled()
})
