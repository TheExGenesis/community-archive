import { render, screen } from '@testing-library/react'
import type { HomepageData } from '@/lib/portal/data'
import {
  HomepageStats,
  HomepageStream,
  HomepageBanger,
  HomepageResearch,
  HomepageTrends,
  HomepageDigest,
} from './HomepageDataSections'
import { getLatestDigestPreview } from '@/lib/digest/data'

jest.mock('@/lib/digest/data', () => ({ getLatestDigestPreview: jest.fn() }))
jest.mock('@/components/portal/Portal', () => ({
  HomepageLiveStream: ({ tweets }: { tweets: unknown[] }) => (
    <div>Stream: {tweets.length}</div>
  ),
  HomeBangerPanel: ({ failed }: { failed: boolean }) => (
    <div>Banger failed: {String(failed)}</div>
  ),
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
        generatedAt: '2026-09-06T00:00:00Z',
      },
      failed: false,
    }),
    overview: pending,
    stream: Promise.resolve({ data: [], failed: false }),
    recentBangers: Promise.resolve({ data: [], failed: true }),
    historicalBangers: pending,
    research: Promise.resolve({ data: [], failed: false }),
    trends: pending,
  }
  void HomepageDigest()
  void HomepageTrends({ data: data.trends, isMember: false })
  render(
    <>
      {await HomepageStats({ data: data.globalStats })}
      {await HomepageStream({ data: data.stream })}
      {await HomepageBanger({ data: data.recentBangers })}
      {await HomepageResearch({ data: data.research })}
    </>,
  )
  expect(screen.getByText(/14.0M public tweets/)).toBeInTheDocument()
  expect(screen.getByText('Stream: 0')).toBeInTheDocument()
  expect(screen.getByText('Research')).toBeInTheDocument()
  expect(screen.getByText('Banger failed: true')).toBeInTheDocument()
  expect(screen.queryByText('Weekly trends')).not.toBeInTheDocument()
})
