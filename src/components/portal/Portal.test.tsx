import { act, render, screen } from '@testing-library/react'
import Portal, { type PortalView } from './Portal'
import type { PortalData, PortalTweet } from '@/lib/portal/types'

jest.mock('@/components/HomepageSearch', () => ({
  __esModule: true,
  default: () => null,
}))

jest.mock('./TweetRow', () => ({
  TweetRow: ({ tweet }: { tweet: PortalTweet }) => <div>{tweet.text}</div>,
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
  { length: 5 },
  (_, index): PortalTweet => ({
    ...seedTweet,
    id: String(200 + index),
    text: `preview tweet ${index + 1}`,
    observedAt: `2026-08-07T12:0${index}:00.000Z`,
    createdAt: `2026-08-07T11:5${index}:00.000Z`,
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

    test('checks immediately and then polls from the latest cursor each minute', async () => {
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
      expect(screen.getByText('14,000,000 tweets')).toBeInTheDocument()
      if (view === 'home') {
        expect(screen.getByText('14,000,000')).toBeInTheDocument()
        expect(
          screen.getByText('+2,400 streamed in the last 24h'),
        ).toBeInTheDocument()
      }

      await act(async () => {
        jest.advanceTimersByTime(30_000)
        await Promise.resolve()
      })
      expect(screen.getByText('14,000,010 tweets')).toBeInTheDocument()

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
      expect(screen.getByText('14,000,024 tweets')).toBeInTheDocument()
      expect(String(fetchMock.mock.calls[1][0])).toContain(
        'after=2026-08-07T12%3A01%3A00.000Z&afterId=101',
      )

      await act(async () => {
        jest.advanceTimersByTime(240_000)
        await Promise.resolve()
      })
      expect(screen.getByText('14,000,100 tweets')).toBeInTheDocument()
      if (view === 'home') {
        expect(screen.getByText('14,000,100')).toBeInTheDocument()
      }

      unmount()
    })

    test('keeps the dashboard preview shorter than the full stream', async () => {
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
      if (view === 'home') {
        expect(screen.queryByText('preview tweet 4')).not.toBeInTheDocument()
        expect(screen.queryByText('preview tweet 5')).not.toBeInTheDocument()
      } else {
        expect(screen.getByText('preview tweet 4')).toBeInTheDocument()
        expect(screen.getByText('preview tweet 5')).toBeInTheDocument()
      }

      unmount()
    })
  },
)
