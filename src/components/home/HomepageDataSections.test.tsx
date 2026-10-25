import { render, screen } from '@testing-library/react'
import type { HomepageData } from '@/lib/portal/data'
import {
  HomepageStats,
  HomepageGrowth,
  HomepageResearch,
  HomepageTrends,
  HomepageDigest,
} from './HomepageDataSections'
import { getLatestDigestPreview } from '@/lib/digest/data'

jest.mock('@/lib/portal/recentMembers', () => ({
  getRecentMemberCount: jest.fn(),
}))
import { getRecentMemberCount } from '@/lib/portal/recentMembers'

jest.mock('@/lib/digest/data', () => ({ getLatestDigestPreview: jest.fn() }))
jest.mock('@/components/portal/Portal', () => ({
  HomeResearchPanel: () => <div>Research</div>,
  HomeTrendsPanel: () => <div>Weekly trends</div>,
  DigestHero: () => <div>Digest</div>,
}))

test('renders ready panels while trends and the digest remain pending', async () => {
  const pending = new Promise<never>(() => undefined)
  ;(getLatestDigestPreview as jest.Mock).mockReturnValue(pending)
  const data: HomepageData = {
    globalStats: Promise.resolve({
      data: {
        totalTweets: 14_000_000,
        memberCount: 700,
        addedLast24Hours: 12_000,
        generatedAt: '2026-09-06T00:00:00Z',
      },
      failed: false,
    }),
    research: Promise.resolve({ data: [], failed: false }),
    trends: pending,
  }
  void HomepageDigest()
  void HomepageTrends({ data: data.trends, isMember: false })
  render(
    <>
      {await HomepageStats({ data: data.globalStats })}
      {await HomepageResearch({ data: data.research })}
    </>,
  )
  expect(screen.getByText(/14.0M public tweets/)).toBeInTheDocument()
  expect(screen.getByText('Research')).toBeInTheDocument()
  expect(screen.queryByText('Weekly trends')).not.toBeInTheDocument()
})

const growthStats = (tweets: number | null, failed = false) =>
  Promise.resolve({
    data: {
      totalTweets: 1,
      memberCount: 1,
      addedLast24Hours: tweets,
      generatedAt: '2026-10-24T00:00:00Z',
    },
    failed,
  })
test('shows both rolling additions, including zero, independently of digest loading', async () => {
  jest.mocked(getRecentMemberCount).mockResolvedValue(0)
  render(await HomepageGrowth({ data: growthStats(1234) }))
  expect(screen.getByText('0 members')).toBeInTheDocument()
  expect(screen.getByText('1,234 tweets')).toBeInTheDocument()
  expect(screen.getByText(/Added in the last 24 hours/)).toBeInTheDocument()
})
test('omits unavailable figures rather than displaying an invented zero', async () => {
  jest.mocked(getRecentMemberCount).mockRejectedValue(new Error('offline'))
  const { unmount } = render(await HomepageGrowth({ data: growthStats(1) }))
  expect(screen.getByText('1 tweet')).toBeInTheDocument()
  expect(screen.queryByText(/members/)).not.toBeInTheDocument()
  unmount()
  expect(await HomepageGrowth({ data: growthStats(null, true) })).toBeNull()
})
