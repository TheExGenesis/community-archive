import { NextRequest } from 'next/server'
import { GET } from '@/app/api/portal/bangers/route'
import { getPortalBangersPage } from '@/lib/portal/data'

jest.mock('@/lib/portal/data', () => ({
  getPortalBangersPage: jest.fn(),
  PORTAL_BANGERS_PAGE_SIZE: 30,
}))

const getPortalBangersPageMock = getPortalBangersPage as jest.MockedFunction<
  typeof getPortalBangersPage
>

describe('portal bangers route', () => {
  beforeEach(() => {
    getPortalBangersPageMock.mockReset()
    getPortalBangersPageMock.mockResolvedValue({
      tweets: [],
      pagination: {
        limit: 30,
        offset: 0,
        nextOffset: null,
        totalAvailable: 0,
        snapshotSize: 0,
        yearCounts: [],
        candidateRankingTruncated: false,
      },
    })
  })

  test('serves public bangers with shared-cache headers', async () => {
    const response = await GET(
      new NextRequest('https://community-archive.org/api/portal/bangers'),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('public')
    expect(getPortalBangersPageMock).toHaveBeenCalled()
  })

  test('forwards bounded paging, ranking, scope, year, and search', async () => {
    const response = await GET(
      new NextRequest(
        'https://community-archive.org/api/portal/bangers?offset=5001&scope=members&sort=recent&year=2024&q=agency',
      ),
    )

    expect(response.status).toBe(200)
    expect(getPortalBangersPageMock).toHaveBeenCalledWith({
      limit: 30,
      offset: 5001,
      scope: 'members',
      sort: 'recent',
      year: 2024,
      period: undefined,
      query: 'agency',
    })
  })

  test('forwards this-week filtering instead of a year', async () => {
    const response = await GET(
      new NextRequest(
        'https://community-archive.org/api/portal/bangers?period=week&year=2024',
      ),
    )

    expect(response.status).toBe(200)
    expect(getPortalBangersPageMock).toHaveBeenCalledWith({
      limit: 30,
      offset: 0,
      scope: 'all',
      sort: 'quotes',
      year: undefined,
      period: 'week',
      query: '',
    })
  })

  test('rejects an invalid offset', async () => {
    const response = await GET(
      new NextRequest(
        'https://community-archive.org/api/portal/bangers?offset=-1',
      ),
    )

    expect(response.status).toBe(400)
    expect(getPortalBangersPageMock).not.toHaveBeenCalled()
  })

  test('rejects an unsupported time period', async () => {
    const response = await GET(
      new NextRequest(
        'https://community-archive.org/api/portal/bangers?period=month',
      ),
    )

    expect(response.status).toBe(400)
    expect(getPortalBangersPageMock).not.toHaveBeenCalled()
  })
})
