import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import StreamMonitor from './page'
import getLatestTweets from '@/lib/queries/getLatestTweets'

jest.mock('@/utils/supabase', () => ({ createBrowserClient: () => ({}) }))
jest.mock('@/lib/queries/getLatestTweets', () => ({
  __esModule: true,
  default: jest.fn(),
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

const latest = jest.mocked(getLatestTweets)
const tweets = (start: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({
    tweet_id: String(start + i),
    full_text: `Tweet ${start + i}`,
  })) as Awaited<ReturnType<typeof getLatestTweets>>

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
  latest.mockResolvedValueOnce(tweets(0, 20))
  let resolvePage!: (value: Awaited<ReturnType<typeof getLatestTweets>>) => void
  latest.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolvePage = resolve
      }),
  )
  setup()
  fireEvent.click(await screen.findByRole('button', { name: 'Load More' }))
  expect(screen.getByText('Tweet 0')).toBeInTheDocument()
  await act(async () => resolvePage(tweets(19, 2)))
  expect(await screen.findByText('Tweet 20')).toBeInTheDocument()
  expect(screen.getAllByText('Tweet 19')).toHaveLength(1)
  expect(
    screen.queryByRole('button', { name: 'Load More' }),
  ).not.toBeInTheDocument()
})

test('refetching a later page does not duplicate it, and Refresh requests page zero', async () => {
  latest
    .mockResolvedValueOnce(tweets(0, 20))
    .mockResolvedValueOnce(tweets(20, 20))
  const client = setup()
  fireEvent.click(await screen.findByRole('button', { name: 'Load More' }))
  await screen.findByText('Tweet 39')
  latest.mockResolvedValueOnce(tweets(21, 20))
  await act(async () => {
    await client.refetchQueries({ queryKey: ['streamMonitorTweets', 20] })
  })
  expect(await screen.findByText('Tweet 40')).toBeInTheDocument()
  expect(screen.getAllByText('Tweet 21')).toHaveLength(1)
  latest.mockResolvedValueOnce(tweets(100, 3))
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  expect(await screen.findByText('Tweet 100')).toBeInTheDocument()
  expect(latest).toHaveBeenLastCalledWith(expect.anything(), 20, undefined, 0, {
    includeEnrichments: false,
  })
  expect(screen.queryByText('Tweet 39')).not.toBeInTheDocument()
})

test('a failed later page preserves existing tweets and retries the same offset', async () => {
  latest
    .mockResolvedValueOnce(tweets(0, 20))
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(tweets(20, 1))
  setup()
  fireEvent.click(await screen.findByRole('button', { name: 'Load More' }))
  const retry = await screen.findByRole('button', {
    name: 'Retry loading tweets',
  })
  expect(screen.getByText('Tweet 0')).toBeInTheDocument()
  fireEvent.click(retry)
  expect(await screen.findByText('Tweet 20')).toBeInTheDocument()
  expect(latest.mock.calls.map((call) => call[3])).toEqual([0, 20, 20])
})

test('failed statistics show unavailable rather than zero activity', async () => {
  jest
    .mocked(fetch)
    .mockResolvedValue({ ok: false, json: async () => ({}) } as Response)
  latest.mockResolvedValue([])
  setup()
  await waitFor(() =>
    expect(screen.getAllByText('Unavailable')).toHaveLength(4),
  )
  expect(screen.queryByText('0')).not.toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Next time period' }),
  ).toBeDisabled()
})
