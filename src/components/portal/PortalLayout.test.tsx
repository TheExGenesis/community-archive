import { act, render, screen } from '@testing-library/react'
import Portal from './Portal'
import type { PortalData, PortalTweet, ResearchPost } from '@/lib/portal/types'

jest.mock('@/components/HomepageSearch', () => ({
  __esModule: true,
  default: () => null,
}))

jest.mock('./TweetRow', () => ({
  TweetRow: ({ tweet }: { tweet: PortalTweet }) => <div>{tweet.text}</div>,
}))

const banger: PortalTweet = {
  id: '100',
  username: 'alice',
  name: 'Alice',
  avatar: null,
  text: 'A banger',
  observedAt: '2026-08-07T12:00:00.000Z',
  createdAt: '2026-08-07T11:55:00.000Z',
  likes: 100,
  rts: 10,
}

const research = Array.from(
  { length: 5 },
  (_, index): ResearchPost => ({
    title: `Research post ${index + 1}`,
    url: `https://example.com/research-${index + 1}`,
    date: '2026-08-07T00:00:00.000Z',
    excerpt: '',
    image: null,
    author: null,
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
  initialStream: [banger],
  research,
  recentBangers: [banger],
  historicalBangers: [{ ...banger, id: '99', text: 'A historical banger' }],
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

test('renders the balanced homepage composition and editorial labels', async () => {
  jest.useFakeTimers()
  jest.setSystemTime(Date.parse('2026-08-07T13:00:00.000Z'))
  jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ tweets: [], updateCursor: null }),
  } as Response)

  const { unmount } = render(<Portal data={data} view="home" />)
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })

  expect(screen.getByText('Featured research')).toBeInTheDocument()
  expect(screen.getByText('Research post 4')).toBeInTheDocument()
  expect(screen.queryByText('Research post 5')).not.toBeInTheDocument()
  expect(screen.getByText('Historical Banger')).toBeInTheDocument()
  const moreBangersLinks = screen.getAllByRole('link', {
    name: /More bangers/i,
  })
  expect(moreBangersLinks).toHaveLength(2)
  moreBangersLinks.forEach((link) => {
    expect(link).toHaveAttribute('href', '/bangers')
  })
  expect(
    screen.getByRole('link', { name: /Export the archive/i }),
  ).toHaveAttribute(
    'href',
    'https://github.com/TheExGenesis/community-archive/releases/tag/data_export',
  )
  expect(screen.getByRole('region', { name: 'Live tweet stream' })).toHaveClass(
    'lg:flex-1',
    'lg:max-h-none',
    'overflow-y-auto',
  )

  unmount()
  jest.clearAllTimers()
  jest.useRealTimers()
  jest.restoreAllMocks()
})
