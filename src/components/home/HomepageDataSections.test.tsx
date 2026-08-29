import { render, screen } from '@testing-library/react'
import type { PortalData } from '@/lib/portal/types'
import { getLatestDigestPreview } from '@/lib/digest/data'
import { HomepagePortal, HomepageStats } from './HomepageDataSections'

jest.mock('@/components/portal/Portal', () => ({
  __esModule: true,
  default: ({ data }: { data: PortalData }) => (
    <div data-testid="portal" data-years={data.trends.years.length} />
  ),
}))
jest.mock('@/lib/digest/data', () => ({
  getLatestDigestPreview: jest.fn().mockResolvedValue(null),
}))

const data = {
  stats: {
    totalTweets: 14_000_000,
    accountCount: 700,
    streamedLast24Hours: 0,
    joinedThisWeek: 0,
    firstYear: 2006,
    currentYear: 2026,
    generatedAt: '2026-08-12T00:00:00.000Z',
  },
  trends: {
    years: [2026],
    series: [],
    weekly: [],
    computedAt: '',
  },
  initialStream: [],
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
} satisfies PortalData

beforeEach(() => {
  jest.clearAllMocks()
})

it('renders the resolved homepage totals', async () => {
  render(await HomepageStats({ data: Promise.resolve(data) }))

  expect(screen.getByText(/14\.0M public tweets/)).toBeInTheDocument()
  expect(screen.getByText(/700 community members/)).toBeInTheDocument()
})

it('keeps historical trend series out of the guest payload', async () => {
  render(await HomepagePortal({ data: Promise.resolve(data), isMember: false }))

  expect(screen.getByTestId('portal')).toHaveAttribute('data-years', '0')
  expect(getLatestDigestPreview).toHaveBeenCalledTimes(1)
})
