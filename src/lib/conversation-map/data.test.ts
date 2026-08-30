import { NextRequest } from 'next/server'
import { GET } from '@/app/api/conversation-map/route'
import { getPortalBangersPage } from '@/lib/portal/data'
import { annotateTweets, loadConversationMap, tweetSnippet } from './data'
import type { PortalTweet, PortalBangersPage } from '@/lib/portal/types'

jest.mock('@/lib/portal/data', () => ({ getPortalBangersPage: jest.fn() }))
const fetchPage = jest.mocked(getPortalBangersPage)
const tweet = (
  id: string,
  createdAt = '2025-02-03T00:00:00Z',
): PortalTweet => ({
  id,
  createdAt,
  observedAt: createdAt,
  username: 'author',
  name: 'Author',
  avatar: null,
  text: 'Original &amp; complete\ntext',
  likes: 1,
  rts: 0,
  quoteCount: 12,
  media: [{ url: 'https://pbs.twimg.com/media/test.jpg', type: 'photo' }],
  quotedTweet: {
    id: '20',
    username: 'quoted',
    name: 'Quoted',
    avatar: null,
    text: 'Quoted source',
    createdAt,
    likes: 0,
    rts: 0,
    media: [],
  },
})
const page = (
  tweets: PortalTweet[],
  nextOffset: number | null,
): PortalBangersPage => ({
  tweets,
  pagination: {
    limit: 100,
    offset: 0,
    nextOffset,
    totalAvailable: 250,
    snapshotSize: 250,
    yearCounts: [
      { year: 2024, count: 1 },
      { year: 2025, count: 250 },
    ],
    candidateRankingTruncated: false,
  },
})
beforeEach(() => fetchPage.mockReset())

it('preserves full text, media and quoted tweets while disclosing only an actual prefix', () => {
  const original = tweet('1')
  const [annotation] = annotateTweets(
    [original, tweet('2', '2024-12-31T00:00:00Z')],
    2025,
  )
  expect(annotation.label).toBe('Original & complete text')
  expect(annotation.tweets).toEqual([original])
  expect(tweetSnippet('word '.repeat(40)).length).toBeLessThanOrEqual(73)
})
it('never restores an absent grouped source from the editorial snapshot', () => {
  const present = tweet('2066804199053013406', '2026-06-16T00:00:00Z')
  const [annotation] = annotateTweets([present], 2026)
  expect(annotation.kind).toBe('snippet')
  expect(annotation.tweets).toEqual([present])
  expect(annotation.id).not.toBe('brent-dill-discussion')
})
it('requests only two member-filtered pages and caps/deduplicates the result', async () => {
  fetchPage.mockResolvedValueOnce(
    page(
      Array.from({ length: 100 }, (_, i) => tweet(String(i + 1))),
      100,
    ),
  )
  fetchPage.mockResolvedValueOnce(
    page(
      Array.from({ length: 100 }, (_, i) => tweet(String(i + 101))),
      200,
    ),
  )
  const result = await loadConversationMap(2025)
  expect(result.annotations).toHaveLength(200)
  expect(fetchPage.mock.calls).toEqual([
    [{ year: 2025, scope: 'members', sort: 'quotes', limit: 100, offset: 0 }],
    [{ year: 2025, scope: 'members', sort: 'quotes', limit: 100, offset: 100 }],
  ])
  expect(result.years).toEqual([2024, 2025])
})
it('does not query invalid years or manufacture success on upstream failure', async () => {
  const invalid = await GET(
    new NextRequest('https://example.org/api/conversation-map?year=9999'),
  )
  expect(invalid.status).toBe(400)
  expect(fetchPage).not.toHaveBeenCalled()
  fetchPage.mockRejectedValueOnce(new Error('gateway unavailable'))
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const response = await GET(
      new NextRequest('https://example.org/api/conversation-map?year=2025'),
    )
    expect(response.status).toBe(502)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  } finally {
    log.mockRestore()
  }
})
