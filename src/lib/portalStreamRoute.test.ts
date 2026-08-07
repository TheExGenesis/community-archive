import { NextRequest } from 'next/server'
import { GET } from '@/app/api/portal/stream/route'
import { getPortalStream } from '@/lib/portal/data'

jest.mock('@/lib/portal/data', () => ({
  getPortalStream: jest.fn(),
}))

const getPortalStreamMock = getPortalStream as jest.MockedFunction<
  typeof getPortalStream
>

describe('portal stream route', () => {
  beforeEach(() => {
    getPortalStreamMock.mockReset()
  })

  test('forwards a validated composite observation cursor', async () => {
    getPortalStreamMock.mockResolvedValue([
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
    expect(getPortalStreamMock).toHaveBeenCalledWith(100, {
      observedAt: '2026-08-07T12:00:00.000Z',
      id: '100',
    })
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        nextCursor: {
          observedAt: '2026-08-07T12:01:00.000Z',
          id: '123',
        },
      }),
    )
  })

  test('rejects malformed cursors before reading data', async () => {
    const response = await GET(
      new NextRequest(
        'https://community-archive.org/api/portal/stream?after=not-a-date&afterId=oops',
      ),
    )

    expect(response.status).toBe(400)
    expect(getPortalStreamMock).not.toHaveBeenCalled()
  })

  test('returns an uncached gateway error instead of an empty success', async () => {
    getPortalStreamMock.mockRejectedValue(new Error('database unavailable'))
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
