import { NextRequest } from 'next/server'
import { GET } from '@/app/api/portal/trends/route'
import {
  fetchPortalTrendEvidence,
  fetchPortalTrendSeries,
} from '@/lib/portal/analytics'
import { getIsMember } from '@/lib/portal/auth'

jest.mock('@/lib/portal/analytics', () => ({
  fetchPortalTrendEvidence: jest.fn(),
  fetchPortalTrendSeries: jest.fn(),
  portalTrendTokens: jest.fn((value: string) =>
    value
      .toLocaleLowerCase()
      .split(/[^a-z0-9_]+/)
      .filter(Boolean)
      .slice(0, 4),
  ),
}))
jest.mock('@/lib/portal/auth', () => ({ getIsMember: jest.fn() }))

jest.mock('@/lib/portal/data', () => ({
  enrichPortalTweets: jest.fn(async (tweets: unknown[]) => tweets),
}))

const fetchPortalTrendEvidenceMock =
  fetchPortalTrendEvidence as jest.MockedFunction<
    typeof fetchPortalTrendEvidence
  >
const fetchPortalTrendSeriesMock =
  fetchPortalTrendSeries as jest.MockedFunction<typeof fetchPortalTrendSeries>
const getIsMemberMock = getIsMember as jest.MockedFunction<typeof getIsMember>

describe('portal trends route', () => {
  beforeEach(() => {
    fetchPortalTrendEvidenceMock.mockReset()
    fetchPortalTrendSeriesMock.mockReset()
    getIsMemberMock.mockReset()
    getIsMemberMock.mockResolvedValue(true)
  })

  test('requires a signed-in member', async () => {
    getIsMemberMock.mockResolvedValue(false)

    const response = await GET(
      new NextRequest(
        'https://community-archive.org/api/portal/trends?view=series&q=tpot',
      ),
    )

    expect(response.status).toBe(401)
    expect(fetchPortalTrendSeriesMock).not.toHaveBeenCalled()
  })

  test('normalizes and deduplicates concurrent series terms', async () => {
    fetchPortalTrendSeriesMock.mockResolvedValue({
      years: [2026],
      series: [],
      computedAt: '2026-08-07T12:00:00.000Z',
    })

    const response = await GET(
      new NextRequest(
        'https://community-archive.org/api/portal/trends?view=series&q=Alpha&q=alpha&q=AI%20Agents',
      ),
    )

    expect(response.status).toBe(200)
    expect(fetchPortalTrendSeriesMock).toHaveBeenCalledWith([
      'alpha',
      'ai agents',
    ])
  })

  test('forwards include and exclude filters to the evidence search', async () => {
    fetchPortalTrendEvidenceMock.mockResolvedValue([])

    const response = await GET(
      new NextRequest(
        'https://community-archive.org/api/portal/trends?view=feed&include=Alpha&include=Beta&exclude=Moloch',
      ),
    )

    expect(response.status).toBe(200)
    expect(fetchPortalTrendEvidenceMock).toHaveBeenCalledWith(
      ['alpha', 'beta'],
      ['moloch'],
      30,
    )
  })

  test('rejects an evidence query without an included term', async () => {
    const response = await GET(
      new NextRequest(
        'https://community-archive.org/api/portal/trends?view=feed&exclude=moloch',
      ),
    )

    expect(response.status).toBe(400)
    expect(fetchPortalTrendEvidenceMock).not.toHaveBeenCalled()
  })
})
