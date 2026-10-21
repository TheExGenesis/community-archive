import { NextRequest } from 'next/server'
import { GET } from '@/app/api/hex-map/posts/route'
import { MAP_VERSION } from './version'
import { mapGateway, portalPost, type MapPost } from './gateway'
import { memberTweets } from './data'
jest.mock('./gateway', () => ({ mapGateway: jest.fn(), portalPost: jest.fn() }))
jest.mock('./data', () => ({ memberTweets: jest.fn() }))
const request = (query: string) =>
  new NextRequest(`http://localhost/api/hex-map/posts?${query}`)
it('rejects a mismatched geometry before touching the backend', async () => {
  const response = await GET(request('version=old&cells=1'))
  expect(response.status).toBe(409)
  expect(mapGateway).not.toHaveBeenCalled()
})
it('only returns policy-filtered cards and retains their cell and member-quote count', async () => {
  jest.mocked(mapGateway).mockResolvedValue({
    data: [
      { tweetId: '1', cell: 4, memberQuotes: 7 },
      { tweetId: '2', cell: 9, memberQuotes: 99 },
    ],
    nextOffset: 12,
  })
  jest
    .mocked(portalPost)
    .mockImplementation(
      (r: MapPost) => ({ id: r.tweetId }) as ReturnType<typeof portalPost>,
    )
  jest
    .mocked(memberTweets)
    .mockResolvedValue([{ id: '1', username: 'allowed' }] as Awaited<
      ReturnType<typeof memberTweets>
    >)
  const response = await GET(
    request(`version=${MAP_VERSION}&cells=4&sort=quotes`),
  )
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(await response.json()).toEqual({
    tweets: [
      { tweet: { id: '1', username: 'allowed' }, cell: 4, memberQuotes: 7 },
    ],
    nextOffset: 12,
  })
})
it('does not publish partially checked data when policy lookup fails', async () => {
  jest.mocked(memberTweets).mockRejectedValue(new Error('Policy unavailable'))
  const response = await GET(request(`version=${MAP_VERSION}&cells=4`))
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({
    error: 'Map posts are temporarily unavailable',
  })
})

it('requires the extended backend contract before showing bounded likes or wider Best ranges', async () => {
  jest.mocked(memberTweets).mockResolvedValue([])
  for (const [sort, period] of [
    ['likes', 'week'],
    ['quotes', 'month'],
    ['quotes', 'quarter'],
    ['quotes', 'year'],
  ]) {
    jest
      .mocked(mapGateway)
      .mockResolvedValue({ period, data: [], nextOffset: null })
    expect(
      (
        await GET(
          request(
            `version=${MAP_VERSION}&cells=4&sort=${sort}&period=${period}`,
          ),
        )
      ).status,
    ).toBe(503)
    jest
      .mocked(mapGateway)
      .mockResolvedValue({
        period,
        timeRangeVersion: 2,
        data: [],
        nextOffset: null,
      })
    expect(
      (
        await GET(
          request(
            `version=${MAP_VERSION}&cells=4&sort=${sort}&period=${period}`,
          ),
        )
      ).status,
    ).toBe(200)
  }
})
