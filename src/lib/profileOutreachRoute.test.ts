import { GET } from '@/app/api/profile/[account_id]/outreach/route'
import { fetchClickHouseProfileOutreach } from '@/lib/metaTwitter/clickhouseSidebar'

const mockGetUser = jest.fn()

jest.mock('next/headers', () => ({ cookies: jest.fn(async () => ({})) }))
jest.mock('@/utils/supabase', () => ({
  createServerClient: () => ({ auth: { getUser: mockGetUser } }),
}))
jest.mock('@/lib/metaTwitter/clickhouseSidebar', () => ({
  fetchClickHouseProfileOutreach: jest.fn(),
}))

const mockFetchOutreach = fetchClickHouseProfileOutreach as jest.MockedFunction<
  typeof fetchClickHouseProfileOutreach
>

beforeEach(() => jest.clearAllMocks())

test('does not expose another accounts personalized suggestions', async () => {
  mockGetUser.mockResolvedValue({
    data: { user: { app_metadata: { provider_id: '41' } } },
  })

  const response = await GET({} as never, { params: { account_id: '42' } })

  expect(response.status).toBe(403)
  expect(mockFetchOutreach).not.toHaveBeenCalled()
})

test('serves suggestions only to the authenticated profile owner', async () => {
  mockGetUser.mockResolvedValue({
    data: { user: { app_metadata: { provider_id: '42' } } },
  })
  mockFetchOutreach.mockResolvedValue({ people: [] })

  const response = await GET({} as never, { params: { account_id: '42' } })

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ people: [] })
  expect(mockFetchOutreach).toHaveBeenCalledWith('42')
})
