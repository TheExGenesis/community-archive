import { GET } from '@/app/api/admin/keywords/route'
import KeywordsPage from '@/app/admin/keywords/page'
import { checkIsAdmin, requireAdmin } from '@/app/admin/data'
import { fetchAnalyticsGatewayJson } from '@/lib/clickhouseGateway'
jest.mock('@/app/admin/data', () => ({
  checkIsAdmin: jest.fn(),
  requireAdmin: jest.fn(),
}))
jest.mock('@/lib/clickhouseGateway', () => ({
  fetchAnalyticsGatewayJson: jest.fn(),
}))
jest.mock('@/app/admin/keywords/KeywordDashboard', () => ({
  KeywordDashboard: () => null,
}))
const fixture = {
  schemaVersion: 2,
  population: 'community_members',
  generatedAt: '2026-09-10T00:00:00Z',
  datasets: Array.from({ length: 7 }, (_, i) => ({
    through: `2026-09-0${i + 3}`,
    days: 7,
    rows: [
      ['__all_tweets__', 1000, 1000, 100, 100, 250, 250],
      ['astra', 100, 20, 50, 10, 60, 12],
    ],
  })),
}
beforeEach(() => jest.resetAllMocks())
test('denies non-admin API callers before fetching analytics, and protects the page', async () => {
  jest.mocked(checkIsAdmin).mockResolvedValue(false)
  const response = await GET(new Request('http://localhost/api/admin/keywords'))
  expect(response.status).toBe(403)
  expect(response.headers.get('cache-control')).toContain('no-store')
  expect(fetchAnalyticsGatewayJson).not.toHaveBeenCalled()
  jest.mocked(requireAdmin).mockRejectedValue(new Error('denied'))
  await expect(KeywordsPage()).rejects.toThrow('denied')
})
test('forwards only a bounded window and returns uncached validated aggregates', async () => {
  jest.mocked(checkIsAdmin).mockResolvedValue(true)
  jest.mocked(fetchAnalyticsGatewayJson).mockResolvedValue(fixture)
  const response = await GET(
    new Request('http://localhost/api/admin/keywords?days=7&sql=ignored'),
  )
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(fixture)
  expect(fetchAnalyticsGatewayJson).toHaveBeenCalledWith(
    ['keyword-lab'],
    new URLSearchParams({ days: '7' }),
    { timeoutMs: 60000 },
  )
  expect(
    (await GET(new Request('http://localhost/api/admin/keywords?days=365')))
      .status,
  ).toBe(400)
  expect(fetchAnalyticsGatewayJson).toHaveBeenCalledTimes(1)
})
test('upstream failure and malformed results are non-cacheable errors', async () => {
  jest.mocked(checkIsAdmin).mockResolvedValue(true)
  jest
    .mocked(fetchAnalyticsGatewayJson)
    .mockRejectedValueOnce(new Error('secret upstream details'))
    .mockResolvedValueOnce({ ...fixture, datasets: [] })
  for (let i = 0; i < 2; i++) {
    const response = await GET(
      new Request('http://localhost/api/admin/keywords'),
    )
    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(await response.text()).not.toContain('secret')
  }
})

test('rejects an upstream response for the wrong window', async () => {
  jest.mocked(checkIsAdmin).mockResolvedValue(true)
  jest.mocked(fetchAnalyticsGatewayJson).mockResolvedValue(fixture)
  expect(
    (await GET(new Request('http://localhost/api/admin/keywords?days=1')))
      .status,
  ).toBe(503)
})
