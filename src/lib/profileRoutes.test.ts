import { NextRequest } from 'next/server'
import { GET as getBangers } from '@/app/api/profile/[account_id]/bangers/route'
import { GET as getSidebar } from '@/app/api/profile/[account_id]/sidebar/route'
import { getProfileBangersPage } from '@/lib/metaTwitter/bangers'
import { getClickHouseProfileSidebarOrThrow } from '@/lib/metaTwitter/clickhouseSidebar'

jest.mock('@/lib/metaTwitter/bangers', () => ({
  getProfileBangersPage: jest.fn(),
  PROFILE_BANGERS_PAGE_LIMIT: 10,
}))
jest.mock('@/lib/metaTwitter/clickhouseSidebar', () => ({
  getClickHouseProfileSidebarOrThrow: jest.fn(),
}))

const getProfileBangersPageMock = getProfileBangersPage as jest.MockedFunction<
  typeof getProfileBangersPage
>
const getClickHouseProfileSidebarOrThrowMock =
  getClickHouseProfileSidebarOrThrow as jest.MockedFunction<
    typeof getClickHouseProfileSidebarOrThrow
  >

beforeEach(() => {
  jest.resetAllMocks()
})

test('serves a bounded profile banger page', async () => {
  getProfileBangersPageMock.mockResolvedValue({
    tweets: [],
    yearCounts: [{ year: 2025, count: 4 }],
    total: 4,
    nextOffset: 4,
    available: true,
  })

  const response = await getBangers(
    new NextRequest(
      'https://community-archive.org/api/profile/42/bangers?year=2025&offset=2&limit=2&sort=likes',
    ),
    { params: { account_id: '42' } },
  )

  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toContain('s-maxage=300')
  expect(getProfileBangersPageMock).toHaveBeenCalledWith('42', {
    limit: 2,
    offset: 2,
    year: 2025,
    sort: 'likes',
  })
})

test('rejects invalid profile pagination without calling ClickHouse', async () => {
  const response = await getBangers(
    new NextRequest(
      'https://community-archive.org/api/profile/42/bangers?offset=-1',
    ),
    { params: { account_id: '42' } },
  )

  expect(response.status).toBe(400)
  expect(getProfileBangersPageMock).not.toHaveBeenCalled()
})

test('rejects unknown profile sort modes instead of changing their meaning', async () => {
  const response = await getBangers(
    new NextRequest(
      'https://community-archive.org/api/profile/42/bangers?sort=popular',
    ),
    { params: { account_id: '42' } },
  )

  expect(response.status).toBe(400)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(getProfileBangersPageMock).not.toHaveBeenCalled()
})

test('serves the cached year-scoped profile sidebar', async () => {
  getClickHouseProfileSidebarOrThrowMock.mockResolvedValue({
    media: [],
    mediaCount: 0,
    people: [],
  })

  const response = await getSidebar(
    new NextRequest(
      'https://community-archive.org/api/profile/42/sidebar?year=2024',
    ),
    { params: { account_id: '42' } },
  )

  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toContain('s-maxage=86400')
  expect(getClickHouseProfileSidebarOrThrowMock).toHaveBeenCalledWith(
    '42',
    2024,
  )
})

test('does not cache a transient profile sidebar failure as empty data', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
  getClickHouseProfileSidebarOrThrowMock.mockRejectedValue(
    new Error('gateway unavailable'),
  )

  const response = await getSidebar(
    new NextRequest('https://community-archive.org/api/profile/42/sidebar'),
    { params: { account_id: '42' } },
  )

  expect(response.status).toBe(502)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
})
