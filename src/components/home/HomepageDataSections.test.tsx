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

test('shows every digit of the totals and both member windows, including zero', async () => {
  render(await HomepageGrowth({ data: growthStats() }))
  expect(screen.getByText('21,023,737')).toBeInTheDocument()
  expect(screen.getByText('1,261')).toBeInTheDocument()
  expect(screen.getByText('0')).toBeInTheDocument()
  expect(screen.getByText('259')).toBeInTheDocument()
  expect(screen.getByText('668,600 tweets')).toBeInTheDocument()
  expect(screen.getByText(/Membership as of/)).toBeInTheDocument()
  expect(screen.getByText(/Oct 25, 6:00 PM UTC/)).toHaveAttribute(
    'datetime',
    '2026-10-25T18:00:00Z',
  )
})

test('keeps missing growth visible as unavailable and preserves the totals', async () => {
  render(
    await HomepageGrowth({
      data: growthStats({
        membersAddedLastHour: null,
        membersAddedLast24Hours: null,
        addedLast24Hours: null,
      }),
    }),
  )
  expect(screen.getAllByText('Unavailable')).toHaveLength(2)
  expect(screen.getByText('1,261')).toBeInTheDocument()
  expect(screen.queryByText('668,600 tweets')).not.toBeInTheDocument()
})

test('shows an explicit failure instead of zero totals', async () => {
  render(await HomepageGrowth({ data: growthStats({}, true) }))
  expect(
    screen.getByText('Archive counts are temporarily unavailable.'),
  ).toBeInTheDocument()
  expect(screen.queryByText('1,261')).not.toBeInTheDocument()
})
