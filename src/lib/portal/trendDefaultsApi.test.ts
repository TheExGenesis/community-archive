import { NextRequest } from 'next/server'
import { GET } from '@/app/api/portal/trends/route'
import { getIsMember } from './auth'
import { fetchPortalTrendSeries, fetchPortalWeeklyTrends } from './analytics'
jest.mock('./auth', () => ({ getIsMember: jest.fn() }))
jest.mock('./analytics', () => ({
  fetchPortalTrendSeries: jest.fn(),
  fetchPortalWeeklyTrends: jest.fn(),
  portalTrendTokens: (term: string) => [term],
}))
jest.mock('./data', () => ({ enrichPortalTweets: jest.fn() }))
beforeEach(() => jest.resetAllMocks())
test('dynamic defaults are member-only and never cached independently of the gateway', async () => {
  jest.mocked(getIsMember).mockResolvedValue(false)
  expect(
    (
      await GET(
        new NextRequest('http://localhost/api/portal/trends?view=defaults'),
      )
    ).status,
  ).toBe(401)
  expect(fetchPortalWeeklyTrends).not.toHaveBeenCalled()
  jest.mocked(getIsMember).mockResolvedValue(true)
  jest.mocked(fetchPortalWeeklyTrends).mockResolvedValue([])
  const response = await GET(
    new NextRequest('http://localhost/api/portal/trends?view=defaults'),
  )
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toContain('no-store')
  expect(await response.json()).toEqual({ weekly: [] })
})
test('series requests default to months while explicit yearly links remain supported', async () => {
  jest.mocked(getIsMember).mockResolvedValue(true)
  jest.mocked(fetchPortalTrendSeries).mockResolvedValue({
    granularity: 'month',
    buckets: [],
    series: [],
    computedAt: '',
  })
  await GET(
    new NextRequest('http://localhost/api/portal/trends?view=series&q=astra'),
  )
  expect(fetchPortalTrendSeries).toHaveBeenLastCalledWith(
    ['astra'],
    expect.any(Date),
    undefined,
    'month',
  )
  await GET(
    new NextRequest(
      'http://localhost/api/portal/trends?view=series&q=astra&granularity=year',
    ),
  )
  expect(fetchPortalTrendSeries).toHaveBeenLastCalledWith(
    ['astra'],
    expect.any(Date),
    undefined,
    'year',
  )
})

test.each(['day', 'week'])(
  'accepts authenticated %s series requests',
  async (granularity) => {
    jest.mocked(getIsMember).mockResolvedValue(true)
    jest
      .mocked(fetchPortalTrendSeries)
      .mockResolvedValue({
        granularity: granularity as 'day' | 'week',
        buckets: [],
        series: [],
        computedAt: '',
      })
    const response = await GET(
      new NextRequest(
        `http://localhost/api/portal/trends?view=series&q=astra&granularity=${granularity}`,
      ),
    )
    expect(response.status).toBe(200)
    expect(fetchPortalTrendSeries).toHaveBeenCalledWith(
      ['astra'],
      expect.any(Date),
      undefined,
      granularity,
    )
  },
)
