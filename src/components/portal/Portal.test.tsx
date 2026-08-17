import { act, render, screen } from '@testing-library/react'
import Portal, { type PortalView } from './Portal'
import type { PortalData, PortalTweet } from '@/lib/portal/types'

jest.mock('./TweetRow', () => ({
  TweetRow: ({ tweet, noClamp }: { tweet: PortalTweet; noClamp?: boolean }) => (
    <div data-no-clamp={String(Boolean(noClamp))}>{tweet.text}</div>
  ),
}))

const seedTweet: PortalTweet = {
  id: '100',
  username: 'alice',
  name: 'Alice',
  avatar: null,
  text: 'seed tweet',
  observedAt: '2026-08-07T12:00:00.000Z',
  createdAt: '2026-08-07T11:55:00.000Z',
  likes: 0,
  rts: 0,
}

const freshTweet: PortalTweet = {
  ...seedTweet,
  id: '101',
  text: 'fresh tweet',
  observedAt: '2026-08-07T12:01:00.000Z',
  createdAt: '2026-08-07T12:00:30.000Z',
}

const previewTweets = Array.from(
  { length: 13 },
  (_, index): PortalTweet => ({
    ...seedTweet,
    id: String(200 + index),
    text: `preview tweet ${index + 1}`,
    observedAt: new Date(
      Date.parse('2026-08-07T12:00:00.000Z') + index * 60_000,
    ).toISOString(),
    createdAt: new Date(
      Date.parse('2026-08-07T11:45:00.000Z') + index * 60_000,
    ).toISOString(),
  }),
)

const data: PortalData = {
  stats: {
    totalTweets: 14_000_000,
    accountCount: 600,
    streamedLast24Hours: 2_400,
    joinedThisWeek: 3,
    firstYear: 2006,
    currentYear: 2026,
    generatedAt: '2026-08-07T12:00:00.000Z',
  },
  trends: {
    years: [2026],
    series: [],
    weekly: [],
    computedAt: '2026-08-07T12:00:00.000Z',
  },
  initialStream: [seedTweet],
  research: [],
  recentBangers: [],
  historicalBangers: [],
  failures: {
    liveAnalytics: false,
    memberCount: false,
    joinedThisWeek: false,
    corpusRange: false,
    trends: false,
    initialStream: false,
    research: false,
    recentBangers: false,
    historicalBangers: false,
  },
}

describe.each<PortalView>(['home', 'stream'])(
  'portal %s live stream',
  (view) => {
    beforeEach(() => {
      jest.useFakeTimers()
      jest.setSystemTime(Date.parse('2026-08-07T13:00:00.000Z'))
    })

    afterEach(() => {
      jest.clearAllTimers()
      jest.useRealTimers()
      jest.restoreAllMocks()
    })

    // The corpus total is a live counter on /stream and the first metric in
    // the home dashboard strip.
    const expectCorpusCount = () =>
      expect(
        screen.getByText(view === 'home' ? '14,000,000' : '14,000,000 tweets'),
      ).toBeInTheDocument()

    test('polls from the latest cursor without changing the corpus snapshot count', async () => {
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          tweets: [freshTweet],
          updateCursor: {
            observedAt: freshTweet.observedAt,
            id: freshTweet.id,
          },
        }),
      } as Response)

      const { unmount } = render(<Portal data={data} view={view} />)
      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(String(fetchMock.mock.calls[0][0])).toContain(
        'after=2026-08-07T12%3A00%3A00.000Z&afterId=100',
      )
      expect(screen.getByText('fresh tweet')).toBeInTheDocument()
      expectCorpusCount()
      if (view === 'home') {
        expect(screen.getByText('+2,400 in the last 24h')).toBeInTheDocument()
      }

      await act(async () => {
        jest.advanceTimersByTime(30_000)
        await Promise.resolve()
      })
      expectCorpusCount()

      await act(async () => {
        jest.advanceTimersByTime(29_999)
        await Promise.resolve()
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)

      await act(async () => {
        jest.advanceTimersByTime(1)
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expectCorpusCount()
      expect(String(fetchMock.mock.calls[1][0])).toContain(
        'after=2026-08-07T12%3A01%3A00.000Z&afterId=101',
      )

      await act(async () => {
        jest.advanceTimersByTime(240_000)
        await Promise.resolve()
      })
      expectCorpusCount()

      unmount()
    })

    test('keeps the dashboard preview in a scrollable viewport', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ tweets: [], updateCursor: null }),
      } as Response)

      const { unmount } = render(
        <Portal data={{ ...data, initialStream: previewTweets }} view={view} />,
      )
      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(screen.getByText('preview tweet 1')).toBeInTheDocument()
      expect(screen.getByText('preview tweet 3')).toBeInTheDocument()
      expect(screen.getByText('preview tweet 4')).toBeInTheDocument()
      expect(screen.getByText('preview tweet 5')).toBeInTheDocument()
      expect(screen.getByText('preview tweet 12')).toBeInTheDocument()
      if (view === 'home') {
        expect(screen.getByText('preview tweet 1')).toHaveAttribute(
          'data-no-clamp',
          'true',
        )
        const preview = screen.getByRole('region', {
          name: 'Live tweet stream',
        })
        expect(preview).toHaveClass('max-h-[420px]', 'overflow-y-auto')
        expect(preview.parentElement).toHaveClass(
          'lg:h-[420px]',
          'lg:min-h-[420px]',
        )
        expect(screen.queryByText('preview tweet 13')).not.toBeInTheDocument()
      } else {
        expect(screen.getByText('preview tweet 1')).toHaveAttribute(
          'data-no-clamp',
          'false',
        )
        expect(
          screen.queryByRole('region', { name: 'Live tweet stream' }),
        ).not.toBeInTheDocument()
        expect(screen.getByText('preview tweet 13')).toBeInTheDocument()
      }

      unmount()
    })
  },
)

describe('portal component failures', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(Date.parse('2026-08-07T13:00:00.000Z'))
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
    } as Response)
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  test('renders local fallbacks while the rest of the homepage remains usable', async () => {
    const failedData: PortalData = {
      ...data,
      initialStream: [],
      failures: Object.fromEntries(
        Object.keys(data.failures).map((key) => [key, true]),
      ) as PortalData['failures'],
    }

    render(<Portal data={failedData} view="home" />)
    await act(async () => {
      await Promise.resolve()
    })

    expect(
      screen.getByText('Tweet totals are temporarily unavailable.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Member count is temporarily unavailable.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Corpus range is temporarily unavailable.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Live stream is temporarily unavailable.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Trending terms are temporarily unavailable.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Featured research is temporarily unavailable.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Recent bangers are temporarily unavailable.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Historical bangers are temporarily unavailable.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Community Builds')).toBeInTheDocument()
    expect(screen.queryByText('Explore the archive')).not.toBeInTheDocument()
  })
})

describe('portal stream page', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(Date.parse('2026-08-07T13:00:00.000Z'))
    Object.defineProperty(global, 'IntersectionObserver', {
      configurable: true,
      value: jest.fn(() => ({
        disconnect: jest.fn(),
        observe: jest.fn(),
        takeRecords: jest.fn(),
        unobserve: jest.fn(),
      })),
    })
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
    jest.restoreAllMocks()
    Reflect.deleteProperty(global, 'IntersectionObserver')
  })

  test('keeps trend analysis off the live stream page', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ tweets: [], updateCursor: null }),
    } as Response)

    const { unmount } = render(<Portal data={data} view="stream" />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.queryByText('Trends in ideas')).not.toBeInTheDocument()
    expect(screen.queryByText('Rising this week')).not.toBeInTheDocument()
    expect(screen.queryByText('Cooling this week')).not.toBeInTheDocument()

    unmount()
  })

  test('jumps a truncated update backlog to the current stream head', async () => {
    const backlog = Array.from({ length: 100 }, (_, index) => ({
      ...seedTweet,
      id: String(500 + index),
      text: `backlog tweet ${index + 1}`,
      observedAt: new Date(
        Date.parse('2026-08-07T12:00:01.000Z') + index,
      ).toISOString(),
    }))
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tweets: backlog,
          backlogTruncated: true,
          updateCursor: {
            observedAt: backlog.at(-1)?.observedAt,
            id: backlog.at(-1)?.id,
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tweets: [freshTweet], hasMore: true }),
      } as Response)

    const { unmount } = render(<Portal data={data} view="stream" />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toBe('/api/portal/stream')
    expect(screen.getByText('fresh tweet')).toBeInTheDocument()
    expect(screen.queryByText('seed tweet')).not.toBeInTheDocument()
    expect(screen.queryByText('backlog tweet 1')).not.toBeInTheDocument()

    unmount()
  })
})
