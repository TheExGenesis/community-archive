import { NextRequest } from 'next/server'
import { GET } from '@/app/api/strands/[seed]/context/route'
import { getStrands, getAppPolicy } from './data'
import { getStrandTweets } from './strand-tweets'
import { fetchClickHouseTweetThreadPageData } from '@/lib/clickhouseTweetPage'
jest.mock('./data', () => ({ getStrands: jest.fn(), getAppPolicy: jest.fn() }))
jest.mock('./strand-tweets', () => ({ getStrandTweets: jest.fn() }))
jest.mock('@/lib/clickhouseGateway', () => ({
  isClickHouseReadsEnabled: () => true,
}))
jest.mock('@/lib/clickhouseTweetPage', () => ({
  fetchClickHouseTweetThreadPageData: jest.fn(),
}))
jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))
beforeEach(() => {
  jest.clearAllMocks()
  jest
    .mocked(getStrands)
    .mockResolvedValue({
      generatedAt: '',
      strands: [{ id: '123', essentialTweets: [{ id: '456' }] }],
    } as never)
  jest
    .mocked(getAppPolicy)
    .mockResolvedValue({
      blocked: new Set(['withdrawn']),
      blockedIds: new Set(['blocked']),
      members: new Set(),
    })
  jest.mocked(getStrandTweets).mockResolvedValue(new Map())
})
const request = (id = '456') =>
  new NextRequest(`https://ca.test/api/strands/123/context?tweet_id=${id}`)
test('only this eligible strand’s seed/key posts can load context', async () => {
  expect((await GET(request('999'), { params: { seed: '123' } })).status).toBe(
    404,
  )
  expect(fetchClickHouseTweetThreadPageData).not.toHaveBeenCalled()
})
test('withdrawn authors break ancestry and reply traversal before any content hydration', async () => {
  const n = (
    id: string,
    parent: string | null,
    username = 'alice',
    account_id = 'ok',
  ) => ({
    tweet_id: id,
    reply_to_tweet_id: parent,
    created_at: id,
    username,
    account_id,
  })
  jest
    .mocked(fetchClickHouseTweetThreadPageData)
    .mockResolvedValue({
      threadTree: {
        tweets: {
          '456': n('456', '1'),
          '1': n('1', null, 'withdrawn'),
          '2': n('2', '456', 'renamed', 'blocked'),
          '3': n('3', '2'),
          '4': n('4', '456'),
        },
      },
    } as never)
  const response = await GET(request(), { params: { seed: '123' } })
  expect(response.status).toBe(200)
  expect(getStrandTweets).toHaveBeenCalledWith(['4'])
  expect(response.headers.get('cache-control')).toContain('no-store')
})
test('upstream failures stay non-successful and cannot be cached', async () => {
  jest
    .mocked(fetchClickHouseTweetThreadPageData)
    .mockRejectedValue(new Error('upstream failed'))
  const response = await GET(request(), { params: { seed: '123' } })
  expect(response.status).toBe(503)
  expect(response.headers.get('cache-control')).toContain('no-store')
  expect(getStrandTweets).not.toHaveBeenCalled()
})
