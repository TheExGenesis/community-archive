import { NextRequest } from 'next/server'
import { GET } from '@/app/api/companion/v1/[feature]/route'
import { getPortalBangersPage, enrichPortalTweets } from '@/lib/portal/data'
import { getCuratedProfileBangersPage } from '@/lib/profileCuration'
import { resolveProfileCore } from '@/lib/metaTwitter/profile'
import { getCurrentUser } from '@/lib/portal/auth'
import { createServerClient } from '@/utils/supabase'
import { getPublishedDigest } from '@/lib/digest/data'
import { getSocialGraphSnapshot } from '@/lib/socialGraph'
import {
  fetchPortalWeeklyTrends,
  fetchPortalTrendSeries,
  fetchPortalTrendEvidence,
} from '@/lib/portal/analytics'
import { fetchAnalyticsGatewayJson } from '@/lib/clickhouseGateway'
import { archiveHref, parseArchiveInput } from './contract'
import { compactDigest, compactGraph } from './projections'

jest.mock('next/headers', () => ({ cookies: jest.fn(() => ({})) }))
jest.mock('@/utils/supabase', () => ({ createServerClient: jest.fn() }))
jest.mock('@/lib/portal/auth', () => ({ getCurrentUser: jest.fn() }))
jest.mock('@/lib/portal/data', () => ({
  getPortalBangersPage: jest.fn(),
  enrichPortalTweets: jest.fn(async (t) => t),
}))
jest.mock('@/lib/profileCuration', () => ({
  getCuratedProfileBangersPage: jest.fn(),
}))
jest.mock('@/lib/metaTwitter/profile', () => ({
  resolveProfileCore: jest.fn(),
}))
jest.mock('@/lib/digest/data', () => ({ getPublishedDigest: jest.fn() }))
jest.mock('@/lib/socialGraph', () => ({ getSocialGraphSnapshot: jest.fn() }))
jest.mock('@/lib/portal/analytics', () => ({
  fetchPortalWeeklyTrends: jest.fn(),
  fetchPortalTrendSeries: jest.fn(),
  fetchPortalTrendEvidence: jest.fn(),
}))
jest.mock('@/lib/clickhouseGateway', () => ({
  fetchAnalyticsGatewayJson: jest.fn(),
  clickHouseSearchGatewayBaseUrl: () => 'http://fixture',
  isClickHouseReadsEnabled: () => true,
}))

const read = (feature: string, query = '', authorization?: string) =>
  GET(
    new NextRequest(
      `https://www.community-archive.org/api/companion/v1/${feature}?${query}`,
      { headers: authorization ? { Authorization: authorization } : {} },
    ),
    { params: { feature } },
  )
const digest = (status = 'published') =>
  ({
    status,
    digestDate: '2026-09-16',
    content: {
      executiveSummary: ['A published summary'],
      stories: [
        {
          slug: 'other',
          title: 'Other story',
          subtitle: '',
          keyword: 'other',
          bullets: [],
          bangers: [],
          commentary: [],
        },
        {
          slug: 'memory',
          title: 'Community memory',
          subtitle: '',
          keyword: 'memory',
          bullets: ['Sources'],
          bangers: [],
          commentary: [],
        },
      ],
    },
  }) as unknown as NonNullable<Awaited<ReturnType<typeof getPublishedDigest>>>
const graph = {
  generatedAt: '2026-09-17',
  semantics: { timeWindow: '2006–2026' },
  stats: { edgePayloadTruncated: false },
  nodes: Array.from({ length: 12 }, (_, i) => ({
    id: String(i),
    username: `user${i}`,
    label: `User ${i}`,
  })),
  edges: Array.from({ length: 11 }, (_, i) => ({
    source: '0',
    target: String(i + 1),
    strength: i / 10,
    mutualInteractions: i + 1,
  })),
} as unknown as Awaited<ReturnType<typeof getSocialGraphSnapshot>>

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getCurrentUser).mockResolvedValue(null)
})

test('rejects invalid or unbounded input before reading any service', async () => {
  for (const [feature, query] of [
    ['bangers', 'offset=-1'],
    ['bangers', 'offset=1001'],
    ['digest', 'date=2026-02-30'],
    ['trends', 'q=' + 'x'.repeat(81)],
    ['graph', 'username=bad%2Fname'],
    ['other', ''],
  ])
    expect((await read(feature, query)).status).toBe(400)
  expect(getPortalBangersPage).not.toHaveBeenCalled()
})
test('delegates community ranking and paging to the website service', async () => {
  jest
    .mocked(getPortalBangersPage)
    .mockResolvedValue({ tweets: [], pagination: { nextOffset: 12 } } as never)
  const response = await read('bangers', 'q=memory&period=week&offset=6')
  expect(getPortalBangersPage).toHaveBeenCalledWith({
    query: 'memory',
    period: 'week',
    offset: 6,
    limit: 6,
    scope: 'all',
    sort: 'quotes',
  })
  expect((await response.json()).data.nextOffset).toBe(12)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
})
test('resolves an author through public profile policy and reuses their curation', async () => {
  jest
    .mocked(resolveProfileCore)
    .mockResolvedValue({ accountId: '123' } as never)
  jest.mocked(getCuratedProfileBangersPage).mockResolvedValue({
    available: true,
    tweets: [],
    nextOffset: null,
  } as never)
  expect((await read('bangers', 'username=Alice')).status).toBe(200)
  expect(resolveProfileCore).toHaveBeenCalledWith('alice')
  expect(getCuratedProfileBangersPage).toHaveBeenCalledWith('123', {
    limit: 6,
    offset: 0,
    sort: 'quotes',
  })
})
test('publicly ineligible profiles do not fall through to unrestricted reads', async () => {
  jest.mocked(resolveProfileCore).mockResolvedValue(null)
  const response = await read('bangers', 'username=missing')
  expect((await response.json()).data.tweets).toEqual([])
  expect(getCuratedProfileBangersPage).not.toHaveBeenCalled()
})
test('digest projection excludes drafts and orders published relevance without generation', async () => {
  expect(compactDigest(digest('draft'), 'memory').stories).toEqual([])
  jest.mocked(getPublishedDigest).mockResolvedValue(digest())
  const response = await read('digest', 'q=memory')
  expect(getPublishedDigest).toHaveBeenCalledWith(undefined, { strict: true })
  const body = await response.json()
  expect(body.data.stories[0].slug).toBe('memory')
  expect(body.data.stories[0].relevant).toBe(true)
})
test('recent graph uses the bounded shared gateway endpoint', async () => {
  jest.mocked(fetchAnalyticsGatewayJson).mockResolvedValue({
    focus: { id: '0', username: 'user0', name: 'User 0' },
    neighbors: [],
    days: 365,
    timeWindow: 'Last 365 days',
    generatedAt: '2026-09-17',
    truncated: false,
  })
  const response = await read('graph', 'username=user0&graphWindow=recent')
  expect(response.status).toBe(200)
  expect((await response.json()).data.days).toBe(365)
  expect(fetchAnalyticsGatewayJson).toHaveBeenCalledWith(
    ['recent-neighbors'],
    new URLSearchParams({ username: 'user0' }),
    { timeoutMs: 25000 },
  )
  expect(getSocialGraphSnapshot).not.toHaveBeenCalled()
})
test('trends require authentication before executing analytics', async () => {
  expect((await read('trends', 'q=memory')).status).toBe(401)
  expect(fetchPortalTrendSeries).not.toHaveBeenCalled()
})
test('verifies extension bearer with Auth, then uses the same trend engine', async () => {
  const getUser = jest
    .fn()
    .mockResolvedValue({ data: { user: { id: 'reader' } }, error: null })
  jest
    .mocked(createServerClient)
    .mockReturnValue({ auth: { getUser } } as never)
  jest.mocked(fetchPortalTrendSeries).mockResolvedValue({
    granularity: 'month',
    buckets: ['2026-08'],
    computedAt: '2026-09-17',
    series: [
      { term: 'memory', color: '', tweetsPerBucket: [3], perBucket: [1] },
    ],
  })
  jest
    .mocked(fetchPortalTrendEvidence)
    .mockResolvedValue({ tweets: [], nextOffset: null })
  expect(
    (await read('trends', 'q=memory', 'Bearer verified-token')).status,
  ).toBe(200)
  expect(getUser).toHaveBeenCalledWith('verified-token')
  expect(getCurrentUser).not.toHaveBeenCalled()
  expect(enrichPortalTweets).toHaveBeenCalledWith([])
})
test('rejects malformed or rejected bearer even when a cookie session exists', async () => {
  jest.mocked(getCurrentUser).mockResolvedValue({ id: 'cookie-user' } as never)
  jest.mocked(createServerClient).mockReturnValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: null },
        error: new Error('invalid'),
      }),
    },
  } as never)
  expect((await read('trends', 'q=memory', 'Basic foo')).status).toBe(401)
  expect((await read('trends', 'q=memory', 'Bearer invalid')).status).toBe(401)
  expect(getCurrentUser).not.toHaveBeenCalled()
})
test('search retains filters, cursor, media, and quote enrichment', async () => {
  jest.mocked(fetchAnalyticsGatewayJson).mockResolvedValue({
    data: {
      tweets: [
        {
          tweetId: '123',
          username: 'alice',
          accountDisplayName: 'Alice',
          fullText: 'memory',
          createdAt: '2026-09-17',
          favoriteCount: 3,
          retweetCount: null,
          media: [
            {
              mediaUrl: 'https://pbs.twimg.com/media/a.jpg',
              mediaType: 'photo',
            },
          ],
        },
      ],
      nextOffset: 6,
    },
  })
  const response = await read('search', 'q=memory&username=alice')
  const body = await response.json()
  expect(body.data.tweets[0].media[0].type).toBe('photo')
  expect(body.data.nextOffset).toBe(6)
  expect(enrichPortalTweets).toHaveBeenCalled()
  expect(
    String(jest.mocked(fetchAnalyticsGatewayJson).mock.calls[0][1]),
  ).toContain('from_user=alice')
})
test('upstream failures return noncacheable errors without leaking query or service details', async () => {
  jest
    .mocked(fetchAnalyticsGatewayJson)
    .mockRejectedValue(new Error('credential=do-not-leak'))
  const response = await read('graph', 'username=user0&graphWindow=recent')
  expect(response.status).toBe(502)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(await response.text()).not.toContain('credential')
})
test('website continuation links retain context and encode query values', () => {
  const input = parseArchiveInput(
    'search',
    new URLSearchParams({ q: 'memory & learning', username: '@Alice' }),
  )
  expect(archiveHref(input)).toBe(
    '/search?q=memory+%26+learning&fromUser=alice',
  )
})

test('the default trends view reuses weekly word discovery, with auth', async () => {
  expect((await read('trends')).status).toBe(401)
  expect(fetchPortalWeeklyTrends).not.toHaveBeenCalled()
  jest.mocked(getCurrentUser).mockResolvedValue({ id: 'reader' } as never)
  jest.mocked(fetchPortalWeeklyTrends).mockResolvedValue([
    {
      term: 'pacing',
      lane: 'rising',
      last7: 42,
      prev7: 21,
      deltaPct: 100,
      status: 'comparable',
      sinceDate: '2026-09-10',
      untilDate: '2026-09-16',
    },
  ])
  const response = await read('trends')
  expect(response.status).toBe(200)
  expect((await response.json()).data.words).toEqual([
    {
      term: 'pacing',
      lane: 'rising',
      posts: 42,
      changePct: 100,
      since: '2026-09-10',
      until: '2026-09-16',
    },
  ])
  expect(fetchPortalTrendSeries).not.toHaveBeenCalled()
})

test('existing clients keep the all-time mutual-interaction graph', async () => {
  jest.mocked(getSocialGraphSnapshot).mockResolvedValue(graph)
  const response = await read('graph', 'username=user0')
  expect(response.status).toBe(200)
  expect((await response.json()).data.neighbors[0].username).toBe('user11')
  expect(fetchAnalyticsGatewayJson).not.toHaveBeenCalled()
})
