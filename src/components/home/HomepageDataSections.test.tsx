import { render, screen } from '@testing-library/react'
import type { HomepageData } from '@/lib/portal/data'
import {
  HomepageStats,
  HomepageResearch,
  HomepageTrends,
  HomepageDigest,
} from './HomepageDataSections'
import { getLatestDigestPreview } from '@/lib/digest/data'

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

const growthStats = (overrides = {}, failed = false) =>
  Promise.resolve({
    data: {
      totalTweets: 21_023_737,
      memberCount: 1_261,
      membersAddedLastHour: 0,
      membersAddedLast24Hours: 259,
      membershipSnapshotAt: '2026-10-25T18:00:00Z',
      addedLast24Hours: 668_600,
      generatedAt: '2026-10-25T18:00:13Z',
      ...overrides,
    },
    failed,
  })

test('rounds compact headline totals down to reached milestones', async () => {
  render(
    await HomepageStats({
      data: growthStats({ memberCount: 1_650, totalTweets: 21_660_000 }),
    }),
  )
  expect(screen.getByText('1.6K community members')).toBeInTheDocument()
  expect(screen.getByText('21.6M public tweets')).toBeInTheDocument()
})
