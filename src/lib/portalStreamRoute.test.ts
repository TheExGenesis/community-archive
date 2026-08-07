import { NextRequest } from 'next/server'
import { GET } from '@/app/api/portal/stream/route'
import { getPortalStreamPage, getPortalStreamUpdates } from '@/lib/portal/data'

jest.mock('@/lib/portal/data', () => ({
  getPortalStreamPage: jest.fn(),
  getPortalStreamUpdates: jest.fn(),
}))

const getPortalStreamPageMock = getPortalStreamPage as jest.MockedFunction<
  typeof getPortalStreamPage
>
const getPortalStreamUpdatesMock =
  getPortalStreamUpdates as jest.MockedFunction<typeof getPortalStreamUpdates>

describe('portal stream route', () => {
  beforeEach(() => {
    getPortalStreamPageMock.mockReset()
    getPortalStreamUpdatesMock.mockReset()
  })

  test('forwards a validated composite observation cursor', async () => {
    getPortalStreamUpdatesMock.mockResolvedValue([
      {
        id: '123',
        username: 'alice',
        name: 'Alice',
        avatar: null,
        text: 'hello',
        observedAt: '2026-08-07T12:01:00.000Z',
        createdAt: '2026-08-07T11:00:00.000Z',
        likes: 1,
        rts: 0,
      },
    ])

    const response = await GET(
      new NextRequest(
        'https://community-archive.org/api/portal/stream?after=2026-08-07T12%3A00%3A00.000Z&afterId=100',
      ),
    )

    expect(response.status).toBe(200)
    expect(getPortalStreamUpdatesMock).toHaveBeenCalledWith(100, {
      observedAt: '2026-08-07T12:00:00.000Z',
      id: '100',
    })
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        updateCursor: {
          observedAt: '2026-08-07T12:01:00.000Z',
          id: '123',
        },
      }),
    )
  })

  test('returns an older authored-time page and its continuation cursor', async () => {
    const tweets = Array.from({ length: 31 }, (_, index) => ({
      id: String(200 - index),
      username: 'alice',
      name: 'Alice',
      avatar: null,
      text: `tweet ${index}`,
      observedAt: '2026-08-07T12:01:00.000Z',
      createdAt: new Date(Date.UTC(2026, 7, 7, 11, 59 - index)).toISOString(),
      likes: 1,
      rts: 0,
    }))
    getPortalStreamPageMock.mockResolvedValue(tweets)

    const response = await GET(
      new NextRequest(
        'https://community-archive.org/api/portal/stream?before=2026-08-07T12%3A00%3A00.000Z&beforeId=201',
      ),
    )

    expect(getPortalStreamPageMock).toHaveBeenCalledWith(31, {
      createdAt: '2026-08-07T12:00:00.000Z',
      id: '201',
    })
    await expect(response.json()).resolves.toMatchObject({
      tweets: expect.arrayContaining([expect.objectContaining({ id: '200' })]),
      nextCursor: {
        createdAt: tweets[29].createdAt,
        id: tweets[29].id,
      },
      hasMore: true,
    })
  })

  test('rejects malformed cursors before reading data', async () => {
    const response = await GET(
      new NextRequest(
        'https://community-archive.org/api/portal/stream?after=not-a-date&afterId=oops',
      ),
    )

    expect(response.status).toBe(400)
    expect(getPortalStreamPageMock).not.toHaveBeenCalled()
    expect(getPortalStreamUpdatesMock).not.toHaveBeenCalled()
  })

  test('returns an uncached gateway error instead of an empty success', async () => {
    getPortalStreamPageMock.mockRejectedValue(new Error('database unavailable'))
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    const response = await GET(
      new NextRequest('https://community-archive.org/api/portal/stream'),
    )

    expect(response.status).toBe(502)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    consoleError.mockRestore()
  })
})
