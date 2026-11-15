import { render, screen } from '@testing-library/react'
import type { HomepageData } from '@/lib/portal/data'
import {
  HomepageStats,
  HomepageResearch,
  HomepageTrends,
  HomepageDigest,
  HomepageGrowthCounter,
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

test('shows 24h tweet and member growth, compact in the trends header', async () => {
  const { container, rerender } = render(
    await HomepageGrowthCounter({ data: growthStats(), placement: 'subline' }),
  )
  expect(container).toHaveTextContent('+668,600 tweets · +259 members in 24h')
  rerender(
    await HomepageGrowthCounter({ data: growthStats(), placement: 'trends' }),
  )
  expect(container).toHaveTextContent('+668.6K tweets · +259 members in 24h')
})

test('growth counter omits missing deltas and hides on failure', async () => {
  const { container } = render(
    await HomepageGrowthCounter({
      data: growthStats({ membersAddedLast24Hours: null }),
      placement: 'top-left',
    }),
  )
  expect(container).toHaveTextContent('+668,600 tweets in 24h')
  expect(
    await HomepageGrowthCounter({
      data: growthStats({
        addedLast24Hours: null,
        membersAddedLast24Hours: null,
      }),
      placement: 'top-right',
    }),
  ).toBeNull()
  expect(
    await HomepageGrowthCounter({
      data: growthStats({}, true),
      placement: 'subline',
    }),
  ).toBeNull()
})
