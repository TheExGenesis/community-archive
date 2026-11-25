import { render, screen } from '@testing-library/react'
import type { HomepageData } from '@/lib/portal/data'
import {
  HomepageStats,
  HomepageResearch,
  HomepageTrends,
  HomepageDigest,
  HomepageGrowthCounter,
  HomepageBulletin,
} from './HomepageDataSections'
import { getLatestDigestPreview } from '@/lib/digest/data'
import { loadHomepageBulletinItems } from '@/lib/bulletin/homepage'
import { getCurrentUser } from '@/lib/portal/auth'

jest.mock('@/lib/digest/data', () => ({ getLatestDigestPreview: jest.fn() }))
jest.mock('@/lib/bulletin/homepage', () => ({
  loadHomepageBulletinItems: jest.fn(),
}))
jest.mock('@/lib/portal/auth', () => ({ getCurrentUser: jest.fn() }))
jest.mock('./HomeBulletinPanel', () => ({
  HomeBulletinPanel: ({
    items,
    personalized,
  }: {
    items: unknown[]
    personalized: boolean
  }) => (
    <div>
      {items.length} bulletin picks{personalized ? ' for you' : ''}
    </div>
  ),
}))
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

test('shows 24h tweet and member growth', async () => {
  const { container } = render(
    await HomepageGrowthCounter({ data: growthStats() }),
  )
  expect(container).toHaveTextContent('+668,600 tweets · +259 members in 24h')
})

test('growth counter omits missing deltas and hides on failure', async () => {
  const { container } = render(
    await HomepageGrowthCounter({
      data: growthStats({ membersAddedLast24Hours: null }),
    }),
  )
  expect(container).toHaveTextContent('+668,600 tweets in 24h')
  const { container: zeroMembers } = render(
    await HomepageGrowthCounter({
      data: growthStats({ membersAddedLast24Hours: 0 }),
    }),
  )
  expect(zeroMembers).toHaveTextContent('+668,600 tweets in 24h')
  expect(zeroMembers).not.toHaveTextContent('member')
  expect(
    await HomepageGrowthCounter({
      data: growthStats({
        addedLast24Hours: null,
        membersAddedLast24Hours: null,
      }),
    }),
  ).toBeNull()
  expect(
    await HomepageGrowthCounter({ data: growthStats({}, true) }),
  ).toBeNull()
})

test('bulletin picks are personal for members and hidden when empty or failing', async () => {
  jest.mocked(getCurrentUser).mockResolvedValue({
    id: 'user-uuid',
    is_anonymous: false,
    app_metadata: { provider_id: '42' },
  } as unknown as Awaited<ReturnType<typeof getCurrentUser>>)
  jest
    .mocked(loadHomepageBulletinItems)
    .mockResolvedValue([{}, {}] as Awaited<
      ReturnType<typeof loadHomepageBulletinItems>
    >)
  const { rerender } = render(await HomepageBulletin({ isMember: true }))
  expect(screen.getByText('2 bulletin picks for you')).toBeInTheDocument()
  expect(loadHomepageBulletinItems).toHaveBeenCalledWith({
    accountId: '42',
    userId: 'user-uuid',
  })

  jest.mocked(getCurrentUser).mockClear()
  rerender(await HomepageBulletin({ isMember: false }))
  expect(screen.getByText('2 bulletin picks')).toBeInTheDocument()
  expect(getCurrentUser).not.toHaveBeenCalled()
  expect(loadHomepageBulletinItems).toHaveBeenLastCalledWith({
    accountId: null,
    userId: null,
  })

  jest.mocked(loadHomepageBulletinItems).mockRejectedValue(new Error('down'))
  expect(await HomepageBulletin({ isMember: false })).toBeNull()
})
